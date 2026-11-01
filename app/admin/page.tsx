"use client";
/**
 * /admin — เข้าได้โดยไม่ต้อง Login
 *  • เดสก์ท็อป: แถบเมนูซ้ายย่อ/ขยายได้   • มือถือ/แท็บเล็ต: แถบเมนูล่าง 5 ปุ่ม
 *  • ทุกการบันทึก/ลบ/อัปเดต/แก้ไข → ป๊อปอัพยืนยัน + แอนิเมชันสำเร็จ (components/feedback.tsx)
 *  • ถ้าผู้ดูแลฐานข้อมูลเปิดรหัสผ่าน (ดูท้ายไฟล์ SQL) จะถามรหัส "ตอนบันทึกครั้งแรก" เท่านั้น
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ListChecks, MapPinned, Palette, Route, Settings, ShieldCheck } from "lucide-react";
import { registerPasscodePrompt } from "@/lib/api";
import { COLORS } from "@/lib/config";
import type { Incident } from "@/lib/supabase";
import { Btn, inputCls, Modal } from "@/components/common";
import { FeedbackProvider } from "@/components/feedback";
import MapEditor from "@/components/admin/MapEditor";
import IncidentList from "@/components/admin/IncidentList";
import RouteImport from "@/components/admin/RouteImport";
import SettingsPanel from "@/components/admin/SettingsPanel";
import StylePanel from "@/components/admin/StylePanel";

type Page = "settings" | "map" | "list" | "routes" | "style";
const NAV: { k: Page; Icon: typeof Settings; l: string; short: string; sub: string }[] = [
  { k: "settings", Icon: Settings, l: "จัดการระบบ", short: "ระบบ", sub: "โลโก้ / ข้อความ / สำนักงาน" },
  { k: "map", Icon: MapPinned, l: "จัดการแผนที่", short: "แผนที่", sub: "เพิ่มน้ำท่วม" },
  { k: "list", Icon: ListChecks, l: "รายการเหตุการณ์", short: "เหตุการณ์", sub: "ตาราง / ส่งออก" },
  { k: "routes", Icon: Route, l: "ข้อมูลเส้นทาง", short: "เส้นทาง", sub: "นำเข้า KML / SHP" },
  { k: "style", Icon: Palette, l: "สไตล์เส้น", short: "สไตล์", sub: "สี / เอฟเฟกต์เส้น" },
];

function Shell() {
  const [page, setPage] = useState<Page>("list");
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [brand, setBrand] = useState<{ name: string; logo: string | null }>({ name: "แขวงทางหลวงปัตตานี", logo: null });
  const [ask, setAsk] = useState<{ resolve: (v: string | null) => void } | null>(null);
  const [pass, setPass] = useState("");

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
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 bg-white px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:h-16 lg:px-8">
          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg lg:hidden" style={{ background: COLORS.navy }}>
            {brand.logo ? <img src={brand.logo} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-4 w-4 text-yellow-300" />}
          </span>
          <h1 className="truncate text-base font-bold text-slate-900">{page === "map" && editing ? "แก้ไขเหตุการณ์" : cur.l}</h1>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-3 pb-28 sm:p-5 sm:pb-28 lg:p-8 lg:pb-8">
          <div className="mx-auto max-w-[1360px]">
            {page === "settings" && <SettingsPanel onSaved={setBrand} />}
            {page === "map" && <MapEditor key={editing?.incident_id ?? "new"} editing={editing} onDone={() => { setEditing(null); setPage("list"); }} />}
            {page === "list" && <IncidentList onNew={() => { setEditing(null); setPage("map"); }} onEdit={(i) => { setEditing(i); setPage("map"); }} />}
            {page === "routes" && <RouteImport />}
            {page === "style" && <StylePanel />}
          </div>
        </main>

        {/* เมนูล่าง (มือถือ/แท็บเล็ต) */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {NAV.map(({ k, Icon, short }) => (
            <button key={k} onClick={() => go(k)} className="flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold" style={{ color: page === k ? COLORS.navy : "#64748b" }}>
              <span className={`grid h-7 w-11 place-items-center rounded-full transition ${page === k ? "bg-[#0B2A5B]/10" : ""}`}><Icon className="h-5 w-5" /></span>{short}
            </button>
          ))}
        </nav>
      </div>

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

export default function AdminPage() {
  return <FeedbackProvider><Shell /></FeedbackProvider>;
}
