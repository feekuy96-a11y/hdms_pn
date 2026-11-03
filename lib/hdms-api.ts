import { createClient } from "@/lib/supabase/client";

export async function invokeHdms<T = any>(action: string, args: unknown[]): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase");
  const client = createClient();
  const { data: { session } } = await client.auth.getSession();
  const response = await fetch(`${url}/functions/v1/hdms-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแล" : data.error || "ดำเนินการไม่สำเร็จ");
  return data;
}
