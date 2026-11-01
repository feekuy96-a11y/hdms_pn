"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const next = (formData.get("next") as string) || "/admin";

  if (!email || !password) {
    return { error: "กรุณาระบุอีเมลและรหัสผ่านให้ครบถ้วน" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง โปรดตรวจสอบอีกครั้ง"
          : error.message || "การเข้าสู่ระบบไม่สำเร็จ",
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signupAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const fullName =
    (formData.get("fullName") as string)?.trim() || "เจ้าหน้าที่แขวงทางหลวง";

  if (!email || !password) {
    return { error: "กรุณาระบุอีเมลและรหัสผ่านให้ครบถ้วน" };
  }

  if (password.length < 6) {
    return { error: "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message || "การลงทะเบียนไม่สำเร็จ" };
  }

  // If email confirmation is required and user has no active session yet
  if (data.user && !data.session) {
    return {
      success: true,
      message:
        "สร้างบัญชีเรียบร้อยแล้ว! กรุณาตรวจสอบอีเมลเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ",
    };
  }

  revalidatePath("/", "layout");
  redirect("/admin");
}

export async function demoBypassAction() {
  const cookieStore = cookies();
  cookieStore.set("doh_admin_role", "doh_admin", {
    path: "/",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  redirect("/admin");
}

export async function signoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = cookies();
  cookieStore.delete("doh_admin_role");
  revalidatePath("/", "layout");
  redirect("/login");
}

