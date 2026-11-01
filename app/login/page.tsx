"use client";

import React, { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction, signupAction, demoBypassAction } from "./actions";
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";

function LoginFormContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";
  const urlError = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    urlError === "auth_callback_failed"
      ? "การยืนยันรหัสเข้าสู่ระบบล้มเหลว โปรดลองใหม่อีกครั้ง"
      : urlError === "verification_failed"
      ? "การยืนยันอีเมลไม่ถูกต้องหรือหมดอายุ"
      : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(e.currentTarget);
    formData.append("next", next);

    startTransition(async () => {
      try {
        if (mode === "login") {
          const res = await loginAction(formData);
          if (res?.error) {
            setErrorMessage(res.error);
          }
        } else {
          const res = await signupAction(formData);
          if (res?.error) {
            setErrorMessage(res.error);
          } else if (res?.success) {
            setSuccessMessage(res.message);
          }
        }
      } catch (err: any) {
        // Next.js redirect throws a special NEXT_REDIRECT error which is expected
        if (err?.message?.includes("NEXT_REDIRECT")) {
          return;
        }
        setErrorMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
      }
    });
  };

  const handleDemoBypass = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await demoBypassAction();
      } catch (err: any) {
        if (err?.message?.includes("NEXT_REDIRECT")) return;
        setErrorMessage("เกิดข้อผิดพลาดในการเข้าสู่ระบบทดสอบ");
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 font-body text-slate-100">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-amber-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 left-1/3 w-[360px] h-[360px] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Top Back Link */}
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-white transition font-heading"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> กลับสู่หน้าแผนที่ประชาชน
          </Link>
          <span className="text-[11px] text-slate-400 font-mono">
            แขวงทางหลวงปัตตานี
          </span>
        </div>

        {/* Card Container */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="text-center space-y-2 mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner mb-1">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="bg-amber-400 text-slate-950 text-[10px] font-heading font-black px-2 py-0.5 rounded uppercase">
                ส่วนราชการ
              </span>
              <span className="text-xs text-amber-300/80 font-heading">
                กรมทางหลวง • ขท.ปัตตานี
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-white">
              ระบบศูนย์ปฏิบัติการอุทกภัย
            </h1>
            <p className="text-xs text-slate-400">
              เข้าสู่ระบบสำหรับการจัดการข้อมูลและรายงานสถานการณ์สำหรับเจ้าหน้าที่
            </p>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 text-xs font-heading font-bold rounded-lg transition ${
                mode === "login"
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              เข้าสู่ระบบ (Sign In)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 text-xs font-heading font-bold rounded-lg transition ${
                mode === "signup"
                  ? "bg-amber-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              ลงทะเบียนใหม่ (Sign Up)
            </button>
          </div>

          {/* Alerts */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-500/40 rounded-xl flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl flex items-start gap-2.5 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label
                  htmlFor="fullName"
                  className="block text-xs font-heading font-medium text-slate-300 mb-1"
                >
                  ชื่อ-สกุล / ตำแหน่งเจ้าหน้าที่
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    placeholder="เช่น นายช่างทางหลวง ชำนาญงาน"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-heading font-medium text-slate-300 mb-1"
              >
                อีเมลราชการ / บุคลากร (Email)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="officer@doh.go.th"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-heading font-medium text-slate-300 mb-1"
              >
                รหัสผ่าน (Password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                />
              </div>
              {mode === "signup" && (
                <p className="text-[10px] text-slate-400 mt-1">
                  รหัสผ่านอย่างน้อย 6 ตัวอักษร
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 px-4 rounded-xl gold-gradient text-slate-950 font-heading font-bold text-xs shadow-lg hover:brightness-105 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  กำลังดำเนินการ...
                </>
              ) : mode === "login" ? (
                "เข้าสู่ระบบ Admin Console"
              ) : (
                "สร้างบัญชีเจ้าหน้าที่ใหม่"
              )}
            </button>
          </form>

          {/* Quick Demo Bypass for Testing */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-400 mb-2">
              สำหรับสภาพแวดล้อมการพัฒนาและการทดสอบระบบ:
            </p>
            <button
              type="button"
              onClick={handleDemoBypass}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 hover:text-amber-300 border border-slate-700 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              เข้าสู่ระบบด่วน (Demo Mode Bypass)
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center text-[11px] text-slate-400">
          ศูนย์บริการข้อมูลสารสนเทศ แขวงทางหลวงปัตตานี กรมทางหลวง © 2026
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300 font-heading text-xs">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400 mr-2" />
          กำลังโหลดหน้าเข้าสู่ระบบ...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}

