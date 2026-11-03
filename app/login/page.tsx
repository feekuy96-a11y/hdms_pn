"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type LoginState = { error?: string };
async function login(_state: LoginState, form: FormData, navigate: () => void): Promise<LoginState> {
  try {
    const client = createClient();
    const { data, error } = await client.auth.signInWithPassword({ email: String(form.get("email") || "").trim(), password: String(form.get("password") || "") });
    if (error || !data.user || !["admin", "doh_admin"].includes(data.user.app_metadata?.role)) {
      if (data.session) await client.auth.signOut();
      return { error: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง หรือบัญชีไม่มีสิทธิ์ผู้ดูแล" };
    }
    navigate();
    return {};
  } catch { return { error: "ไม่สามารถเชื่อมต่อระบบเข้าสู่ระบบได้" }; }
}

const initialState: LoginState = {};

export default function LoginPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState((state: LoginState, form: FormData) => login(state, form, () => router.replace("/admin/")), initialState);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-4">
      <section className="w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid size-11 place-items-center rounded-xl bg-amber-400 text-slate-950">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-bold text-white">เข้าสู่ระบบเจ้าหน้าที่</h1>
            <p className="text-sm text-slate-300">ศูนย์ข้อมูลอุทกภัย แขวงทางหลวงปัตตานี</p>
          </div>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value="/admin" />
          <label className="block text-sm font-semibold text-slate-200">
            อีเมล
            <input name="email" type="email" autoComplete="username" required className="mt-1.5 w-full rounded-xl bg-slate-950 px-3 py-3 text-base text-white outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-amber-400" />
          </label>
          <label className="block text-sm font-semibold text-slate-200">
            รหัสผ่าน
            <input name="password" type="password" autoComplete="current-password" required className="mt-1.5 w-full rounded-xl bg-slate-950 px-3 py-3 text-base text-white outline-none ring-1 ring-slate-700 focus:ring-2 focus:ring-amber-400" />
          </label>
          {state.error && <p role="alert" className="rounded-xl bg-red-950 px-3 py-2 text-sm text-red-200">{state.error}</p>}
          <button type="submit" disabled={pending} className="min-h-11 w-full rounded-xl bg-amber-400 px-4 py-2 font-heading font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60">
            {pending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </section>
    </main>
  );
}
