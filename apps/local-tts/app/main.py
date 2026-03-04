from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.synthesizer import MockSynthesizer, Synthesizer, build_synthesizer, encode_wav_base64
from app.voices import SUPPORTED_VOICE_PROFILES


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1)
    voice_profile_id: Optional[str] = None


def create_app(synthesizer: Optional[Synthesizer] = None) -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.version)
    active_synthesizer = synthesizer or build_synthesizer()

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "service": "local-tts",
            "version": app.version,
            "provider": settings.provider,
        }

    @app.post("/tts/synthesize")
    async def synthesize(request: SynthesizeRequest) -> dict:
        voice_profile_id = request.voice_profile_id or settings.default_voice_profile_id
        if voice_profile_id not in SUPPORTED_VOICE_PROFILES:
            raise HTTPException(status_code=400, detail="Unsupported voice profile")

        try:
            wav_bytes = active_synthesizer.synthesize(request.text, voice_profile_id)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        return {
            "voice_profile_id": voice_profile_id,
            "audio_format": "wav_base64",
            "mime_type": "audio/wav",
            "audio_base64": encode_wav_base64(wav_bytes),
            "text": request.text,
        }

    return app


app = create_app()
