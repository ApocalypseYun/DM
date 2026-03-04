import base64
import io
import subprocess
import wave
from typing import Protocol

from app.config import settings


class Synthesizer(Protocol):
    def synthesize(self, text: str, voice_profile_id: str) -> bytes:
        ...


def build_synthesizer() -> Synthesizer:
    if settings.provider == "piper":
        return PiperSynthesizer()
    return MockSynthesizer()


class MockSynthesizer:
    def synthesize(self, text: str, voice_profile_id: str) -> bytes:
        # Generate a tiny audible placeholder waveform so the pipeline stays testable.
        frame_count = max(1600, min(16000, len(text.encode("utf-8")) * 400))
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)
            wav_file.writeframes(b"\x10\x00\x20\x00" * (frame_count // 2))
        return buffer.getvalue()


class PiperSynthesizer:
    def synthesize(self, text: str, voice_profile_id: str) -> bytes:
        if not settings.piper_model_path:
            raise RuntimeError("PIPER_MODEL_PATH is required for the piper provider")

        command = [
            settings.piper_bin,
            "--model",
            settings.piper_model_path,
            "--output_raw",
        ]
        if settings.piper_config_path:
            command.extend(["--config", settings.piper_config_path])
        if settings.piper_noise_scale:
            command.extend(["--noise_scale", settings.piper_noise_scale])
        if settings.piper_length_scale:
            command.extend(["--length_scale", settings.piper_length_scale])
        if settings.piper_noise_w:
            command.extend(["--noise_w", settings.piper_noise_w])
        if settings.piper_sentence_silence:
            command.extend(["--sentence_silence", settings.piper_sentence_silence])

        process = subprocess.run(
            command,
            input=text.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError(process.stderr.decode("utf-8", errors="ignore").strip() or "piper failed")

        raw_audio = process.stdout
        if not raw_audio:
            raise RuntimeError("piper returned no audio")

        return _wrap_pcm_as_wav(raw_audio)


def encode_wav_base64(wav_bytes: bytes) -> str:
    return base64.b64encode(wav_bytes).decode("ascii")


def _wrap_pcm_as_wav(raw_audio: bytes) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(22050)
        wav_file.writeframes(raw_audio)
    return buffer.getvalue()
