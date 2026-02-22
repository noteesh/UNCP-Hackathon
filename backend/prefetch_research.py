#!/usr/bin/env python3
"""
Pre-fetch research papers into backend/research/ using Gemini Web Search.

Run this ONCE locally before deploying:
    cd backend
    python prefetch_research.py

The fetched .txt files are saved to backend/research/ and should be
committed to the repo so deployed instances never need to call web search.

Requires:
  - GEMINI_API_KEY set in backend/.env (or as an environment variable)
  - pip install google-generativeai python-dotenv
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure backend/ is on the path so we can import the service
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from services.gemini_service import (
    RESEARCH_DIR,
    RESEARCH_TOPICS,
    _research_file_exists,
    fetch_research_if_needed,
    _configure_genai,
)


def main() -> None:
    print("=" * 60)
    print("AURA Research Pre-Fetcher")
    print("=" * 60)

    # Check API key
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("\n❌ ERROR: No API key found.")
        print("   Set GEMINI_API_KEY in backend/.env or as an environment variable.")
        print("   Get a key at: https://aistudio.google.com/apikey")
        sys.exit(1)

    print(f"\n📁 Research directory: {RESEARCH_DIR}")
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)

    # Show current state
    existing = list(RESEARCH_DIR.iterdir())
    print(f"   Existing files: {len(existing)}")
    for f in existing:
        print(f"     • {f.name} ({f.stat().st_size:,} bytes)")

    # Check which topics still need fetching
    needed = [t for t in RESEARCH_TOPICS if not _research_file_exists(t)]
    cached = len(RESEARCH_TOPICS) - len(needed)

    print(f"\n📋 Topics: {len(RESEARCH_TOPICS)} total, {cached} cached, {len(needed)} to fetch")

    if not needed:
        print("\n✅ All research topics already cached. Nothing to do.")
        print("   Commit backend/research/ to your repo and deploy.")
        return

    print(f"\n🔍 Fetching {len(needed)} topic(s) via Gemini Web Search...\n")

    # Force the fetcher to run (it checks per-file caching internally)
    # We need to ensure _research_fetched is False
    import services.gemini_service as svc
    svc._research_fetched = False

    fetched_details = fetch_research_if_needed(verbose=True, return_details=True)

    fetched_files = [item.get("file") for item in fetched_details if item.get("file")]
    print(f"\n✅ Fetched {len(fetched_files)} file(s):")
    for item in fetched_details:
        fname = item.get("file", "")
        if not fname:
            continue
        fpath = RESEARCH_DIR / fname
        size = fpath.stat().st_size if fpath.exists() else 0
        status = "cached" if item.get("cached") else "new"
        print(f"   • {fname} ({size:,} bytes) [{status}]")

        sources = item.get("sources", [])
        if sources:
            print("     Papers:")
            for src in sources:
                title = src.get("title", "Unknown title")
                url = src.get("url", "")
                print(f"       - {title}")
                print(f"         Source: {url}")

        downloaded_pdfs = item.get("downloaded_pdfs", [])
        if downloaded_pdfs:
            print("     Downloaded PDFs:")
            for pdf_name in downloaded_pdfs:
                print(f"       - {pdf_name}")

    # Final summary
    all_files = list(RESEARCH_DIR.iterdir())
    total_size = sum(f.stat().st_size for f in all_files if f.is_file())
    print(f"\n📊 Total: {len(all_files)} file(s), {total_size:,} bytes")
    print("\n👉 Next steps:")
    print("   1. Review the files in backend/research/")
    print("   2. git add backend/research/")
    print("   3. git commit -m 'Add pre-fetched research papers'")
    print("   4. Deploy — the app will use these files without calling web search.")


if __name__ == "__main__":
    main()
