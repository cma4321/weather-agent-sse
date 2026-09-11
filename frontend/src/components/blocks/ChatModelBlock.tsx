import type { Block } from "@/lib/events/state";

type Props = { block: Extract<Block, { kind: "draft" | "text" | "tool_call" }> };

const BUBBLE = "rounded-2xl rounded-bl-md px-4 py-2.5 text-sm";

/** Flattens the tool arguments into `key: value` pairs rendered as chips. */
function argEntries(args: unknown): [string, string][] {
  if (typeof args !== "object" || args === null) return [];
  return Object.entries(args as Record<string, unknown>).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}

/** Renders model-side states: streaming draft, final text, or a tool call request. */
export function ChatModelBlock({ block }: Props) {
  if (block.kind === "draft") {
    return (
      <p className={`${BUBBLE} bg-sky-50 whitespace-pre-wrap text-sky-900/70`} data-kind="draft">
        {block.text}
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-sky-500 align-middle" />
      </p>
    );
  }

  if (block.kind === "text") {
    return (
      <p
        className={`${BUBBLE} border border-sky-100 bg-white whitespace-pre-wrap text-slate-800 shadow-sm`}
        data-kind="text"
      >
        {block.text}
      </p>
    );
  }

  const args = argEntries(block.args);
  return (
    <div className={`${BUBBLE} bg-sky-100 text-sky-800`} data-kind="tool_call">
      <p className="font-medium">
        🔧 Chamando <code className="font-mono">{block.name}</code>
      </p>
      {args.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {args.map(([key, value]) => (
            <span key={key} className="rounded-full bg-white/70 px-2 py-0.5 font-mono text-xs">
              {key}: {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
