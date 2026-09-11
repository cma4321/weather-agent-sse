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
