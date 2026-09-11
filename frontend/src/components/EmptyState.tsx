"use client";

const SUGGESTIONS = [
  "Qual o clima em São Paulo?",
  "E no Rio de Janeiro?",
  "Como está o tempo em Curitiba hoje?",
];

type Props = { disabled: boolean; onPick: (message: string) => void };

/** Welcome screen shown while the conversation has no turns. */
export function EmptyState({ disabled, onPick }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-2xl"
      >
        ☁️
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold text-slate-800">Olá! Sou o agent de clima.</p>
        <p className="text-sm text-slate-500">Escolha uma sugestão ou escreva a sua pergunta.</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={disabled}
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
