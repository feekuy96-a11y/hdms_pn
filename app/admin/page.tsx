"use client";
/**
 * /admin — เข้าได้โดยไม่ต้อง Login
 *  • เดสก์ท็อป: แถบเมนูซ้ายย่อ/ขยายได้   • มือถือ: แถบเมนูล่าง 4 ปุ่ม (นิ้วโป้งเอื้อมถึง)
 *  • ถ้าผู้ดูแลฐานข้อมูลเปิดรหัสผ่าน (ดูท้ายไฟล์ SQL) ระบบจะถามรหัส "ตอนบันทึกครั้งแรก" เท่านั้น
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ListChecks, MapPinned, Route, Settings, ShieldCheck } from "lucide-react";
import { registerPasscodePrompt } from "@/lib/api";
import { COLORS } from "@/lib/config";
import type { Incident } from "@/lib/supabase";
import { Btn, inputCls, Modal } from "@/components/common";
import MapEditor from "@/components/admin/MapEditor";
import IncidentList from "@/components/admin/IncidentList";
import RouteImport from "@/components/admin/RouteImport";
import SettingsPanel from "@/components/admin/SettingsPanel";

type Page = "settings" | "map" | "list" | "routes";
const NAV: { k: Page; Icon: typeof Settings; l: string; short: string; sub: string }[] = [
  { k: "settings", Icon: Settings, l: "จัดการระบบ", short: "ระบบ", sub: "โลโก้ / ข้อความ" },
  { k: "map", Icon: MapPinned, l: "จัดการแผนที่", short: "แผนที่", sub: "เพิ่มน้ำท่วม" },
  { k: "list", Icon: ListChecks, l: "รายการเหตุการณ์", short: "เหตุการณ์", sub: "ตาราง / ส่งออก" },
  { k: "routes", Icon: Route, l: "ข้อมูลเส้นทาง", short: "เส้นทาง", sub: "นำเข้า SHP" },
];

export default function AdminPage() {
  const [page, setPage] = useState<Page>("list");
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [brand, setBrand] = useState<{ name: string; logo: string | null }>({ name: "แขวงทางหลวงปัตตานี", logo: null });
  const [msg, setMsg] = useState<{ t: string; err: boolean } | null>(null);
  const [ask, setAsk] = useState<{ resolve: (v: string | null) => void } | null>(null);
  const [pass, setPass] = useState("");
  const timer = useRef<any>();

  const toast = useCallback((t: string, err = false) => {
    setMsg({ t, err }); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), err ? 5000 : 2800);
  }, []);

  useEffect(() => { registerPasscodePrompt(() => new Promise((resolve) => setAsk({ resolve }))); }, []);

  const go = (p: Page) => { if (p !== "map") setEditing(null); setPage(p); };
  const cur = NAV.find((n) => n.k === page)!;

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      {/* เมนูข้าง (เดสก์ท็อป) */}
      <aside className={`hidden shrink-0 flex-col text-white transition-[width] duration-200 lg:flex ${open ? "w-64" : "w-[72px]"}`}
        style={{ background: `linear-gradient(180deg,${COLORS.navyDark},${COLORS.navy})` }}>
        <div className={`flex h-16 items-center border-b border-white/10 ${open ? "gap-3 px-4" : "justify-center"}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20">
            {brand.logo ? <img src={brand.logo} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-5 w-5 text-yellow-300" />}
          </span>
          {open && <div className="min-w-0"><p className="truncate text-sm font-bold">{brand.name}</p><p className="text-[11px] text-yellow-300">Admin Console</p></div>}
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ k, Icon, l, sub }) => (
            <button key={k} onClick={() => go(k)} title={l}
              className={`flex w-full items-center rounded-xl py-2.5 text-left transition ${open ? "gap-3 px-3" : "justify-center"} ${page === k ? "bg-white/15" : "hover:bg-white/10"}`}
              style={page === k ? { boxShadow: `inset 3px 0 0 ${COLORS.yellow}` } : undefined}>
              <Icon className="h-5 w-5 shrink-0" />
              {open && <span><span className="block text-sm font-semibold">{l}</span><span className="block text-[11px] text-white/50">{sub}</span></span>}
            </button>
          ))}
        </nav>
        <button onClick={() => setOpen((v) => !v)} className={`m-3 flex items-center rounded-xl py-2.5 text-xs text-white/60 hover:bg-white/10 ${open ? "gap-2 px-3" : "justify-center"}`}>
          {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{open && "ย่อเมนู"}
        </button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:h-16 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg lg:hidden" style={{ background: COLORS.navy }}>
              {brand.logo ? <img src={brand.logo} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-4 w-4 text-yellow-300" />}
            </span>
            <h1 className="truncate text-base font-bold text-slate-900">{page === "map" && editing ? "แก้ไขเหตุการณ์" : cur.l}</h1>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 sm:flex">
            <AlertTriangle className="h-3 w-3" />ไม่มีระบบ Login — ทุกการแก้ไขถูกบันทึกประวัติ
          </span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-3 pb-28 sm:p-5 sm:pb-28 lg:p-8 lg:pb-8">
          <div className="mx-auto max-w-[1360px]">
            {page === "settings" && <SettingsPanel toast={toast} onSaved={setBrand} />}
            {page === "map" && <MapEditor key={editing?.incident_id ?? "new"} editing={editing} toast={toast} onDone={() => { setEditing(null); setPage("list"); }} />}
            {page === "list" && <IncidentList toast={toast} onNew={() => { setEditing(null); setPage("map"); }} onEdit={(i) => { setEditing(i); setPage("map"); }} />}
            {page === "routes" && <RouteImport toast={toast} />}
          </div>
        </main>

        {/* เมนูล่าง (มือถือ/แท็บเล็ต) */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {NAV.map(({ k, Icon, short }) => (
            <button key={k} onClick={() => go(k)} className="flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
              style={{ color: page === k ? COLORS.navy : "#64748b" }}>
              <span className={`grid h-7 w-12 place-items-center rounded-full transition ${page === k ? "bg-[#0B2A5B]/10" : ""}`}><Icon className="h-5 w-5" /></span>{short}
            </button>
          ))}
        </nav>
      </div>

      {msg && (
        <div className={`fixed left-1/2 z-[90] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-2xl bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-8 ${msg.err ? "bg-red-700" : "bg-slate-900"}`}>
          {msg.err ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}<span className="min-w-0">{msg.t}</span>
        </div>
      )}

      {ask && (
        <Modal title="ต้องใช้รหัสผ่านแอดมิน" onClose={() => { ask.resolve(null); setAsk(null); setPass(""); }}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); ask.resolve(pass); setAsk(null); setPass(""); }}>
            <p className="text-sm text-slate-600">ผู้ดูแลระบบเปิดใช้รหัสผ่านสำหรับการบันทึกข้อมูล (ถามครั้งเดียวต่อการเปิดเบราว์เซอร์)</p>
            <input autoFocus type="password" className={inputCls} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="รหัสผ่าน" />
            <Btn type="submit" className="w-full" disabled={!pass}>ยืนยัน</Btn>
          </form>
        </Modal>
      )}
    </div>
  );
}
