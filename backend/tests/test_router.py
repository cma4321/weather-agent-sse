from fastapi.testclient import TestClient

from app.api.deps import get_agent
from app.main import create_app


class FakeAgent:
    def __init__(self):
        self.received: list[str] = []

    async def stream(self, message: str):
        self.received.append(message)
        yield {"event": "on_chat_model_stream", "name": "m", "run_id": "1", "data": {"chunk": {"content": "Oi"}}}
        yield {"event": "on_chat_model_end", "name": "m", "run_id": "1", "data": {"output": {"content": "Oi"}}}


def make_client() -> tuple[TestClient, FakeAgent]:
    app = create_app()
    fake = FakeAgent()
    app.dependency_overrides[get_agent] = lambda: fake
    return TestClient(app), fake


def test_execute_streams_sse():
    client, fake = make_client()
    with client.stream("POST", "/agent/execute", json={"message": "Qual o clima?"}) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = "".join(response.iter_text())
    assert fake.received == ["Qual o clima?"]
    frames = body.split("\n\n")
    assert frames[0].startswith("event: on_chat_model_stream\ndata: {")
    assert frames[1].startswith("event: on_chat_model_end\ndata: {")
    assert frames[2] == ""


def test_empty_message_is_rejected():
    client, _ = make_client()
    assert client.post("/agent/execute", json={"message": ""}).status_code == 422
    assert client.post("/agent/execute", json={}).status_code == 422
    assert client.post("/agent/execute", json={"message": "x" * 2001}).status_code == 422


def test_cors_allows_frontend_origin():
    client, _ = make_client()
    response = client.options(
        "/agent/execute",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"},
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_router_module_does_not_import_langgraph():
    import sys

    import app.api.agent_router  # noqa: F401

    with open(app.api.agent_router.__file__, encoding="utf-8") as fh:
        source = fh.read()
    assert "langgraph" not in source and "langchain" not in source
    assert "app.api.agent_router" in sys.modules
