import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app, resolve_runtime_root


def test_health_endpoint_reports_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_root_page_serves_widget_demo_shell() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "DigitalHumanWidget.mount" in response.text


def test_resolve_runtime_root_falls_back_to_container_parent(tmp_path: Path) -> None:
    anchor = tmp_path / "app" / "main.py"
    anchor.parent.mkdir()
    anchor.write_text("", encoding="utf-8")

    assert resolve_runtime_root(anchor) == tmp_path


def test_websocket_accepts_connection_and_acknowledges_barge_in() -> None:
    client = TestClient(create_app())

    with client.websocket_connect("/ws/realtime") as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "session_ready"

        websocket.send_json({"type": "barge_in"})
        events = [websocket.receive_json() for _ in range(2)]

    assert events[0]["type"] == "interrupt_ack"
    assert events[0]["response_id"] is None
    assert events[1]["type"] == "avatar_state"
    assert events[1]["state"] == "listening"
