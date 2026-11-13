import React from "react";
import { parseAdviceText } from "@/lib/advice-format";

// Shows detour advice the way the owner's document does: a bold direction heading, numbered steps with a bold
// "จุดเริ่มต้น:" / "จุดสิ้นสุด:", and indented summary lines with a bold label. Text that does not follow the format
// is still shown line by line, so older advice keeps working. Used on the public page and in the admin preview.
export function AdviceText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = React.useMemo(() => parseAdviceText(text), [text]);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-1.5 text-xs leading-relaxed ${className}`}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <div key={index} className="pt-2 font-heading text-[13px] font-bold text-amber-200 first:pt-0">
              <span aria-hidden="true" className="text-amber-400/60">=== </span>
              {block.text}
              <span aria-hidden="true" className="text-amber-400/60"> ===</span>
            </div>
          );
        }
        if (block.kind === "step") {
          return (
            <div key={index} className="flex gap-1.5">
              <span className="w-5 shrink-0 text-right font-bold tabular-nums text-amber-300">{block.number}.</span>
              <span className="min-w-0 break-words">
                {block.label && <strong className="font-bold text-amber-200">{block.label} </strong>}
                {block.text}
              </span>
            </div>
          );
        }
        if (block.kind === "summary") {
          return (
            <div key={index} className="flex gap-1.5 pl-6">
              <span aria-hidden="true" className="shrink-0 text-amber-300">-</span>
              <span className="min-w-0 break-words">
                {block.label && <strong className="font-bold text-amber-200">{block.label} </strong>}
                {block.text}
              </span>
            </div>
          );
        }
        return (
          <div key={index} className="break-words">
            {block.text}
          </div>
        );
      })}
    </div>
  );
}

