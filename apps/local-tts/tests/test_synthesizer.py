import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.synthesizer import PiperSynthesizer, XinferenceSynthesizer, build_synthesizer


def test_piper_synthesizer_passes_tuning_flags(monkeypatch) -> None:
    captured = {}

    def fake_run(command, input, stdout, stderr, check):
        captured["command"] = command
        return SimpleNamespace(returncode=0, stdout=b"\x00\x00" * 22050, stderr=b"")

    monkeypatch.setattr("app.synthesizer.subprocess.run", fake_run)
    monkeypatch.setattr(
        "app.synthesizer.settings",
        SimpleNamespace(
            piper_bin="piper",
            piper_model_path="/models/piper/model.onnx",
            piper_config_path="/models/piper/model.onnx.json",
            piper_noise_scale="0.45",
            piper_length_scale="1.12",
            piper_noise_w="0.72",
            piper_sentence_silence="0.18",
        ),
    )

    synthesizer = PiperSynthesizer()
    wav_bytes = synthesizer.synthesize("你好", "default_female_zh")

    assert wav_bytes
    assert "--noise_scale" in captured["command"]
    assert "--length_scale" in captured["command"]
    assert "--noise_w" in captured["command"]
    assert "--sentence_silence" in captured["command"]


def test_build_synthesizer_uses_xinference_provider(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.synthesizer.settings",
        SimpleNamespace(
            provider="xinference",
        ),
    )

    synthesizer = build_synthesizer()

    assert isinstance(synthesizer, XinferenceSynthesizer)


def test_xinference_synthesizer_posts_openai_compatible_request(monkeypatch) -> None:
    captured = {}

    class FakeResponse:
        status_code = 200
        content = b"audio-bytes"

        def raise_for_status(self) -> None:
            return None

    def fake_post(url, json=None, files=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["files"] = files
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("app.synthesizer.httpx.post", fake_post)
    monkeypatch.setattr(
        "app.synthesizer.settings",
        SimpleNamespace(
            xinference_tts_base_url="http://127.0.0.1:9997",
            xinference_tts_model_uid="CosyVoice-300M",
            xinference_tts_voice="",
            xinference_tts_response_format="wav",
            xinference_tts_speed="1.0",
        ),
    )

    synthesizer = XinferenceSynthesizer()
    output = synthesizer.synthesize("你好", "default_female_zh")

    assert output == b"audio-bytes"
    assert captured["url"] == "http://127.0.0.1:9997/v1/audio/speech"
    assert captured["json"]["model"] == "CosyVoice-300M"
    assert captured["json"]["input"] == "你好"
    assert captured["json"]["response_format"] == "wav"
    assert captured["timeout"] == 120


def test_xinference_synthesizer_raises_on_failed_request(monkeypatch) -> None:
    class FakeResponse:
        status_code = 503
        text = "bad gateway"

        def raise_for_status(self) -> None:
            raise RuntimeError("boom")

    monkeypatch.setattr("app.synthesizer.httpx.post", lambda *args, **kwargs: FakeResponse())
    monkeypatch.setattr(
        "app.synthesizer.settings",
        SimpleNamespace(
            xinference_tts_base_url="http://127.0.0.1:9997",
            xinference_tts_model_uid="CosyVoice-300M",
            xinference_tts_voice="",
            xinference_tts_response_format="wav",
            xinference_tts_speed="1.0",
        ),
    )

    synthesizer = XinferenceSynthesizer()

    with pytest.raises(RuntimeError):
        synthesizer.synthesize("你好", "default_female_zh")
