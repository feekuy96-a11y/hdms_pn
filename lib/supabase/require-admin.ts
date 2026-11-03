import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role;
  if (error || !user || (role !== "admin" && role !== "doh_admin")) {
    throw new Error("ไม่มีสิทธิ์ดำเนินการ กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแล");
  }

  return user;
}
