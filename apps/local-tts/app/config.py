import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = "DM Local TTS"
    version: str = "0.1.0"
    default_voice_profile_id: str = "default_female_zh"
    provider: str = os.getenv("TTS_PROVIDER", "mock")
    piper_bin: str = os.getenv("PIPER_BIN", "piper")
    piper_model_path: str = os.getenv("PIPER_MODEL_PATH", "")
    piper_config_path: str = os.getenv("PIPER_CONFIG_PATH", "")
    piper_noise_scale: str = os.getenv("PIPER_NOISE_SCALE", "0.4")
    piper_length_scale: str = os.getenv("PIPER_LENGTH_SCALE", "1.05")
    piper_noise_w: str = os.getenv("PIPER_NOISE_W", "0.7")
    piper_sentence_silence: str = os.getenv("PIPER_SENTENCE_SILENCE", "0.12")
    xinference_tts_base_url: str = os.getenv("XINFERENCE_TTS_BASE_URL", "http://127.0.0.1:9997")
    xinference_tts_model_uid: str = os.getenv("XINFERENCE_TTS_MODEL_UID", "CosyVoice-300M")
    xinference_tts_voice: str = os.getenv("XINFERENCE_TTS_VOICE", "")
    xinference_tts_response_format: str = os.getenv("XINFERENCE_TTS_RESPONSE_FORMAT", "wav")
    xinference_tts_speed: str = os.getenv("XINFERENCE_TTS_SPEED", "1.0")


settings = Settings()
