"""
Gemini Service – Eye Movement Analysis for Neurological Risk Assessment

Analyzes longitudinal eye movement data to detect potential risk of:
  • Post-operative delirium
  • Subclinical stroke

Uses Google Gemini 2.5 Flash with STRICT evidence-only reasoning.
All medical claims MUST be traceable to research documents in backend/research/.
Output is ALWAYS valid JSON matching backend/services/gemini_response.json.

This is a research-support tool, NOT a diagnostic system.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter
import google.generativeai as genai

# Load .env file if python-dotenv is available (optional dependency)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RESEARCH_DIR = Path(__file__).resolve().parent.parent / "research"
SCHEMA_PATH = Path(__file__).resolve().parent / "gemini_response.json"

APP_ENV = os.environ.get("AURA_ENV", "testing").lower()
MODEL_NAME = "gemini-3.0-flash" if APP_ENV == "production" else "gemini-2.5-flash-lite"
TEMPERATURE = 0.1
MAX_RETRIES = 2
MAX_OUTPUT_TOKENS = 4096*2          # Avoid truncation for long evidence-grounded JSON responses
MAX_RESEARCH_CONTEXT_CHARS = 60000 # Cap research context to control input token cost

# Runtime research fetching is DISABLED by default.
# Set ENABLE_RESEARCH_FETCH=true in .env to allow web-search downloads.
# For production / hosted deployments, pre-fetch locally and commit the files.
ENABLE_RESEARCH_FETCH = os.environ.get("ENABLE_RESEARCH_FETCH", "false").lower() in (
    "true", "1", "yes",
)

# ---------------------------------------------------------------------------
# Module-level caches  (avoid redundant API calls / disk reads / model builds)
# ---------------------------------------------------------------------------
_genai_configured: bool = False
_cached_research: tuple[str, list[str]] | None = None
_cached_schema: dict[str, Any] | None = None
_cached_system_prompt: str | None = None
_cached_analysis_model: genai.GenerativeModel | None = None
_research_fetched: bool = False
_cached_search_model: genai.GenerativeModel | None = None

# Topics for web-search-based research retrieval (used only when
# backend/research/ is empty or lacks relevant content).
RESEARCH_TOPICS: list[str] = [
    (
        "saccadic eye movement abnormalities as biomarkers for "
        "post-operative delirium detection in elderly surgical patients"
    ),
    (
        "ocular motor function and eye tracking metrics for "
        "subclinical stroke screening and cerebrovascular risk"
    ),
    (
        "longitudinal eye movement analysis fixation stability "
        "and smooth pursuit for neurological deterioration assessment"
    ),
    (
        "pupil variability and pupillary response changes "
        "associated with cognitive decline and delirium in clinical studies"
    ),
    (
        "antisaccade prosaccade latency velocity asymmetry "
        "as neurological biomarkers in peer-reviewed clinical research"
    ),
]

logger = logging.getLogger(__name__)
router = APIRouter()


# ===================================================================
# API Configuration
# ===================================================================

def _configure_genai() -> None:
    """Configure the Google Generative AI SDK with the API key.

    Cached — only runs once per process.
    """
    global _genai_configured
    if _genai_configured:
        return
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GEMINI_API_KEY or GOOGLE_API_KEY environment variable must be set. "
            "Create a backend/.env file with: GEMINI_API_KEY=your_key_here"
        )
    genai.configure(api_key=api_key)
    _genai_configured = True


# ===================================================================
# A. Research Loader
# ===================================================================

def _load_text_file(filepath: Path) -> str:
    """Read a plain-text / markdown file and return its contents."""
    try:
        return filepath.read_text(encoding="utf-8", errors="ignore")
    except Exception as exc:
        logger.warning("Failed to read text file %s: %s", filepath.name, exc)
        return ""


def _load_pdf_file(filepath: Path) -> str:
    """Extract text from a PDF file.  Falls back gracefully."""
    try:
        from PyPDF2 import PdfReader  # type: ignore[import-untyped]

        reader = PdfReader(str(filepath))
        pages: list[str] = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        return "\n".join(pages)
    except ImportError:
        return (
            f"[PDF file '{filepath.name}' present but PyPDF2 is not installed. "
            f"Install it with: pip install PyPDF2]"
        )
    except Exception as exc:
        return f"[Error extracting text from PDF '{filepath.name}': {exc}]"


def load_research_context() -> tuple[str, list[str]]:
    """Load every research document from ``backend/research/``.

    Returns
    -------
    tuple[str, list[str]]
        (combined_context_string, list_of_filenames)
    """
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)

    documents: list[str] = []
    filenames: list[str] = []

    for filepath in sorted(RESEARCH_DIR.iterdir()):
        if filepath.is_dir():
            continue

        suffix = filepath.suffix.lower()
        if suffix == ".pdf":
            content = _load_pdf_file(filepath)
        elif suffix in {".txt", ".md", ".text", ".markdown", ".json"}:
            content = _load_text_file(filepath)
        else:
            continue  # skip unrecognised formats

        if content.strip():
            documents.append(
                f"=== RESEARCH DOCUMENT: {filepath.name} ===\n"
                f"{content}\n"
                f"=== END OF {filepath.name} ===\n"
            )
            filenames.append(filepath.name)

    combined = "\n\n".join(documents)

    # Truncate to stay within token budget
    if len(combined) > MAX_RESEARCH_CONTEXT_CHARS:
        combined = combined[:MAX_RESEARCH_CONTEXT_CHARS] + (
            "\n\n[... RESEARCH CONTEXT TRUNCATED TO CONSERVE TOKENS ...]"
        )

    return combined, filenames


def _extract_title_authors_from_text(content: str) -> list[str]:
    """Extract human-readable references from research text content.

    Returns list of strings in format: "Title — Authors".
    """
    refs: list[str] = []

    # Pattern used by generated research text files
    title_matches = re.findall(r"\*\*Exact paper title:\*\*\s*(.+)", content)
    author_matches = re.findall(
        r"\*\*Authors, publication year, journal:\*\*\s*(.+)",
        content,
    )

    for idx, title in enumerate(title_matches):
        clean_title = title.strip().strip(".")
        authors = "Unknown authors"
        if idx < len(author_matches):
            authors = author_matches[idx].strip().strip(".")
        refs.append(f"{clean_title} — {authors}")

    # Fallback pattern for markdown-like headings
    if not refs:
        heading_titles = re.findall(r"^###\s+Paper\s+\d+:\s*(.+)$", content, re.MULTILINE)
        for title in heading_titles:
            refs.append(f"{title.strip().strip('.')} — Unknown authors")

    return refs


def _build_reference_catalog() -> tuple[dict[str, str], list[str]]:
    """Build a mapping from filename/aliases to human-readable references."""
    filename_to_ref: dict[str, str] = {}
    all_refs: list[str] = []

    if not RESEARCH_DIR.exists():
        return filename_to_ref, all_refs

    for filepath in sorted(RESEARCH_DIR.iterdir()):
        if not filepath.is_file():
            continue

        refs_for_file: list[str] = []
        suffix = filepath.suffix.lower()
        if suffix in {".txt", ".md", ".text", ".markdown", ".json"}:
            content = _load_text_file(filepath)
            refs_for_file = _extract_title_authors_from_text(content)

        if not refs_for_file:
            stem_title = filepath.stem.replace("_", " ").strip()
            refs_for_file = [f"{stem_title} — Unknown authors"]

        primary_ref = refs_for_file[0]
        filename_to_ref[filepath.name] = primary_ref
        filename_to_ref[filepath.stem] = primary_ref

        for ref in refs_for_file:
            if ref not in all_refs:
                all_refs.append(ref)

    return filename_to_ref, all_refs


def _normalize_research_references(result: dict[str, Any]) -> dict[str, Any]:
    """Convert research_references_used entries into 'Title — Authors' strings."""
    refs = result.get("research_references_used", [])
    if not isinstance(refs, list):
        result["research_references_used"] = []
        return result

    filename_to_ref, all_refs = _build_reference_catalog()
    normalized: list[str] = []

    for ref in refs:
        ref_text = str(ref).strip()
        if not ref_text:
            continue

        # Already looks like title+authors
        if " — " in ref_text:
            normalized.append(ref_text)
            continue

        mapped = filename_to_ref.get(ref_text)
        if not mapped and ref_text.endswith(".pdf"):
            mapped = filename_to_ref.get(Path(ref_text).stem)
        if mapped:
            normalized.append(mapped)
        elif all_refs:
            # Best-effort fallback to closest first known reference
            normalized.append(all_refs[0])

    # If model returned empty refs but we have a catalog, attach top references
    if not normalized and all_refs:
        normalized = all_refs[:3]

    # De-duplicate while preserving order
    deduped: list[str] = []
    seen: set[str] = set()
    for item in normalized:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)

    result["research_references_used"] = deduped
    return result


# ===================================================================
# B. Research Fetcher  (Web Search + Caching)
# ===================================================================

def _topic_hash(topic: str) -> str:
    """Deterministic short hash for a topic string."""
    return hashlib.md5(topic.encode()).hexdigest()[:12]


def _research_file_path(topic: str) -> Path:
    return RESEARCH_DIR / f"research_{_topic_hash(topic)}.txt"


def _research_file_exists(topic: str) -> bool:
    fp = _research_file_path(topic)
    return fp.exists() and fp.stat().st_size > 100


def _save_research_file(
    topic: str,
    content: str,
    sources: list[dict[str, str]] | None = None,
) -> str:
    """Persist web-search-fetched research to disk and return the filename."""
    fp = _research_file_path(topic)
    sources = sources or []
    sources_block = "\n".join(
        f"#   - {src.get('title', 'Unknown title')} | {src.get('url', '')}"
        for src in sources
    )
    if not sources_block:
        sources_block = "#   - [No grounded sources returned]"

    header = (
        f"# Research Topic: {topic}\n"
        f"# Retrieved: {datetime.now(timezone.utc).isoformat()}\n"
        f"# Source: Gemini Web Search Grounding\n"
        f"# Grounded Papers:\n"
        f"{sources_block}\n"
        f"# NOTE: Contains grounded extraction and excerpts from discovered sources.\n"
        f"#       Verify with original publications before clinical use.\n\n"
    )
    fp.write_text(header + content, encoding="utf-8")
    return fp.name


def _sanitize_filename(name: str) -> str:
    """Sanitize paper title into a filesystem-safe filename stem."""
    safe = re.sub(r"[^a-zA-Z0-9._ -]", "", name).strip()
    safe = re.sub(r"\s+", "_", safe)
    return safe[:120] or "paper"


def _extract_sources_from_response(response: Any) -> list[dict[str, str]]:
    """Extract grounded source titles/URLs from Gemini response metadata."""
    sources: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    try:
        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            grounding = getattr(candidate, "grounding_metadata", None)
            if grounding is None:
                continue

            chunks = getattr(grounding, "grounding_chunks", None) or []
            for chunk in chunks:
                web = getattr(chunk, "web", None)
                if web is None:
                    continue
                title = (getattr(web, "title", "") or "").strip()
                url = (getattr(web, "uri", "") or "").strip()
                if not title and not url:
                    continue
                key = (title, url)
                if key in seen:
                    continue
                seen.add(key)
                sources.append({"title": title or "Unknown title", "url": url})
    except Exception:
        return []

    return sources


def _looks_like_pdf_url(url: str) -> bool:
    lower = url.lower()
    return lower.endswith(".pdf") or ".pdf?" in lower or "pdf" in lower


def _download_source_pdf(title: str, url: str, topic: str) -> str | None:
    """Best-effort download of a source PDF into backend/research/.

    Returns filename if downloaded, else None.
    """
    if not url or not _looks_like_pdf_url(url):
        return None

    topic_prefix = _topic_hash(topic)
    filename = f"paper_{topic_prefix}_{_sanitize_filename(title)}.pdf"
    out_path = RESEARCH_DIR / filename
    if out_path.exists() and out_path.stat().st_size > 1024:
        return out_path.name

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as resp:
            content_type = (resp.headers.get("Content-Type") or "").lower()
            if "pdf" not in content_type and not _looks_like_pdf_url(url):
                return None
            data = resp.read()
            if len(data) < 1024:
                return None
            out_path.write_bytes(data)
            return out_path.name
    except Exception:
        return None


def _create_search_model() -> genai.GenerativeModel:
    """Create a GenerativeModel with Google Search grounding enabled.

    Cached — reuses the same model instance across all topic fetches.
    Tries multiple API patterns for compatibility across SDK versions.
    """
    global _cached_search_model
    if _cached_search_model is not None:
        return _cached_search_model

    # Attempt 1: "google_search" tool (current Gemini API)
    try:
        _cached_search_model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            tools="google_search",
        )
        return _cached_search_model
    except Exception:
        pass

    # Attempt 2: protos-based GoogleSearch tool definition
    try:
        search_tool = genai.protos.Tool(
            google_search=genai.protos.GoogleSearch()
        )
        _cached_search_model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            tools=[search_tool],
        )
        return _cached_search_model
    except Exception:
        pass

    # Attempt 3: plain model (no grounding — still useful)
    _cached_search_model = genai.GenerativeModel(model_name=MODEL_NAME)
    return _cached_search_model


def fetch_research_if_needed(
    verbose: bool = False,
    return_details: bool = False,
) -> list[Any]:
    """Fetch research via Gemini web search for any missing topics.

    Cached files are never re-downloaded.
    Skips entirely if already checked this process (saves API calls).

    Returns
    -------
    list[Any]
        Default: list of fetched filenames.
        If return_details=True: list of dicts with topic/file/source metadata.
    """
    global _research_fetched, _cached_search_model
    if _research_fetched:
        return []  # Already checked this process — skip

    _configure_genai()
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)

    fetched: list[str] = []
    details: list[dict[str, Any]] = []

    for topic in RESEARCH_TOPICS:
        # Already cached?
        if _research_file_exists(topic):
            cached_name = _research_file_path(topic).name
            fetched.append(cached_name)
            details.append(
                {
                    "topic": topic,
                    "file": cached_name,
                    "cached": True,
                    "sources": [],
                    "downloaded_pdfs": [],
                }
            )
            continue

        try:
            model = _create_search_model()
            prompt = (
                f"Find peer-reviewed clinical research papers and studies about:\n"
                f"{topic}\n\n"
                f"Return content focused on original-source fidelity, not broad summaries.\n"
                f"For each paper include:\n"
                f"1. Exact paper title\n"
                f"2. Direct source URL (publisher/DOI/PubMed/arXiv if available)\n"
                f"3. Authors, publication year, journal\n"
                f"4. Large verbatim excerpts from methods/results/discussion where possible\n"
                f"5. Quantitative details exactly as reported (sample size, p-values, effect sizes)\n"
                f"6. If full text is unavailable, clearly state that and provide the closest primary source link\n\n"
                f"Do NOT invent data. Do NOT add general medical knowledge."
            )
            response = model.generate_content(prompt)
            text = response.text if response.text else ""
            sources = _extract_sources_from_response(response)
            downloaded_pdfs: list[str] = []

            if verbose and sources:
                print(f"\n[Topic] {topic}")
                for idx, src in enumerate(sources, start=1):
                    print(f"  [{idx}] {src['title']}")
                    print(f"      Source: {src['url']}")

            for src in sources[:8]:
                pdf_name = _download_source_pdf(src["title"], src["url"], topic)
                if pdf_name:
                    downloaded_pdfs.append(pdf_name)
                    if verbose:
                        print(f"      Downloaded PDF: {pdf_name}")

            if text.strip():
                fname = _save_research_file(topic, text, sources=sources)
                fetched.append(fname)
                details.append(
                    {
                        "topic": topic,
                        "file": fname,
                        "cached": False,
                        "sources": sources,
                        "downloaded_pdfs": downloaded_pdfs,
                    }
                )
        except Exception as exc:
            # If the search tool was rejected, invalidate cache so the
            # next attempt can try a different tool configuration.
            _cached_search_model = None
            logger.warning("Research fetch failed for topic [%s]: %s", topic, exc)
            continue  # non-blocking — move on to next topic

    _research_fetched = True  # Don't re-check next call
    if return_details:
        return details
    return fetched


# ===================================================================
# C. Schema Loading & Validation
# ===================================================================

_REQUIRED_FIELDS: dict[str, type | tuple[type, ...]] = {
    "risk_level": str,
    "conditions_flagged": list,
    "confidence_score": (int, float),
    "explanation": str,
    "research_references_used": list,
}

_VALID_RISK_LEVELS = {"low", "moderate", "high", "inconclusive"}
_VALID_CONDITIONS = {"post_op_delirium", "subclinical_stroke"}


def _load_output_schema() -> dict[str, Any]:
    """Load the output template from gemini_response.json.

    Cached — only reads from disk once per process.
    """
    global _cached_schema
    if _cached_schema is not None:
        return _cached_schema

    try:
        _cached_schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    except Exception:
        _cached_schema = {
            "risk_level": "low | moderate | high",
            "conditions_flagged": ["post_op_delirium", "subclinical_stroke"],
            "confidence_score": "0-1",
            "explanation": "Detailed explanation referencing research findings",
            "research_references_used": ["paper_name_1.pdf", "paper_name_2.pdf"],
        }
    return _cached_schema


def _validate_response(response: dict[str, Any]) -> tuple[bool, list[str]]:
    """Validate a response dict against the expected schema.

    Returns
    -------
    tuple[bool, list[str]]
        (is_valid, list_of_error_messages)
    """
    errors: list[str] = []

    for field, expected in _REQUIRED_FIELDS.items():
        if field not in response:
            errors.append(f"Missing required field: '{field}'")
        elif not isinstance(response[field], expected):
            errors.append(
                f"Field '{field}' wrong type: expected {expected}, "
                f"got {type(response[field]).__name__}"
            )

    # risk_level enum
    rl = response.get("risk_level")
    if isinstance(rl, str) and rl.lower() not in _VALID_RISK_LEVELS:
        errors.append(
            f"Invalid risk_level '{rl}'. Must be one of {_VALID_RISK_LEVELS}"
        )

    # confidence_score range
    cs = response.get("confidence_score")
    if isinstance(cs, (int, float)) and not (0 <= cs <= 1):
        errors.append(f"confidence_score must be in [0, 1], got {cs}")

    # conditions_flagged values
    cf = response.get("conditions_flagged")
    if isinstance(cf, list):
        for item in cf:
            if item not in _VALID_CONDITIONS:
                errors.append(f"Invalid condition_flagged value: '{item}'")

    return (len(errors) == 0, errors)


def _fix_response(raw: dict[str, Any]) -> dict[str, Any]:
    """Attempt to normalise a partially valid response into a schema-compliant one."""
    fixed: dict[str, Any] = {}

    # risk_level
    rl = str(raw.get("risk_level", "inconclusive")).lower().strip()
    fixed["risk_level"] = rl if rl in _VALID_RISK_LEVELS else "inconclusive"

    # conditions_flagged
    cf = raw.get("conditions_flagged", [])
    if not isinstance(cf, list):
        cf = []
    fixed["conditions_flagged"] = [c for c in cf if c in _VALID_CONDITIONS]

    # confidence_score
    try:
        score = float(raw.get("confidence_score", 0.0))
        fixed["confidence_score"] = round(max(0.0, min(1.0, score)), 4)
    except (TypeError, ValueError):
        fixed["confidence_score"] = 0.0

    # explanation
    fixed["explanation"] = str(
        raw.get("explanation", "Analysis completed with validation warnings.")
    )

    # research_references_used
    refs = raw.get("research_references_used", [])
    if not isinstance(refs, list):
        refs = []
    fixed["research_references_used"] = [str(r) for r in refs]

    return fixed


# ===================================================================
# D. Safe Fallback Response
# ===================================================================

def _safe_fallback_response(reason: str) -> dict[str, Any]:
    """Return a guaranteed schema-compliant fallback response."""
    return {
        "risk_level": "inconclusive",
        "conditions_flagged": [],
        "confidence_score": 0.0,
        "explanation": (
            f"Unable to complete analysis: {reason}. "
            f"Insufficient evidence to make any risk determination. "
            f"This is a research-support tool and is not a diagnostic system."
        ),
        "research_references_used": [],
    }


# ===================================================================
# E. Prompt Construction
# ===================================================================

def _build_system_prompt(
    research_context: str,
    research_files: list[str],
) -> str:
    """Construct the complete system instruction for Gemini."""
    schema_template = _load_output_schema()
    schema_str = json.dumps(schema_template, indent=2)

    research_block = (
        "The following research documents are your ONLY permitted evidence basis:\n\n"
        f"{research_context}"
        if research_context.strip()
        else (
            "NO RESEARCH DOCUMENTS ARE AVAILABLE.\n"
            "You MUST return an inconclusive assessment and state that "
            "no research evidence is available."
        )
    )

    return f"""You are a medical research analysis system specialised in ocular biomarkers for neurological risk assessment.

## OUTPUT FORMAT — MANDATORY
You MUST respond with ONLY valid JSON. No markdown fences. No commentary. No explanation outside the JSON object.
Your JSON output MUST contain exactly these fields and match this template:
{schema_str}

Field constraints:
- "risk_level": exactly one of "low", "moderate", "high", or "inconclusive" (string)
- "conditions_flagged": array of zero or more of "post_op_delirium", "subclinical_stroke"
- "confidence_score": number between 0.0 and 1.0 inclusive
- "explanation": short bullet-point string (3-6 bullets) listing EXACT metrics used
- "research_references_used": array of strings formatted as "Paper Title — Authors"

## EXPLANATION FORMAT — MANDATORY
The "explanation" value MUST be concise and use bullet points only.
Use this exact style inside the string (newline-separated):
- Metric: <metric_name>; Baseline: <value>; Latest: <value>; Trend: <increase/decrease/stable>; Evidence: <short note>
- Metric: <metric_name>; Baseline: <value>; Latest: <value>; Trend: <increase/decrease/stable>; Evidence: <short note>

Rules:
- Keep to 3-6 bullets total
- Mention only metrics actually present in patient input
- Include exact metric names used for risk assessment
- No long narrative paragraph
- If evidence is insufficient, use 1-2 short bullets and state insufficiency

## EVIDENCE-ONLY REASONING — ABSOLUTE REQUIREMENT
You are PROHIBITED from:
- Using prior medical knowledge or pretrained model assumptions
- Using clinical intuition or "common knowledge"
- Inferring beyond what is EXPLICITLY stated in the research documents below
- Inventing risk thresholds, clinical cutoffs, causal relationships, biomarkers, or diagnostic criteria
- Fabricating findings, statistics, mechanisms, or citations

You may ONLY reason from the RESEARCH DOCUMENTS provided below.
Every medical claim in your explanation MUST be traceable to specific content in these documents.

If the research documents do not contain sufficient evidence for a determination:
- Set risk_level to "inconclusive"
- Set confidence_score to a low value (0.0-0.2)
- State explicitly in explanation that insufficient research evidence is available

## CONSERVATIVE RISK ESTIMATION
- Weak or incomplete evidence → low confidence, inconclusive risk
- Data does not clearly match documented research patterns → inconclusive
- NEVER over-diagnose
- NEVER assume causality from correlation
- Prefer uncertainty over hallucination
- Prefer under-diagnosis over overreach

## LONGITUDINAL ANALYSIS
When analysing the time-series eye movement data:
1. Compare EACH time-series measurement against the patient's baseline
2. Detect trends: monotonic increase/decrease, oscillation, sudden shifts
3. Flag sudden deviations ONLY using thresholds documented in research
4. Identify saccade asymmetry ONLY if explicitly described in research
5. Detect variability increases ONLY with research-documented metrics
6. If research does not define what constitutes deterioration, state that explicitly

## MEDICAL LIABILITY SAFEGUARD
This is a research-support tool, NOT a diagnostic system.
- NEVER state that a patient HAS a condition
- State only: "Elevated risk pattern consistent with [X] as described in [research document filename]"
- Or: "No documented research-supported pattern detected"

## RESEARCH DOCUMENTS
{research_block}

## AVAILABLE RESEARCH FILES
{json.dumps(research_files)}"""


def _build_user_prompt(data: dict[str, Any]) -> str:
    """Format patient data into the user prompt."""
    patient_id = data.get("patient_id", "unknown")
    age = data.get("age", "unknown")
    baseline = data.get("baseline", {})
    time_series = data.get("time_series", [])

    return f"""Analyse the following patient's longitudinal eye movement data for neurological risk assessment.

PATIENT INFORMATION:
- Patient ID: {patient_id}
- Age: {age}

BASELINE MEASUREMENTS:
{json.dumps(baseline, indent=2)}

LONGITUDINAL TIME-SERIES DATA ({len(time_series)} data points):
{json.dumps(time_series, indent=2)}

REQUIRED ANALYSIS:
1. Compare each time-series data point against the baseline measurements.
2. Identify statistically significant deviations or deterioration trends.
3. Assess risk for post-operative delirium and subclinical stroke.
4. Base ALL conclusions strictly on the research documents in your context.
5. If evidence is insufficient, explicitly state so and return inconclusive risk.
6. Keep explanation short and bullet-pointed, naming the exact metrics used.

Return ONLY the valid JSON object. No other text."""


# ===================================================================
# F. Core Analysis Function
# ===================================================================

async def analyze_eye_movement(data: dict[str, Any]) -> dict[str, Any]:
    """Analyse eye movement data and return a risk assessment.

    Parameters
    ----------
    data : dict
        Must contain ``patient_id``, ``age``, ``baseline``, ``time_series``.

    Returns
    -------
    dict
        JSON-serialisable dict matching ``gemini_response.json`` schema.
    """

    # ------ 1. Configure API ------
    try:
        _configure_genai()
    except EnvironmentError as exc:
        return _safe_fallback_response(str(exc))

    # ------ 2. Ensure research is available ------
    if ENABLE_RESEARCH_FETCH:
        try:
            fetch_research_if_needed()
        except Exception as exc:
            logger.warning("Research fetching failed: %s", exc)
            # Continue — we'll work with whatever is on disk
    else:
        logger.debug(
            "Runtime research fetching disabled. "
            "Using pre-committed files in backend/research/."
        )

    # ------ 3. Load research context (cached after first call) ------
    global _cached_research, _cached_system_prompt, _cached_analysis_model
    try:
        if _cached_research is not None:
            research_context, research_files = _cached_research
        else:
            research_context, research_files = load_research_context()
            _cached_research = (research_context, research_files)
    except Exception as exc:
        return _safe_fallback_response(
            f"Failed to load research context: {exc}"
        )

    # ------ 4. If no research at all → immediate inconclusive ------
    if not research_files:
        return _safe_fallback_response(
            "No research documents found in backend/research/. "
            "Cannot perform evidence-based analysis without research context."
        )

    # ------ 5. Build prompts ------
    if _cached_system_prompt is None:
        _cached_system_prompt = _build_system_prompt(research_context, research_files)
    system_prompt = _cached_system_prompt
    user_prompt = _build_user_prompt(data)

    # ------ 6. Build model once (cached across calls & retries) ------
    if _cached_analysis_model is None:
        _cached_analysis_model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            generation_config={
                "temperature": TEMPERATURE,
                "response_mime_type": "application/json",
                "max_output_tokens": MAX_OUTPUT_TOKENS,
            },
            system_instruction=system_prompt,
        )
    model = _cached_analysis_model

    # ------ 7. Call Gemini with retry loop ------
    last_error: str = "Unknown error"

    for attempt in range(MAX_RETRIES + 1):
        try:

            prompt = user_prompt
            if attempt > 0:
                prompt += (
                    "\n\n⚠ PREVIOUS ATTEMPT FAILED SCHEMA VALIDATION.\n"
                    "You MUST return ONLY a single valid JSON object with "
                    "exactly these fields: risk_level, conditions_flagged, "
                    "confidence_score, explanation, research_references_used.\n"
                    "Do NOT wrap in markdown. Do NOT add commentary.\n"
                    f"Errors: {last_error}"
                )

            response = await model.generate_content_async(prompt)

            if not response.text:
                last_error = "Gemini returned empty response"
                continue

            # Strip any accidental markdown fences
            raw_text = response.text.strip()
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
            raw_text = re.sub(r"\s*```$", "", raw_text)

            result: dict[str, Any] = json.loads(raw_text)

            is_valid, errors = _validate_response(result)
            if is_valid:
                return _normalize_research_references(result)

            # Last attempt — try fixing
            if attempt == MAX_RETRIES:
                logger.warning(
                    "Validation errors on final attempt: %s — attempting fix",
                    errors,
                )
                fixed = _fix_response(result)
                ok, _ = _validate_response(fixed)
                if ok:
                    return _normalize_research_references(fixed)
                return _safe_fallback_response(
                    "Response did not match schema after retries and fix attempt"
                )

            last_error = f"Validation errors: {errors}"

        except json.JSONDecodeError as exc:
            last_error = f"Invalid JSON from model: {exc}"
            if attempt == MAX_RETRIES:
                return _safe_fallback_response(last_error)
        except Exception as exc:
            last_error = f"Gemini API error: {exc}"
            if attempt == MAX_RETRIES:
                return _safe_fallback_response(last_error)

    return _safe_fallback_response(last_error)


@router.post("/api/analyze")
async def analyze_route(data: dict[str, Any]):
    return await analyze_eye_movement(data)


# ===================================================================
# G. Synchronous Wrapper
# ===================================================================

def analyze_eye_movement_sync(data: dict[str, Any]) -> dict[str, Any]:
    """Synchronous convenience wrapper around :func:`analyze_eye_movement`.

    Safe to call from non-async code.  Will create an event loop if needed.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We're inside an existing async loop (e.g. FastAPI with sync endpoint).
        # Spin up a new thread to avoid blocking.
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, analyze_eye_movement(data))
            return future.result()
    else:
        return asyncio.run(analyze_eye_movement(data))


# ===================================================================
# Legacy shim — keep the original call_gemini interface working
# ===================================================================

def call_gemini(prompt: str, **kwargs: Any) -> str:
    """Legacy interface — sends a raw prompt to Gemini and returns text.

    For eye-movement analysis, prefer :func:`analyze_eye_movement` instead.
    """
    _configure_genai()
    model = genai.GenerativeModel(
        model_name=kwargs.get("model", MODEL_NAME),
        generation_config={"temperature": kwargs.get("temperature", TEMPERATURE)},
    )
    response = model.generate_content(prompt)
    return response.text if response.text else ""



