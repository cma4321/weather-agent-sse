from langchain_core.messages import AIMessage, HumanMessage

from app.agent.graph import build_graph
from app.agent.tools.weather import get_weather
from tests.fakes import ScriptedChatModel

TOOL_CALL = AIMessage(
    content="",
    tool_calls=[{"id": "call_1", "name": "get_weather", "args": {"city": "São Paulo"}}],
)
FINAL = AIMessage(content="Em São Paulo faz 22°C.")


def make_graph(*script):
    return build_graph(ScriptedChatModel(script=iter(script)), [get_weather])


async def test_model_calls_tool_then_answers():
    graph = make_graph(TOOL_CALL, FINAL)
    result = await graph.ainvoke({"messages": [HumanMessage("Qual o clima em São Paulo?")]})
    messages = result["messages"]
    assert [m.type for m in messages] == ["human", "ai", "tool", "ai"]
    assert messages[2].name == "get_weather"
    assert '"temp_c": 22' in messages[2].content
    assert messages[3].content == "Em São Paulo faz 22°C."


async def test_model_without_tool_call_ends_immediately():
    graph = make_graph(AIMessage(content="Oi!"))
    result = await graph.ainvoke({"messages": [HumanMessage("Oi")]})
    assert [m.type for m in result["messages"]] == ["human", "ai"]


async def test_astream_events_v2_emits_chat_model_and_tool_events():
    graph = make_graph(TOOL_CALL, FINAL)
    events = [
        event
        async for event in graph.astream_events(
            {"messages": [HumanMessage("clima sp")]},
            version="v2",
            include_types=["chat_model", "tool"],
        )
    ]
    names = [e["event"] for e in events]
    assert names[0] == "on_chat_model_start"
    assert "on_tool_start" in names and "on_tool_end" in names
    assert names[-1] == "on_chat_model_end"
    assert names.index("on_tool_end") < names.index("on_chat_model_end", names.index("on_tool_end"))
    assert set(names) <= {"on_chat_model_start", "on_chat_model_stream", "on_chat_model_end", "on_tool_start", "on_tool_end"}

    tool_end = next(e for e in events if e["event"] == "on_tool_end")
    assert tool_end["name"] == "get_weather"
    assert '"condition": "parcialmente nublado"' in tool_end["data"]["output"].content

    streamed = "".join(
        e["data"]["chunk"].content for e in events if e["event"] == "on_chat_model_stream"
    )
    assert streamed == "Em São Paulo faz 22°C."
