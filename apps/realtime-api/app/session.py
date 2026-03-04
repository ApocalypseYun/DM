import asyncio
import contextlib
from typing import Any, Awaitable, Callable, Dict, Optional
from uuid import uuid4

from app.asr_client import ASRClient
from app.dify_client import DifyClient
from app.models import (
    assistant_text_final_event,
    asr_final_event,
    avatar_state_event,
    decode_audio_chunk,
    error_event,
    interrupt_ack_event,
    tts_audio_chunk_event,
)
from app.tts_client import TTSClient

SendJson = Callable[[Dict[str, Any]], Awaitable[None]]


class RealtimeSession:
    def __init__(
        self,
        asr_client: Optional[ASRClient] = None,
        dify_client: Optional[DifyClient] = None,
        tts_client: Optional[TTSClient] = None,
    ) -> None:
        self.asr_client = asr_client or ASRClient()
        self.dify_client = dify_client or DifyClient()
        self.tts_client = tts_client or TTSClient()
        self.active_response_id: Optional[str] = None
        self.voice_profile_id = "default_female_zh"
        self._audio_buffer = bytearray()
        self._mime_type = "audio/wav"
        self._response_task: Optional[asyncio.Task] = None
        self._send_json: Optional[SendJson] = None

    def bind_sender(self, send_json: SendJson) -> None:
        self._send_json = send_json

    async def handle_event(self, payload: Dict[str, Any]) -> list[Dict[str, Any]]:
        event_type = payload.get("type")
        if event_type == "audio_chunk":
            self._audio_buffer.extend(decode_audio_chunk(payload))
            mime_type = payload.get("mime_type")
            if isinstance(mime_type, str) and mime_type:
                self._mime_type = mime_type
            return []

        if event_type == "set_voice_profile":
            voice_profile_id = payload.get("voice_profile_id")
            if isinstance(voice_profile_id, str) and voice_profile_id:
                self.voice_profile_id = voice_profile_id
            return []

        if event_type == "barge_in":
            await self._cancel_response()
            return [
                interrupt_ack_event(self.active_response_id),
                avatar_state_event("listening"),
            ]

        if event_type == "audio_commit":
            audio_bytes = decode_audio_chunk(payload)
            if audio_bytes:
                mime_type = payload.get("mime_type")
                if isinstance(mime_type, str) and mime_type:
                    self._mime_type = mime_type
            else:
                audio_bytes = bytes(self._audio_buffer)
            self._audio_buffer.clear()
            if not audio_bytes:
                return []

            voice_profile_id = payload.get("voice_profile_id")
            if isinstance(voice_profile_id, str) and voice_profile_id:
                self.voice_profile_id = voice_profile_id

            await self._cancel_response()

            response_id = uuid4().hex
            self.active_response_id = response_id
            self._response_task = asyncio.create_task(
                self._process_turn(audio_bytes, self._mime_type, response_id, self.voice_profile_id)
            )
            return []

        return [error_event("Unsupported event")]

    async def close(self) -> None:
        await self._cancel_response()

    async def _cancel_response(self) -> None:
        task = self._response_task
        self.active_response_id = None
        if not task or task.done():
            self._response_task = None
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        self._response_task = None

    async def _emit(self, payload: Dict[str, Any]) -> None:
        if self._send_json is not None:
            await self._send_json(payload)

    async def _process_turn(
        self,
        audio_bytes: bytes,
        mime_type: str,
        response_id: str,
        voice_profile_id: str,
    ) -> None:
        try:
            await self._emit(avatar_state_event("listening", response_id))

            user_text = await self.asr_client.transcribe_audio(audio_bytes, mime_type=mime_type)
            if not user_text:
                await self._emit(error_event("ASR returned empty text"))
                await self._emit(avatar_state_event("idle"))
                return
            if response_id != self.active_response_id:
                return

            await self._emit(asr_final_event(user_text, response_id))
            await self._emit(avatar_state_event("thinking", response_id))

            assistant_text = await self.dify_client.respond(user_text)
            if response_id != self.active_response_id:
                return

            await self._emit(assistant_text_final_event(assistant_text, response_id))

            tts_payload = await self.tts_client.synthesize(assistant_text, voice_profile_id=voice_profile_id)
            if response_id != self.active_response_id:
                return

            await self._emit(avatar_state_event("speaking", response_id))
            await self._emit(
                tts_audio_chunk_event(
                    tts_payload["audio_base64"],
                    tts_payload.get("audio_format", "wav_base64"),
                    tts_payload.get("voice_profile_id", voice_profile_id),
                    response_id,
                )
            )
            self.active_response_id = None
            await self._emit(avatar_state_event("idle"))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self.active_response_id = None
            await self._emit(error_event(str(exc)))
            await self._emit(avatar_state_event("idle"))
