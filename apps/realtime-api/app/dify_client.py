import httpx

from app.config import settings


class DifyClient:
    """Adapter for the existing Dify chat endpoint."""

    async def respond(self, text: str) -> str:
        if not text:
            return ""

        headers = {"Content-Type": "application/json"}
        if settings.dify_api_key:
            headers["Authorization"] = f"Bearer {settings.dify_api_key}"

        payload = {
            "inputs": {},
            "query": text,
            "response_mode": "blocking",
            "conversation_id": "",
            "user": "digital-human-widget",
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(settings.dify_chat_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return str(data.get("answer", "")).strip()
