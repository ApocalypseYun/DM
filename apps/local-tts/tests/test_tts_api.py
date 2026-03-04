import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app


def test_synthesize_defaults_to_general_female_profile() -> None:
    client = TestClient(create_app())

    response = client.post("/tts/synthesize", json={"text": "你好"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["voice_profile_id"] == "default_female_zh"
    assert payload["audio_format"] == "wav_base64"
    assert payload["audio_base64"]


def test_synthesize_rejects_unknown_voice_profile() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/tts/synthesize",
        json={"text": "你好", "voice_profile_id": "missing-profile"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported voice profile"
