import React from "react";
import { parseAdviceText } from "@/lib/advice-format";

// Shows detour advice the way the owner's document does: a bold direction heading, numbered steps with a bold
// "จุดเริ่มต้น:" / "จุดสิ้นสุด:", and indented summary lines with a bold label. Text that does not follow the format
// is still shown line by line, so older advice keeps working. Used on the public page and in the admin preview.
export function AdviceText({
  text,
  className = "",
  hideDistanceAndDuration = false,
}: {
  text: string;
  className?: string;
  hideDistanceAndDuration?: boolean;
}) {
  const blocks = React.useMemo(() => {
    const parsed = parseAdviceText(text);
    if (!hideDistanceAndDuration) return parsed;
    return parsed.filter(
      (block) =>
        !(
          block.kind === "summary" &&
          /^(?:รวมระยะทาง|ระยะเวลาเดินทาง|ใช้เวลาเดินทาง)/i.test(block.label)
        )
    );
  }, [text, hideDistanceAndDuration]);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-1.5 text-xs leading-relaxed ${className}`}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <div key={index} className="pt-[0.615em] font-heading text-[0.8125rem] font-bold text-amber-200 first:pt-0">
              <span aria-hidden="true" className="text-amber-400/60">=== </span>
              {block.text}
              <span aria-hidden="true" className="text-amber-400/60"> ===</span>
            </div>
          );
        }
        if (block.kind === "step") {
          return (
            <div key={index} className="flex gap-[0.5em]">
              <span className="w-[1.667em] shrink-0 text-right font-bold tabular-nums text-amber-300">{block.number}.</span>
              <span className="min-w-0 break-words">
                {block.label && <strong className="font-bold text-amber-200">{block.label} </strong>}
                {block.text}
              </span>
            </div>
          );
        }
        if (block.kind === "summary") {
          return (
            <div key={index} className="flex gap-[0.5em] pl-[2em]">
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

