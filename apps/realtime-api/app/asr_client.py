import httpx

from app.config import settings


class ASRClient:
    """Adapter for the existing Xinference ASR service."""

    async def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/wav") -> str:
        if not audio_bytes:
            return ""

        extension = "wav"
        if "/" in mime_type:
            extension = mime_type.split("/", 1)[1].split(";", 1)[0]
        files = {
            "file": (f"audio.{extension}", audio_bytes, mime_type),
            "model": (None, "paraformer-zh"),
        }
        url = f"{settings.xinference_base_url.rstrip('/')}/v1/audio/transcriptions"

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, files=files)
            response.raise_for_status()
            payload = response.json()
            return str(payload.get("text", "")).strip()
