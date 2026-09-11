"use client";

/** Drives one chat session: POST the message, parse SSE, fold events into state. */

import { useCallback, useEffect, useRef, useState } from "react";
import { dispatch } from "@/lib/events/dispatch";
import { initialState, startTurn, type ChatState } from "@/lib/events/state";
import { toStreamEvent } from "@/lib/events/types";
import { parseSse } from "@/lib/sse/parse";

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useAgentStream(baseUrl: string = DEFAULT_BASE_URL) {
  const [state, setState] = useState<ChatState>(initialState);
  // Mirror of `state` so dispatch runs outside React's updater (its throws must reach our catch).
  const stateRef = useRef<ChatState>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((next: ChatState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (message: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      commit({ ...startTurn(stateRef.current, crypto.randomUUID(), message), status: "streaming", error: undefined });

      try {
        const response = await fetch(`${baseUrl}/agent/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

        for await (const frame of parseSse(response.body)) {
          if (frame.event === "error") {
            const detail = frame.data as { message?: string };
            throw new Error(detail.message ?? "stream error");
          }
          commit(dispatch(stateRef.current, toStreamEvent(frame)));
        }
        commit({ ...stateRef.current, status: "done" });
      } catch (error) {
        if (controller.signal.aborted) return;
        commit({ ...stateRef.current, status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    },
    [baseUrl, commit],
  );

  return { state, send, isStreaming: state.status === "streaming" };
}
