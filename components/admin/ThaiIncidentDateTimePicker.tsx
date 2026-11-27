"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const SHORT_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const YEAR_OFFSET = 543;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
type Fields = { year: number; month: number; day: number; hour: number; minute: number };
const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const dateLabel = ({ year, month, day }: Fields) => `${day} ${SHORT_MONTHS[month - 1]} ${year + YEAR_OFFSET}`;

export function parseIncidentWallTime(value: string): Fields | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  if (year < 100 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

// The form contract remains Gregorian local date/time; only the controls and preview show BE.
export const serializeIncidentWallTime = ({ year, month, day, hour, minute }: Fields) =>
  `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;

const control = "min-h-10 rounded-lg border border-surface bg-surface-card px-2 text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";
const icon = control + " grid w-10 place-items-center disabled:opacity-40";

export function ThaiIncidentDateTimePicker({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const parsed = parseIncidentWallTime(value);
  const [draft, setDraft] = useState<Fields | null>(null);
  const minYear = Math.min(MIN_YEAR, parsed?.year ?? MIN_YEAR);
  const maxYear = Math.max(MAX_YEAR, parsed?.year ?? MAX_YEAR);
  const focusDay = (day: number) => requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(`[data-calendar-day="${day}"]`)?.focus());

  function open() {
    const now = new Date();
    const selected = parsed ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes() };
    setDraft(selected);
    dialog.current?.showModal();
    focusDay(selected.day);
  }

  function setMonth(year: number, month: number) {
    if (!draft || year < minYear || year > maxYear) return;
    setDraft({ ...draft, year, month, day: Math.min(draft.day, daysInMonth(year, month)) });
  }

  function shiftMonth(offset: number) {
    if (!draft) return;
    const next = new Date(Date.UTC(draft.year, draft.month - 1 + offset, 1));
    setMonth(next.getUTCFullYear(), next.getUTCMonth() + 1);
  }

  function dayKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!draft) return;
    const changes: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = changes[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = new Date(Date.UTC(draft.year, draft.month - 1, draft.day + delta));
    const year = next.getUTCFullYear();
    if (year < minYear || year > maxYear) return;
    setDraft({ ...draft, year, month: next.getUTCMonth() + 1, day: next.getUTCDate() });
    focusDay(next.getUTCDate());
  }

  return <>
    <button ref={trigger} id={id} type="button" aria-haspopup="dialog" onClick={open}
      aria-labelledby={`${id}-label ${id}-value`}
      className={control + " flex w-full min-w-0 items-center justify-between gap-2 px-3 text-left"}>
      <span id={`${id}-value`}>{parsed ? `${dateLabel(parsed)} · ${pad(parsed.hour)}:${pad(parsed.minute)} น.` : "เลือกวันและเวลา"}</span>
      <CalendarDays size={16} aria-hidden="true" className="shrink-0" />
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} data-hdms-popup="panel" onClose={() => { setDraft(null); trigger.current?.focus(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-1rem)] max-w-[23rem] overflow-auto rounded-xl border border-surface bg-surface-panel p-3 text-[var(--text-primary)]">
      {draft && <>
        <header className="mb-3 flex items-center justify-between gap-2">
          <h4 id={titleId} className="text-base font-bold">เลือกวันและเวลาเริ่มเกิดเหตุ</h4>
          <button className={icon} type="button" aria-label="ปิดปฏิทิน" onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1">
          <button className={icon} type="button" aria-label="เดือนก่อนหน้า" disabled={draft.month === 1 && draft.year === minYear} onClick={() => shiftMonth(-1)}><ChevronLeft size={17} aria-hidden="true" /></button>
          <select aria-label="เดือน" value={draft.month} className={control + " min-w-0"} onChange={e => setMonth(draft.year, Number(e.target.value))}>
            {MONTHS.map((m,i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select aria-label="ปี พ.ศ." value={draft.year} className={control} onChange={e => setMonth(Number(e.target.value), draft.month)}>
            {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(year => <option key={year} value={year}>{year + YEAR_OFFSET}</option>)}
          </select>
          <button className={icon} type="button" aria-label="เดือนถัดไป" disabled={draft.month === 12 && draft.year === maxYear} onClick={() => shiftMonth(1)}><ChevronRight size={17} aria-hidden="true" /></button>
        </div>
        <div role="group" aria-label={`ปฏิทิน ${MONTHS[draft.month - 1]} ${draft.year + YEAR_OFFSET}`} className="grid grid-cols-7 text-center">
          {WEEKDAYS.map(day => <div key={day} aria-hidden="true" className="py-1 text-xs text-[var(--text-secondary)]">{day}</div>)}
          {Array.from({length: new Date(Date.UTC(draft.year, draft.month - 1, 1)).getUTCDay()}, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
          {Array.from({length: daysInMonth(draft.year, draft.month)}, (_,i) => i + 1).map(day => <button key={day} type="button" data-calendar-day={day}
            aria-label={dateLabel({ ...draft, day })} aria-pressed={draft.day === day} tabIndex={draft.day === day ? 0 : -1}
            onKeyDown={dayKey} onClick={() => setDraft({ ...draft, day })}
            className="min-h-10 rounded-md text-sm tabular-nums hover:bg-surface-card aria-pressed:bg-amber-400 aria-pressed:font-bold aria-pressed:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{day}</button>)}
        </div>
        <div className="my-3 flex flex-wrap items-center gap-2 border-t border-surface pt-3">
          <span className="text-sm font-semibold">เวลา (24 ชั่วโมง)</span>
          <select aria-label="ชั่วโมง" className={control} value={draft.hour} onChange={e => setDraft({ ...draft, hour: Number(e.target.value) })}>
            {Array.from({length:24},(_,i) => <option key={i} value={i}>{pad(i)}</option>)}
          </select>
          <span aria-hidden="true">:</span>
          <select aria-label="นาที" className={control} value={draft.minute} onChange={e => setDraft({ ...draft, minute: Number(e.target.value) })}>
            {Array.from({length:60},(_,i) => <option key={i} value={i}>{pad(i)}</option>)}
          </select>
          <span className="text-sm">น.</span>
        </div>
        <footer className="flex flex-wrap justify-end gap-2">
          <button className={control + " px-3"} type="button" onClick={() => dialog.current?.close()}>ยกเลิก</button>
          <button type="button" className="min-h-10 rounded-lg bg-amber-400 px-3 text-sm font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            onClick={() => { onChange(serializeIncidentWallTime(draft)); dialog.current?.close(); }}>ใช้วันและเวลานี้</button>
        </footer>
      </>}
    </dialog>
  </>;
}
