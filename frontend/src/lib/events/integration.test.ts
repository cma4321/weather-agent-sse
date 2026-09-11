import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSse } from "@/lib/sse/parse";
import { dispatch } from "./dispatch";
import { initialState, startTurn } from "./state";
import { errorMessageOf, toStreamEvent } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(here, "../__fixtures__/weather-stream.sse"), "utf-8");

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    },
  });
}

describe("real backend frames through parser + dispatch", () => {
  it("produces tool_call, finished tool_result and final text, then surfaces the error frame", async () => {
    let state = startTurn(initialState, "t", "Qual o clima em São Paulo?");
    let error: string | undefined;
    for await (const frame of parseSse(streamOf(fixture))) {
      if (frame.event === "error") {
        error = errorMessageOf(frame);
        break;
      }
      state = dispatch(state, toStreamEvent(frame));
    }
    expect(state.turns[0].blocks).toEqual([
      { kind: "tool_call", name: "get_weather", args: { city: "São Paulo" } },
      { kind: "tool_result", name: "get_weather", input: { city: "São Paulo" }, output: expect.stringContaining('"temp_c": 22'), running: false },
      { kind: "text", text: "Em São Paulo faz 22°C, parcialmente nublado." },
    ]);
    expect(error).toBe("boom");
  });
});
