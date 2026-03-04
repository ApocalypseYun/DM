import base64
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app


class FakeASRClient:
    async def transcribe_audio(self, _audio_bytes: bytes, mime_type: str = "audio/wav") -> str:
        assert mime_type == "audio/webm"
        return "你好"


class FakeDifyClient:
    async def respond(self, text: str) -> str:
        assert text == "你好"
        return "你好，我在。"


class FakeTTSClient:
    async def synthesize(self, text: str, voice_profile_id: str = "default_female_zh") -> dict:
        assert text == "你好，我在。"
        return {
            "voice_profile_id": voice_profile_id,
            "audio_format": "wav_base64",
            "audio_base64": base64.b64encode(b"fake-wav").decode("ascii"),
        }


def test_audio_commit_runs_asr_dify_and_tts_pipeline() -> None:
    app = create_app(
        asr_client=FakeASRClient(),
        dify_client=FakeDifyClient(),
        tts_client=FakeTTSClient(),
    )
    client = TestClient(app)

    with client.websocket_connect("/ws/realtime") as websocket:
        assert websocket.receive_json()["type"] == "session_ready"

        websocket.send_json(
            {
                "type": "audio_commit",
                "audio_base64": base64.b64encode(b"chunk-one").decode("ascii"),
                "mime_type": "audio/webm",
                "voice_profile_id": "default_female_zh",
            }
        )

        events = [websocket.receive_json() for _ in range(7)]

    assert [event["type"] for event in events] == [
        "avatar_state",
        "asr_final",
        "avatar_state",
        "assistant_text_final",
        "avatar_state",
        "tts_audio_chunk",
        "avatar_state",
    ]
    assert events[0]["state"] == "listening"
    assert events[1]["text"] == "你好"
    assert events[2]["state"] == "thinking"
    assert events[3]["text"] == "你好，我在。"
    assert events[4]["state"] == "speaking"
    assert events[5]["audio_base64"]
    assert events[6]["state"] == "idle"
