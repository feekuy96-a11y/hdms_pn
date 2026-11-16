"use client";

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

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

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
    <section aria-labelledby="external-jobs-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="external-jobs-title" className="text-xl font-bold text-white">งานส่งข้อมูลเบื้องหลัง</h2>
          <p className="mt-1 text-sm text-slate-400">ตรวจสำเนารูปไป Google Drive และรายงานไป Google Sheets โดยไม่กระทบข้อมูลหลักใน Supabase</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} /> รีเฟรช
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className={`flex items-center gap-2 text-sm font-semibold ${color}`}><Icon className="h-4 w-4" />{label}</div>
            <p className="mt-2 text-2xl font-bold text-white">{result.counts[key]}</p>
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
          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-800 text-slate-300"><tr><th className="px-4 py-3">ประเภท</th><th className="px-4 py-3">รายการ</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">ครั้งที่ลอง</th><th className="px-4 py-3">อัปเดตล่าสุด</th><th className="px-4 py-3">รายละเอียด / การทำงาน</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {result.jobs.map((job) => (
                    <tr key={job.id} className="align-top">
                      <td className="px-4 py-3 font-semibold text-white">{job.kind === "MEDIA" ? "รูปภาพ" : "รายงาน"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{job.recordId}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${job.status === "failed" ? "bg-red-500/20 text-red-200" : job.status === "done" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-100"}`}>{STATUS_LABEL[job.status]}</span></td>
                      <td className="px-4 py-3 text-slate-300">{job.attempts}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-300">{formatDate(job.updatedAt)}</td>
                      <td className="max-w-sm px-4 py-3">
                        {job.lastError && <p className="mb-2 break-words text-xs text-red-200">{job.lastError}</p>}
                        {job.status === "failed" ? <button type="button" disabled={retryingId === job.id} onClick={() => void retry(job)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-500 px-3 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><RotateCcw className="h-4 w-4" />{retryingId === job.id ? "กำลังส่ง…" : "ลองส่งใหม่"}</button> : <span className="text-xs text-slate-500">ไม่มีการทำงานเพิ่มเติม</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">แสดงงานที่ต้องติดตามสูงสุด 50 งาน และงานสำเร็จล่าสุด 20 งาน ข้อมูลหลักใน Supabase ไม่ถูกแก้ไขจากหน้านี้</p>
          </div>
        )}
      </div>
    </section>
  );
}
