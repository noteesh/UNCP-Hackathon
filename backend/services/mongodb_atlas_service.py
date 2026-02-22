"""
MongoDB Atlas service for AURA.

Collections
-----------
patients  — one document per patient (demographics + surgery info).
             Also stores the permanent `baseline` metrics from their very
             first session — this never changes and is the reference point
             for all future delta calculations.

sessions  — one document per screening session, linked by patient_id.
             Each session stores a rolling `time_series` of the N most
             recent individual readings (default: TIME_SERIES_MAX_READINGS).
             Also stores derived deltas vs. the patient baseline, Gemini
             summary, and Solana audit hash.

physicians — physician accounts; each holds a list of assigned patient_ids.

Metric fields (per reading)
---------------------------
  saccade_velocity       — deg/s, speed of rapid eye movement
  fixation_stability     — 0–1, how still the eye holds a fixation point
  pupil_variability      — 0–1, variance in pupil diameter (lower = more stable)
  antisaccade_latency    — ms, time to suppress a reflexive saccade (frontal lobe)
  smooth_pursuit_gain    — 0–1, gaze velocity / target velocity ratio
  saccade_accuracy       — 0–1, how close the saccade lands to the target
  prosaccade_latency     — ms, time to make a reflexive saccade to a target

All IDs are stored as plain strings (UUID4) so they round-trip cleanly
between Python, MongoDB _id, and the React frontend without ObjectId hassle.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration — easy-to-change constants
# ---------------------------------------------------------------------------

# Maximum number of individual readings stored in a session's time_series.
# When a new reading arrives and the list is already at this length, the
# oldest entry is dropped (sliding window).
# Change this value to adjust how many readings are kept per session.
TIME_SERIES_MAX_READINGS = 5

# The 7 metric keys that every reading must contain.
# Used for validation, delta computation, and baseline extraction.
METRIC_KEYS = [
    "saccade_velocity",
    "fixation_stability",
    "pupil_variability",
    "antisaccade_latency",
    "smooth_pursuit_gain",
    "saccade_accuracy",
    "prosaccade_latency",
]

# ---------------------------------------------------------------------------
# Connection singleton
# ---------------------------------------------------------------------------

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect() -> None:
    """Open the Motor connection pool. Call once at application startup."""
    global _client, _db
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI environment variable is not set.")
    _client = AsyncIOMotorClient(uri)
    _db = _client["aura"]
    await _db.command("ping")
    print("[MongoDB] Connected to Atlas cluster — database: aura")


async def disconnect() -> None:
    """Close the Motor connection pool. Call once at application shutdown."""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        print("[MongoDB] Disconnected.")


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not connected. Call connect() first.")
    return _db


# ---------------------------------------------------------------------------
# Collection helpers
# ---------------------------------------------------------------------------

def _patients():
    return get_db()["patients"]


def _sessions():
    return get_db()["sessions"]


def _physicians():
    return get_db()["physicians"]


# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# PATIENTS
# ---------------------------------------------------------------------------

async def create_patient(
    name: str,
    age: int,
    surgery_type: str,
    surgery_date: str,
    medications: list[str] | None = None,
    conditions: list[str] | None = None,
    assigned_physician_id: str | None = None,
) -> dict[str, Any]:
    """
    Insert a new patient document.
    `baseline` starts as None — it is set permanently the first time
    a completed session is saved for this patient.
    """
    doc = {
        "_id": _new_id(),
        "patient_id": _new_id(),
        "name": name,
        "age": age,
        "surgery_type": surgery_type,
        "surgery_date": surgery_date,
        "medications": medications or [],
        "conditions": conditions or [],
        "assigned_physician_id": assigned_physician_id,
        # Permanently set from the first session's averaged metrics.
        # Never overwritten after that.
        "baseline": None,
        "created_at": _now_iso(),
    }
    await _patients().insert_one(doc)
    return _strip_id(doc)


async def get_patient(patient_id: str) -> dict[str, Any] | None:
    doc = await _patients().find_one({"patient_id": patient_id})
    return _strip_id(doc) if doc else None


async def list_patients(physician_id: str | None = None) -> list[dict[str, Any]]:
    """
    Return all patients, optionally filtered to those assigned to a physician.
    Each patient document is enriched with their latest session summary so the
    physician dashboard can show scores without a second query.
    """
    query: dict[str, Any] = {}
    if physician_id:
        query["assigned_physician_id"] = physician_id

    patients = []
    async for doc in _patients().find(query).sort("created_at", -1):
        p = _strip_id(doc)
        latest = await _sessions().find_one(
            {"patient_id": p["patient_id"], "completed": True},
            sort=[("session_number", -1)],
        )
        if latest:
            summary = latest.get("gemini_summary") or {}
            p["latest_session"] = {
                "session_number": latest["session_number"],
                "timestamp": latest["timestamp"],
                "aura_score": latest.get("aura_score"),
                "risk_level": summary.get("risk_level"),
                "solana_tx_hash": latest.get("solana_tx_hash"),
            }
        else:
            p["latest_session"] = None
        patients.append(p)
    return patients


async def _set_patient_baseline(
    patient_id: str,
    baseline_metrics: dict[str, Any],
) -> None:
    """
    Write the baseline onto the patient document.
    Called exactly once — only when session_number == 1.
    Uses $set with a guard so a race condition can never overwrite an
    already-set baseline.
    """
    await _patients().update_one(
        {"patient_id": patient_id, "baseline": None},
        {"$set": {"baseline": baseline_metrics}},
    )


# ---------------------------------------------------------------------------
# SESSIONS
# ---------------------------------------------------------------------------

async def create_session(
    patient_id: str,
    time_series: list[dict[str, Any]],
    aura_score: float | None = None,
    gemini_summary: dict[str, Any] | None = None,
    solana_tx_hash: str | None = None,
    solana_explorer_url: str | None = None,
) -> dict[str, Any]:
    """
    Persist a completed screening session.

    `time_series` is a list of individual readings, each containing the 7
    metric keys defined in METRIC_KEYS plus a `timestamp` field.
    Only the most recent TIME_SERIES_MAX_READINGS entries are kept —
    older entries are trimmed from the front (sliding window).

    On the very first session for a patient (session_number == 1), the
    averaged metrics from time_series are saved as the patient's permanent
    baseline.

    For all subsequent sessions, deltas are computed between the current
    session's averaged metrics and the stored patient baseline.
    """
    # Enforce the sliding window limit
    windowed_series = time_series[-TIME_SERIES_MAX_READINGS:]

    # Compute the average of all readings in this session
    session_avg = _average_metrics(windowed_series)

    # Determine session number
    last = await _sessions().find_one(
        {"patient_id": patient_id},
        sort=[("session_number", -1)],
    )
    session_number = (last["session_number"] + 1) if last else 1

    # Fetch the patient to get the stored baseline
    patient = await _patients().find_one({"patient_id": patient_id})
    stored_baseline = patient.get("baseline") if patient else None

    # First session — this time_series average becomes the permanent baseline
    if session_number == 1:
        await _set_patient_baseline(patient_id, session_avg)
        baseline_used = session_avg
        derived_metrics = {
            "note": "baseline_session",
            "prior_session_number": None,
            "deltas_vs_baseline": None,
        }
    else:
        baseline_used = stored_baseline
        derived_metrics = {
            "prior_session_number": last["session_number"] if last else None,
            "deltas_vs_baseline": _compute_deltas_vs_baseline(
                session_avg, stored_baseline
            ),
        }

    session_id = _new_id()
    doc = {
        "_id": session_id,
        "session_id": session_id,
        "patient_id": patient_id,
        "session_number": session_number,
        "timestamp": _now_iso(),
        # The N most recent readings from this session
        "time_series": windowed_series,
        # Average of all readings — used for delta computation and Gemini prompt
        "session_averages": session_avg,
        # The baseline that was used to compute deltas (snapshot for auditability)
        "baseline_snapshot": baseline_used,
        "derived_metrics": derived_metrics,
        "aura_score": aura_score,
        "gemini_summary": gemini_summary or {},
        "solana_tx_hash": solana_tx_hash,
        "solana_explorer_url": solana_explorer_url,
        "completed": True,
    }
    await _sessions().insert_one(doc)
    return _strip_id(doc)


async def add_reading_to_session(
    session_id: str,
    reading: dict[str, Any],
) -> dict[str, Any]:
    """
    Append a single new reading to an in-progress session's time_series,
    enforcing the TIME_SERIES_MAX_READINGS sliding window via a MongoDB
    pipeline update (no read-modify-write race condition).

    Use this if you want to stream readings into a session as they arrive
    rather than submitting the whole list at once.
    """
    # Append and then slice to keep only the last N entries
    await _sessions().update_one(
        {"session_id": session_id},
        [
            {"$set": {
                "time_series": {
                    "$slice": [
                        {"$concatArrays": ["$time_series", [reading]]},
                        -TIME_SERIES_MAX_READINGS,
                    ]
                }
            }}
        ],
    )
    doc = await _sessions().find_one({"session_id": session_id})
    return _strip_id(doc) if doc else {}


async def get_sessions_for_patient(patient_id: str) -> list[dict[str, Any]]:
    """
    Return all completed sessions for a patient, oldest-first.
    This ordered list powers the longitudinal trend graphs.
    """
    sessions = []
    async for doc in _sessions().find(
        {"patient_id": patient_id, "completed": True},
        sort=[("session_number", 1)],
    ):
        sessions.append(_strip_id(doc))
    return sessions


async def get_session(session_id: str) -> dict[str, Any] | None:
    doc = await _sessions().find_one({"session_id": session_id})
    return _strip_id(doc) if doc else None


async def get_prior_session(patient_id: str) -> dict[str, Any] | None:
    """
    Return the most recently completed session for a patient.
    Used by the Gemini service to provide context in its prompt.
    """
    doc = await _sessions().find_one(
        {"patient_id": patient_id, "completed": True},
        sort=[("session_number", -1)],
    )
    return _strip_id(doc) if doc else None


async def update_session_audit(
    session_id: str,
    solana_tx_hash: str,
    solana_explorer_url: str,
) -> None:
    """Patch Solana audit fields onto an already-saved session."""
    await _sessions().update_one(
        {"session_id": session_id},
        {"$set": {
            "solana_tx_hash": solana_tx_hash,
            "solana_explorer_url": solana_explorer_url,
        }},
    )


# ---------------------------------------------------------------------------
# PHYSICIANS
# ---------------------------------------------------------------------------

async def create_physician(name: str, email: str) -> dict[str, Any]:
    doc = {
        "_id": _new_id(),
        "physician_id": _new_id(),
        "name": name,
        "email": email,
        "assigned_patient_ids": [],
        "created_at": _now_iso(),
    }
    await _physicians().insert_one(doc)
    return _strip_id(doc)


async def assign_patient_to_physician(
    physician_id: str, patient_id: str
) -> None:
    await _physicians().update_one(
        {"physician_id": physician_id},
        {"$addToSet": {"assigned_patient_ids": patient_id}},
    )
    await _patients().update_one(
        {"patient_id": patient_id},
        {"$set": {"assigned_physician_id": physician_id}},
    )


# ---------------------------------------------------------------------------
# Metric computation helpers
# ---------------------------------------------------------------------------

def _average_metrics(
    readings: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Average the 7 METRIC_KEYS across all readings in a time_series.
    Non-numeric or missing values are skipped gracefully.
    Returns a flat dict with one averaged value per metric key.
    """
    totals: dict[str, float] = {k: 0.0 for k in METRIC_KEYS}
    counts: dict[str, int] = {k: 0 for k in METRIC_KEYS}

    for reading in readings:
        for key in METRIC_KEYS:
            val = reading.get(key)
            if val is not None:
                try:
                    totals[key] += float(val)
                    counts[key] += 1
                except (TypeError, ValueError):
                    pass

    return {
        key: round(totals[key] / counts[key], 4) if counts[key] > 0 else None
        for key in METRIC_KEYS
    }


def _compute_deltas_vs_baseline(
    session_avg: dict[str, Any],
    baseline: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Compute (session_average - baseline) for each metric.
    The clinical interpretation of the sign differs per metric:
      saccade_velocity      — negative delta = worsening (slower)
      fixation_stability    — negative delta = worsening (less stable)
      pupil_variability     — positive delta = worsening (more variable)
      antisaccade_latency   — positive delta = worsening (slower suppression)
      smooth_pursuit_gain   — negative delta = worsening (worse tracking)
      saccade_accuracy      — negative delta = worsening (less accurate)
      prosaccade_latency    — positive delta = worsening (slower reflex)
    """
    if baseline is None:
        return None

    result = {}
    for key in METRIC_KEYS:
        curr = session_avg.get(key)
        base = baseline.get(key)
        if curr is not None and base is not None:
            result[f"delta_{key}"] = round(float(curr) - float(base), 4)
        else:
            result[f"delta_{key}"] = None
    return result


# ---------------------------------------------------------------------------
# Longitudinal / trend analysis
# ---------------------------------------------------------------------------

def build_longitudinal_summary(sessions: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Given an ordered list of sessions (oldest first) for one patient,
    return a summary structure ready for Gemini or the physician dashboard.

    Shape:
    {
        "session_count": int,
        "first_session_date": str,
        "latest_session_date": str,
        "aura_score_trend": [float | None, ...],
        "metric_trends": {
            "saccade_velocity":    [float | None, ...],
            "fixation_stability":  [float | None, ...],
            "pupil_variability":   [float | None, ...],
            "antisaccade_latency": [float | None, ...],
            "smooth_pursuit_gain": [float | None, ...],
            "saccade_accuracy":    [float | None, ...],
            "prosaccade_latency":  [float | None, ...],
        },
        "latest_deltas": dict,   # deltas from the most recent session
        "overall_trajectory": "improving" | "stable" | "declining" | "insufficient_data"
    }
    """
    if not sessions:
        return {"session_count": 0}

    aura_scores = [s.get("aura_score") for s in sessions]

    metric_trends = {
        key: [s.get("session_averages", {}).get(key) for s in sessions]
        for key in METRIC_KEYS
    }

    trajectory = "insufficient_data"
    valid_scores = [s for s in aura_scores if s is not None]
    if len(valid_scores) >= 2:
        diff = valid_scores[-1] - valid_scores[0]
        if diff >= 5:
            trajectory = "improving"
        elif diff <= -5:
            trajectory = "declining"
        else:
            trajectory = "stable"

    return {
        "session_count": len(sessions),
        "first_session_date": sessions[0]["timestamp"],
        "latest_session_date": sessions[-1]["timestamp"],
        "aura_score_trend": aura_scores,
        "metric_trends": metric_trends,
        "latest_deltas": sessions[-1].get("derived_metrics", {}),
        "overall_trajectory": trajectory,
    }


# ---------------------------------------------------------------------------
# Internal utilities
# ---------------------------------------------------------------------------

def _strip_id(doc: dict[str, Any] | None) -> dict[str, Any]:
    """Remove the internal MongoDB _id field before returning to callers."""
    if doc is None:
        return {}
    doc = dict(doc)
    doc.pop("_id", None)
    return doc
