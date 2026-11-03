"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    if (typeof window !== "undefined") {
      window.location.replace(`${basePath}/admin/`);
    } else {
      router.replace("/admin/");
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        <p className="text-sm font-heading text-slate-300">กำลังเข้าสู่ระบบผู้ดูแล...</p>
      </div>
    </main>
  );
}
