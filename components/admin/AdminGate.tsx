"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export function AdminGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    try {
      const client = createClient();
      const check = async () => {
        const { data: { user } } = await client.auth.getUser();
        if (!live) return;
        if (user && ["admin", "doh_admin"].includes(user.app_metadata?.role)) setAllowed(true);
        else window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login/`);
      };
      void check().catch(() => { if (live) window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login/`); });
      const { data: { subscription } } = client.auth.onAuthStateChange(() => { setTimeout(() => { void check(); }, 0); });
      return () => { live = false; subscription.unsubscribe(); };
    } catch {
      window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/login/`);
    }
    return () => { live = false; };
  }, []);
  return allowed ? children : <main className="min-h-screen grid place-items-center text-slate-200">กำลังตรวจสอบสิทธิ์...</main>;
}
