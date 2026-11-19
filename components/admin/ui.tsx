import React from "react";

// Shared layout primitives for the admin forms, so every screen groups content the same way:
//   FormSection  - a numbered card with a title, one line of help and its own fields
//   ToolGroup    - a labelled cluster of related buttons
//   ActionButton - the one button style (primary / secondary / pick / danger) with a 40px minimum height
//   StickyActionBar - the save / cancel row that stays reachable while a long form scrolls

const TONES = {
  default: "border-slate-800 bg-slate-950",
  amber: "border-amber-600/40 bg-amber-950/20",
} as const;

interface FormSectionProps {
  step?: number;
  title: string;
  description?: string;
  tone?: keyof typeof TONES;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function FormSection({ step, title, description, tone = "default", actions, children }: FormSectionProps) {
  return (
    <section className={`rounded-2xl border ${TONES[tone]}`}>
      <header className="flex flex-wrap items-start justify-between gap-[0.75em] border-b border-slate-800/80 px-[1rem] py-[0.75rem] sm:px-[1.25rem]">
        <div className="flex min-w-0 items-start gap-[0.75em]">
          {step !== undefined && (
            <span aria-hidden="true" className="grid h-[1.75rem] w-[1.75rem] shrink-0 place-items-center rounded-full bg-amber-500 font-heading text-[0.875rem] font-black text-slate-950">
              {step}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-heading text-[0.875rem] font-bold text-white">{title}</h3>
            {description && <p className="mt-[0.2em] max-w-[65ch] text-[0.75rem] text-slate-400">{description}</p>}
          </div>
        </div>
        {actions}
      </header>
      <div className="space-y-[1rem] p-[1rem] sm:p-[1.25rem]">{children}</div>
    </section>
  );
}

export function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-[0.4em]">
      <p className="max-w-[65ch] text-[0.75rem] font-semibold text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-[0.5em]">{children}</div>
    </div>
  );
}

type ActionVariant = "primary" | "secondary" | "pick" | "danger";

const VARIANTS: Record<ActionVariant, string> = {
  primary: "bg-sky-600 text-white shadow hover:bg-sky-500",
  secondary: "border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700",
  pick: "border border-slate-700 bg-slate-800 text-amber-300 hover:bg-slate-700",
  danger: "border border-red-900/70 bg-red-950/40 text-red-300 hover:bg-red-950/70",
};

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant;
  /** Highlights a toggle-style button (for example "waiting for a click on the map"). */
  active?: boolean;
}

export function ActionButton({ variant = "secondary", active = false, className = "", type = "button", ...props }: ActionButtonProps) {
  const activeStyle = active ? "!border-amber-400 !bg-amber-500 !text-slate-950 motion-safe:animate-pulse" : "";
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex min-h-[2.5rem] items-center justify-center gap-[0.45em] rounded-[0.55em] px-[0.95em] py-[0.5em] text-[0.75rem] font-heading font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${activeStyle} ${className}`}
    />
  );
}

export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-[0.25rem] flex gap-[0.5em] rounded-xl border border-slate-700 bg-slate-950/95 p-[0.75rem] shadow-[0_-10px_24px_rgba(2,6,23,0.65)] backdrop-blur">
      {children}
    </div>
  );
}
