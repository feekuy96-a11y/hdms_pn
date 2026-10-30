"use client";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Upload } from "lucide-react";
import { fetchSettings, saveSettings } from "@/lib/api";
import { COLORS } from "@/lib/config";
import { Btn, Card, Field, inputCls } from "@/components/common";

export default function SettingsPanel({ toast, onSaved }: { toast: (m: string, err?: boolean) => void; onSaved: (s: { name: string; logo: string | null }) => void }) {
  const [f, setF] = useState({ name: "", org: "", desc: "", phone: "" });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchSettings().then((s) => {
      if (s) { setF({ name: s.system_name, org: s.organization, desc: s.description ?? "", phone: s.contact_phone ?? "" }); setLogoUrl(s.logo_url); }
    }).finally(() => setLoaded(true));
  }, []);

  const pick = (file?: File | null) => {
    if (!file) return;
    setLogoFile(file);
    const r = new FileReader(); r.onload = () => setLogoUrl(r.result as string); r.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({ ...f, logo: logoFile });
      toast("บันทึกแล้ว — หน้าประชาชนอัปเดตทันที");
      onSaved({ name: f.name, logo: logoUrl });
      setLogoFile(null);
    } catch (e: any) { toast(e.message, true); } finally { setSaving(false); }
  };

  if (!loaded) return <div className="grid place-items-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3" title="ข้อมูลระบบ" sub="แสดงบนส่วนหัวของหน้าประชาชน">
        <div className="space-y-4">
          <Field label="โลโก้หน่วยงาน">
            <div className="flex items-center gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-6 w-6 text-slate-400" />}
              </span>
              <label className="cursor-pointer">
                <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Upload className="h-4 w-4" />เลือกไฟล์</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
            </div>
          </Field>
          <Field label="ชื่อระบบ *"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="หน่วยงาน"><input className={inputCls} value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} /></Field>
          <Field label="คำอธิบาย"><textarea rows={3} className={inputCls} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
          <Field label="เบอร์โทรติดต่อ (แสดงในรายละเอียดเหตุการณ์)"><input inputMode="tel" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <div className="flex justify-end"><Btn disabled={saving || !f.name.trim()} onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}บันทึกการเปลี่ยนแปลง</Btn></div>
        </div>
      </Card>
      <Card className="xl:col-span-2" title="ตัวอย่างหน้าประชาชน">
        <div className="overflow-hidden rounded-xl bg-slate-200 p-3">
          <div className="inline-flex max-w-full items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3 text-white"
            style={{ background: `linear-gradient(120deg,${COLORS.navyDark},${COLORS.navy})`, borderBottom: `3px solid ${COLORS.yellow}` }}>
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10">
              {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-5 w-5 text-yellow-300" />}
            </span>
            <span className="min-w-0 leading-tight"><b className="block truncate text-sm">{f.name || "—"}</b><span className="block truncate text-[11px] text-white/65">{f.org}</span></span>
          </div>
          {f.desc && <p className="mt-3 text-xs text-slate-600">{f.desc}</p>}
        </div>
      </Card>
    </div>
  );
}
