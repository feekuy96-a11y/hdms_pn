"use client";
/**
 * รายการเหตุการณ์ — คลิกแถวเปิด "ป๊อปอัพรายละเอียด" (ดูข้อมูลครบ + จัดการทุกอย่างจากที่นี่)
 * ทุกการบันทึก/ลบ/อัปเดต/แก้ไข มีป๊อปอัพยืนยันก่อน และแสดงแอนิเมชันสำเร็จหลังเสร็จ
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart2, CheckCircle2, ChevronRight, Download, Loader2, MapPinned, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { addUpdate, deleteIncident, exportUpdatesCsv, fetchAdminIncidents, fetchHistory, fetchRoutes, imageUrl, saveIncident, setStatus } from "@/lib/api";
import { toLines } from "@/lib/geo";
import type { HistoryPoint, Incident, RouteRow, Traffic } from "@/lib/supabase";
import { Btn, Card, Field, inputCls, LevelChart, Modal, TRAFFIC, TrendBadge, fmtTime } from "@/components/common";
import { useFeedback } from "@/components/feedback";

const lenFmt = (m?: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(2)} กม.` : `${Math.round(m)} ม.`);

export default function IncidentList({ onEdit, onNew }: { onEdit: (i: Incident) => void; onNew: () => void }) {
  const fb = useFeedback();
  const [rows, setRows] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [flt, setFlt] = useState<"active" | "resolved" | "all">("active");
  const [view, setView] = useState<Incident | null>(null);
  const [lvFor, setLvFor] = useState<Incident | null>(null);
  const [editInfo, setEditInfo] = useState<Incident | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetchAdminIncidents(); setRows(r); setView((v) => (v ? r.find((x) => x.incident_id === v.incident_id) ?? null : v)); }
    catch (e: any) { fb.error(e.message); } finally { setLoading(false); }
  }, [fb]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const shown = useMemo(() => rows.filter((r) => (flt === "all" || r.status === flt) && (r.title + (r.location_name ?? "")).toLowerCase().includes(q.toLowerCase())), [rows, flt, q]);

  const toggleStatus = async (r: Incident) => {
    const toResolved = r.status === "active";
    const ok = await fb.run({
      title: toResolved ? "คืนสภาพปกติ?" : "เปิดเหตุการณ์อีกครั้ง?",
      message: toResolved ? <>“{r.title}” จะถูกซ่อนจากแผนที่ประชาชน</> : <>“{r.title}” จะกลับมาแสดงบนแผนที่ประชาชน</>,
      confirmText: toResolved ? "คืนสภาพปกติ" : "เปิดใหม่", kind: "updated", detail: toResolved ? "คืนสภาพปกติแล้ว" : "เปิดเหตุการณ์อีกครั้งแล้ว",
    }, () => setStatus(r.incident_id, toResolved ? "resolved" : "active"));
    if (ok) load();
  };
  const remove = async (r: Incident) => {
    const ok = await fb.run({
      title: "ลบเหตุการณ์นี้?", tone: "danger", confirmText: "ลบเหตุการณ์",
      message: <>“{r.title}” จะหายจากระบบและหน้าประชาชน<br /><span className="text-xs text-slate-400">(ลบแบบซ่อน — ผู้ดูแลฐานข้อมูลกู้คืนได้)</span></>,
      kind: "deleted", detail: r.title,
    }, () => deleteIncident(r.incident_id));
    if (ok) { setView(null); load(); }
  };
  const doExport = async () => {
    const ok = await fb.confirm({ title: "ส่งออกข้อมูลเป็น CSV?", message: "ดาวน์โหลดประวัติระดับน้ำทั้งหมดเป็นไฟล์ CSV (เปิดใน Excel ได้)", confirmText: "ส่งออก" });
    if (!ok) return;
    setExporting(true);
    try { fb.info(`ส่งออก ${await exportUpdatesCsv()} รายการ`); } catch (e: any) { fb.error(e.message); } finally { setExporting(false); }
  };

  return (
    <Card title="รายการเหตุการณ์น้ำท่วม" sub={`กำลังเกิดเหตุ ${rows.filter((r) => r.status === "active").length} · ทั้งหมด ${rows.length} · คลิกที่รายการเพื่อดู/จัดการ`}
      right={<div className="flex flex-wrap gap-2"><Btn onClick={onNew}><MapPinned className="h-4 w-4" />เพิ่มเหตุการณ์</Btn><Btn v="ghost" onClick={doExport} disabled={exporting}><Download className="h-4 w-4" />ส่งออก CSV</Btn></div>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={inputCls + " sm:max-w-xs"} placeholder="ค้นหาหัวข้อ / ตำแหน่ง…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
          {([["active", "กำลังเกิดเหตุ"], ["resolved", "ปกติแล้ว"], ["all", "ทั้งหมด"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFlt(k)} className={`rounded-md px-3 py-2 ${flt === k ? "bg-[#0B2A5B] text-white shadow" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="grid place-items-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        : !shown.length ? <p className="py-14 text-center text-sm text-slate-400">ไม่พบรายการ</p>
        : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.incident_id}>
                <button onClick={() => setView(r)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-[#0B2A5B]/40 hover:bg-slate-50 sm:p-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-extrabold tabular-nums text-white" style={{ background: TRAFFIC[r.traffic_status]?.color }}>{r.latest_level_cm ?? "–"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{r.title}</span>
                    <span className="block truncate text-xs text-slate-500">{[r.location_name, r.district, r.route_code && `ทล.${r.route_code}`].filter(Boolean).join(" · ") || "—"}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.status === "active" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{r.status === "active" ? "เกิดเหตุ" : "ปกติแล้ว"}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TRAFFIC[r.traffic_status]?.badge}`}>{TRAFFIC[r.traffic_status]?.short}</span>
                      <TrendBadge trend={r.trend} diff={r.level_diff_cm} />
                      <span className="text-[11px] text-slate-400">{fmtTime(r.latest_recorded_at)}</span>
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        )}

      {view && <DetailModal r={view} onClose={() => setView(null)} onAddLevel={() => setLvFor(view)} onEditInfo={() => setEditInfo(view)} onEditLine={() => onEdit(view)} onStatus={() => toggleStatus(view)} onDelete={() => remove(view)} />}
      {lvFor && <LevelModal r={lvFor} onClose={() => setLvFor(null)} onDone={() => { setLvFor(null); load(); }} />}
      {editInfo && <InfoModal r={editInfo} onClose={() => setEditInfo(null)} onDone={() => { setEditInfo(null); load(); }} />}
    </Card>
  );
}

/* ───────── ป๊อปอัพ: รายละเอียดเหตุการณ์ ───────── */
function DetailModal({ r, onClose, onAddLevel, onEditInfo, onEditLine, onStatus, onDelete }: {
  r: Incident; onClose: () => void; onAddLevel: () => void; onEditInfo: () => void; onEditLine: () => void; onStatus: () => void; onDelete: () => void;
}) {
  const [hist, setHist] = useState<HistoryPoint[]>([]);
  useEffect(() => { fetchHistory(r.incident_id).then(setHist).catch(() => {}); }, [r.incident_id, r.latest_recorded_at]);
  const rowsInfo: [string, string][] = [
    ["สถานะ", r.status === "active" ? "กำลังเกิดเหตุ" : "คืนสภาพปกติแล้ว"], ["สถานะจราจร", TRAFFIC[r.traffic_status]?.label ?? "–"],
    ["เส้นทาง", [r.route_code && `ทล.${r.route_code}`, r.route_name].filter(Boolean).join(" ") || "–"], ["พื้นที่", [r.location_name, r.district].filter(Boolean).join(" · ") || "–"],
    ["ช่วง กม.", r.km_start != null || r.km_end != null ? `${r.km_start ?? "?"} – ${r.km_end ?? "?"}` : "–"], ["ความยาวช่วงน้ำท่วม", lenFmt(r.flood_length_m)],
    ["ทางเลี่ยง", r.detour_geojson ? lenFmt(r.detour_length_m) : "ไม่มี"], ["เริ่มเกิดเหตุ", fmtTime(r.started_at)],
    ["อัปเดตล่าสุด", fmtTime(r.latest_recorded_at)], ["ผู้รายงานล่าสุด", r.latest_reported_by || "–"],
  ];
  return (
    <Modal title="รายละเอียดเหตุการณ์" size="lg" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-extrabold tabular-nums text-white" style={{ background: TRAFFIC[r.traffic_status]?.color }}>{r.latest_level_cm ?? "–"}</span>
          <div className="min-w-0"><p className="font-bold leading-snug text-slate-900">{r.title}</p><div className="mt-1.5"><TrendBadge trend={r.trend} diff={r.level_diff_cm} /></div></div>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rowsInfo.map(([l, v]) => <div key={l} className="rounded-lg bg-slate-50 p-2.5"><dt className="text-[11px] font-semibold text-slate-400">{l}</dt><dd className="mt-0.5 text-[13px] font-semibold text-slate-800">{v}</dd></div>)}
        </dl>
        {hist.length > 1 && <LevelChart height={150} data={hist.map((h) => ({ t: new Date(h.recorded_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }), cm: h.water_level_cm }))} />}
        {r.detour_note && <p className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">ทางเลี่ยง: {r.detour_note}</p>}
        {!!r.latest_image_paths?.length && <div className="grid grid-cols-3 gap-2">{r.latest_image_paths.slice(0, 6).map((p) => <a key={p} href={imageUrl(p)} target="_blank" rel="noreferrer"><img src={imageUrl(p)} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" /></a>)}</div>}
        {hist.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-500">ประวัติการอัปเดต ({hist.length})</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {[...hist].reverse().map((h, i) => <li key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-1.5 text-sm"><b className="w-16 tabular-nums">{h.water_level_cm} ซม.</b><span className="flex-1 truncate text-xs text-slate-500">{fmtTime(h.recorded_at)}{h.reported_by ? ` · ${h.reported_by}` : ""}{h.note ? ` · ${h.note}` : ""}</span></li>)}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {r.status === "active" && <Btn onClick={onAddLevel}><Plus className="h-4 w-4" />เพิ่มระดับน้ำ</Btn>}
          <Btn v="ghost" onClick={onEditInfo}><Pencil className="h-4 w-4" />แก้ไขข้อมูล</Btn>
          <Btn v="ghost" onClick={onEditLine}><MapPinned className="h-4 w-4" />แก้ไขเส้นบนแผนที่</Btn>
          <Btn v="warn" onClick={onStatus}>{r.status === "active" ? <><CheckCircle2 className="h-4 w-4" />คืนสภาพปกติ</> : <><RotateCcw className="h-4 w-4" />เปิดใหม่</>}</Btn>
          <Btn v="danger" onClick={onDelete}><Trash2 className="h-4 w-4" />ลบ</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ───────── ป๊อปอัพ: เพิ่มระดับน้ำ ───────── */
function LevelModal({ r, onClose, onDone }: { r: Incident; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback();
  const [lv, setLv] = useState({ level: "", note: "", by: "" });
  const [files, setFiles] = useState<File[]>([]);
  const diff = lv.level !== "" && r.latest_level_cm != null ? +(Number(lv.level) - r.latest_level_cm).toFixed(1) : null;
  const submit = async () => {
    const ok = await fb.run({
      title: "ยืนยันการอัปเดตระดับน้ำ?", confirmText: "อัปเดต", kind: "updated", detail: `${lv.level} ซม.`,
      message: <>“{r.title}”<br />ระดับน้ำใหม่ <b>{lv.level} ซม.</b>{diff != null && <> ({diff > 0 ? "เพิ่มขึ้น " : diff < 0 ? "ลดลง " : "ทรงตัว "}{Math.abs(diff)} ซม.)</>}</>,
    }, () => addUpdate(r.incident_id, { levelCm: Number(lv.level), note: lv.note, reportedBy: lv.by, images: files }));
    if (ok) onDone();
  };
  return (
    <Modal title="อัปเดตระดับน้ำ" onClose={onClose}>
      <div className="space-y-3.5">
        <p className="rounded-xl bg-slate-50 p-3 text-sm"><b>{r.title}</b><br /><span className="text-slate-500">ล่าสุด {r.latest_level_cm ?? "–"} ซม. · {fmtTime(r.latest_recorded_at)}</span></p>
        <Field label="ระดับน้ำใหม่ (ซม.) *"><input autoFocus type="number" inputMode="decimal" min="0" className={inputCls} value={lv.level} onChange={(e) => setLv({ ...lv, level: e.target.value })} /></Field>
        {diff != null && <p className="text-sm">ส่วนต่างจากครั้งก่อน: <b className={diff > 0 ? "text-red-600" : diff < 0 ? "text-emerald-600" : "text-amber-600"}>{diff > 0 ? "▲ +" : diff < 0 ? "▼ " : "● "}{diff} ซม.</b></p>}
        <Field label="ผู้รายงาน"><input className={inputCls} value={lv.by} onChange={(e) => setLv({ ...lv, by: e.target.value })} /></Field>
        <Field label="หมายเหตุ"><textarea rows={2} className={inputCls} value={lv.note} onChange={(e) => setLv({ ...lv, note: e.target.value })} /></Field>
        <Field label="ภาพถ่าย (ไม่บังคับ)">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-sm text-slate-600"><Upload className="h-4 w-4" />{files.length ? `เลือกแล้ว ${files.length} รูป` : "เลือกรูปภาพ"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 10))} /></label>
        </Field>
        <div className="flex justify-end gap-2"><Btn v="ghost" onClick={onClose}>ยกเลิก</Btn><Btn disabled={lv.level === ""} onClick={submit}>บันทึก</Btn></div>
      </div>
    </Modal>
  );
}

/* ───────── ป๊อปอัพ: แก้ไขข้อมูล (ไม่รวมเส้น) ───────── */
function InfoModal({ r, onClose, onDone }: { r: Incident; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [f, setF] = useState({ title: r.title, location: r.location_name ?? "", district: r.district ?? "", traffic: r.traffic_status as Traffic, kmStart: r.km_start != null ? String(r.km_start) : "", kmEnd: r.km_end != null ? String(r.km_end) : "", routeId: r.route_id ?? "", detourNote: r.detour_note ?? "" });
  useEffect(() => { fetchRoutes().then(setRoutes).catch(() => {}); }, []);
  const submit = async () => {
    const ok = await fb.run({ title: "ยืนยันการแก้ไขข้อมูล?", message: <>“{f.title}” จะถูกอัปเดตบนหน้าประชาชนทันที</>, confirmText: "บันทึกการแก้ไข", kind: "edited", detail: f.title },
      () => saveIncident({
        id: r.incident_id, title: f.title.trim(), location: f.location, district: f.district, traffic: f.traffic,
        flood: toLines(r.flood_geojson)[0], detour: r.detour_geojson ? toLines(r.detour_geojson)[0] : null, detourNote: f.detourNote, routeId: f.routeId || null,
        kmStart: f.kmStart ? Number(f.kmStart) : null, kmEnd: f.kmEnd ? Number(f.kmEnd) : null,
      }));
    if (ok) onDone();
  };
  return (
    <Modal title="แก้ไขข้อมูลเหตุการณ์" onClose={onClose}>
      <div className="space-y-3">
        <Field label="หัวข้อ *"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="ตำบล"><input className={inputCls} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <Field label="อำเภอ"><input className={inputCls} value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} /></Field>
          <Field label="กม.เริ่มต้น"><input type="number" inputMode="decimal" className={inputCls} value={f.kmStart} onChange={(e) => setF({ ...f, kmStart: e.target.value })} /></Field>
          <Field label="กม.สิ้นสุด"><input type="number" inputMode="decimal" className={inputCls} value={f.kmEnd} onChange={(e) => setF({ ...f, kmEnd: e.target.value })} /></Field>
        </div>
        <Field label="เส้นทางหลวง"><select className={inputCls} value={f.routeId} onChange={(e) => setF({ ...f, routeId: e.target.value })}><option value="">— ไม่ระบุ —</option>{routes.map((x) => <option key={x.id} value={x.id}>ทล.{x.route_code} {x.route_name}</option>)}</select></Field>
        <Field label="สถานะจราจร"><select className={inputCls} value={f.traffic} onChange={(e) => setF({ ...f, traffic: e.target.value as Traffic })}>{(Object.keys(TRAFFIC) as Traffic[]).map((k) => <option key={k} value={k}>{TRAFFIC[k].label}</option>)}</select></Field>
        <Field label="คำแนะนำทางเลี่ยง"><textarea rows={2} className={inputCls} value={f.detourNote} onChange={(e) => setF({ ...f, detourNote: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Btn v="ghost" onClick={onClose}>ยกเลิก</Btn><Btn disabled={!f.title.trim()} onClick={submit}>บันทึก</Btn></div>
      </div>
    </Modal>
  );
}
