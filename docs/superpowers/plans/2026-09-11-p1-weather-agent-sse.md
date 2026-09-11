# P1 Weather Agent SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A FastAPI endpoint streams a LangGraph weather agent's `astream_events` (v2) as SSE, and a Next.js chat renders tokens, tool calls, tool results and final text as separate states.

**Architecture:** Backend is layered: router (HTTP only) → `AgentService` (runs the compiled graph) → `build_graph` (model + tools nodes) → `get_weather` stub, with a pure SSE encoder in between. Frontend is a pure event pipeline: SSE parser → type dispatch → pure state handlers → React components keyed by block kind. The LLM is injected into the graph so all backend tests run against a scripted fake with no network.

**Tech Stack:** Python 3.11, uv, FastAPI 0.141, langgraph 1.2, langchain-openai 1.6, pydantic-settings 2.15, pytest 9 + pytest-asyncio 1.4, httpx. Next.js 16 (App Router), TypeScript, Tailwind 4, vitest 5. Node 22.

Spec: `docs/superpowers/specs/2026-09-11-p1-weather-agent-sse-design.md`

## Global Constraints

- Monorepo: `backend/` and `frontend/`. `.env` lives at the repo root and is gitignored (AC-09). `.env.example` at root is committed.
- Backend reads `<repo root>/.env`. Env vars: `OPENAI_API_KEY` (required), `OPENAI_MODEL` (default `gpt-4o-mini`), `WEATHER_DELAY_SECONDS` (default `2`), `CORS_ORIGINS` (default `http://localhost:3000`).
- Endpoint: `POST /agent/execute`, body `{"message": string}`, response `text/event-stream` (AC-01). The router never imports `langgraph` or `langchain_*` and never iterates the stream.
- Stream call is exactly `astream_events(..., version="v2", include_types=["chat_model", "tool"])` (AC-04).
- SSE frame: `event: <StreamEvent.event>` then `data: <whole StreamEvent as JSON>` then a blank line (AC-05).
- `get_weather(city: str)` does no HTTP, sleeps `WEATHER_DELAY_SECONDS`, always returns `{"city": <city>, "temp_c": 22, "condition": "parcialmente nublado"}` (AC-03).
- Front: an event whose type is not `on_chat_model_*` or `on_tool_*` throws `UnknownEventTypeError` (AC-06). `on_chat_model_stream` tokens concatenate into a draft; `on_chat_model_end` replaces that draft; tool call, tool result and final text are separate blocks (AC-07).
- Code, comments and docstrings in English. README in pt-BR.
- On this machine `uv` is installed as a pip package: if `uv` is not on PATH, run `python -m uv` instead of `uv`. Every `uv ...` command below can be written `python -m uv ...`.
- All backend commands run from `backend/`; all frontend commands run from `frontend/`. Git commands run from the repo root.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` on the last line.

---

## File Structure

```
.env.example                          # committed template
.gitignore                            # already exists (.env, .venv/, node_modules/, .next/ ...)
README.md                             # pt-BR run instructions (Task 13)
backend/
  pyproject.toml                      # uv project, deps, pytest config
  app/__init__.py
  app/config.py                       # Settings + get_settings()
  app/main.py                         # create_app(), lifespan, CORS, router mount
  app/api/__init__.py
  app/api/deps.py                     # get_agent(request) -> AgentService
  app/api/agent_router.py             # POST /agent/execute
  app/agent/__init__.py
  app/agent/service.py                # AgentService, create_agent_service(settings)
  app/agent/graph.py                  # build_graph(llm, tools)
  app/agent/tools/__init__.py
  app/agent/tools/weather.py          # get_weather
  app/sse/__init__.py
  app/sse/encoder.py                  # json_default, encode_frame, to_sse
  tests/__init__.py
  tests/conftest.py                   # env fixture
  tests/fakes.py                      # ScriptedChatModel
  tests/test_config.py
  tests/test_weather_tool.py
  tests/test_graph.py
  tests/test_encoder.py
  tests/test_service.py
  tests/test_router.py
frontend/                             # create-next-app output plus:
  vitest.config.ts
  src/lib/sse/parse.ts                # parseSse, parseFrame
  src/lib/sse/parse.test.ts
  src/lib/events/types.ts             # SseFrame, StreamEvent, MessageDump, guards, toStreamEvent, textOf
  src/lib/events/state.ts             # Block, Turn, ChatState, initialState, startTurn, updateLastTurn
  src/lib/events/handlers/chatModel.ts
  src/lib/events/handlers/chatModel.test.ts
  src/lib/events/handlers/tool.ts
  src/lib/events/handlers/tool.test.ts
  src/lib/events/dispatch.ts          # dispatch, UnknownEventTypeError
  src/lib/events/dispatch.test.ts
  src/hooks/useAgentStream.ts
  src/components/ChatWindow.tsx
  src/components/MessageInput.tsx
  src/components/TurnView.tsx
  src/components/blocks/ChatModelBlock.tsx
  src/components/blocks/ToolBlock.tsx
  src/app/page.tsx                    # renders ChatWindow
```

---

### Task 1: Backend project + Settings

**Files:**
- Create: `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_config.py`, `.env.example`

**Interfaces:**
- Produces: `app.config.Settings` with fields `openai_api_key: str`, `openai_model: str`, `weather_delay_seconds: float`, `cors_origins: str`, property `cors_origin_list: list[str]`; `app.config.get_settings() -> Settings` (lru_cached); `app.config.REPO_ROOT: Path`.

- [ ] **Step 1: Write pyproject.toml**

```toml
[project]
name = "praxis-p1-backend"
version = "0.1.0"
description = "Praxis P1 - LangGraph weather agent streamed over SSE"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.141",
    "uvicorn[standard]>=0.34",
    "langgraph>=1.2",
    "langchain-openai>=1.6",
    "pydantic-settings>=2.15",
]

[dependency-groups]
dev = [
    "pytest>=9",
    "pytest-asyncio>=1.4",
    "httpx>=0.28",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Create package markers and sync**

Create empty `backend/app/__init__.py` and `backend/tests/__init__.py`.

Run from `backend/`: `uv sync`
Expected: `.venv` created, `uv.lock` written, no errors.

- [ ] **Step 3: Write .env.example at repo root**

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
WEATHER_DELAY_SECONDS=2
CORS_ORIGINS=http://localhost:3000
```

- [ ] **Step 4: Write conftest.py**

```python
import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def _test_env(monkeypatch: pytest.MonkeyPatch):
    """Give every test a valid key and a zero tool delay, isolated from the real .env."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("WEATHER_DELAY_SECONDS", "0")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
```

- [ ] **Step 5: Write the failing test**

`backend/tests/test_config.py`:

```python
from app.config import REPO_ROOT, Settings, get_settings


def test_defaults_when_only_key_is_set(monkeypatch):
    monkeypatch.delenv("WEATHER_DELAY_SECONDS")
    settings = Settings(_env_file=None, openai_api_key="k")
    assert settings.openai_api_key == "k"
    assert settings.openai_model == "gpt-4o-mini"
    assert settings.weather_delay_seconds == 2.0
    assert settings.cors_origin_list == ["http://localhost:3000"]


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("OPENAI_MODEL", "gpt-x")
    monkeypatch.setenv("CORS_ORIGINS", "http://a:1, http://b:2")
    settings = Settings(_env_file=None)
    assert settings.openai_model == "gpt-x"
    assert settings.cors_origin_list == ["http://a:1", "http://b:2"]


def test_env_file_points_to_repo_root():
    assert (REPO_ROOT / ".env.example").is_file()
    assert Settings.model_config["env_file"] == REPO_ROOT / ".env"


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
```

- [ ] **Step 6: Run test to verify it fails**

Run: `uv run pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 7: Write config.py**

```python
"""Application settings loaded from the repo-root .env file and the environment."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/app -> backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: str
    openai_model: str = "gpt-4o-mini"
    weather_delay_seconds: float = 2.0
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 8: Run test to verify it passes**

Run: `uv run pytest tests/test_config.py -v`
Expected: 4 passed

- [ ] **Step 9: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/app backend/tests .env.example
git commit -m "feat(backend): scaffold uv project and settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: get_weather tool

**Files:**
- Create: `backend/app/agent/__init__.py`, `backend/app/agent/tools/__init__.py`, `backend/app/agent/tools/weather.py`, `backend/tests/test_weather_tool.py`

**Interfaces:**
- Consumes: `app.config.get_settings`
- Produces: `app.agent.tools.weather.get_weather` — a LangChain `BaseTool` named `get_weather`, async, arg `city: str`, returns `dict`.

- [ ] **Step 1: Write the failing test**

```python
import asyncio

import pytest

from app.agent.tools import weather
from app.agent.tools.weather import get_weather


def test_tool_metadata():
    assert get_weather.name == "get_weather"
    assert list(get_weather.args.keys()) == ["city"]


async def test_returns_fixed_stub():
    result = await get_weather.ainvoke({"city": "São Paulo"})
    assert result == {"city": "São Paulo", "temp_c": 22, "condition": "parcialmente nublado"}


async def test_sleeps_for_configured_delay(monkeypatch):
    monkeypatch.setenv("WEATHER_DELAY_SECONDS", "1.5")
    weather.get_settings.cache_clear()
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    await get_weather.ainvoke({"city": "Rio"})
    assert slept == [1.5]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_weather_tool.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agent'`

- [ ] **Step 3: Write weather.py (and empty `__init__.py` files)**

```python
"""Weather tool stub: no HTTP, fixed answer, configurable latency."""

import asyncio

from langchain_core.tools import tool

from app.config import get_settings


@tool
async def get_weather(city: str) -> dict:
    """Return the current weather for the given city."""
    await asyncio.sleep(get_settings().weather_delay_seconds)
    return {"city": city, "temp_c": 22, "condition": "parcialmente nublado"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_weather_tool.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/agent backend/tests/test_weather_tool.py
git commit -m "feat(backend): add get_weather stub tool

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Graph builder + scripted fake LLM

**Files:**
- Create: `backend/app/agent/graph.py`, `backend/tests/fakes.py`, `backend/tests/test_graph.py`

**Interfaces:**
- Consumes: `get_weather`
- Produces: `app.agent.graph.build_graph(llm: BaseChatModel, tools: Sequence[BaseTool]) -> CompiledStateGraph`; `tests.fakes.ScriptedChatModel(script=iter([...AIMessage | Exception...]))` with `bind_tools` returning itself.

- [ ] **Step 1: Write the fake chat model**

`backend/tests/fakes.py`:

```python
"""Scripted chat model for tests: replays AIMessages, streaming text word by word."""

from collections.abc import Iterator
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult


class ScriptedChatModel(BaseChatModel):
    """Each call pops the next item from `script`. An Exception item is raised."""

    script: Iterator[AIMessage | Exception]
    model_config = {"arbitrary_types_allowed": True}

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ScriptedChatModel":
        return self

    def _next(self) -> AIMessage:
        item = next(self.script)
        if isinstance(item, Exception):
            raise item
        return item

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._next())])

    def _stream(self, messages, stop=None, run_manager=None, **kwargs):
        message = self._next()
        if message.tool_calls:
            yield ChatGenerationChunk(message=AIMessageChunk(content="", tool_calls=message.tool_calls))
            return
        words = message.content.split(" ")
        for index, word in enumerate(words):
            text = word if index == len(words) - 1 else word + " "
            yield ChatGenerationChunk(message=AIMessageChunk(content=text))
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_graph.py`:

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `uv run pytest tests/test_graph.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agent.graph'`

- [ ] **Step 4: Write graph.py**

```python
"""LangGraph definition: a model node and a tools node with a conditional loop."""

from collections.abc import Sequence

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode, tools_condition


def build_graph(llm: BaseChatModel, tools: Sequence[BaseTool]) -> CompiledStateGraph:
    """Compile: START -> model -> (tools -> model)* -> END.

    The LLM is injected so tests can use a fake model with no network.
    """
    tool_list = list(tools)
    model = llm.bind_tools(tool_list)

    async def call_model(state: MessagesState) -> dict:
        response = await model.ainvoke(state["messages"])
        return {"messages": [response]}

    builder = StateGraph(MessagesState)
    builder.add_node("model", call_model)
    builder.add_node("tools", ToolNode(tool_list))
    builder.add_edge(START, "model")
    builder.add_conditional_edges("model", tools_condition)
    builder.add_edge("tools", "model")
    return builder.compile()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_graph.py -v`
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/agent/graph.py backend/tests/fakes.py backend/tests/test_graph.py
git commit -m "feat(backend): add model+tools graph builder with scripted fake LLM

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: SSE encoder

**Files:**
- Create: `backend/app/sse/__init__.py`, `backend/app/sse/encoder.py`, `backend/tests/test_encoder.py`

**Interfaces:**
- Produces: `app.sse.encoder.json_default(obj) -> Any`, `encode_frame(event: dict) -> str`, `to_sse(events: AsyncIterator[dict]) -> AsyncIterator[str]`.

- [ ] **Step 1: Write the failing test**

```python
import json

from langchain_core.messages import AIMessageChunk

from app.sse.encoder import encode_frame, to_sse


def test_frame_has_event_and_full_data():
    event = {"event": "on_tool_start", "name": "get_weather", "run_id": "r1", "data": {"input": {"city": "SP"}}}
    frame = encode_frame(event)
    assert frame.startswith("event: on_tool_start\ndata: ")
    assert frame.endswith("\n\n")
    payload = json.loads(frame[len("event: on_tool_start\ndata: ") : -2])
    assert payload == event


def test_pydantic_messages_are_dumped():
    chunk = AIMessageChunk(content="Olá")
    frame = encode_frame({"event": "on_chat_model_stream", "name": "m", "run_id": "r", "data": {"chunk": chunk}})
    payload = json.loads(frame.split("data: ", 1)[1])
    assert payload["data"]["chunk"]["content"] == "Olá"
    assert payload["data"]["chunk"]["type"] == "AIMessageChunk"


def test_unknown_objects_fall_back_to_str():
    class Weird:
        def __str__(self):
            return "weird"

    frame = encode_frame({"event": "x", "data": {"obj": Weird()}})
    assert json.loads(frame.split("data: ", 1)[1])["data"]["obj"] == "weird"


def test_newlines_in_strings_stay_on_one_data_line():
    frame = encode_frame({"event": "x", "data": {"text": "a\nb"}})
    assert frame.count("\n") == 3  # event line, data line, blank line


async def test_to_sse_encodes_each_event():
    async def events():
        yield {"event": "a", "data": {}}
        yield {"event": "b", "data": {}}

    frames = [f async for f in to_sse(events())]
    assert frames == ['event: a\ndata: {"event": "a", "data": {}}\n\n', 'event: b\ndata: {"event": "b", "data": {}}\n\n']
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_encoder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.sse'`

- [ ] **Step 3: Write encoder.py (and empty `app/sse/__init__.py`)**

```python
"""Serialise LangChain StreamEvents as Server-Sent Events frames."""

import json
from collections.abc import AsyncIterator
from typing import Any

from pydantic import BaseModel


def json_default(obj: Any) -> Any:
    """Make messages/chunks (pydantic models) JSON-friendly; stringify anything else."""
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    return str(obj)


def encode_frame(event: dict[str, Any]) -> str:
    """One SSE frame: the event type plus the whole StreamEvent as JSON."""
    payload = json.dumps(event, default=json_default, ensure_ascii=False)
    return f"event: {event['event']}\ndata: {payload}\n\n"


async def to_sse(events: AsyncIterator[dict[str, Any]]) -> AsyncIterator[str]:
    async for event in events:
        yield encode_frame(event)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_encoder.py -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/sse backend/tests/test_encoder.py
git commit -m "feat(backend): add SSE encoder for stream events

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: AgentService

**Files:**
- Create: `backend/app/agent/service.py`, `backend/tests/test_service.py`

**Interfaces:**
- Consumes: `build_graph`, `get_weather`, `Settings`, `ScriptedChatModel`
- Produces: `app.agent.service.AgentService(graph)` with `async def stream(self, message: str) -> AsyncIterator[dict]`; `app.agent.service.create_agent_service(settings: Settings) -> AgentService`; constant `INCLUDE_TYPES = ["chat_model", "tool"]`.

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.agent.service'`

- [ ] **Step 3: Write service.py**

```python
"""AgentService: runs the compiled graph and yields LangChain StreamEvents."""

import logging
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.graph.state import CompiledStateGraph

from app.agent.graph import build_graph
from app.agent.tools.weather import get_weather
from app.config import Settings

logger = logging.getLogger(__name__)

INCLUDE_TYPES = ["chat_model", "tool"]


class AgentService:
    def __init__(self, graph: CompiledStateGraph) -> None:
        self._graph = graph

    async def stream(self, message: str) -> AsyncIterator[dict[str, Any]]:
        """Yield every chat_model/tool StreamEvent (v2). On failure yield one error envelope and stop."""
        try:
            async for event in self._graph.astream_events(
                {"messages": [HumanMessage(content=message)]},
                version="v2",
                include_types=INCLUDE_TYPES,
            ):
                yield event
        except Exception as exc:  # noqa: BLE001 - surfaced to the client as a final frame
            logger.exception("agent stream failed")
            yield {"event": "error", "data": {"message": str(exc)}}


def create_agent_service(settings: Settings) -> AgentService:
    """Wire the real OpenAI model and the weather tool into a compiled graph."""
    llm = ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key, streaming=True)
    return AgentService(build_graph(llm, [get_weather]))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_service.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/agent/service.py backend/tests/test_service.py
git commit -m "feat(backend): add AgentService wrapping astream_events v2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: FastAPI app and POST /agent/execute

**Files:**
- Create: `backend/app/api/__init__.py`, `backend/app/api/deps.py`, `backend/app/api/agent_router.py`, `backend/app/main.py`, `backend/tests/test_router.py`

**Interfaces:**
- Consumes: `AgentService`, `create_agent_service`, `to_sse`, `get_settings`
- Produces: `app.main.app` (ASGI), `app.main.create_app() -> FastAPI`, `app.api.deps.get_agent(request) -> AgentService`, route `POST /agent/execute`.

- [ ] **Step 1: Write the failing test**

```python
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

    source = open(app.api.agent_router.__file__, encoding="utf-8").read()
    assert "langgraph" not in source and "langchain" not in source
    assert "app.api.agent_router" in sys.modules
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_router.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.api'`

- [ ] **Step 3: Write deps.py (and empty `app/api/__init__.py`)**

```python
"""FastAPI dependencies."""

from fastapi import Request

from app.agent.service import AgentService


def get_agent(request: Request) -> AgentService:
    """The single AgentService built at startup (see app.main.lifespan)."""
    return request.app.state.agent
```

- [ ] **Step 4: Write agent_router.py**

```python
"""HTTP surface for the agent. Knows nothing about graphs or LangChain."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent.service import AgentService
from app.api.deps import get_agent
from app.sse.encoder import to_sse

router = APIRouter(prefix="/agent", tags=["agent"])


class ExecuteRequest(BaseModel):
    message: str = Field(min_length=1)


@router.post("/execute")
async def execute(body: ExecuteRequest, agent: AgentService = Depends(get_agent)) -> StreamingResponse:
    """Hand the agent's event stream straight to the client as SSE."""
    return StreamingResponse(
        to_sse(agent.stream(body.message)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 5: Write main.py**

```python
"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.service import create_agent_service
from app.api.agent_router import router as agent_router
from app.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.agent = create_agent_service(get_settings())
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Praxis P1 - Weather Agent", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(agent_router)
    return app


app = create_app()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest -v`
Expected: all tests pass (config 4, weather 3, graph 3, encoder 5, service 4, router 4).

- [ ] **Step 7: Boot check without a real key**

Run from `backend/`: `OPENAI_API_KEY=test-key uv run python -c "from app.main import app; print([r.path for r in app.routes])"`
Expected: output includes `/agent/execute`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api backend/app/main.py backend/tests/test_router.py
git commit -m "feat(backend): add FastAPI app with POST /agent/execute SSE route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Frontend scaffold, vitest, event types and state

**Files:**
- Create: `frontend/` via create-next-app, `frontend/vitest.config.ts`, `frontend/src/lib/events/types.ts`, `frontend/src/lib/events/state.ts`, `frontend/src/lib/events/state.test.ts`
- Modify: `frontend/package.json` (add `test` script)

**Interfaces:**
- Produces (types.ts): `SseFrame = { event: string; data: unknown }`; `StreamEvent = { event: string; name: string; run_id: string; data: Record<string, unknown>; tags?: string[]; metadata?: Record<string, unknown>; parent_ids?: string[] }`; `ToolCall = { id?: string; name: string; args: unknown }`; `MessageDump = { content: unknown; tool_calls?: ToolCall[]; type?: string; name?: string }`; `isChatModelEvent(type: string): boolean`; `isToolEvent(type: string): boolean`; `toStreamEvent(frame: SseFrame): StreamEvent`; `textOf(content: unknown): string`.
- Produces (state.ts): `Block`, `Turn`, `ChatStatus`, `ChatState`, `initialState`, `startTurn(state, id, user)`, `updateLastTurn(state, fn)`.

- [ ] **Step 1: Scaffold Next.js**

Run from repo root:

```bash
npx --yes create-next-app@latest frontend --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes
```

Expected: `frontend/` with `src/app/page.tsx`, `package.json` (next 16.x, react 19.x, tailwindcss 4.x).

- [ ] **Step 2: Add vitest**

Run from `frontend/`: `npm install -D vitest`

Add to `frontend/package.json` scripts: `"test": "vitest run"`.

Create `frontend/vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
});
```

- [ ] **Step 3: Write types.ts**

```ts
/** Wire and domain types for the agent event stream. */

export type SseFrame = { event: string; data: unknown };

/** A LangChain StreamEvent (astream_events v2) as serialised by the backend. */
export type StreamEvent = {
  event: string;
  name: string;
  run_id: string;
  data: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
  parent_ids?: string[];
};

export type ToolCall = { id?: string; name: string; args: unknown };

/** Shape of a pydantic `model_dump()` of an AIMessage / AIMessageChunk / ToolMessage. */
export type MessageDump = {
  content: unknown;
  tool_calls?: ToolCall[];
  type?: string;
  name?: string;
};

export const CHAT_MODEL_PREFIX = "on_chat_model_";
export const TOOL_PREFIX = "on_tool_";

export function isChatModelEvent(type: string): boolean {
  return type.startsWith(CHAT_MODEL_PREFIX);
}

export function isToolEvent(type: string): boolean {
  return type.startsWith(TOOL_PREFIX);
}

/** The frame's data IS the StreamEvent (AC-05); this just narrows it. */
export function toStreamEvent(frame: SseFrame): StreamEvent {
  const raw = (frame.data ?? {}) as Partial<StreamEvent>;
  return {
    event: frame.event,
    name: typeof raw.name === "string" ? raw.name : "",
    run_id: typeof raw.run_id === "string" ? raw.run_id : "",
    data: (raw.data as Record<string, unknown>) ?? {},
    tags: raw.tags,
    metadata: raw.metadata,
    parent_ids: raw.parent_ids,
  };
}

/** Message content can be a string or a list of content blocks; return plain text. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) return String((block as { text: unknown }).text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}
```

- [ ] **Step 4: Write the failing state test**

`frontend/src/lib/events/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialState, startTurn, updateLastTurn, type Block } from "./state";

describe("state helpers", () => {
  it("startTurn appends a turn with no blocks", () => {
    const s = startTurn(initialState, "t1", "oi");
    expect(s.turns).toEqual([{ id: "t1", user: "oi", blocks: [] }]);
  });

  it("updateLastTurn only touches the last turn and keeps others", () => {
    let s = startTurn(initialState, "t1", "a");
    s = startTurn(s, "t2", "b");
    const draft: Block = { kind: "draft", text: "x" };
    s = updateLastTurn(s, (blocks) => [...blocks, draft]);
    expect(s.turns[0].blocks).toEqual([]);
    expect(s.turns[1].blocks).toEqual([draft]);
  });

  it("updateLastTurn with no turns returns the same state", () => {
    expect(updateLastTurn(initialState, (b) => b)).toBe(initialState);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run from `frontend/`: `npm test`
Expected: FAIL, cannot resolve `./state`.

- [ ] **Step 6: Write state.ts**

```ts
/** Chat state: a list of turns, each holding ordered blocks (AC-07). */

export type Block =
  | { kind: "draft"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool_call"; name: string; args: unknown }
  | { kind: "tool_result"; name: string; input: unknown; output?: string; running: boolean };

export type Turn = { id: string; user: string; blocks: Block[] };

export type ChatStatus = "idle" | "streaming" | "done" | "error";

export type ChatState = { turns: Turn[]; status: ChatStatus; error?: string };

export const initialState: ChatState = { turns: [], status: "idle" };

export function startTurn(state: ChatState, id: string, user: string): ChatState {
  return { ...state, turns: [...state.turns, { id, user, blocks: [] }] };
}

export function updateLastTurn(state: ChatState, fn: (blocks: Block[]) => Block[]): ChatState {
  if (state.turns.length === 0) return state;
  const last = state.turns[state.turns.length - 1];
  const updated: Turn = { ...last, blocks: fn(last.blocks) };
  return { ...state, turns: [...state.turns.slice(0, -1), updated] };
}
```

- [ ] **Step 7: Run tests and lint**

Run from `frontend/`: `npm test` then `npm run lint`
Expected: 3 passed; lint clean.

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scaffold Next.js app with vitest, event types and chat state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: SSE parser

**Files:**
- Create: `frontend/src/lib/sse/parse.ts`, `frontend/src/lib/sse/parse.test.ts`

**Interfaces:**
- Consumes: `SseFrame`
- Produces: `parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame>`; `parseFrame(raw: string): SseFrame | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseFrame, parseSse } from "./parse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const out = [];
  for await (const frame of parseSse(streamOf(chunks))) out.push(frame);
  return out;
}

describe("parseFrame", () => {
  it("reads event and JSON data", () => {
    expect(parseFrame('event: on_tool_start\ndata: {"a":1}')).toEqual({ event: "on_tool_start", data: { a: 1 } });
  });
  it("defaults event to message and ignores comments", () => {
    expect(parseFrame(': ping\ndata: {"a":1}')).toEqual({ event: "message", data: { a: 1 } });
  });
  it("returns null without data", () => {
    expect(parseFrame("event: x")).toBeNull();
    expect(parseFrame("")).toBeNull();
  });
});

describe("parseSse", () => {
  it("yields two frames from one chunk", async () => {
    const frames = await collect(['event: a\ndata: {"n":1}\n\nevent: b\ndata: {"n":2}\n\n']);
    expect(frames).toEqual([
      { event: "a", data: { n: 1 } },
      { event: "b", data: { n: 2 } },
    ]);
  });

  it("reassembles a frame split across chunks", async () => {
    const frames = await collect(["event: a\nda", 'ta: {"n":', "1}\n", "\n"]);
    expect(frames).toEqual([{ event: "a", data: { n: 1 } }]);
  });

  it("handles multi-byte characters split across chunks", async () => {
    const bytes = new TextEncoder().encode('event: a\ndata: {"t":"São"}\n\n');
    const cut = bytes.indexOf(0xc3) + 1; // split inside "ã"
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const out = [];
    for await (const f of parseSse(stream)) out.push(f);
    expect(out).toEqual([{ event: "a", data: { t: "São" } }]);
  });

  it("flushes a trailing frame without final blank line", async () => {
    const frames = await collect(['event: a\ndata: {"n":1}']);
    expect(frames).toEqual([{ event: "a", data: { n: 1 } }]);
  });

  it("accepts CRLF line endings", async () => {
    const frames = await collect(['event: a\r\ndata: {"n":1}\r\n\r\n']);
    expect(frames).toEqual([{ event: "a", data: { n: 1 } }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `npm test`
Expected: FAIL, cannot resolve `./parse`.

- [ ] **Step 3: Write parse.ts**

```ts
/** Minimal SSE parser over a fetch body. No dependencies. */

import type { SseFrame } from "@/lib/events/types";

/** Parse one raw frame (lines between blank lines). Returns null if it carries no data. */
export function parseFrame(raw: string): SseFrame | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of raw.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return null;
  return { event, data: JSON.parse(dataLines.join("\n")) };
}

/** Yield frames as they complete; tolerant of chunk boundaries anywhere. */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const frame = parseFrame(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        if (frame) yield frame;
        separator = buffer.indexOf("\n\n");
      }

      if (done) {
        const trailing = parseFrame(buffer);
        if (trailing) yield trailing;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `frontend/`: `npm test`
Expected: all passed (state 3 + parse 8).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/sse
git commit -m "feat(frontend): add dependency-free SSE parser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Chat-model and tool handlers (AC-07)

**Files:**
- Create: `frontend/src/lib/events/handlers/chatModel.ts`, `frontend/src/lib/events/handlers/chatModel.test.ts`, `frontend/src/lib/events/handlers/tool.ts`, `frontend/src/lib/events/handlers/tool.test.ts`

**Interfaces:**
- Consumes: `ChatState`, `Block`, `updateLastTurn`, `StreamEvent`, `MessageDump`, `textOf`
- Produces: `handleChatModelEvent(state: ChatState, event: StreamEvent): ChatState`; `handleToolEvent(state: ChatState, event: StreamEvent): ChatState`.

- [ ] **Step 1: Write the failing chat-model test**

`chatModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialState, startTurn } from "../state";
import type { StreamEvent } from "../types";
import { handleChatModelEvent } from "./chatModel";

const ev = (event: string, data: Record<string, unknown>): StreamEvent => ({ event, name: "llm", run_id: "r", data });
const base = startTurn(initialState, "t", "oi");
const blocks = (s: ReturnType<typeof startTurn>) => s.turns[0].blocks;

describe("handleChatModelEvent", () => {
  it("start opens an empty draft", () => {
    expect(blocks(handleChatModelEvent(base, ev("on_chat_model_start", {})))).toEqual([{ kind: "draft", text: "" }]);
  });

  it("stream concatenates tokens into the draft", () => {
    let s = handleChatModelEvent(base, ev("on_chat_model_start", {}));
    s = handleChatModelEvent(s, ev("on_chat_model_stream", { chunk: { content: "Em " } }));
    s = handleChatModelEvent(s, ev("on_chat_model_stream", { chunk: { content: "SP" } }));
    expect(blocks(s)).toEqual([{ kind: "draft", text: "Em SP" }]);
  });

  it("stream without a draft creates one", () => {
    const s = handleChatModelEvent(base, ev("on_chat_model_stream", { chunk: { content: "x" } }));
    expect(blocks(s)).toEqual([{ kind: "draft", text: "x" }]);
  });

  it("stream with empty content is a no-op", () => {
    const s = handleChatModelEvent(base, ev("on_chat_model_start", {}));
    expect(handleChatModelEvent(s, ev("on_chat_model_stream", { chunk: { content: "" } }))).toBe(s);
  });

  it("end replaces the draft with final text", () => {
    let s = handleChatModelEvent(base, ev("on_chat_model_start", {}));
    s = handleChatModelEvent(s, ev("on_chat_model_stream", { chunk: { content: "rascu" } }));
    s = handleChatModelEvent(s, ev("on_chat_model_end", { output: { content: "Faz 22°C.", tool_calls: [] } }));
    expect(blocks(s)).toEqual([{ kind: "text", text: "Faz 22°C." }]);
  });

  it("end with tool_calls replaces the draft with tool_call blocks", () => {
    let s = handleChatModelEvent(base, ev("on_chat_model_start", {}));
    s = handleChatModelEvent(
      s,
      ev("on_chat_model_end", { output: { content: "", tool_calls: [{ id: "c1", name: "get_weather", args: { city: "SP" } }] } }),
    );
    expect(blocks(s)).toEqual([{ kind: "tool_call", name: "get_weather", args: { city: "SP" } }]);
  });

  it("end with empty content and no tool_calls drops the draft", () => {
    let s = handleChatModelEvent(base, ev("on_chat_model_start", {}));
    s = handleChatModelEvent(s, ev("on_chat_model_end", { output: { content: "", tool_calls: [] } }));
    expect(blocks(s)).toEqual([]);
  });

  it("end only replaces the latest draft, keeping earlier blocks", () => {
    let s = handleChatModelEvent(base, ev("on_chat_model_start", {}));
    s = handleChatModelEvent(s, ev("on_chat_model_end", { output: { content: "", tool_calls: [{ name: "get_weather", args: {} }] } }));
    s = handleChatModelEvent(s, ev("on_chat_model_start", {}));
    s = handleChatModelEvent(s, ev("on_chat_model_end", { output: { content: "final" } }));
    expect(blocks(s)).toEqual([
      { kind: "tool_call", name: "get_weather", args: {} },
      { kind: "text", text: "final" },
    ]);
  });

  it("reads list content blocks", () => {
    const s = handleChatModelEvent(base, ev("on_chat_model_end", { output: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }));
    expect(blocks(s)).toEqual([{ kind: "text", text: "ab" }]);
  });
});
```

- [ ] **Step 2: Write the failing tool test**

`tool.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialState, startTurn } from "../state";
import type { StreamEvent } from "../types";
import { handleToolEvent } from "./tool";

const ev = (event: string, data: Record<string, unknown>, name = "get_weather"): StreamEvent => ({ event, name, run_id: "r", data });
const base = startTurn(initialState, "t", "oi");
const blocks = (s: ReturnType<typeof startTurn>) => s.turns[0].blocks;

describe("handleToolEvent", () => {
  it("start adds a running tool_result", () => {
    const s = handleToolEvent(base, ev("on_tool_start", { input: { city: "SP" } }));
    expect(blocks(s)).toEqual([{ kind: "tool_result", name: "get_weather", input: { city: "SP" }, running: true }]);
  });

  it("end fills output on the running block with the same name", () => {
    let s = handleToolEvent(base, ev("on_tool_start", { input: { city: "SP" } }));
    s = handleToolEvent(s, ev("on_tool_end", { output: { content: '{"temp_c": 22}', type: "tool" } }));
    expect(blocks(s)).toEqual([{ kind: "tool_result", name: "get_weather", input: { city: "SP" }, output: '{"temp_c": 22}', running: false }]);
  });

  it("end without a matching running block appends a finished one", () => {
    const s = handleToolEvent(base, ev("on_tool_end", { output: { content: "x" } }));
    expect(blocks(s)).toEqual([{ kind: "tool_result", name: "get_weather", input: undefined, output: "x", running: false }]);
  });

  it("end matches the last running block of that name", () => {
    let s = handleToolEvent(base, ev("on_tool_start", { input: 1 }));
    s = handleToolEvent(s, ev("on_tool_start", { input: 2 }));
    s = handleToolEvent(s, ev("on_tool_end", { output: { content: "two" } }));
    expect(blocks(s)[0]).toMatchObject({ input: 1, running: true });
    expect(blocks(s)[1]).toMatchObject({ input: 2, output: "two", running: false });
  });

  it("unknown on_tool_* subtype is a no-op", () => {
    expect(handleToolEvent(base, ev("on_tool_stream", {}))).toBe(base);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run from `frontend/`: `npm test`
Expected: FAIL, cannot resolve `./chatModel` and `./tool`.

- [ ] **Step 4: Write chatModel.ts**

```ts
/** Handlers for on_chat_model_* events: draft accumulation and replacement (AC-07). */

import { updateLastTurn, type Block, type ChatState } from "../state";
import { textOf, type MessageDump, type StreamEvent } from "../types";

function lastDraftIndex(blocks: Block[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].kind === "draft") return i;
  return -1;
}

function appendToDraft(text: string) {
  return (blocks: Block[]): Block[] => {
    const i = lastDraftIndex(blocks);
    if (i === -1) return [...blocks, { kind: "draft", text }];
    const draft = blocks[i] as Extract<Block, { kind: "draft" }>;
    return [...blocks.slice(0, i), { kind: "draft", text: draft.text + text }, ...blocks.slice(i + 1)];
  };
}

/** Final blocks for a completed model pass: tool calls if any, else the final text. */
function finalBlocks(output: MessageDump | undefined): Block[] {
  const calls = output?.tool_calls ?? [];
  if (calls.length > 0) return calls.map((call) => ({ kind: "tool_call", name: call.name, args: call.args }));
  const text = textOf(output?.content);
  return text ? [{ kind: "text", text }] : [];
}

function replaceDraft(replacement: Block[]) {
  return (blocks: Block[]): Block[] => {
    const i = lastDraftIndex(blocks);
    if (i === -1) return [...blocks, ...replacement];
    return [...blocks.slice(0, i), ...replacement, ...blocks.slice(i + 1)];
  };
}

export function handleChatModelEvent(state: ChatState, event: StreamEvent): ChatState {
  switch (event.event) {
    case "on_chat_model_start":
      return updateLastTurn(state, (blocks) => [...blocks, { kind: "draft", text: "" }]);
    case "on_chat_model_stream": {
      const text = textOf((event.data.chunk as MessageDump | undefined)?.content);
      return text ? updateLastTurn(state, appendToDraft(text)) : state;
    }
    case "on_chat_model_end":
      return updateLastTurn(state, replaceDraft(finalBlocks(event.data.output as MessageDump | undefined)));
    default:
      return state;
  }
}
```

- [ ] **Step 5: Write tool.ts**

```ts
/** Handlers for on_tool_* events: a tool_result block per tool run. */

import { updateLastTurn, type Block, type ChatState } from "../state";
import { textOf, type MessageDump, type StreamEvent } from "../types";

type ToolResult = Extract<Block, { kind: "tool_result" }>;

function lastRunningIndex(blocks: Block[], name: string): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === "tool_result" && b.running && b.name === name) return i;
  }
  return -1;
}

export function handleToolEvent(state: ChatState, event: StreamEvent): ChatState {
  switch (event.event) {
    case "on_tool_start":
      return updateLastTurn(state, (blocks) => [
        ...blocks,
        { kind: "tool_result", name: event.name, input: event.data.input, running: true },
      ]);
    case "on_tool_end": {
      const output = textOf((event.data.output as MessageDump | undefined)?.content);
      return updateLastTurn(state, (blocks) => {
        const i = lastRunningIndex(blocks, event.name);
        if (i === -1) {
          return [...blocks, { kind: "tool_result", name: event.name, input: undefined, output, running: false }];
        }
        const done: ToolResult = { ...(blocks[i] as ToolResult), output, running: false };
        return [...blocks.slice(0, i), done, ...blocks.slice(i + 1)];
      });
    }
    default:
      return state;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run from `frontend/`: `npm test`
Expected: all passed (state 3, parse 8, chatModel 9, tool 5).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/events/handlers
git commit -m "feat(frontend): add pure chat-model and tool event handlers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Dispatch by event type (AC-06)

**Files:**
- Create: `frontend/src/lib/events/dispatch.ts`, `frontend/src/lib/events/dispatch.test.ts`

**Interfaces:**
- Consumes: `isChatModelEvent`, `isToolEvent`, `handleChatModelEvent`, `handleToolEvent`
- Produces: `class UnknownEventTypeError extends Error`; `dispatch(state: ChatState, event: StreamEvent): ChatState`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { dispatch, UnknownEventTypeError } from "./dispatch";
import { initialState, startTurn } from "./state";
import type { StreamEvent } from "./types";

const base = startTurn(initialState, "t", "oi");
const ev = (event: string, data: Record<string, unknown> = {}): StreamEvent => ({ event, name: "n", run_id: "r", data });

describe("dispatch", () => {
  it("routes on_chat_model_* to the chat-model handler", () => {
    expect(dispatch(base, ev("on_chat_model_start")).turns[0].blocks).toEqual([{ kind: "draft", text: "" }]);
  });

  it("routes on_tool_* to the tool handler", () => {
    expect(dispatch(base, ev("on_tool_start", { input: 1 })).turns[0].blocks[0]).toMatchObject({ kind: "tool_result", running: true });
  });

  it("throws UnknownEventTypeError for anything else", () => {
    expect(() => dispatch(base, ev("on_chain_start"))).toThrow(UnknownEventTypeError);
    expect(() => dispatch(base, ev("error"))).toThrow("Unknown event type: error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `npm test`
Expected: FAIL, cannot resolve `./dispatch`.

- [ ] **Step 3: Write dispatch.ts**

```ts
/** Type → handler routing (AC-06). Anything outside the two families is an error. */

import { handleChatModelEvent } from "./handlers/chatModel";
import { handleToolEvent } from "./handlers/tool";
import type { ChatState } from "./state";
import { isChatModelEvent, isToolEvent, type StreamEvent } from "./types";

export class UnknownEventTypeError extends Error {
  constructor(type: string) {
    super(`Unknown event type: ${type}`);
    this.name = "UnknownEventTypeError";
  }
}

export function dispatch(state: ChatState, event: StreamEvent): ChatState {
  if (isChatModelEvent(event.event)) return handleChatModelEvent(state, event);
  if (isToolEvent(event.event)) return handleToolEvent(state, event);
  throw new UnknownEventTypeError(event.event);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `frontend/`: `npm test`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/events/dispatch.ts frontend/src/lib/events/dispatch.test.ts
git commit -m "feat(frontend): dispatch stream events by type, reject unknown types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: useAgentStream hook

**Files:**
- Create: `frontend/src/hooks/useAgentStream.ts`

**Interfaces:**
- Consumes: `parseSse`, `dispatch`, `toStreamEvent`, `startTurn`, `initialState`, `ChatState`
- Produces: `useAgentStream(baseUrl?: string): { state: ChatState; send: (message: string) => Promise<void>; isStreaming: boolean }`.

- [ ] **Step 1: Write the hook**

```ts
"use client";

/** Drives one chat session: POST the message, parse SSE, fold events into state. */

import { useCallback, useEffect, useRef, useState } from "react";
import { dispatch } from "@/lib/events/dispatch";
import { initialState, startTurn, type ChatState } from "@/lib/events/state";
import { toStreamEvent } from "@/lib/events/types";
import { parseSse } from "@/lib/sse/parse";

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useAgentStream(baseUrl: string = DEFAULT_BASE_URL) {
  const [state, setState] = useState<ChatState>(initialState);
  // Mirror of `state` so dispatch runs outside React's updater (its throws must reach our catch).
  const stateRef = useRef<ChatState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((next: ChatState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      commit({ ...startTurn(stateRef.current, crypto.randomUUID(), message), status: "streaming", error: undefined });

      try {
        const response = await fetch(`${baseUrl}/agent/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

        for await (const frame of parseSse(response.body)) {
          if (frame.event === "error") {
            const detail = frame.data as { message?: string };
            throw new Error(detail.message ?? "stream error");
          }
          commit(dispatch(stateRef.current, toStreamEvent(frame)));
        }
        commit({ ...stateRef.current, status: "done" });
      } catch (error) {
        if (controller.signal.aborted) return;
        commit({ ...stateRef.current, status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    },
    [baseUrl, commit],
  );

  return { state, send, isStreaming: state.status === "streaming" };
}
```

- [ ] **Step 2: Type-check and lint**

Run from `frontend/`: `npx tsc --noEmit` then `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useAgentStream.ts
git commit -m "feat(frontend): add useAgentStream hook

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Chat UI

**Files:**
- Create: `frontend/src/components/blocks/ChatModelBlock.tsx`, `frontend/src/components/blocks/ToolBlock.tsx`, `frontend/src/components/TurnView.tsx`, `frontend/src/components/MessageInput.tsx`, `frontend/src/components/ChatWindow.tsx`
- Modify: `frontend/src/app/page.tsx` (replace scaffold content), `frontend/src/app/layout.tsx` (title + lang)

**Interfaces:**
- Consumes: `useAgentStream`, `Block`, `Turn`
- Produces: `ChatWindow` (default export), page renders it.

- [ ] **Step 1: Write ChatModelBlock.tsx**

```tsx
import type { Block } from "@/lib/events/state";

type Props = { block: Extract<Block, { kind: "draft" | "text" | "tool_call" }> };

/** Renders model-side states: streaming draft, final text, or a tool call request. */
export function ChatModelBlock({ block }: Props) {
  if (block.kind === "draft") {
    return (
      <p className="whitespace-pre-wrap text-zinc-500 italic" data-kind="draft">
        {block.text}
        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-400 align-middle" />
      </p>
    );
  }
  if (block.kind === "text") {
    return (
      <p className="whitespace-pre-wrap text-zinc-900 dark:text-zinc-100" data-kind="text">
        {block.text}
      </p>
    );
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-mono text-sm text-amber-900" data-kind="tool_call">
      <span className="font-semibold">tool call</span> {block.name}({JSON.stringify(block.args)})
    </div>
  );
}
```

- [ ] **Step 2: Write ToolBlock.tsx**

```tsx
import type { Block } from "@/lib/events/state";

type Props = { block: Extract<Block, { kind: "tool_result" }> };

function pretty(output: string | undefined): string {
  if (output === undefined) return "";
  try {
    return JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    return output;
  }
}

/** Renders a tool run: running spinner, then its JSON output. */
export function ToolBlock({ block }: Props) {
  return (
    <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 font-mono text-sm text-sky-900" data-kind="tool_result">
      <div className="flex items-center gap-2">
        <span className="font-semibold">tool result</span>
        <span>{block.name}</span>
        {block.running && <span className="animate-pulse text-sky-600">running…</span>}
      </div>
      {!block.running && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{pretty(block.output)}</pre>}
    </div>
  );
}
```

- [ ] **Step 3: Write TurnView.tsx**

```tsx
import type { Block, Turn } from "@/lib/events/state";
import { ChatModelBlock } from "./blocks/ChatModelBlock";
import { ToolBlock } from "./blocks/ToolBlock";

/** Same split as the event dispatcher: model-side blocks vs tool blocks. */
function renderBlock(block: Block, index: number) {
  if (block.kind === "tool_result") return <ToolBlock key={index} block={block} />;
  return <ChatModelBlock key={index} block={block} />;
}

export function TurnView({ turn }: { turn: Turn }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="self-end rounded-2xl bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">{turn.user}</div>
      <div className="flex flex-col gap-2 self-start">{turn.blocks.map(renderBlock)}</div>
    </div>
  );
}
```

- [ ] **Step 4: Write MessageInput.tsx**

```tsx
"use client";

import { useState, type FormEvent } from "react";

type Props = { disabled: boolean; onSend: (message: string) => void };

export function MessageInput({ disabled, onSend }: Props) {
  const [value, setValue] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const message = value.trim();
    if (!message || disabled) return;
    onSend(message);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        className="flex-1 rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="Qual o clima em São Paulo?"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        autoFocus
      />
      <button type="submit" disabled={disabled} className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        Enviar
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Write ChatWindow.tsx**

```tsx
"use client";

import { useAgentStream } from "@/hooks/useAgentStream";
import { MessageInput } from "./MessageInput";
import { TurnView } from "./TurnView";

export default function ChatWindow() {
  const { state, send, isStreaming } = useAgentStream();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Weather agent</h1>
      <section className="flex flex-1 flex-col gap-6">
        {state.turns.map((turn) => (
          <TurnView key={turn.id} turn={turn} />
        ))}
        {state.status === "error" && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-800" role="alert">
            {state.error}
          </p>
        )}
      </section>
      <MessageInput disabled={isStreaming} onSend={send} />
    </main>
  );
}
```

- [ ] **Step 6: Replace page.tsx and set layout metadata**

`frontend/src/app/page.tsx`:

```tsx
import ChatWindow from "@/components/ChatWindow";

export default function Page() {
  return <ChatWindow />;
}
```

In `frontend/src/app/layout.tsx`, set `metadata` to `{ title: "Praxis P1 - Weather agent", description: "LangGraph agent streamed over SSE" }` and `<html lang="pt-BR">`. Keep the rest of the scaffold layout.

- [ ] **Step 7: Build, lint, test**

Run from `frontend/`: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`
Expected: all clean, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add chat UI with per-block renderers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: README, smoke test (AC-08), final check

**Files:**
- Create: `README.md`
- Verify: `.env` exists at root with a real `OPENAI_API_KEY` (never committed)

- [ ] **Step 1: Write README.md (pt-BR)**

````markdown
# Praxis · P1 · Agent de clima com chat em SSE

Agent LangGraph com uma tool `get_weather` (stub), exposto por FastAPI em
`POST /agent/execute` como `text/event-stream`, e um chat em Next.js que
renderiza os eventos de `astream_events` (v2).

## Estrutura

```
backend/   FastAPI + LangGraph (uv)
frontend/  Next.js 16 + Tailwind (npm)
.env       OPENAI_API_KEY e configurações (não versionado)
docs/      spec e plano
```

## Pré-requisitos

- Python 3.11+ e [uv](https://docs.astral.sh/uv/) (`pip install uv`; se `uv` não estiver no PATH, use `python -m uv`)
- Node 22+ e npm

## Configuração

Copie `.env.example` para `.env` na raiz e preencha a chave:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
WEATHER_DELAY_SECONDS=2
CORS_ORIGINS=http://localhost:3000
```

## Subir a API

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Teste rápido via curl:

```bash
curl -N -X POST http://localhost:8000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"message": "Qual o clima em São Paulo?"}'
```

## Subir o front

```bash
cd frontend
npm install
npm run dev
```

Abra http://localhost:3000. Para apontar para outra API, defina
`NEXT_PUBLIC_API_URL` em `frontend/.env.local`.

## Testes

```bash
cd backend && uv run pytest
cd frontend && npm test
```

## Fumaça (AC-08)

Com API e front no ar, envie "Qual o clima em São Paulo?". Esperado, em
estados separados: tool call `get_weather({"city": "São Paulo"})`, resultado
`{"city": "São Paulo", "temp_c": 22, "condition": "parcialmente nublado"}`
após ~2s, e a frase final mencionando 22°C.

## Como os eventos fluem

1. `agent_router` recebe `{"message"}` e devolve `StreamingResponse(to_sse(agent.stream(message)))`.
2. `AgentService.stream` chama `graph.astream_events(..., version="v2", include_types=["chat_model", "tool"])`.
3. `to_sse` escreve `event: <tipo>` e `data: <StreamEvent inteiro em JSON>`.
4. No front, `parseSse` lê os frames, `dispatch` escolhe o handler pelo prefixo do tipo
   (`on_chat_model_*` ou `on_tool_*`; outro tipo lança `UnknownEventTypeError`),
   e os handlers puros montam os blocos: draft (tokens concatenados), texto final
   (substitui o draft no `on_chat_model_end`), tool call e tool result.
````

- [ ] **Step 2: Run the full backend and frontend test suites**

Run from `backend/`: `uv run pytest -q`
Run from `frontend/`: `npm test`
Expected: all green in both.

- [ ] **Step 3: Smoke test end to end**

Requires a real `OPENAI_API_KEY` in `.env` at the repo root. If it is missing, stop here and report that the smoke test is blocked on the key; do not fake it.

Terminal 1, from `backend/`: `uv run uvicorn app.main:app --port 8000`
Terminal 2, from repo root:

```bash
curl -N -X POST http://localhost:8000/agent/execute -H "Content-Type: application/json" -d '{"message": "Qual o clima em São Paulo?"}'
```

Expected in order: `event: on_chat_model_start`, `on_chat_model_stream` frames, `on_chat_model_end` with `tool_calls` naming `get_weather`, `on_tool_start`, ~2 s pause, `on_tool_end` whose output content contains `"temp_c": 22`, then streamed tokens and a final `on_chat_model_end` whose content mentions 22°C.

Then from `frontend/`: `npm run dev`, open http://localhost:3000, send the same message, confirm four visual states: tool call chip, tool result (running then JSON), draft tokens, final text.

- [ ] **Step 4: Confirm .env is not tracked**

Run from repo root: `git status --porcelain | grep -c "^?? .env$"` → `0`, and `git check-ignore .env` → `.env`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README with API/front setup and smoke test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
