/** Type → handler routing (AC-06). Anything outside the two families is an error. */

import { handleChatModelEvent } from "./handlers/chatModel";
import { handleToolEvent } from "./handlers/tool";
import type { ChatState } from "./state";
import { isChatModelEvent, isToolEvent, type StreamEvent } from "./types";

export class UnknownEventTypeError extends Error {
  constructor(type: string) {
    super(`Unknown event type: ${type}`);
    this.name = "UnknownEventTypeError";
  }
}

export function dispatch(state: ChatState, event: StreamEvent): ChatState {
  if (isChatModelEvent(event.event)) return handleChatModelEvent(state, event);
  if (isToolEvent(event.event)) return handleToolEvent(state, event);
  throw new UnknownEventTypeError(event.event);
}
