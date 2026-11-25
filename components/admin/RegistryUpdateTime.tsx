import { Clock } from "lucide-react";

const localTime = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

export function RegistryUpdateTime({ updatedAt }: { updatedAt?: string | null }) {
  const value = updatedAt ? new Date(updatedAt) : null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 text-[11px] text-slate-400">
      <Clock className="size-3 shrink-0" aria-hidden="true" />
      {value && !Number.isNaN(value.getTime())
        ? <time dateTime={value.toISOString()}>อัปเดต {localTime.format(value)}</time>
        : <span>ไม่ระบุเวลาอัปเดต</span>}
    </span>
  );
}
