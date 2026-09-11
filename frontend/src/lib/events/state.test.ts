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
