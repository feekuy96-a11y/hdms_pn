"use client";

import React, { useEffect, useState } from "react";
import { checkOsrmStatus } from "@/lib/gis-utils";
import { Cpu, Wifi, WifiOff } from "lucide-react";

export function OsrmRoutingBadge() {
  const [status, setStatus] = useState<{ localOnline: boolean; publicOnline: boolean }>({
    localOnline: false,
    publicOnline: false,
  });
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    setChecking(true);
    try {
      const res = await checkOsrmStatus();
      setStatus(res);
    } catch {
      setStatus({ localOnline: false, publicOnline: false });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    verify();
    const interval = setInterval(verify, 30000);
    return () => clearInterval(interval);
  }, []);

  if (status.localOnline) {
    return (
      <div
        className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-heading font-medium cursor-pointer shadow-sm"
        title="OSRM Local Microservice กำลังทำงานบนเซิร์ฟเวอร์ภายใน (http://localhost:5000) คำนวณรวดเร็ว 1-5ms และทำงานออฟไลน์ได้"
        onClick={verify}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <Cpu className="w-3.5 h-3.5 text-emerald-400" />
        <span>OSRM Local: พร้อมใช้งาน</span>
      </div>
    );
  }

  if (status.publicOnline) {
    return (
      <div
        className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-heading font-medium cursor-pointer shadow-sm"
        title="กำลังเชื่อมต่อ Public OSRM API (สำรอง) คลิกเพื่อตรวจสอบการเชื่อมต่อกับ Local Microservice"
        onClick={verify}
      >
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        <Wifi className="w-3.5 h-3.5 text-amber-400" />
        <span>OSRM: Public Cloud (สำรอง)</span>
      </div>
    );
  }

  return (
    <div
      className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[11px] font-heading font-medium cursor-pointer shadow-sm"
      title="ทำงานในโหมด Offline PostGIS Geometry Routing โครงข่ายในฐานข้อมูล"
      onClick={verify}
    >
      <span className="w-2 h-2 rounded-full bg-sky-400" />
      <WifiOff className="w-3.5 h-3.5 text-sky-400" />
      <span>OSRM: PostGIS Offline</span>
    </div>
  );
}

