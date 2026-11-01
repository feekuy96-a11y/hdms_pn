"use client";
/**
 * นำเข้าเส้นทางหลวง: .kml · .kmz · .zip (Shapefile) · .geojson · .gpx
 *  แผนที่ตัวอย่างแสดง 2 ชั้นพร้อมกัน → เขียวอ่อน = เส้นที่ "มีอยู่ในระบบแล้ว" · น้ำเงิน = ไฟล์ที่กำลังจะนำเข้า
 *  หลังนำเข้า ระบบอ่านกลับจากฐานข้อมูลมาตรวจ (นับจำนวน/ความยาว) และรีเฟรชแคชให้ทุกคนเห็นทันที
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Power, Trash2 } from "lucide-react";
import { deleteRoute, fetchAdminRoutes, fetchRoutes, importRoutes, updateRoute, type RouteImportRow } from "@/lib/api";
import { readSpatialFile, type SpatialResult } from "@/lib/importers";
import { createMap, fitTo, loadLongdo, polyline, type LngLat } from "@/lib/longdo";
import { toLines } from "@/lib/geo";
import type { AdminRoute, RouteRow } from "@/lib/supabase";
import { Btn, Card, Field, inputCls, Modal } from "@/components/common";
import { useFeedback } from "@/components/feedback";

const CODE_HINTS = ["route_code", "routecode", "route_no", "routeno", "hwy_no", "highway_no", "road_no", "roadno", "route", "rt_no", "scode", "code", "ref", "name"];
const NAME_HINTS = ["route_name", "routename", "name_th", "road_name", "roadname", "name", "desc", "description"];
const pickField = (fields: string[], hints: string[]) => { const low = fields.map((f) => f.toLowerCase()); for (const h of hints) { const i = low.indexOf(h); if (i >= 0) return fields[i]; } return ""; };

export default function RouteImport() {
  const fb = useFeedback();
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const sysOv = useRef<any[]>([]);
  const impOv = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  const [fileName, setFileName] = useState("");
  const [res, setRes] = useState<SpatialResult | null>(null);
  const [reading, setReading] = useState(false);
  const [codeF, setCodeF] = useState("");
  const [nameF, setNameF] = useState("");
  const [typeMode, setTypeMode] = useState<"primary" | "secondary" | "field">("primary");
  const [typeF, setTypeF] = useState("");
  const [primVals, setPrimVals] = useState("");
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [report, setReport] = useState<string>("");

  const [list, setList] = useState<AdminRoute[]>([]);
  const [sys, setSys] = useState<RouteRow[]>([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<AdminRoute | null>(null);

  const reload = useCallback(async () => {
    try { setList(await fetchAdminRoutes()); setSys(await fetchRoutes(true)); } catch (e: any) { fb.error(e.message); }
  }, [fb]);
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    let dead = false;
    loadLongdo().then((L) => { if (dead || !boxRef.current || mapRef.current) return; LRef.current = L; mapRef.current = createMap(L, boxRef.current); setReady(true); }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    setReading(true); setRes(null); setReport(""); setFileName(file.name);
    try {
      const r = await readSpatialFile(file);
      setRes(r); setCodeF(pickField(r.fields, CODE_HINTS)); setNameF(pickField(r.fields, NAME_HINTS)); setTypeF(""); setPrimVals("");
    } catch (e: any) { fb.error(e.message); } finally { setReading(false); }
  };

  const rows = useMemo<RouteImportRow[]>(() => {
    if (!res) return [];
    const pv = primVals.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const g = new Map<string, RouteImportRow>();
    res.features.forEach((f, idx) => {
      const code = (codeF ? String(f.props[codeF] ?? "").trim() : "") || `IMP-${idx + 1}`;
      const nm = nameF ? String(f.props[nameF] ?? "").trim() : "";
      const type: "primary" | "secondary" = typeMode === "field" ? (pv.includes(String(f.props[typeF] ?? "").trim().toLowerCase()) ? "primary" : "secondary") : typeMode;
      const cur = g.get(code);
      if (cur) { cur.lines.push(...f.lines); if (!cur.route_name && nm) cur.route_name = nm; }
      else g.set(code, { route_code: code, route_name: nm, route_type: type, source: `${fileName}`.slice(0, 200), props: f.props, lines: [...f.lines] });
    });
    return [...g.values()].map((r) => ({ ...r, route_name: r.route_name || `ทล.${r.route_code}` }));
  }, [res, codeF, nameF, typeMode, typeF, primVals, fileName]);
  const vertexCount = useMemo(() => rows.reduce((s, r) => s + r.lines.reduce((a, l) => a + l.length, 0), 0), [rows]);

  /* ชั้นที่ 1: เส้นที่มีในระบบ (เขียวอ่อน) */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current; if (!ready || !m) return;
    sysOv.current.forEach((o) => m.Overlays.remove(o)); sysOv.current = [];
    const all: LngLat[] = [];
    for (const r of sys) for (const part of toLines(r.geojson)) {
      const o = polyline(L, part, { color: r.route_type === "primary" ? "#1B5E20" : "#81C784", width: r.route_type === "primary" ? 5 : 3.5 });
      m.Overlays.add(o); sysOv.current.push(o); all.push(part[0], part[part.length - 1]);
    }
    if (!res && all.length) fitTo(m, all, 0.03);
  }, [ready, sys, res]);

  /* ชั้นที่ 2: ไฟล์ที่กำลังจะนำเข้า (น้ำเงิน) */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current; if (!ready || !m) return;
    impOv.current.forEach((o) => m.Overlays.remove(o)); impOv.current = [];
    if (!res) return;
    const all: LngLat[] = [];
    for (const r of rows) for (const l of r.lines) {
      for (const o of [polyline(L, l, { color: "rgba(255,255,255,.9)", width: 8 }), polyline(L, l, { color: "#1D4ED8", width: 4.5 })]) { m.Overlays.add(o); impOv.current.push(o); }
      all.push(l[0], l[l.length - 1]);
    }
    if (all.length) fitTo(m, all, 0.02);
  }, [ready, res, rows]);

  const doImport = async () => {
    if (!rows.length) return;
    const before = list.length;
    const ok = await fb.run({
      title: `นำเข้า ${rows.length.toLocaleString()} เส้นทาง?`, confirmText: "นำเข้า", kind: "imported", detail: `${rows.length.toLocaleString()} เส้นทาง`,
      message: <>จาก “{fileName}” · {vertexCount.toLocaleString()} จุด<br />เส้นทางที่มีเลขสายทางซ้ำกับในระบบจะถูกอัปเดตทับ</>,
    }, async () => {
      setProgress([0, rows.length]);
      try {
        const r = await importRoutes(rows, (d, t) => setProgress([d, t]));
        if (r.imported === 0) throw new Error(`นำเข้าไม่สำเร็จ — ถูกข้ามทั้งหมด ${r.skipped} รายการ (รูปทรงไม่ถูกต้อง/ไม่มีเลขสายทาง)`);
        const after = await fetchAdminRoutes();     // อ่านกลับมาตรวจจริง
        await fetchRoutes(true);
        const km = after.reduce((s, x) => s + Number(x.length_km || 0), 0);
        setReport(`นำเข้า ${r.imported.toLocaleString()} เส้นทาง${r.skipped ? ` · ข้าม ${r.skipped}` : ""} · ตอนนี้ในระบบมี ${after.length.toLocaleString()} เส้นทาง (เดิม ${before}) ยาวรวม ${km.toFixed(1)} กม. — ตรวจสอบเส้นสีเขียวบนแผนที่ด้านซ้าย`);
      } finally { setProgress(null); }
    });
    if (ok) { setRes(null); setFileName(""); reload(); }
  };

  const shown = list.filter((r) => (r.route_code + r.route_name).toLowerCase().includes(q.toLowerCase())).slice(0, 150);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="แผนที่ตรวจสอบเส้นทาง" sub="เขียว = มีในระบบแล้ว (ที่ประชาชนเห็น) · น้ำเงิน = ไฟล์ที่กำลังจะนำเข้า" className="overflow-hidden">
          <div className="-m-4 sm:-m-5">
            <div className="relative h-[42dvh] min-h-[260px] bg-slate-200 lg:h-[460px]"><div ref={boxRef} className="fm-map absolute inset-0" /></div>
            {report && <p className="border-t border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">{report}</p>}
          </div>
        </Card>

        <Card title="นำเข้าไฟล์" sub=".kml · .kmz · .zip (Shapefile) · .geojson · .gpx">
          <div className="space-y-3">
            <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 hover:bg-slate-100">
              {reading ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : <FileUp className="h-5 w-5 text-slate-500" />}
              <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{fileName || "เลือกไฟล์ข้อมูลเส้นทาง"}</span>
              <input type="file" accept=".kml,.kmz,.zip,.geojson,.json,.gpx" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {res?.warnings.map((w) => <p key={w} className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</p>)}

            {res && (
              <>
                <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">พบ <b>{res.features.length.toLocaleString()}</b> รายการ → <b>{rows.length.toLocaleString()}</b> เส้นทาง · <b>{vertexCount.toLocaleString()}</b> จุด</p>
                <Field label="ฟิลด์เลขสายทาง (ใช้จัดกลุ่ม/อัปเดตซ้ำ)"><select className={inputCls} value={codeF} onChange={(e) => setCodeF(e.target.value)}><option value="">— ไม่มี (ตั้งชื่ออัตโนมัติ) —</option>{res.fields.map((f) => <option key={f}>{f}</option>)}</select></Field>
                <Field label="ฟิลด์ชื่อเส้นทาง"><select className={inputCls} value={nameF} onChange={(e) => setNameF(e.target.value)}><option value="">— ไม่มี (ใช้ “ทล.เลขสายทาง”) —</option>{res.fields.map((f) => <option key={f}>{f}</option>)}</select></Field>
                <Field label="ประเภทเส้นทาง">
                  <select className={inputCls} value={typeMode} onChange={(e) => setTypeMode(e.target.value as any)}><option value="primary">สายหลักทั้งหมด</option><option value="secondary">สายรองทั้งหมด</option><option value="field">แยกตามฟิลด์</option></select>
                </Field>
                {typeMode === "field" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="ฟิลด์"><select className={inputCls} value={typeF} onChange={(e) => setTypeF(e.target.value)}><option value="" />{res.fields.map((f) => <option key={f}>{f}</option>)}</select></Field>
                    <Field label="ค่าที่เป็นสายหลัก (คั่น ,)"><input className={inputCls} placeholder="เช่น 1,2" value={primVals} onChange={(e) => setPrimVals(e.target.value)} /></Field>
                  </div>
                )}
                <Btn className="w-full" disabled={!!progress || !rows.length} onClick={doImport}>
                  {progress ? <><Loader2 className="h-4 w-4 animate-spin" />กำลังนำเข้า {progress[0]}/{progress[1]}</> : `นำเข้า ${rows.length.toLocaleString()} เส้นทาง`}
                </Btn>
              </>
            )}
            <p className="text-[11px] leading-relaxed text-slate-400">KML ต้องเป็น “เส้น” (LineString) — ถ้าเป็นจุดหรือพื้นที่จะถูกข้ามพร้อมแจ้งเตือน · Shapefile ควรเป็น EPSG:4326 และ UTF-8</p>
          </div>
        </Card>
      </div>

      <Card title="เส้นทางในระบบ" sub={`${list.length.toLocaleString()} เส้นทาง · คลิกเพื่อดู/แก้ไข · เป็นฐานของการเกาะเส้นอัตโนมัติ`} right={<input className={inputCls + " !w-44"} placeholder="ค้นหา…" value={q} onChange={(e) => setQ(e.target.value)} />}>
        {!shown.length ? <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีเส้นทาง — นำเข้าไฟล์ด้านบนเพื่อเริ่มใช้งาน</p> : (
          <ul className="divide-y divide-slate-100">
            {shown.map((r) => (
              <li key={r.id}>
                <button onClick={() => setEdit(r)} className={`flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50 ${r.is_active ? "" : "opacity-50"}`}>
                  <span className="h-2 w-6 shrink-0 rounded-full" style={{ background: r.route_type === "primary" ? "#1B5E20" : "#81C784" }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">ทล.{r.route_code} <span className="font-normal text-slate-500">{r.route_name}</span></span>
                    <span className="text-[11px] text-slate-400">{r.route_type === "primary" ? "สายหลัก" : "สายรอง"} · {r.length_km} กม. · {r.points.toLocaleString()} จุด{r.is_active ? "" : " · ซ่อนอยู่"}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {list.length > shown.length && <p className="pt-3 text-center text-xs text-slate-400">แสดง {shown.length} จาก {list.length} — ใช้ช่องค้นหาเพื่อกรอง</p>}
      </Card>

      {edit && <RouteModal r={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function RouteModal({ r, onClose, onDone }: { r: AdminRoute; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback();
  const [name, setName] = useState(r.route_name);
  const [type, setType] = useState(r.route_type);
  const [active, setActive] = useState(r.is_active);
  const save = async () => {
    const ok = await fb.run({ title: "ยืนยันการแก้ไขเส้นทาง?", message: <>ทล.{r.route_code} จะถูกอัปเดตบนแผนที่ประชาชน</>, confirmText: "บันทึกการแก้ไข", kind: "edited", detail: `ทล.${r.route_code}` },
      async () => { await updateRoute(r.id, name, type, active); await fetchRoutes(true); });
    if (ok) onDone();
  };
  const remove = async () => {
    const ok = await fb.run({ title: "ลบเส้นทางนี้ถาวร?", tone: "danger", confirmText: "ลบเส้นทาง", kind: "deleted", detail: `ทล.${r.route_code}`,
      message: <>ทล.{r.route_code} {r.route_name}<br /><span className="text-xs text-slate-400">เหตุการณ์ที่ผูกกับเส้นทางนี้จะไม่ถูกลบ แต่จะไม่ระบุเส้นทาง</span></> },
      async () => { await deleteRoute(r.id); await fetchRoutes(true); });
    if (ok) onDone();
  };
  return (
    <Modal title={`ทล.${r.route_code}`} onClose={onClose}>
      <div className="space-y-3.5">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[["ความยาว", `${r.length_km} กม.`], ["จำนวนจุด", r.points.toLocaleString()], ["แหล่งที่มา", r.source || "–"]].map(([l, v]) => <div key={l} className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-slate-400">{l}</dt><dd className="truncate text-sm font-bold text-slate-800">{v}</dd></div>)}
        </dl>
        <Field label="ชื่อเส้นทาง"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="ประเภท"><select className={inputCls} value={type} onChange={(e) => setType(e.target.value as any)}><option value="primary">สายหลัก</option><option value="secondary">สายรอง</option></select></Field>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg bg-slate-50 px-3 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#0B2A5B]" checked={active} onChange={(e) => setActive(e.target.checked)} /><Power className="h-4 w-4 text-slate-400" />แสดงบนแผนที่ประชาชน</label>
        <div className="flex flex-wrap justify-between gap-2"><Btn v="danger" onClick={remove}><Trash2 className="h-4 w-4" />ลบ</Btn><div className="flex gap-2"><Btn v="ghost" onClick={onClose}>ปิด</Btn><Btn onClick={save} disabled={!name.trim()}>บันทึก</Btn></div></div>
      </div>
    </Modal>
  );
}
