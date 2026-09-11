"use client";

import { useAgentStream } from "@/hooks/useAgentStream";
import { MessageInput } from "./MessageInput";
import { TurnView } from "./TurnView";

export default function ChatWindow() {
  const { state, send, isStreaming } = useAgentStream();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Weather agent</h1>
      <section className="flex flex-1 flex-col gap-6">
        {state.turns.map((turn) => (
          <TurnView key={turn.id} turn={turn} />
        ))}
        {state.status === "error" && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-800" role="alert">
            {state.error}
          </p>
        )}
      </section>
      <MessageInput disabled={isStreaming} onSend={send} />
    </main>
  );
}
