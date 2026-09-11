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
