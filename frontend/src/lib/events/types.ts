/** Wire and domain types for the agent event stream. */

export type SseFrame = { event: string; data: unknown };

/** A LangChain StreamEvent (astream_events v2) as serialised by the backend. */
export type StreamEvent = {
  event: string;
  name: string;
  run_id: string;
  data: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
  parent_ids?: string[];
};

export type ToolCall = { id?: string; name: string; args: unknown };

/** Shape of a pydantic `model_dump()` of an AIMessage / AIMessageChunk / ToolMessage. */
export type MessageDump = {
  content: unknown;
  tool_calls?: ToolCall[];
  type?: string;
  name?: string;
};

export const CHAT_MODEL_PREFIX = "on_chat_model_";
export const TOOL_PREFIX = "on_tool_";

export function isChatModelEvent(type: string): boolean {
  return type.startsWith(CHAT_MODEL_PREFIX);
}

export function isToolEvent(type: string): boolean {
  return type.startsWith(TOOL_PREFIX);
}

/** The frame's data IS the StreamEvent (AC-05); this just narrows it. */
export function toStreamEvent(frame: SseFrame): StreamEvent {
  const raw = (frame.data ?? {}) as Partial<StreamEvent>;
  return {
    event: frame.event,
    name: typeof raw.name === "string" ? raw.name : "",
    run_id: typeof raw.run_id === "string" ? raw.run_id : "",
    data: (raw.data as Record<string, unknown>) ?? {},
    tags: raw.tags,
    metadata: raw.metadata,
    parent_ids: raw.parent_ids,
  };
}

/** Message carried by the backend's transport-level `error` frame (the whole envelope is the frame data). */
export function errorMessageOf(frame: SseFrame): string {
  const envelope = frame.data as { data?: { message?: unknown } } | null;
  const message = envelope?.data?.message;
  return typeof message === "string" && message ? message : "stream error";
}

/** Message content can be a string or a list of content blocks; return plain text. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) return String((block as { text: unknown }).text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}
