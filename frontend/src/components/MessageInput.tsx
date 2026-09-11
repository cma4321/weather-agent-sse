"use client";

import { useState, type FormEvent } from "react";

type Props = { disabled: boolean; onSend: (message: string) => void };

export function MessageInput({ disabled, onSend }: Props) {
  const [value, setValue] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const message = value.trim();
    if (!message || disabled) return;
    onSend(message);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-3">
      <input
        className="min-w-0 flex-1 rounded-full border border-sky-200 bg-white px-5 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
        aria-label="Mensagem"
        placeholder="Qual o clima em São Paulo?"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        autoFocus
      />
      <button
        type="submit"
        disabled={disabled}
        className="shrink-0 rounded-full bg-sky-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50"
      >
        Enviar
      </button>
    </form>
  );
}
