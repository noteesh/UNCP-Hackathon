from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from services.eleven_labs_service import router as eleven_labs_router
from services.gemini_service import router as gemini_router
from services.mongodb_atlas_service import connect, disconnect, router as mongodb_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Connect to MongoDB on startup, disconnect on shutdown."""
    await connect()
    yield
    await disconnect()

app = FastAPI(title="AURA API", lifespan=lifespan)

app.include_router(eleven_labs_router)
app.include_router(gemini_router)
app.include_router(mongodb_router)


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
