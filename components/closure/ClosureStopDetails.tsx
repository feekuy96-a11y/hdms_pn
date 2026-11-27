import { Flag, MapPin, Milestone, Navigation } from "lucide-react";
import type { ClosureStop } from "@/lib/closure-record";

export function ClosureStopDetails({ stop, compact = false }: { stop: ClosureStop; compact?: boolean }) {
  const rows = [
    ...(stop.km ? [{ label: "หลัก กม.", value: stop.km, Icon: Milestone }] : []),
    { label: "พื้นที่", value: stop.area, Icon: MapPin },
    { label: "จุดสังเกต", value: stop.landmark, Icon: Flag },
    ...(!compact && stop.position ? [{
      label: "พิกัด", value: `${stop.position[1].toFixed(6)}, ${stop.position[0].toFixed(6)}`, Icon: Navigation,
    }] : []),
  ];
  return <dl className="grid gap-2">
    {rows.map(({ label, value, Icon }) => <div key={label} className="grid min-w-0 grid-cols-[auto_1fr] items-start gap-x-2">
      <Icon size={15} className="row-span-2 mt-0.5" aria-hidden="true"/>
      <dt className="text-xs font-medium text-[var(--text-secondary)]">{label}</dt>
      <dd className="min-w-0 break-words text-sm tabular-nums">{value || "ไม่ได้ระบุ"}</dd>
    </div>)}
  </dl>;
}
