import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = "DM Realtime API"
    version: str = "0.1.0"
    xinference_base_url: str = os.getenv("XINFERENCE_BASE_URL", "http://127.0.0.1:9997")
    dify_chat_url: str = os.getenv("DIFY_CHAT_URL", "http://127.0.0.1:88/v1/chat-messages")
    dify_api_key: str = os.getenv("DIFY_API_KEY", "")
    local_tts_base_url: str = os.getenv("LOCAL_TTS_BASE_URL", "http://127.0.0.1:8091")


settings = Settings()
