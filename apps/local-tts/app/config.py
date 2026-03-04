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


settings = Settings()
