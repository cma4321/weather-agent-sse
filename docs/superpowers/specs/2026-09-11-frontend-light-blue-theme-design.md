# Frontend · Light-blue theme — Design

Date: 2026-09-11
Status: approved

## Goal

Make the chat UI pleasant to look at, with a light-blue visual identity, without
touching the event pipeline (parser, dispatch, handlers, hook) or its tests.

## Scope

Files: `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx` (metadata only if
needed), `frontend/src/components/**`. New component allowed: `components/EmptyState.tsx`.
No new dependencies. Tailwind 4 utilities only, plus a few CSS variables in `globals.css`.

Out of scope: dark mode (light theme only, `color-scheme: light`), any change to
`src/lib/**` or `src/hooks/**` beyond what the auto-scroll needs (none expected; the
scroll lives in `ChatWindow`).

## Visual system

- Palette: Tailwind `sky` scale on a white/slate base. Page background:
  `bg-gradient-to-b from-sky-50 to-white`. Text `slate-800`; muted `slate-500`.
- Container: centered card `max-w-2xl`, white, `border border-sky-100`,
  `rounded-2xl`, `shadow-[0_8px_30px_rgba(2,132,199,0.08)]`, fills the viewport height
  with a scrollable message area and a fixed composer at the bottom.
- Header: title "Weather Agent", subtitle "Pergunte o clima de uma cidade", badge
  `LangGraph · SSE` (`bg-sky-100 text-sky-700`, pill).
- User bubble: right-aligned, `bg-sky-600 text-white rounded-2xl rounded-br-md`.
- Assistant column: left-aligned, small round avatar (`bg-sky-100 text-sky-700`, "☁️"),
  blocks stacked with `gap-2`.

## Blocks (AC-07 states stay visually distinct)

- `draft`: `bg-sky-50 text-sky-900/70 rounded-2xl rounded-bl-md`, blinking caret
  (`animate-pulse`), `data-kind="draft"`.
- `text`: white, `border border-sky-100`, `rounded-2xl rounded-bl-md`, `data-kind="text"`.
- `tool_call`: `bg-sky-100 text-sky-800`, header "🔧 Chamando `get_weather`", each arg
  as a chip `bg-white/70 rounded-full px-2 text-xs font-mono`, `data-kind="tool_call"`.
- `tool_result`: `bg-sky-50 border border-sky-200`. Header: "Resultado da tool" +
  status dot (`bg-amber-400 animate-pulse` while `running`, `bg-emerald-500` when done).
  When the output parses as JSON with `city`, `temp_c`, `condition`, render a weather
  card: city (semibold), temperature large (`text-3xl font-semibold` + "°C"), condition
  (`text-slate-600`). Below it a `<details>` "JSON bruto" with the pretty-printed output.
  If parsing fails, show the raw output in `<pre>`. `data-kind="tool_result"`.

## Empty state and composer

- When there are no turns: centered welcome ("Olá! Sou o agent de clima.") and
  suggestion chips: "Qual o clima em São Paulo?", "E no Rio de Janeiro?",
  "Como está o tempo em Curitiba hoje?". Clicking a chip calls `send(text)`.
- Composer: `rounded-full` input, `border-sky-200`, `focus:ring-2 focus:ring-sky-300`,
  button `bg-sky-500 hover:bg-sky-600 text-white rounded-full`, `disabled:opacity-50`.
  Keep `aria-label="Mensagem"`. Enter sends.
- Auto-scroll: `ChatWindow` keeps a `ref` on the bottom sentinel and calls
  `scrollIntoView({ behavior: "smooth" })` in a `useEffect` keyed on
  `state.turns` and `state.status`.
- Error: `bg-rose-50 border-rose-200 text-rose-800 rounded-xl`, `role="alert"`.

## Acceptance

- `npm run lint`, `npx tsc --noEmit`, `npm test` (30 passed, unchanged), `npm run build`.
- Manual: with the API up, send a message; the four states render as described.
  With an API error, the rose banner shows the backend message.
