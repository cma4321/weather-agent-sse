/** Handlers for on_chat_model_* events: draft accumulation and replacement (AC-07). */

import { updateLastTurn, type Block, type ChatState } from "../state";
import { textOf, type MessageDump, type StreamEvent } from "../types";

function lastDraftIndex(blocks: Block[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].kind === "draft") return i;
  return -1;
}

function appendToDraft(text: string) {
  return (blocks: Block[]): Block[] => {
    const i = lastDraftIndex(blocks);
    if (i === -1) return [...blocks, { kind: "draft", text }];
    const draft = blocks[i] as Extract<Block, { kind: "draft" }>;
    return [...blocks.slice(0, i), { kind: "draft", text: draft.text + text }, ...blocks.slice(i + 1)];
  };
}

/** Final blocks for a completed model pass: final text (if any) followed by tool calls (if any). */
function finalBlocks(output: MessageDump | undefined): Block[] {
  const text = textOf(output?.content);
  const calls = output?.tool_calls ?? [];
  const blocks: Block[] = text ? [{ kind: "text", text }] : [];
  return [...blocks, ...calls.map((call): Block => ({ kind: "tool_call", name: call.name, args: call.args }))];
}

function replaceDraft(replacement: Block[]) {
  return (blocks: Block[]): Block[] => {
    const i = lastDraftIndex(blocks);
    if (i === -1) return [...blocks, ...replacement];
    return [...blocks.slice(0, i), ...replacement, ...blocks.slice(i + 1)];
  };
}

export function handleChatModelEvent(state: ChatState, event: StreamEvent): ChatState {
  switch (event.event) {
    case "on_chat_model_start":
      return updateLastTurn(state, (blocks) => [...blocks, { kind: "draft", text: "" }]);
    case "on_chat_model_stream": {
      const text = textOf((event.data.chunk as MessageDump | undefined)?.content);
      return text ? updateLastTurn(state, appendToDraft(text)) : state;
    }
    case "on_chat_model_end":
      return updateLastTurn(state, replaceDraft(finalBlocks(event.data.output as MessageDump | undefined)));
    default:
      return state;
  }
}
