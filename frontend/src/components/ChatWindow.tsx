"use client";

import { useEffect, useRef } from "react";
import { useAgentStream } from "@/hooks/useAgentStream";
import { EmptyState } from "./EmptyState";
import { MessageInput } from "./MessageInput";
import { TurnView } from "./TurnView";

export default function ChatWindow() {
  const { state, send, isStreaming } = useAgentStream();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as blocks stream in.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.turns, state.status]);

  const isEmpty = state.turns.length === 0;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col p-4 sm:p-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-[0_8px_30px_rgba(2,132,199,0.08)]">
        <header className="flex items-center gap-3 border-b border-sky-100 px-5 py-4">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-lg"
          >
            ☁️
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-800">Weather Agent</h1>
            <p className="truncate text-xs text-slate-500">Pergunte o clima de uma cidade</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">
            LangGraph · SSE
          </span>
        </header>

        <section className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          {isEmpty ? (
            <EmptyState disabled={isStreaming} onPick={send} />
          ) : (
            state.turns.map((turn) => <TurnView key={turn.id} turn={turn} />)
          )}
          {state.status === "error" && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              {state.error}
            </p>
          )}
          <div ref={bottomRef} />
        </section>

        <div className="border-t border-sky-100 bg-white p-4">
          <MessageInput disabled={isStreaming} onSend={send} />
        </div>
      </div>
    </main>
  );
}
