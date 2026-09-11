from langchain_core.messages import AIMessage

from app.agent.graph import build_graph
from app.agent.service import INCLUDE_TYPES, AgentService, create_agent_service
from app.agent.tools.weather import get_weather
from app.config import Settings
from tests.fakes import ScriptedChatModel

TOOL_CALL = AIMessage(content="", tool_calls=[{"id": "c1", "name": "get_weather", "args": {"city": "SP"}}])
FINAL = AIMessage(content="22°C em SP.")


def make_service(*script) -> AgentService:
    return AgentService(build_graph(ScriptedChatModel(script=iter(script)), [get_weather]))


def test_include_types_is_exactly_chat_model_and_tool():
    assert INCLUDE_TYPES == ["chat_model", "tool"]


async def test_stream_yields_stream_events_in_order():
    events = [e async for e in make_service(TOOL_CALL, FINAL).stream("clima?")]
    types = [e["event"] for e in events]
    assert types[0] == "on_chat_model_start"
    assert "on_tool_start" in types and "on_tool_end" in types
    assert types[-1] == "on_chat_model_end"
    assert all({"event", "name", "run_id", "data"} <= set(e) for e in events)


async def test_stream_emits_error_envelope_on_failure():
    events = [e async for e in make_service(RuntimeError("boom")).stream("x")]
    assert events[-1] == {"event": "error", "data": {"message": "boom"}}
    assert all(e["event"] != "on_chat_model_end" for e in events)


def test_create_agent_service_builds_without_network():
    settings = Settings(_env_file=None, openai_api_key="test-key")
    service = create_agent_service(settings)
    assert isinstance(service, AgentService)
