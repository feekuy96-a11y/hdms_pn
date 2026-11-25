"use client";

import workspace from "../AdminWorkspace.module.css";
import { RegistryUpdateTime } from "../RegistryUpdateTime";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import {
  ExternalJobItem,
  ExternalJobsResult,
  getExternalJobsAction,
  retryExternalJobAction,
} from "@/app/actions/doh-actions";

const EMPTY_COUNTS: ExternalJobsResult["counts"] = { pending: 0, processing: 0, done: 0, failed: 0 };
const STATUS_LABEL: Record<ExternalJobItem["status"], string> = {
  pending: "รอดำเนินการ", processing: "กำลังส่ง", done: "สำเร็จ", failed: "ไม่สำเร็จ",
};

export function ExternalJobsTab({ onToast }: { onToast: (message: string) => void }) {
  const [result, setResult] = useState<ExternalJobsResult>({ jobs: [], counts: EMPTY_COUNTS });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryingId, setRetryingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await getExternalJobsAction());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดสถานะงานเบื้องหลังไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const retry = async (job: ExternalJobItem) => {
    setRetryingId(job.id);
    try {
      await retryExternalJobAction(job.id);
      onToast("ส่งงานกลับเข้าคิวแล้ว");
      await load();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "ลองส่งงานใหม่ไม่สำเร็จ");
    } finally {
      setRetryingId("");
    }
  };

  const cards = [
    { key: "pending" as const, label: "รอดำเนินการ", icon: Clock3, color: "text-amber-300" },
    { key: "processing" as const, label: "กำลังส่ง", icon: LoaderCircle, color: "text-sky-300" },
    { key: "failed" as const, label: "ไม่สำเร็จ", icon: AlertTriangle, color: "text-red-300" },
    { key: "done" as const, label: "สำเร็จ", icon: CheckCircle2, color: "text-emerald-300" },
  ];

  return (
    <section aria-labelledby="external-jobs-title" className={`${workspace.registry} space-y-3`}>
      <div className={`${workspace.registryHeading} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <h2 id="external-jobs-title" className="text-xl font-bold text-white">งานส่งข้อมูลเบื้องหลัง</h2>
          <p className="mt-1 text-sm text-slate-400">ตรวจว่าสำเนารูปและรายงานส่งถึงปลายทางหรือยัง แล้วลองส่งใหม่เฉพาะงานที่ไม่สำเร็จ</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} /> รีเฟรช
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="rounded-xl border border-surface bg-surface-panel px-3 py-2">
            <div className={`flex items-center gap-2 text-sm font-semibold ${color}`}><Icon className="h-4 w-4" />{label}</div>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-white">{result.counts[key]}</p>
          </div>
        ))}
      </div>

      <div aria-live="polite">
        {loading && <div role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center text-slate-300">กำลังโหลดสถานะงานเบื้องหลัง…</div>}
        {!loading && error && (
          <div role="alert" className="rounded-xl border border-red-500/60 bg-red-950/40 p-4 text-red-100">
            <p className="font-bold">โหลดข้อมูลไม่สำเร็จ</p><p className="mt-1 break-words text-sm">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 min-h-10 rounded-lg bg-red-500 px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">ลองใหม่</button>
          </div>
        )}
        {!loading && !error && result.jobs.length === 0 && (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center text-slate-300">ยังไม่มีงานส่งข้อมูลเบื้องหลัง</div>
        )}
        {!loading && !error && result.jobs.length > 0 && (
          <section aria-label="รายละเอียดงานส่งข้อมูล" className="space-y-2">
            <ul className="space-y-2">
              {result.jobs.map((job) => (
                <li key={job.id} className="space-y-2 rounded-xl border border-surface bg-surface-panel p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg px-2 py-1 text-xs font-bold ${job.status === "failed" ? "bg-red-950/60 text-red-200" : job.status === "done" ? "bg-emerald-950/60 text-emerald-200" : "bg-amber-950/60 text-amber-100"}`}>{STATUS_LABEL[job.status]}</span>
                    <h3 className="min-w-0 break-words text-sm font-bold text-white">
                      {job.kind === "MEDIA" ? "รูปภาพ" : "รายงาน"} <span className="font-mono">{job.recordId}</span>
                    </h3>
                  </div>
                  <div className={`${workspace.registryFacts} text-xs text-slate-400`}>
                    <span>ลองส่ง {job.attempts} ครั้ง</span>
                    <RegistryUpdateTime updatedAt={job.updatedAt} />
                  </div>
                  {job.lastError && <p className="break-words rounded-lg bg-red-950/40 p-2 text-xs text-red-200">{job.lastError}</p>}
                  {job.status === "failed" ? (
                    <button type="button" disabled={retryingId === job.id} onClick={() => void retry(job)}
                      className={`${workspace.primary} inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-bold disabled:cursor-wait disabled:opacity-60`}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />{retryingId === job.id ? "กำลังส่ง…" : "ลองส่งใหม่"}
                    </button>
                  ) : <p className="text-xs text-slate-500">ไม่มีการทำงานเพิ่มเติม</p>}
                </li>
              ))}
            </ul>
            <p className="rounded-xl border border-surface bg-surface-panel px-3 py-2 text-xs text-slate-500">แสดงงานที่ต้องติดตามสูงสุด 50 งาน และงานสำเร็จล่าสุด 20 งาน ข้อมูลหลักใน Supabase ไม่ถูกแก้ไขจากหน้านี้</p>
          </section>
        )}
      </div>
    </section>
  );
}
