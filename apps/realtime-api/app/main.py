from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.asr_client import ASRClient
from app.config import settings
from app.dify_client import DifyClient
from app.models import session_ready_event
from app.session import RealtimeSession
from app.tts_client import TTSClient


def create_app(
    asr_client: Optional[ASRClient] = None,
    dify_client: Optional[DifyClient] = None,
    tts_client: Optional[TTSClient] = None,
) -> FastAPI:
    app = FastAPI(title=settings.app_name, version=settings.version)
    repo_root = Path(__file__).resolve().parents[3]
    widget_dist_dir = repo_root / "packages" / "widget" / "dist"
    assets_dir = repo_root / "assets"

    app.mount("/widget", StaticFiles(directory=str(widget_dist_dir), check_dir=False), name="widget")
    app.mount("/assets", StaticFiles(directory=str(assets_dir), check_dir=False), name="assets")

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "service": "realtime-api", "version": app.version}

    @app.get("/", response_class=HTMLResponse)
    async def root() -> str:
        return """
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DM Digital Human Demo</title>
  </head>
  <body>
    <script type="module" src="/widget/index.js"></script>
    <script type="module">
      window.DigitalHumanWidget.mount({
        serverUrl: window.location.origin,
        avatarImage: "/assets/avatar/front.jpg",
        voiceProfile: "default_female_zh",
        draggable: true
      })
    </script>
  </body>
</html>
"""

    @app.websocket("/ws/realtime")
    async def realtime_socket(websocket: WebSocket) -> None:
        await websocket.accept()
        session = RealtimeSession(
            asr_client=asr_client,
            dify_client=dify_client,
            tts_client=tts_client,
        )
        session.bind_sender(websocket.send_json)
        await websocket.send_json(session_ready_event())

        try:
            while True:
                payload = await websocket.receive_json()
                events = await session.handle_event(payload)
                for event in events:
                    await websocket.send_json(event)
        except WebSocketDisconnect:
            await session.close()
            return

    return app


app = create_app()
