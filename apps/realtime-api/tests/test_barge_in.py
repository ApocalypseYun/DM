import asyncio
import base64
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.session import RealtimeSession


class SlowASRClient:
    async def transcribe_audio(self, _audio_bytes: bytes, mime_type: str = "audio/wav") -> str:
        await asyncio.sleep(0.2)
        return "你好"


class FakeDifyClient:
    async def respond(self, _text: str) -> str:
        return "你好，我在。"


class FakeTTSClient:
    async def synthesize(self, _text: str, voice_profile_id: str = "default_female_zh") -> dict:
        return {
            "voice_profile_id": voice_profile_id,
            "audio_format": "wav_base64",
            "audio_base64": base64.b64encode(b"fake-wav").decode("ascii"),
        }


@pytest.mark.asyncio
async def test_barge_in_cancels_pending_response_pipeline() -> None:
    emitted = []
    session = RealtimeSession(
        asr_client=SlowASRClient(),
        dify_client=FakeDifyClient(),
        tts_client=FakeTTSClient(),
    )
    session.bind_sender(lambda payload: _capture(emitted, payload))

    await session.handle_event(
        {
            "type": "audio_commit",
            "audio_base64": base64.b64encode(b"chunk-one").decode("ascii"),
            "mime_type": "audio/webm",
        }
    )
    interrupt_events = await session.handle_event({"type": "barge_in"})
    await asyncio.sleep(0.05)

    assert [event["type"] for event in interrupt_events] == ["interrupt_ack", "avatar_state"]
    assert all(event["type"] not in {"assistant_text_final", "tts_audio_chunk"} for event in emitted)


async def _capture(events: list, payload: dict) -> None:
    events.append(payload)
