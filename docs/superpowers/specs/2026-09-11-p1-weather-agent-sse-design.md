# P1 · Weather Agent with SSE Chat — Design

Date: 2026-09-11
Status: approved

## Goal

Build the Praxis P1 challenge: a LangGraph agent with one stub tool (`get_weather`)
exposed by a FastAPI endpoint that streams `astream_events` (v2) as Server-Sent
Events, and a Next.js chat front-end that renders those events as separate visual
states (draft tokens, final text, tool call, tool result).

Acceptance criteria AC-01..AC-09 from the challenge PDF are the source of truth.

## Decisions

| Topic | Decision |
|---|---|
| Repo layout | Monorepo: `backend/` (FastAPI, uv) + `frontend/` (Next.js). `.env` at repo root (AC-09). |
| LangGraph | `langgraph` library in-process. Graph compiled once, `astream_events(..., version="v2", include_types=["chat_model", "tool"])`. No LangGraph Server. |
| Python tooling | uv, Python 3.11+ (3.11.9 installed locally), `pyproject.toml` + `uv.lock`. |
| Front stack | Next.js 16 App Router, TypeScript, Tailwind 4, no UI library. |
| Tests | pytest (backend) + vitest (frontend). |
| Code language | English identifiers/comments/docstrings. README in pt-BR. |
| Tool delay | `WEATHER_DELAY_SECONDS`, default 2, configurable via env. |
| LLM | OpenAI via `langchain-openai`. `OPENAI_MODEL` env, default `gpt-4o-mini`. |
| Front ↔ back | Front calls `http://localhost:8000` directly. CORS enabled on the API. No Next.js proxy route. |
| Git | Repo initialised at root. GitHub account: `cma4321`. |

## Backend

### Layout

```
backend/
  pyproject.toml
  app/
    main.py                 # FastAPI app factory, CORS, lifespan builds AgentService into app.state
    config.py               # Settings (pydantic-settings), env_file = <repo root>/.env
    api/
      agent_router.py       # POST /agent/execute
      deps.py               # get_agent(request) -> AgentService from app.state
    agent/
      service.py            # AgentService: wraps compiled graph, exposes stream(message)
      graph.py              # build_graph(llm, tools) -> CompiledGraph
      tools/weather.py      # get_weather stub
    sse/
      encoder.py            # to_sse(events) async generator -> str frames
  tests/
```

### Request flow

```
POST /agent/execute  {"message": "..."}
  agent_router  -> AgentService.stream(message)      (AsyncIterator[StreamEvent])
                -> to_sse(events)                     (AsyncIterator[str])
                -> StreamingResponse(media_type="text/event-stream")
```

- **Router (AC-01).** Validates body with `ExecuteRequest(message: str, min_length=1)`.
  Obtains `AgentService` via `Depends(get_agent)`. Returns
  `StreamingResponse(to_sse(agent.stream(req.message)), media_type="text/event-stream")`.
  Imports only the `AgentService` type and `to_sse`. Never imports LangGraph/LangChain.
  Does not iterate the stream itself.
- **AgentService (AC-02).** Constructed with a compiled graph. `stream(message)`
  calls `graph.astream_events({"messages": [HumanMessage(message)]}, version="v2",
  include_types=["chat_model", "tool"])` and yields each `StreamEvent` dict.
  On exception it logs, yields a transport-level error envelope
  `{"event": "error", "data": {"message": str(exc)}}` and stops.
- **Graph (AC-03, AC-04).** `build_graph(llm, tools)`:
  `StateGraph(MessagesState)`; node `model` runs `llm.bind_tools(tools).ainvoke`;
  node `tools` is `ToolNode(tools)`; `START -> model`; conditional edge from
  `model` via `tools_condition`; `tools -> model`. Returns `compile()`.
  The LLM is injected so tests use a fake chat model.
- **Tool (AC-03).** `@tool async def get_weather(city: str) -> dict`.
  `await asyncio.sleep(settings.weather_delay_seconds)`. Always returns
  `{"city": city, "temp_c": 22, "condition": "parcialmente nublado"}`. No HTTP.
- **Settings (AC-09).** `OPENAI_API_KEY` (required), `OPENAI_MODEL`,
  `WEATHER_DELAY_SECONDS`, `CORS_ORIGINS` (comma-separated, default
  `http://localhost:3000`). `env_file` resolved to the repo root `.env`
  relative to `config.py`.

### SSE encoding (AC-05)

Each event becomes one frame:

```
event: <StreamEvent["event"]>
data: <json.dumps(StreamEvent, default=_json_default)>

```

`_json_default` converts pydantic `BaseModel` instances (messages, chunks) with
`model_dump()` and falls back to `str()` for anything else. `data` is therefore
the whole StreamEvent (`event`, `name`, `run_id`, `tags`, `metadata`, `data`,
`parent_ids`). The front reads:

| Event | Field read by front |
|---|---|
| `on_chat_model_stream` | `data.chunk.content` |
| `on_chat_model_end` | `data.output.content`, `data.output.tool_calls[]` |
| `on_tool_start` | `name`, `data.input` |
| `on_tool_end` | `name`, `data.output` (ToolMessage; `content` is the stub JSON string) |

The `error` frame is a transport envelope, not a StreamEvent, and is handled by
the front before type dispatch. Because the encoder serialises the whole envelope,
the message is read from `frame.data.data.message` (`errorMessageOf`). `to_sse`
itself also emits one `error` frame if encoding fails, so the stream never ends
silently on a server-side failure.

### Error handling

- Invalid body → 422 (pydantic).
- Missing `OPENAI_API_KEY` → settings validation fails at startup with a clear message.
- Exception mid-stream → `event: error` frame, stream closes, logged server-side.

## Frontend

### Layout

```
frontend/src/
  app/page.tsx, layout.tsx, globals.css
  lib/sse/parse.ts                   # ReadableStream<Uint8Array> -> AsyncGenerator<SseFrame>
  lib/events/types.ts                # StreamEvent, SseFrame, guards isChatModelEvent / isToolEvent
  lib/events/state.ts                # ChatState, Turn, Block types + initial state
  lib/events/handlers/chatModel.ts   # (state, event) -> state for on_chat_model_*
  lib/events/handlers/tool.ts        # (state, event) -> state for on_tool_*
  lib/events/dispatch.ts             # picks handler by event prefix; unknown -> throws UnknownEventTypeError
  hooks/useAgentStream.ts            # send(message): POST, parse, dispatch; AbortController on unmount
  components/ChatWindow.tsx, MessageInput.tsx, TurnView.tsx
  components/blocks/ChatModelBlock.tsx, ToolBlock.tsx
```

### SSE parser

Pure function over a `ReadableStream`. Decodes UTF-8, buffers, splits on
`\n\n`, parses `event:` and `data:` lines, `JSON.parse`s data, yields
`{ event, data }`. Tolerates frames split across chunks and multiple frames in
one chunk. Ignores comment lines (`:`) and empty frames.

### State (AC-07)

```ts
type Block =
  | { kind: "draft";       text: string }
  | { kind: "text";        text: string }
  | { kind: "tool_call";   name: string; args: unknown }
  | { kind: "tool_result"; name: string; input: unknown; output?: string; running: boolean };

type Turn = { id: string; user: string; blocks: Block[] };
type ChatState = { turns: Turn[]; status: "idle" | "streaming" | "done" | "error"; error?: string };
```

Handlers (pure, applied to the last turn):

- `on_chat_model_start` → push `draft("")`.
- `on_chat_model_stream` → append `data.chunk.content` to the current draft.
- `on_chat_model_end` → replace the current draft: one `text` block with
  `data.output.content` when it is non-empty, followed by one `tool_call` block
  per entry in `data.output.tool_calls`. A pass with both content and tool calls
  keeps both, so a preamble is never lost.
- `on_tool_start` → push `tool_result{ running: true }`.
- `on_tool_end` → fill `output` on the last running `tool_result` with the same
  `name`, set `running: false`.

### Dispatch (AC-06)

`dispatch(state, frame)`: if `frame.event` starts with `on_chat_model_` →
chat-model handler; `on_tool_` → tool handler; anything else → throw
`UnknownEventTypeError(event)`. The hook catches it and sets `status: "error"`.

The UI mirrors the same split: `TurnView` maps each block kind to `ChatModelBlock`
(draft/text/tool_call) or `ToolBlock` (tool_result).

### Hook

`useAgentStream()` returns `{ state, send, isStreaming }`. `send(message)`:
appends a turn, sets `streaming`, `fetch` POST with `AbortController`, iterates
`parseSse`, and for each frame: if `event === "error"` set error state, else
`dispatch`. On completion sets `done`. Aborts on unmount.

## Testing

Backend (pytest, pytest-asyncio):
- `test_weather_tool`: delay patched to 0; exact stub dict.
- `test_graph`: fake tool-calling chat model (subclass of `GenericFakeChatModel`
  with `bind_tools` returning self) scripted to emit one `tool_call` then a
  final text. Assert the event sequence includes `on_chat_model_stream`,
  `on_chat_model_end`, `on_tool_start`, `on_tool_end`, and the final text.
- `test_encoder`: frame format; `AIMessageChunk` inside `data` serialises.
- `test_router`: `TestClient` with `dependency_overrides[get_agent]` → fake
  service yielding two events. Assert `text/event-stream` and frame framing.
  Assert 422 on empty message.

Frontend (vitest):
- `parse.test.ts`: frame split across chunks, two frames in one chunk, comment lines.
- `handlers.test.ts`: stream→end replaces draft; end with tool_calls → tool_call block; tool start/end lifecycle.
- `dispatch.test.ts`: unknown type throws `UnknownEventTypeError`.

## Out of scope

Auth, persistence/checkpoints, RAG, AG-UI, custom stream modes, real weather HTTP.

## Deliverables

- Repo runs end to end: `uv run uvicorn app.main:app --reload` (backend) and
  `npm run dev` (frontend).
- `README.md` (pt-BR): setup, env vars, how to run API and front, how to test,
  smoke test "Qual o clima em São Paulo?" (AC-08).
- `.env.example` at root; `.env` gitignored.
