import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from elevenlabs.client import ElevenLabs

# Load .env: from CWD (e.g. when you run uvicorn from backend/) and from backend dir
load_dotenv()  # CWD .env
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=str(_env_path))


def _get_api_key() -> str:
    key = os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVEN_LABS_API_KEY")
    if not key or not (key := key.strip()):
        raise ValueError(
            "ELEVENLABS_API_KEY is not set. Add ELEVENLABS_API_KEY=your_key to backend/.env"
        )
    return key


router = APIRouter()


def call_eleven_labs(
    text: str,
    voice_id: str = "1NThU4PKZ475tX1Ubtfy",
    model_id: str = "eleven_multilingual_v2",
    stability: float | None = 0.4,
    similarity_boost: float | None = 0.75,
    **kwargs,
) -> bytes:
    """
    Call Eleven Labs text-to-speech API. Uses ELEVENLABS_API_KEY from .env.
    Lower stability = more expressive; higher = more monotone. similarity_boost
    keeps the voice closer to the original (website preview) sound.
    """
    client = ElevenLabs(api_key=_get_api_key())
    opts: dict = {
        "text": text,
        "voice_id": voice_id,
        "model_id": model_id,
        "output_format": "mp3_44100_128",
        **kwargs,
    }
    voice_settings: dict = {}
    if stability is not None:
        voice_settings["stability"] = stability
    if similarity_boost is not None:
        voice_settings["similarity_boost"] = similarity_boost
    if voice_settings:
        opts["voice_settings"] = voice_settings
    result = client.text_to_speech.convert(**opts)
    if hasattr(result, "read"):
        return result.read()
    if isinstance(result, bytes):
        return result
    return b"".join(result)

class SpeechRequest(BaseModel):
    text: str
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Default: Rachel (Nurse-like)

@router.post("/voice/generate")
async def generate_voice(request: SpeechRequest):
    """
    Converts text to speech via ElevenLabs; returns audio/mpeg.
    Used by the landing page voice assistant (and others) when sending custom text.
    """
    try:
        # 1. Validate text isn't empty
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text for speech cannot be empty")

        # 2. Call our ElevenLabs service
        # We wrap this in a standard execution since we're using the SDK
        audio_data = call_eleven_labs(
            text=request.text,
            voice_id=request.voice_id,
            model_id="eleven_multilingual_v2",  # more natural; use eleven_flash_v2_5 for lower latency
        )

        # 3. Return as a Streaming/Binary response
        # Using audio/mpeg ensures the browser/mobile app knows to play it as sound
        return Response(content=audio_data, media_type="audio/mpeg")

    except Exception as e:
        print(f"Server Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to synthesize speech")

# Example of how you'd trigger this from your Gemini logic
@router.post("/recovery/analyze")
async def analyze_and_speak(test_data: dict):
    # 1. Process biomarkers (logic here)
    # 2. Get clinical reasoning from Gemini
    gemini_text = "Your saccadic velocity is slightly below baseline. Please rest."
    
    # 3. You can either call the function directly or let the frontend 
    # call the /voice/generate endpoint separately.
    return {"status": "success", "assessment": gemini_text}



# Mapping of instruction types to specific text.
# Landing page read-aloud: GET /voice/instructions?type=landing
INSTRUCTION_SET = {
    "landing": (
        "Welcome to AURA, the Advanced Under-eye Response Assessment. "
        "This simple test measures cognitive stability through eye movements and voice patterns. "
        "Please enable voice guidance for step-by-step instructions. "
        "When you're ready, press View Dashboard or Start Assessment."
    ),
    "baseline_start": "Welcome to AURA. Let’s calibrate your baseline. Please hold the camera in front of you at eye level.",
    "eye_tracking": "Now, keep your head perfectly still. Follow the moving blue dot with your eyes only. Start now.",
    "vocal_test": "Please take a deep breath and repeat the following phrase clearly: The quick brown fox jumps over the lazy dog.",
    "post_op_start": (
        "Welcome back. We are going to check your recovery status. "
        "Run a post-operative assessment to compare against your baseline. "
        "Same short eye-tracking and voice test—results appear on your dashboard. "
        "Complete the test when you're ready. Your results will be compared to your pre-op baseline."
    ),
    "complete": "Test complete. Please wait a moment while we analyze your physiological readiness.",
    "research_references": (
        "Research references. Papers and sources used by AURA. "
        "This page lists external research links and local documents that support the assessment. "
        "Use the links to open papers in a new tab. Press Read page aloud again to hear this message."
    ),
    "about_us": (
        "About AURA. Advanced Under-eye Response Assessment. "
        "AURA is a cognitive stability assessment tool that uses eye tracking and voice analysis "
        "to help monitor recovery and detect early signs of change. It is designed for use before and "
        "after procedures to establish a baseline and track progress. The assessment includes fixation "
        "stability, saccadic eye movement, smooth pursuit, and optional voice tests. Results are "
        "summarized on your dashboard and can be shared with your care team. This tool is for "
        "informational support only and does not replace professional medical advice. "
        "Always consult your physician about your health and recovery."
    ),
}

@router.get("/voice/instructions")
async def get_instructions(type: str = Query(..., description="The key of the instruction set to read")):
    """
    Returns high-quality audio instructions based on the stage of the test.
    """
    # 1. Look up the text based on the type requested
    text = INSTRUCTION_SET.get(type)
    
    if not text:
        raise HTTPException(status_code=404, detail="Instruction type not found")

    try:
        # 2. Call the ElevenLabs service (stability ~0.4 = more expressive, closer to website preview)
        audio_data = call_eleven_labs(
            text=text,
            voice_id="21m00Tcm4TlvDq8ikWAM",
            stability=0.4,
            similarity_boost=0.75,
            model_id="eleven_multilingual_v2",
        )

        return Response(content=audio_data, media_type="audio/mpeg")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))