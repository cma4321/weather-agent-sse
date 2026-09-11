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
    <article className="flex flex-col gap-3">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-sky-600 px-4 py-2.5 text-sm whitespace-pre-wrap text-white shadow-sm">
          {turn.user}
        </p>
      </div>
      {turn.blocks.length > 0 && (
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm text-sky-700"
          >
            ☁️
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">{turn.blocks.map(renderBlock)}</div>
        </div>
      )}
    </article>
  );
}
