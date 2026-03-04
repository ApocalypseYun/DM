from typing import Any, Dict

import httpx

from app.config import settings


class TTSClient:
    """Adapter for the local TTS service."""

    async def synthesize(self, text: str, voice_profile_id: str = "default_female_zh") -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{settings.local_tts_base_url.rstrip('/')}/tts/synthesize",
                json={
                    "text": text,
                    "voice_profile_id": voice_profile_id,
                },
            )
            response.raise_for_status()
            return response.json()
