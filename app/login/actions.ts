"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const requestedNext = String(formData.get("next") || "/admin");

  if (!email || !password) {
    return { error: "กรุณากรอกอีเมลและรหัสผ่าน" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const role = data.user?.app_metadata?.role;

  if (error || !data.user || (role !== "admin" && role !== "doh_admin")) {
    if (data.session) await supabase.auth.signOut();
    return { error: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง หรือบัญชีไม่มีสิทธิ์ผู้ดูแล" };
  }

  const destination = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/admin";
  redirect(destination);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
