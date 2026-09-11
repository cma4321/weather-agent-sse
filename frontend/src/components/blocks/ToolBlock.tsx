import type { Block } from "@/lib/events/state";

type Props = { block: Extract<Block, { kind: "tool_result" }> };

type Weather = { city: string; temp_c: number; condition: string };

function parsed(output: string | undefined): unknown {
  if (output === undefined) return undefined;
  try {
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}

/** Narrows a parsed payload to the weather shape the card knows how to render. */
function asWeather(value: unknown): Weather | null {
  if (typeof value !== "object" || value === null) return null;
  const { city, temp_c: temp, condition } = value as Record<string, unknown>;
  if (typeof city !== "string" || typeof temp !== "number" || typeof condition !== "string") return null;
  return { city, temp_c: temp, condition };
}

/** Renders a tool run: running indicator, then a weather card or the raw output. */
export function ToolBlock({ block }: Props) {
  const payload = parsed(block.output);
  const weather = asWeather(payload);
  const pretty = payload === undefined ? block.output : JSON.stringify(payload, null, 2);

  return (
    <div className="rounded-2xl rounded-bl-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm" data-kind="tool_result">
      <div className="flex items-center gap-2 text-sky-800">
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${block.running ? "animate-pulse bg-amber-400" : "bg-emerald-500"}`}
        />
        <span className="font-medium">Resultado da tool</span>
        <code className="font-mono text-xs text-sky-700">{block.name}</code>
      </div>

      {block.running && <p className="mt-2 text-sky-700/70">Consultando…</p>}

      {!block.running && weather && (
        <>
          <div className="mt-3 flex items-end justify-between gap-4 rounded-xl border border-sky-100 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">{weather.city}</p>
              <p className="truncate text-slate-600">{weather.condition}</p>
            </div>
            <p className="shrink-0 text-3xl font-semibold text-sky-700">
              {weather.temp_c}
              <span className="text-xl">°C</span>
            </p>
          </div>
          <details className="mt-2 text-xs text-sky-800">
            <summary className="cursor-pointer select-none">JSON bruto</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-white/70 p-3 font-mono whitespace-pre-wrap">
              {pretty}
            </pre>
          </details>
        </>
      )}

      {!block.running && !weather && (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-white/70 p-3 font-mono text-xs whitespace-pre-wrap text-slate-700">
          {pretty}
        </pre>
      )}
    </div>
  );
}
