import type { Block, Turn } from "@/lib/events/state";
import { ChatModelBlock } from "./blocks/ChatModelBlock";
import { ToolBlock } from "./blocks/ToolBlock";

/** Same split as the event dispatcher: model-side blocks vs tool blocks. */
function renderBlock(block: Block, index: number) {
  if (block.kind === "tool_result") return <ToolBlock key={index} block={block} />;
  return <ChatModelBlock key={index} block={block} />;
}

export function TurnView({ turn }: { turn: Turn }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="self-end rounded-2xl bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">{turn.user}</div>
      <div className="flex flex-col gap-2 self-start">{turn.blocks.map(renderBlock)}</div>
    </div>
  );
}
