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
    voice_id: str = "21m00Tcm4TlvDq8ikWAM",
    model_id: str = "eleven_flash_v2_5",
    stability: float | None = None,
    **kwargs,
) -> bytes:
    """
    Call Eleven Labs text-to-speech API. Uses ELEVENLABS_API_KEY from .env.
    """
    client = ElevenLabs(api_key=_get_api_key())
    opts: dict = {
        "text": text,
        "voice_id": voice_id,
        "model_id": model_id,
        "output_format": "mp3_44100_128",
        **kwargs,
    }
    if stability is not None:
        opts["voice_settings"] = {"stability": stability}
    result = client.text_to_speech.convert(**opts)
    if hasattr(result, "read"):
        return result.read()
    if isinstance(result, bytes):
        return result
    return b"".join(result)

class SpeechRequest(BaseModel):
    text: str
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Default: Rachel (Nurse-like)

@router.post("/api/v1/voice/generate")
async def generate_voice(request: SpeechRequest):
    """
    Receives text (from Gemini reasoning), converts to speech via ElevenLabs,
    and returns the audio stream directly to the frontend.
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
            model_id="eleven_flash_v2_5" # Low-latency for bedside apps
        )

        # 3. Return as a Streaming/Binary response
        # Using audio/mpeg ensures the browser/mobile app knows to play it as sound
        return Response(content=audio_data, media_type="audio/mpeg")

    except Exception as e:
        print(f"Server Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to synthesize speech")

# Example of how you'd trigger this from your Gemini logic
@router.post("/api/v1/recovery/analyze")
async def analyze_and_speak(test_data: dict):
    # 1. Process biomarkers (logic here)
    # 2. Get clinical reasoning from Gemini
    gemini_text = "Your saccadic velocity is slightly below baseline. Please rest."
    
    # 3. You can either call the function directly or let the frontend 
    # call the /voice/generate endpoint separately.
    return {"status": "success", "assessment": gemini_text}



# Mapping of instruction types to specific text
INSTRUCTION_SET = {
    "baseline_start": "Welcome to AURA. Let’s calibrate your baseline. Please hold the camera in front of you at eye level.",
    "eye_tracking": "Now, keep your head perfectly still. Follow the moving blue dot with your eyes only. Start now.",
    "vocal_test": "Please take a deep breath and repeat the following phrase clearly: The quick brown fox jumps over the lazy dog.",
    "post_op_start": "Welcome back. We are going to check your recovery status. Please follow the instructions as we did this morning.",
    "complete": "Test complete. Please wait a moment while we analyze your physiological readiness."
}

@router.get("/api/v1/voice/instructions")
async def get_instructions(type: str = Query(..., description="The key of the instruction set to read")):
    """
    Returns high-quality audio instructions based on the stage of the test.
    """
    # 1. Look up the text based on the type requested
    text = INSTRUCTION_SET.get(type)
    
    if not text:
        raise HTTPException(status_code=404, detail="Instruction type not found")

    try:
        # 2. Call the ElevenLabs service
        # Using a slightly higher 'stability' for instructions to sound more authoritative/clear
        audio_data = call_eleven_labs(
            text=text,
            voice_id="21m00Tcm4TlvDq8ikWAM", # Keeping the same 'Nurse' voice for consistency
            stability=0.8,
            model_id="eleven_flash_v2_5"
        )

        return Response(content=audio_data, media_type="audio/mpeg")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))