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

  it("end with both final text and tool_calls emits a text block followed by tool_call blocks", () => {
    let s = handleChatModelEvent(base, ev("on_chat_model_start", {}));
    s = handleChatModelEvent(
      s,
      ev("on_chat_model_end", {
        output: { content: "Vou consultar.", tool_calls: [{ id: "c1", name: "get_weather", args: { city: "SP" } }] },
      }),
    );
    expect(blocks(s)).toEqual([
      { kind: "text", text: "Vou consultar." },
      { kind: "tool_call", name: "get_weather", args: { city: "SP" } },
    ]);
  });

  it("reads list content blocks", () => {
    const s = handleChatModelEvent(base, ev("on_chat_model_end", { output: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }));
    expect(blocks(s)).toEqual([{ kind: "text", text: "ab" }]);
  });
});
