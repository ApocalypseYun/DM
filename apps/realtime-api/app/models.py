import base64
from typing import Any, Dict, Optional


def session_ready_event() -> Dict[str, Any]:
    return {"type": "session_ready"}


def interrupt_ack_event(response_id: Optional[str]) -> Dict[str, Any]:
    return {
        "type": "interrupt_ack",
        "response_id": response_id,
    }


def avatar_state_event(state: str, response_id: Optional[str] = None) -> Dict[str, Any]:
    return {
        "type": "avatar_state",
        "state": state,
        "response_id": response_id,
    }


def asr_final_event(text: str, response_id: Optional[str] = None) -> Dict[str, Any]:
    return {
        "type": "asr_final",
        "text": text,
        "response_id": response_id,
    }


def assistant_text_final_event(text: str, response_id: Optional[str] = None) -> Dict[str, Any]:
    return {
        "type": "assistant_text_final",
        "text": text,
        "response_id": response_id,
    }


def tts_audio_chunk_event(
    audio_base64: str,
    audio_format: str,
    voice_profile_id: str,
    response_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "type": "tts_audio_chunk",
        "audio_base64": audio_base64,
        "audio_format": audio_format,
        "voice_profile_id": voice_profile_id,
        "response_id": response_id,
    }


def error_event(detail: str) -> Dict[str, Any]:
    return {
        "type": "error",
        "detail": detail,
    }


def decode_audio_chunk(payload: Dict[str, Any], field_name: str = "audio_base64") -> bytes:
    raw = payload.get(field_name, "")
    if not isinstance(raw, str) or not raw:
        return b""
    return base64.b64decode(raw.encode("ascii"))
