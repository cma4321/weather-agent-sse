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
