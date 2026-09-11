import type { Block } from "@/lib/events/state";

type Props = { block: Extract<Block, { kind: "draft" | "text" | "tool_call" }> };

/** Renders model-side states: streaming draft, final text, or a tool call request. */
export function ChatModelBlock({ block }: Props) {
  if (block.kind === "draft") {
    return (
      <p className="whitespace-pre-wrap text-zinc-500 italic" data-kind="draft">
        {block.text}
        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-400 align-middle" />
      </p>
    );
  }
  if (block.kind === "text") {
    return (
      <p className="whitespace-pre-wrap text-zinc-900 dark:text-zinc-100" data-kind="text">
        {block.text}
      </p>
    );
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-mono text-sm text-amber-900" data-kind="tool_call">
      <span className="font-semibold">tool call</span> {block.name}({JSON.stringify(block.args)})
    </div>
  );
}
