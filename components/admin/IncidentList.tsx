"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart2, CheckCircle2, Download, Loader2, MapPinned, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { addUpdate, deleteIncident, exportUpdatesCsv, fetchAdminIncidents, fetchHistory, setStatus } from "@/lib/api";
import type { HistoryPoint, Incident } from "@/lib/supabase";
import { Btn, Card, Field, inputCls, LevelChart, Modal, TRAFFIC, TrendBadge, fmtTime } from "@/components/common";

export default function IncidentList({ toast, onEdit, onNew }: {
  toast: (m: string, err?: boolean) => void; onEdit: (i: Incident) => void; onNew: () => void;
}) {
  const [rows, setRows] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [flt, setFlt] = useState<"active" | "resolved" | "all">("active");
  const [upd, setUpd] = useState<Incident | null>(null);
  const [hist, setHist] = useState<{ inc: Incident; data: HistoryPoint[] } | null>(null);
  const [lv, setLv] = useState({ level: "", note: "", by: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await fetchAdminIncidents()); } catch (e: any) { toast(e.message, true); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => rows.filter((r) => (flt === "all" || r.status === flt) && (r.title + (r.location_name ?? "")).toLowerCase().includes(q.toLowerCase())), [rows, flt, q]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); await load(); } catch (e: any) { toast(e.message, true); }
  };

  const diff = upd && lv.level !== "" && upd.latest_level_cm != null ? +(Number(lv.level) - upd.latest_level_cm).toFixed(1) : null;
  const submitUpdate = async () => {
    if (!upd) return;
    setBusy(true);
    try {
      await addUpdate(upd.incident_id, { levelCm: Number(lv.level), note: lv.note, reportedBy: lv.by, images: files });
      toast("เพิ่มระดับน้ำแล้ว"); setUpd(null); setLv({ level: "", note: "", by: "" }); setFiles([]); await load();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };
  const doExport = async () => {
    setBusy(true);
    try { toast(`ส่งออก ${await exportUpdatesCsv()} รายการ`); } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  };

  return (
    <Card title="รายการเหตุการณ์น้ำท่วม" sub={`กำลังเกิดเหตุ ${rows.filter((r) => r.status === "active").length} · ทั้งหมด ${rows.length}`}
      right={
        <div className="flex flex-wrap gap-2">
          <Btn onClick={onNew}><MapPinned className="h-4 w-4" />เพิ่มเหตุการณ์</Btn>
          <Btn v="ghost" onClick={doExport} disabled={busy}><Download className="h-4 w-4" />ส่งออก CSV</Btn>
        </div>
      }>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={inputCls + " sm:max-w-xs"} placeholder="ค้นหาหัวข้อ / ตำแหน่ง…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
          {([["active", "กำลังเกิดเหตุ"], ["resolved", "ปกติแล้ว"], ["all", "ทั้งหมด"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFlt(k)} className={`rounded-md px-3 py-2 ${flt === k ? "bg-[#0B2A5B] text-white shadow" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !shown.length ? (
        <p className="py-14 text-center text-sm text-slate-400">ไม่พบรายการ</p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li key={r.incident_id} className="rounded-xl border border-slate-200 p-3 sm:p-4 xl:flex xl:items-center xl:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-extrabold tabular-nums text-white" style={{ background: TRAFFIC[r.traffic_status]?.color }}>
                  {r.latest_level_cm ?? "–"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{r.title}</p>
                  <p className="truncate text-xs text-slate-500">{[r.location_name, r.route_code && `ทล.${r.route_code}`].filter(Boolean).join(" · ") || "—"}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.status === "active" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{r.status === "active" ? "เกิดเหตุ" : "ปกติแล้ว"}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TRAFFIC[r.traffic_status]?.badge}`}>{TRAFFIC[r.traffic_status]?.short}</span>
                    <TrendBadge trend={r.trend} diff={r.level_diff_cm} />
                    <span className="text-[11px] text-slate-400">{fmtTime(r.latest_recorded_at)} · {r.update_count} ครั้ง</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 xl:mt-0 xl:justify-end">
                {r.status === "active" && <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={() => setUpd(r)}><Plus className="h-3.5 w-3.5" />เพิ่มระดับน้ำ</Btn>}
                <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={async () => setHist({ inc: r, data: await fetchHistory(r.incident_id) })}><BarChart2 className="h-3.5 w-3.5" />ประวัติ</Btn>
                <Btn v="ghost" className="!min-h-[36px] !px-2.5 text-xs" onClick={() => onEdit(r)}><Pencil className="h-3.5 w-3.5" />แก้ไขเส้น</Btn>
                <Btn v="warn" className="!min-h-[36px] !px-2.5 text-xs"
                  onClick={() => act(() => setStatus(r.incident_id, r.status === "active" ? "resolved" : "active"), r.status === "active" ? "คืนสภาพปกติแล้ว" : "เปิดเหตุการณ์อีกครั้ง")}>
                  {r.status === "active" ? <><CheckCircle2 className="h-3.5 w-3.5" />คืนสภาพปกติ</> : <><RotateCcw className="h-3.5 w-3.5" />เปิดใหม่</>}
                </Btn>
                <Btn v="danger" className="!min-h-[36px] !px-2.5" aria-label="ลบ"
                  onClick={() => confirm(`ลบ “${r.title}” ?\n(ลบแบบซ่อน — กู้คืนได้ผู้ดูแลฐานข้อมูล)`) && act(() => deleteIncident(r.incident_id), "ลบแล้ว")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      )}

      {upd && (
        <Modal title="อัปเดตระดับน้ำ" onClose={() => setUpd(null)}>
          <div className="space-y-3.5">
            <p className="rounded-xl bg-slate-50 p-3 text-sm"><b>{upd.title}</b><br /><span className="text-slate-500">ล่าสุด {upd.latest_level_cm ?? "–"} ซม. · {fmtTime(upd.latest_recorded_at)}</span></p>
            <Field label="ระดับน้ำใหม่ (ซม.) *"><input autoFocus type="number" inputMode="decimal" min="0" className={inputCls} value={lv.level} onChange={(e) => setLv({ ...lv, level: e.target.value })} /></Field>
            {diff != null && <p className="text-sm">ส่วนต่างจากครั้งก่อน: <b className={diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-amber-600"}>{diff > 0 ? "▲ +" : diff < 0 ? "▼ " : "● "}{diff} ซม.</b></p>}
            <Field label="ผู้รายงาน"><input className={inputCls} value={lv.by} onChange={(e) => setLv({ ...lv, by: e.target.value })} /></Field>
            <Field label="หมายเหตุ"><textarea rows={2} className={inputCls} value={lv.note} onChange={(e) => setLv({ ...lv, note: e.target.value })} /></Field>
            <Field label="ภาพถ่าย (ไม่บังคับ)">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">
                <Upload className="h-4 w-4" />{files.length ? `เลือกแล้ว ${files.length} รูป` : "เลือกรูปภาพ"}
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 10))} />
              </label>
            </Field>
            <div className="flex justify-end gap-2"><Btn v="ghost" onClick={() => setUpd(null)}>ยกเลิก</Btn><Btn disabled={lv.level === "" || busy} onClick={submitUpdate}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}บันทึก</Btn></div>
          </div>
        </Modal>
      )}

      {hist && (
        <Modal title={`ประวัติระดับน้ำ — ${hist.inc.title}`} onClose={() => setHist(null)}>
          <LevelChart height={170} data={hist.data.map((h) => ({ t: new Date(h.recorded_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }), cm: h.water_level_cm }))} />
          <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
            {[...hist.data].reverse().map((h, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <b className="w-16 tabular-nums">{h.water_level_cm} ซม.</b>
                <span className="flex-1 truncate text-xs text-slate-500">{fmtTime(h.recorded_at)}{h.reported_by ? ` · ${h.reported_by}` : ""}{h.note ? ` · ${h.note}` : ""}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </Card>
  );
}
