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
