"use client";
/**
 * ป๊อปอัพยืนยัน + ภาพเคลื่อนไหวความสำเร็จ (ใช้ทุกการบันทึก/ลบ/อัปเดต/แก้ไขในหน้า Admin)
 *   const fb = useFeedback();
 *   await fb.run({ title: "ยืนยันการบันทึก", kind: "saved" }, () => saveSomething());
 *   → ถามยืนยัน → ทำงาน (ปุ่มหมุน) → แอนิเมชัน “บันทึกสำเร็จ” | ผิดพลาดแสดงแถบแดง
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Trash2, X } from "lucide-react";

export type SuccessKind = "saved" | "deleted" | "updated" | "edited" | "imported";
const KIND: Record<SuccessKind, { title: string; tone: "ok" | "del" }> = {
  saved: { title: "บันทึกสำเร็จ", tone: "ok" },
  updated: { title: "อัปเดตสำเร็จ", tone: "ok" },
  edited: { title: "แก้ไขสำเร็จ", tone: "ok" },
  imported: { title: "นำเข้าสำเร็จ", tone: "ok" },
  deleted: { title: "ลบสำเร็จ", tone: "del" },
};

export interface ConfirmOpts { title: string; message?: React.ReactNode; confirmText?: string; tone?: "primary" | "danger" }
type RunOpts = ConfirmOpts & { kind: SuccessKind; detail?: string };

interface Api {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  run: (o: RunOpts, fn: () => Promise<unknown>) => Promise<boolean>;
  success: (k: SuccessKind, detail?: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}
const Ctx = createContext<Api>(null as unknown as Api);
export const useFeedback = () => useContext(Ctx);

interface Dlg { opts: ConfirmOpts; resolve: (v: boolean) => void; fn?: () => Promise<unknown>; kind?: SuccessKind; detail?: string }

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [busy, setBusy] = useState(false);
  const [succ, setSucc] = useState<{ kind: SuccessKind; detail?: string; id: number } | null>(null);
  const [toast, setToast] = useState<{ m: string; err: boolean } | null>(null);
  const tToast = useRef<any>(), tSucc = useRef<any>();

  const error = useCallback((m: string) => { setToast({ m, err: true }); clearTimeout(tToast.current); tToast.current = setTimeout(() => setToast(null), 6000); }, []);
  const info = useCallback((m: string) => { setToast({ m, err: false }); clearTimeout(tToast.current); tToast.current = setTimeout(() => setToast(null), 2800); }, []);
  const success = useCallback((kind: SuccessKind, detail?: string) => {
    setSucc({ kind, detail, id: Date.now() }); clearTimeout(tSucc.current); tSucc.current = setTimeout(() => setSucc(null), 1900);
  }, []);

  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ opts, resolve })), []);
  const run = useCallback((o: RunOpts, fn: () => Promise<unknown>) =>
    new Promise<boolean>((resolve) => setDlg({ opts: o, resolve, fn, kind: o.kind, detail: o.detail })), []);

  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null); setBusy(false); };
  const onConfirm = async () => {
    if (!dlg) return;
    if (!dlg.fn) return close(true);
    setBusy(true);
    try { await dlg.fn(); const { kind, detail } = dlg; close(true); if (kind) success(kind, detail); }
    catch (e: any) { close(false); error(e?.message ?? "เกิดข้อผิดพลาด"); }
  };

  useEffect(() => {
    if (!dlg) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) close(false); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  const api = useMemo<Api>(() => ({ confirm, run, success, error, info }), [confirm, run, success, error, info]);
  const danger = dlg?.opts.tone === "danger";

  return (
    <Ctx.Provider value={api}>
      {children}

      {dlg && (
        <div className="fm-fade fixed inset-0 z-[100] grid place-items-center bg-slate-900/55 p-4 backdrop-blur-sm">
          <div className="fm-succ-card w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${danger ? "bg-red-100 text-red-600" : "bg-blue-100 text-[#0B2A5B]"}`}>
                {danger ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900">{dlg.opts.title}</h3>
                {dlg.opts.message && <div className="mt-1 text-sm text-slate-600">{dlg.opts.message}</div>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button disabled={busy} onClick={() => close(false)} className="min-h-[42px] rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">ยกเลิก</button>
              <button disabled={busy} onClick={onConfirm}
                className={`inline-flex min-h-[42px] items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-70 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-[#0B2A5B] hover:bg-[#123a7a]"}`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "กำลังดำเนินการ…" : dlg.opts.confirmText ?? (danger ? "ลบ" : "ยืนยัน")}
              </button>
            </div>
          </div>
        </div>
      )}

      {succ && <SuccessOverlay key={succ.id} kind={succ.kind} detail={succ.detail} onClose={() => setSucc(null)} />}

      {toast && (
        <div className={`fm-fade fixed left-1/2 top-4 z-[120] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-2xl ${toast.err ? "bg-red-700" : "bg-slate-900"}`}>
          {toast.err ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
          <span className="min-w-0">{toast.m}</span>
          <button onClick={() => setToast(null)} aria-label="ปิด" className="ml-1 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}
    </Ctx.Provider>
  );
}

function SuccessOverlay({ kind, detail, onClose }: { kind: SuccessKind; detail?: string; onClose: () => void }) {
  const k = KIND[kind];
  const color = k.tone === "del" ? "#DC2626" : "#16A34A";
  const sparks = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { x: Math.cos(a) * 58, y: Math.sin(a) * 58, c: i % 2 ? color : "#FBC02D" };
  });
  return (
    <div className="fm-fade fixed inset-0 z-[110] grid place-items-center bg-slate-900/35 p-6 backdrop-blur-[2px]" onClick={onClose}>
      <div className="fm-succ-card relative w-full max-w-[17rem] rounded-3xl bg-white px-6 pb-6 pt-8 text-center shadow-2xl">
        {sparks.map((s, i) => <span key={i} className="fm-spark" style={{ background: s.c, ["--x" as any]: `${s.x}px`, ["--y" as any]: `${s.y}px` }} />)}
        <svg viewBox="0 0 64 64" className="mx-auto h-20 w-20" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <circle className="fm-succ-circle" cx="32" cy="32" r="29" />
          {k.tone === "del"
            ? <path className="fm-succ-mark" d="M20 24h24M27 24v-4h10v4M23 24l2 22h14l2-22" />
            : <path className="fm-succ-mark" d="M19 33l9 9 17-19" />}
        </svg>
        <p className="mt-3 text-lg font-extrabold text-slate-900">{k.title}</p>
        {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}
