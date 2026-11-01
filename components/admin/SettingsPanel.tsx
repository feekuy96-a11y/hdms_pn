"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Loader2, MapPin, Pencil, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { deleteOffice, fetchOffices, fetchSettings, saveOffice, saveSettings } from "@/lib/api";
import { COLORS } from "@/lib/config";
import { fmtCoord, parseCoord } from "@/lib/geo";
import { createMap, loadLongdo, marker, type LngLat } from "@/lib/longdo";
import type { Office } from "@/lib/supabase";
import { Btn, Card, Field, inputCls, Modal } from "@/components/common";
import { useFeedback } from "@/components/feedback";

export default function SettingsPanel({ onSaved }: { onSaved: (s: { name: string; logo: string | null }) => void }) {
  const fb = useFeedback();
  const [f, setF] = useState({ name: "", org: "", desc: "", phone: "" });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchSettings().then((s) => { if (s) { setF({ name: s.system_name, org: s.organization, desc: s.description ?? "", phone: s.contact_phone ?? "" }); setLogoUrl(s.logo_url); } }).finally(() => setLoaded(true));
  }, []);

  const pick = (file?: File | null) => {
    if (!file) return;
    setLogoFile(file);
    const r = new FileReader(); r.onload = () => setLogoUrl(r.result as string); r.readAsDataURL(file);
  };

  const save = async () => {
    const ok = await fb.run({ title: "ยืนยันการบันทึกข้อมูลระบบ?", message: "ชื่อ โลโก้ และคำอธิบายจะเปลี่ยนบนหน้าประชาชนทันที", confirmText: "บันทึก", kind: "saved", detail: f.name },
      () => saveSettings({ ...f, logo: logoFile }));
    if (ok) { onSaved({ name: f.name, logo: logoUrl }); setLogoFile(null); }
  };

  if (!loaded) return <div className="grid place-items-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="ข้อมูลระบบ" sub="แสดงบนส่วนหัวของหน้าประชาชน">
          <div className="space-y-4">
            <Field label="โลโก้หน่วยงาน">
              <div className="flex items-center gap-4">
                <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">{logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-6 w-6 text-slate-400" />}</span>
                <label className="cursor-pointer"><span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Upload className="h-4 w-4" />เลือกไฟล์</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} /></label>
              </div>
            </Field>
            <Field label="ชื่อระบบ *"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="หน่วยงาน"><input className={inputCls} value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} /></Field>
            <Field label="คำอธิบาย"><textarea rows={3} className={inputCls} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
            <Field label="เบอร์โทรติดต่อ (แสดงปุ่มโทรในรายละเอียดเหตุการณ์)"><input inputMode="tel" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <div className="flex justify-end"><Btn disabled={!f.name.trim()} onClick={save}>บันทึกการเปลี่ยนแปลง</Btn></div>
          </div>
        </Card>
        <Card className="xl:col-span-2" title="ตัวอย่างหน้าประชาชน">
          <div className="overflow-hidden rounded-xl bg-slate-200 p-3">
            <div className="rounded-2xl px-3 py-2.5 text-white" style={{ background: `linear-gradient(110deg,${COLORS.navyDark},${COLORS.navy})`, borderBottom: `3px solid ${COLORS.yellow}` }}>
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10">{logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-6 w-6 text-yellow-300" />}</span>
                <span className="min-w-0 leading-tight"><b className="block truncate text-sm">{f.name || "—"}</b><span className="block truncate text-[11px] text-white/70">{f.org}</span></span>
              </div>
            </div>
            <p className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">ขณะนี้เส้นทางสัญจรได้ตามปกติ</p>
            {f.desc && <p className="mt-3 text-xs text-slate-600">{f.desc}</p>}
          </div>
        </Card>
      </div>
      <OfficeManager />
    </div>
  );
}

/* ───────── หมุดสำนักงาน/จุดบริการ ───────── */
function OfficeManager() {
  const fb = useFeedback();
  const [list, setList] = useState<Office[]>([]);
  const [edit, setEdit] = useState<Partial<Office> | null>(null);
  const load = useCallback(() => fetchOffices().then(setList).catch((e) => fb.error(e.message)), [fb]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <Card title="หมุดสำนักงาน / จุดบริการ" sub="แสดงเป็นไอคอนอาคารบนแผนที่ประชาชน (แตะดูที่อยู่ เบอร์โทร และนำทาง)"
      right={<Btn onClick={() => setEdit({ is_active: true })}><Plus className="h-4 w-4" />เพิ่มสำนักงาน</Btn>}>
      {!list.length ? <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีหมุดสำนักงาน — กด “เพิ่มสำนักงาน” เพื่อปักหมุดแขวงทางหลวง</p> : (
        <ul className="divide-y divide-slate-100">
          {list.map((o) => (
            <li key={o.id}>
              <button onClick={() => setEdit(o)} className={`flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50 ${o.is_active ? "" : "opacity-50"}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-yellow-400 bg-[#0B2A5B]"><Building2 className="h-5 w-5 text-yellow-300" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{o.name}</span><span className="block truncate text-xs text-slate-500">{o.address || fmtCoord([o.lng, o.lat])}{o.phone ? ` · ${o.phone}` : ""}</span></span>
                <Pencil className="h-4 w-4 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {edit && <OfficeModal o={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </Card>
  );
}

function OfficeModal({ o, onClose, onDone }: { o: Partial<Office>; onClose: () => void; onDone: () => void }) {
  const fb = useFeedback();
  const isNew = !o.id;
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const mk = useRef<any>(null);
  const [f, setF] = useState({ name: o.name ?? "", address: o.address ?? "", phone: o.phone ?? "", active: o.is_active ?? true });
  const [pt, setPt] = useState<LngLat | null>(o.lng != null && o.lat != null ? [o.lng, o.lat] : null);
  const [txt, setTxt] = useState(o.lng != null && o.lat != null ? fmtCoord([o.lng, o.lat]) : "");
  const ptRef = useRef(pt); ptRef.current = pt;

  useEffect(() => {
    let dead = false;
    loadLongdo().then((L) => {
      if (dead || !boxRef.current || mapRef.current) return;
      LRef.current = L;
      const map = createMap(L, boxRef.current, ptRef.current ? { lon: ptRef.current[0], lat: ptRef.current[1], zoom: 15 } : undefined);
      mapRef.current = map;
      map.Event.bind("click", () => { const p = map.location(L.LocationMode.Pointer); if (p) { setPt([p.lon, p.lat]); setTxt(fmtCoord([p.lon, p.lat])); } });
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    const L = LRef.current, m = mapRef.current; if (!m) return;
    if (mk.current) { m.Overlays.remove(mk.current); mk.current = null; }
    if (pt) { mk.current = marker(L, pt, '<div class="fm-op"><svg viewBox="0 0 24 24" fill="none" stroke="#FBC02D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2"/></svg></div>', { x: 17, y: 17 }); m.Overlays.add(mk.current); }
  }, [pt, mapRef.current]);

  const commit = () => { const p = parseCoord(txt); if (p) { setPt(p); mapRef.current?.location({ lon: p[0], lat: p[1] }, true); } };
  const save = async () => {
    if (!pt) return;
    const ok = await fb.run({ title: isNew ? "ยืนยันการเพิ่มหมุดสำนักงาน?" : "ยืนยันการแก้ไขหมุดสำนักงาน?", message: <>“{f.name}” จะแสดงบนแผนที่ประชาชน</>, confirmText: "บันทึก", kind: isNew ? "saved" : "edited", detail: f.name },
      () => saveOffice({ id: o.id, name: f.name, address: f.address, phone: f.phone, lng: pt[0], lat: pt[1], active: f.active }));
    if (ok) onDone();
  };
  const remove = async () => {
    const ok = await fb.run({ title: "ลบหมุดสำนักงานนี้?", tone: "danger", confirmText: "ลบ", message: <>“{o.name}” จะหายจากแผนที่ประชาชน</>, kind: "deleted", detail: o.name }, () => deleteOffice(o.id!));
    if (ok) onDone();
  };
  return (
    <Modal title={isNew ? "เพิ่มหมุดสำนักงาน" : "แก้ไขหมุดสำนักงาน"} size="lg" onClose={onClose}>
      <div className="space-y-3">
        <Field label="ชื่อสำนักงาน/จุดบริการ *"><input className={inputCls} placeholder="เช่น แขวงทางหลวงปัตตานี" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ที่อยู่"><input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="เบอร์โทร"><input inputMode="tel" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <Field label="พิกัด (lat, lng) — พิมพ์/วาง หรือคลิกบนแผนที่ด้านล่าง">
          <input className={inputCls} placeholder="6.870400, 101.253300" value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        </Field>
        <div className="relative h-64 overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
          <div ref={boxRef} className="fm-map absolute inset-0" />
          {!pt && <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-[#0B2A5B] px-3 py-1 text-xs font-bold text-white shadow"><MapPin className="mr-1 inline h-3.5 w-3.5" />คลิกแผนที่เพื่อปักหมุด</p>}
        </div>
        <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#0B2A5B]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />แสดงบนแผนที่ประชาชน</label>
        <div className="flex flex-wrap justify-between gap-2">
          {isNew ? <span /> : <Btn v="danger" onClick={remove}><Trash2 className="h-4 w-4" />ลบ</Btn>}
          <div className="flex gap-2"><Btn v="ghost" onClick={onClose}>ยกเลิก</Btn><Btn disabled={!f.name.trim() || !pt} onClick={save}>บันทึก</Btn></div>
        </div>
      </div>
    </Modal>
  );
}
