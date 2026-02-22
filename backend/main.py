from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from services.mongodb_atlas_service import connect, disconnect


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect to MongoDB on startup, disconnect on shutdown."""
    await connect()
    yield
    await disconnect()


app = FastAPI(title="AURA API", lifespan=lifespan)

# ---------------------------------------------------------------------------
# CORS — allow the React dev server and any deployed frontend origin
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:4173",   # Vite preview
        # Add your DigitalOcean frontend URL here once deployed, e.g.:
        # "https://aura.your-app.ondigitalocean.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "AURA API"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------

@app.get("/api/patients")
async def list_patients():
    from services.mongodb_atlas_service import list_patients as _list
    return await _list()


@app.post("/api/patients")
async def create_patient(body: dict):
    from services.mongodb_atlas_service import create_patient as _create
    return await _create(
        name=body["name"],
        age=body.get("age", 0),
        surgery_type=body.get("surgery_type", ""),
        surgery_date=body.get("surgery_date", ""),
        medications=body.get("medications", []),
        conditions=body.get("conditions", []),
        assigned_physician_id=body.get("assigned_physician_id"),
    )


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str):
    from services.mongodb_atlas_service import get_patient as _get
    patient = await _get(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@app.post("/api/session")
async def create_session(body: dict):
    """
    Submit a completed screening session.

    Expected body:
    {
        "patient_id": "...",
        "time_series": [
            {
                "timestamp": "2026-01-01T10:00:00",
                "saccade_velocity": 210,
                "fixation_stability": 0.85,
                "pupil_variability": 0.03,
                "antisaccade_latency": 295,
                "smooth_pursuit_gain": 0.88,
                "saccade_accuracy": 0.92,
                "prosaccade_latency": 190
            },
            ...  (up to TIME_SERIES_MAX_READINGS entries)
        ],
        "aura_score": 88,           // optional — computed by frontend or backend
        "gemini_summary": {...},    // optional — filled in by Gemini service
        "solana_tx_hash": "...",    // optional — filled in by Solana service
        "solana_explorer_url": "..." // optional
    }

    The first session for a patient automatically sets the permanent baseline.
    Subsequent sessions compute deltas vs. that baseline.
    Only the most recent TIME_SERIES_MAX_READINGS readings are stored.
    """
    from services.mongodb_atlas_service import create_session as _create
    if "time_series" not in body or not isinstance(body["time_series"], list):
        raise HTTPException(
            status_code=422,
            detail="'time_series' must be a non-empty list of metric readings."
        )
    return await _create(
        patient_id=body["patient_id"],
        time_series=body["time_series"],
        aura_score=body.get("aura_score"),
        gemini_summary=body.get("gemini_summary"),
        solana_tx_hash=body.get("solana_tx_hash"),
        solana_explorer_url=body.get("solana_explorer_url"),
    )


@app.get("/api/session/{patient_id}")
async def get_sessions(patient_id: str):
    from services.mongodb_atlas_service import get_sessions_for_patient as _get
    return await _get(patient_id)


# ---------------------------------------------------------------------------
# Longitudinal / trend analysis
# Powers the physician dashboard trend graphs and Gemini delta context.
# ---------------------------------------------------------------------------

@app.get("/api/longitudinal/{patient_id}")
async def get_longitudinal(patient_id: str):
    """
    Full longitudinal trend summary for one patient:
    AURA score trajectory, per-metric trends, deltas from the latest session,
    and an overall trajectory label (improving / stable / declining).
    """
    from services.mongodb_atlas_service import (
        get_sessions_for_patient,
        build_longitudinal_summary,
    )
    sessions = await get_sessions_for_patient(patient_id)
    return build_longitudinal_summary(sessions)
