"use client";

import { useRef, type ChangeEventHandler } from "react";

/** Keep focus on a visible control when opening the native file chooser.
 * A clipped, focusable input can scroll the admin canvas out of view. */
export function DetourPointPhotoInput({ label, ariaLabel, onChange, compact = false }: {
  label: string;
  ariaLabel: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="inline-flex max-w-full">
      <button
        type="button"
        aria-label={`เลือกไฟล์: ${ariaLabel}`}
        className={`min-h-11 cursor-pointer border border-emerald-700/70 bg-emerald-950/40 font-heading font-bold text-emerald-200 transition hover:bg-emerald-900/60 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${compact ? "rounded-md px-2 text-[10px]" : "rounded-lg px-2.5 text-[11px]"}`}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          ref.current?.click();
        }}
      >
        {label}
      </button>
      <input ref={ref} type="file" accept="image/*" aria-label={ariaLabel} hidden onChange={onChange} />
    </span>
  );
}
