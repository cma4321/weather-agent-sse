/** Handlers for on_tool_* events: a tool_result block per tool run. */

import { updateLastTurn, type Block, type ChatState } from "../state";
import { textOf, type MessageDump, type StreamEvent } from "../types";

type ToolResult = Extract<Block, { kind: "tool_result" }>;

function lastRunningIndex(blocks: Block[], name: string): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === "tool_result" && b.running && b.name === name) return i;
  }
  return -1;
}

export function handleToolEvent(state: ChatState, event: StreamEvent): ChatState {
  switch (event.event) {
    case "on_tool_start":
      return updateLastTurn(state, (blocks) => [
        ...blocks,
        { kind: "tool_result", name: event.name, input: event.data.input, running: true },
      ]);
    case "on_tool_end": {
      const output = textOf((event.data.output as MessageDump | undefined)?.content);
      return updateLastTurn(state, (blocks) => {
        const i = lastRunningIndex(blocks, event.name);
        if (i === -1) {
          return [...blocks, { kind: "tool_result", name: event.name, input: undefined, output, running: false }];
        }
        const done: ToolResult = { ...(blocks[i] as ToolResult), output, running: false };
        return [...blocks.slice(0, i), done, ...blocks.slice(i + 1)];
      });
    }
    default:
      return state;
  }
}
