import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.synthesizer import PiperSynthesizer


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
