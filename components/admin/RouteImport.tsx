"use client";
/**
 * นำเข้าเส้นทางหลวง: .zip (Shapefile) · .geojson · .kml · .gpx
 *  1) เลือกไฟล์ → อ่านในเบราว์เซอร์ (ไม่ส่งไฟล์ดิบไปไหน) 2) จับคู่ฟิลด์ (เลขสายทาง/ชื่อ/ประเภท)
 *  3) ดูตัวอย่างบนแผนที่ 4) นำเข้า (upsert ตามเลขสายทาง — นำเข้าซ้ำ = อัปเดต)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Pencil, Power, Trash2 } from "lucide-react";
import { deleteRoute, fetchAdminRoutes, fetchRoutes, importRoutes, updateRoute, type RouteImportRow } from "@/lib/api";
import { readSpatialFile, type SpatialResult } from "@/lib/importers";
import { createMap, fitTo, loadLongdo, polyline, type LngLat } from "@/lib/longdo";
import type { AdminRoute } from "@/lib/supabase";
import { Btn, Card, Field, inputCls } from "@/components/common";

const CODE_HINTS = ["route_code", "routecode", "route_no", "routeno", "hwy_no", "highway_no", "road_no", "roadno", "route", "rt_no", "scode", "code", "ref", "name"];
const NAME_HINTS = ["route_name", "routename", "name_th", "road_name", "roadname", "name", "desc", "description"];
const pick = (fields: string[], hints: string[]) => {
  const low = fields.map((f) => f.toLowerCase());
  for (const h of hints) { const i = low.indexOf(h); if (i >= 0) return fields[i]; }
  return "";
};

export default function RouteImport({ toast }: { toast: (m: string, err?: boolean) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const ov = useRef<any[]>([]);
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

  const [list, setList] = useState<AdminRoute[]>([]);
  const [q, setQ] = useState("");

  const loadList = useCallback(() => fetchAdminRoutes().then(setList).catch((e) => toast(e.message, true)), [toast]);
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    let dead = false;
    loadLongdo().then((L) => {
      if (dead || !boxRef.current || mapRef.current) return;
      LRef.current = L; mapRef.current = createMap(L, boxRef.current); setReady(true);
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  const onFile = async (file?: File) => {
    if (!file) return;
    setReading(true); setRes(null); setFileName(file.name);
    try {
      const r = await readSpatialFile(file);
      setRes(r);
      setCodeF(pick(r.fields, CODE_HINTS)); setNameF(pick(r.fields, NAME_HINTS)); setTypeF(""); setPrimVals("");
    } catch (e: any) { toast(e.message, true); } finally { setReading(false); }
  };

  /* จัดกลุ่มตามเลขสายทาง → 1 แถว = 1 เส้นทาง (หลายช่วงรวมเป็น MultiLineString) */
  const rows = useMemo<RouteImportRow[]>(() => {
    if (!res) return [];
    const pv = primVals.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const g = new Map<string, RouteImportRow>();
    res.features.forEach((f, idx) => {
      const code = (codeF ? String(f.props[codeF] ?? "").trim() : "") || `IMP-${idx + 1}`;
      const nm = nameF ? String(f.props[nameF] ?? "").trim() : "";
      const type: "primary" | "secondary" = typeMode === "field"
        ? (pv.includes(String(f.props[typeF] ?? "").trim().toLowerCase()) ? "primary" : "secondary") : typeMode;
      const cur = g.get(code);
      if (cur) { cur.lines.push(...f.lines); if (!cur.route_name && nm) cur.route_name = nm; }
      else g.set(code, { route_code: code, route_name: nm, route_type: type, source: `shp:${fileName}`.slice(0, 200), props: f.props, lines: [...f.lines] });
    });
    return [...g.values()].map((r) => ({ ...r, route_name: r.route_name || `ทล.${r.route_code}` }));
  }, [res, codeF, nameF, typeMode, typeF, primVals, fileName]);

  const vertexCount = useMemo(() => rows.reduce((s, r) => s + r.lines.reduce((a, l) => a + l.length, 0), 0), [rows]);

  /* ตัวอย่างบนแผนที่ */
  useEffect(() => {
    const L = LRef.current, m = mapRef.current;
    if (!ready || !m) return;
    ov.current.forEach((o) => m.Overlays.remove(o)); ov.current = [];
    if (!res) return;
    const all: LngLat[] = [];
    for (const r of rows) for (const l of r.lines) {
      const o = polyline(L, l, { color: r.route_type === "primary" ? "#1B5E20" : "#81C784", width: r.route_type === "primary" ? 5 : 3.5 });
      m.Overlays.add(o); ov.current.push(o);
      all.push(l[0], l[l.length - 1]);
    }
    if (all.length) fitTo(m, all, 0.02);
  }, [ready, res, rows]);

  const doImport = async () => {
    if (!rows.length) return;
    if (!confirm(`นำเข้า ${rows.length} เส้นทาง?\nเส้นทางที่มีเลขสายทางซ้ำกันจะถูกอัปเดตทับ`)) return;
    setProgress([0, rows.length]);
    try {
      const n = await importRoutes(rows, (d, t) => setProgress([d, t]));
      await fetchRoutes(true);
      toast(`นำเข้าสำเร็จ ${n} เส้นทาง`);
      setRes(null); setFileName(""); await loadList();
    } catch (e: any) { toast(e.message, true); } finally { setProgress(null); }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await fetchRoutes(true); toast(ok); await loadList(); } catch (e: any) { toast(e.message, true); }
  };
  const shown = list.filter((r) => (r.route_code + r.route_name).toLowerCase().includes(q.toLowerCase())).slice(0, 150);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="ตัวอย่างข้อมูลที่นำเข้า" sub="เส้นเขียวเข้ม = สายหลัก · เขียวอ่อน = สายรอง" className="overflow-hidden">
          <div className="-m-4 sm:-m-5">
            <div className="relative h-[42dvh] min-h-[260px] bg-slate-200 lg:h-[460px]">
              <div ref={boxRef} className="fm-map absolute inset-0" />
              {!res && <div className="pointer-events-none absolute inset-0 grid place-items-center"><p className="rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-slate-500 shadow">เลือกไฟล์เพื่อดูตัวอย่างบนแผนที่</p></div>}
            </div>
          </div>
        </Card>

        <Card title="นำเข้าไฟล์" sub=".zip (Shapefile: .shp .dbf .prj) · .geojson · .kml · .gpx">
          <div className="space-y-3">
            <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 hover:bg-slate-100">
              {reading ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : <FileUp className="h-5 w-5 text-slate-500" />}
              <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{fileName || "เลือกไฟล์ข้อมูลเส้นทาง"}</span>
              <input type="file" accept=".zip,.geojson,.json,.kml,.gpx" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>

            {res?.warnings.map((w) => (
              <p key={w} className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</p>
            ))}

            {res && (
              <>
                <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                  พบ <b>{res.features.length.toLocaleString()}</b> รายการ → รวมเป็น <b>{rows.length.toLocaleString()}</b> เส้นทาง · <b>{vertexCount.toLocaleString()}</b> จุด
                </p>
                <Field label="ฟิลด์เลขสายทาง (ใช้จัดกลุ่ม/อัปเดตซ้ำ)">
                  <select className={inputCls} value={codeF} onChange={(e) => setCodeF(e.target.value)}>
                    <option value="">— ไม่มี (ตั้งชื่ออัตโนมัติ) —</option>
                    {res.fields.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </Field>
                <Field label="ฟิลด์ชื่อเส้นทาง">
                  <select className={inputCls} value={nameF} onChange={(e) => setNameF(e.target.value)}>
                    <option value="">— ไม่มี (ใช้ “ทล.เลขสายทาง”) —</option>
                    {res.fields.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </Field>
                <Field label="ประเภทเส้นทาง">
                  <select className={inputCls} value={typeMode} onChange={(e) => setTypeMode(e.target.value as any)}>
                    <option value="primary">สายหลักทั้งหมด</option>
                    <option value="secondary">สายรองทั้งหมด</option>
                    <option value="field">แยกตามฟิลด์</option>
                  </select>
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
            <p className="text-[11px] leading-relaxed text-slate-400">
              คำแนะนำ: ส่งออกจาก QGIS เป็น <b>EPSG:4326</b> และ <b>UTF-8</b> จะแม่นและอ่านภาษาไทยถูกต้องที่สุด ·
              ถ้าไฟล์ใหญ่ ระบบลดจุดที่ซ้อนกัน (~1 ม.) ก่อนส่งให้อัตโนมัติ
            </p>
          </div>
        </Card>
      </div>

      <Card title="เส้นทางในระบบ" sub={`${list.length.toLocaleString()} เส้นทาง · เส้นเหล่านี้คือฐานที่ใช้เกาะเส้นอัตโนมัติ`}
        right={<input className={inputCls + " !w-44"} placeholder="ค้นหา…" value={q} onChange={(e) => setQ(e.target.value)} />}>
        {!shown.length ? <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีเส้นทาง — นำเข้าไฟล์ด้านบนเพื่อเริ่มใช้งาน</p> : (
          <ul className="divide-y divide-slate-100">
            {shown.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 ${r.is_active ? "" : "opacity-50"}`}>
                <span className="h-2 w-6 shrink-0 rounded-full" style={{ background: r.route_type === "primary" ? "#1B5E20" : "#81C784" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">ทล.{r.route_code} <span className="font-normal text-slate-500">{r.route_name}</span></p>
                  <p className="text-[11px] text-slate-400">{r.route_type === "primary" ? "สายหลัก" : "สายรอง"} · {r.length_km} กม. · {r.points.toLocaleString()} จุด</p>
                </div>
                <div className="flex gap-1.5">
                  <Btn v="ghost" className="!min-h-[34px] !px-2.5 text-xs" onClick={() => { const n = prompt("ชื่อเส้นทาง", r.route_name); if (n) act(() => updateRoute(r.id, n, r.route_type, r.is_active), "แก้ชื่อแล้ว"); }}><Pencil className="h-3.5 w-3.5" /></Btn>
                  <Btn v="ghost" className="!min-h-[34px] !px-2.5 text-xs" onClick={() => act(() => updateRoute(r.id, r.route_name, r.route_type === "primary" ? "secondary" : "primary", r.is_active), "เปลี่ยนประเภทแล้ว")}>{r.route_type === "primary" ? "→ สายรอง" : "→ สายหลัก"}</Btn>
                  <Btn v="warn" className="!min-h-[34px] !px-2.5 text-xs" onClick={() => act(() => updateRoute(r.id, r.route_name, r.route_type, !r.is_active), r.is_active ? "ซ่อนแล้ว" : "แสดงแล้ว")}><Power className="h-3.5 w-3.5" />{r.is_active ? "ซ่อน" : "แสดง"}</Btn>
                  <Btn v="danger" className="!min-h-[34px] !px-2.5" onClick={() => confirm(`ลบ ทล.${r.route_code} ถาวร?`) && act(() => deleteRoute(r.id), "ลบแล้ว")}><Trash2 className="h-3.5 w-3.5" /></Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list.length > shown.length && <p className="pt-3 text-center text-xs text-slate-400">แสดง {shown.length} จาก {list.length} — ใช้ช่องค้นหาเพื่อกรอง</p>}
      </Card>
    </div>
  );
}
