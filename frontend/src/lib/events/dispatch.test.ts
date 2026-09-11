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
