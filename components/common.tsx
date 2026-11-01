"use client";
import { useEffect } from "react";
import { ArrowDown, ArrowUp, Minus, Sparkles, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Traffic, Trend } from "@/lib/supabase";
import { COLORS } from "@/lib/config";

export const TRAFFIC: Record<Traffic, { label: string; short: string; color: string; badge: string }> = {
  closed: { label: "ปิดการจราจร", short: "ปิด", color: "#D32F2F", badge: "bg-red-100 text-red-800" },
  large_vehicle_only: { label: "เฉพาะรถยกสูง/รถใหญ่", short: "รถใหญ่", color: "#F59E0B", badge: "bg-amber-100 text-amber-800" },
  open_limited: { label: "ผ่านได้ด้วยความระมัดระวัง", short: "ผ่านได้", color: "#16A34A", badge: "bg-emerald-100 text-emerald-800" },
};

export const fmtTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–";

export function TrendBadge({ trend, diff }: { trend: Trend; diff?: number | null }) {
  const m = {
    rising: { t: "น้ำเพิ่มขึ้น", cls: "bg-red-50 text-red-700 ring-red-200", I: ArrowUp },
    falling: { t: "น้ำลดลง", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", I: ArrowDown },
    stable: { t: "ทรงตัว", cls: "bg-amber-50 text-amber-700 ring-amber-200", I: Minus },
    new: { t: "รายงานใหม่", cls: "bg-sky-50 text-sky-700 ring-sky-200", I: Sparkles },
    no_data: { t: "ไม่มีข้อมูล", cls: "bg-slate-50 text-slate-500 ring-slate-200", I: Minus },
  }[trend];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${m.cls}`}>
      <m.I className="h-3.5 w-3.5" strokeWidth={2.5} />
      {m.t}
      {diff != null && diff !== 0 && <span className="tabular-nums">({diff > 0 ? "+" : ""}{diff} ซม.)</span>}
    </span>
  );
}

export function LevelChart({ data, height = 150 }: { data: { t: string; cm: number }[]; height?: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => [`${v} ซม.`, "ระดับน้ำ"]} contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid #e2e8f0" }} />
          <Line type="monotone" dataKey="cm" stroke={COLORS.flood} strokeWidth={3}
            dot={{ r: 3.5, fill: "#fff", stroke: COLORS.flood, strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#0B2A5B] focus:ring-2 focus:ring-[#0B2A5B]/15";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

type BtnV = "pri" | "ghost" | "warn" | "danger";
export function Btn({ v = "pri", className = "", children, ...p }: { v?: BtnV; className?: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls: Record<BtnV, string> = {
    pri: "bg-[#0B2A5B] text-white hover:bg-[#123a7a]",
    ghost: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    warn: "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  };
  return (
    <button {...p} className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 ${cls[v]} ${className}`}>
      {children}
    </button>
  );
}

export function Card({ title, sub, right, children, className = "" }: { title?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            {sub && <p className="text-xs text-slate-500">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Modal({ title, onClose, children, size = "md" }: { title: string; onClose: () => void; children: React.ReactNode; size?: "md" | "lg" }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fm-fade fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md"}`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5">
          <h3 className="min-w-0 truncate font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="ปิด" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
