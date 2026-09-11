import type { Block } from "@/lib/events/state";

type Props = { block: Extract<Block, { kind: "tool_result" }> };

function pretty(output: string | undefined): string {
  if (output === undefined) return "";
  try {
    return JSON.stringify(JSON.parse(output), null, 2);
  } catch {
    return output;
  }
}

/** Renders a tool run: running spinner, then its JSON output. */
export function ToolBlock({ block }: Props) {
  return (
    <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 font-mono text-sm text-sky-900" data-kind="tool_result">
      <div className="flex items-center gap-2">
        <span className="font-semibold">tool result</span>
        <span>{block.name}</span>
        {block.running && <span className="animate-pulse text-sky-600">running…</span>}
      </div>
      {!block.running && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{pretty(block.output)}</pre>}
    </div>
  );
}
