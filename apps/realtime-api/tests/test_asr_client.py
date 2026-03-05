import asyncio
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.asr_client import ASRClient


class StubAsyncClient:
    def __init__(self, response: httpx.Response):
        self._response = response

    async def __aenter__(self) -> "StubAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(self, _url: str, files: dict[str, Any]) -> httpx.Response:
        assert "file" in files
        assert "model" in files
        return self._response


def test_transcribe_audio_returns_text(monkeypatch: pytest.MonkeyPatch) -> None:
    request = httpx.Request("POST", "http://unit.test/v1/audio/transcriptions")
    response = httpx.Response(200, request=request, json={"text": " 你好 "})
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: StubAsyncClient(response))

    text = asyncio.run(ASRClient().transcribe_audio(b"voice-bytes", mime_type="audio/webm"))

    assert text == "你好"


def test_transcribe_audio_treats_funasr_empty_500_as_empty_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = httpx.Request("POST", "http://unit.test/v1/audio/transcriptions")
    response = httpx.Response(
        500,
        request=request,
        json={"detail": "FunASR returned empty or invalid result: []"},
    )
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: StubAsyncClient(response))

    text = asyncio.run(ASRClient().transcribe_audio(b"noise", mime_type="audio/webm"))

    assert text == ""


def test_transcribe_audio_treats_audio_decode_500_as_empty_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = httpx.Request("POST", "http://unit.test/v1/audio/transcriptions")
    response = httpx.Response(
        500,
        request=request,
        json={"detail": "Failed to load audio: Error opening input file /tmp/tmp123"},
    )
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: StubAsyncClient(response))

    text = asyncio.run(ASRClient().transcribe_audio(b"noise", mime_type="audio/webm"))

    assert text == ""


def test_transcribe_audio_keeps_non_funasr_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    request = httpx.Request("POST", "http://unit.test/v1/audio/transcriptions")
    response = httpx.Response(500, request=request, json={"detail": "upstream exploded"})
    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: StubAsyncClient(response))

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(ASRClient().transcribe_audio(b"voice-bytes", mime_type="audio/webm"))
