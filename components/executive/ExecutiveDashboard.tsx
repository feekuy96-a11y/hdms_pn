"use client";

import React, { useState } from "react";
import { MitigationProject } from "@/db/default-data";
import { CheckCircle2, Clock, Coins, Printer, ArrowRight } from "lucide-react";

interface ExecutiveDashboardProps {
  projects: MitigationProject[];
}

export function ExecutiveDashboard({ projects }: ExecutiveDashboardProps) {
  const completed = projects.filter((p) => p.status_group === "COMPLETED");
  const pending = projects.filter((p) => p.status_group === "PENDING_BUDGET");
  const sumPendingBudget = pending.reduce((sum, p) => sum + Number(p.budget_mb || 0), 0);

  const [activeTab, setActiveTab] = useState<"all" | "completed" | "pending">("all");

  const handlePrint = () => {
    window.print();
  };

  return (
    <section className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 print:p-0">
      {/* Header Banner */}
      <div className="doh-header rounded-2xl p-5 sm:p-6 border border-amber-500/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-heading font-bold text-amber-400 uppercase tracking-wider">
            GOVERNOR & EXECUTIVE BRIEFING DASHBOARD
          </span>
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-white mt-1">
            สรุปผลการแก้ไขปัญหาน้ำท่วมและแผนขอรับการสนับสนุนงบประมาณ แขวงทางหลวงปัตตานี
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            ข้อมูลเชิงยุทธศาสตร์เพื่อรายงานผู้ว่าราชการจังหวัดปัตตานีและผู้บริหารระดับสูง กรมทางหลวง
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/50 px-3.5 py-2 rounded-xl text-xs font-heading font-bold shadow"
          >
            <Printer className="w-4 h-4" /> พิมพ์รายงาน (Print/PDF)
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-slate-400">จุดเสี่ยงน้ำท่วมทั้งสิ้น</div>
          <div className="text-2xl sm:text-3xl font-heading font-bold text-white mt-1">{projects.length} แห่ง</div>
          <div className="text-[11px] text-sky-400 mt-1">โครงข่ายทางหลวงสายหลักและสายรอง</div>
        </div>

        <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> ดำเนินการแก้ไขแล้วเสร็จ
          </div>
          <div className="text-2xl sm:text-3xl font-heading font-bold text-emerald-400 mt-1">{completed.length} แห่ง</div>
          <div className="text-[11px] text-emerald-300/80 mt-1">ระบายน้ำได้สมบูรณ์ ไม่เกิดน้ำท่วมซ้ำซาก</div>
        </div>

        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-amber-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> รอรับการจัดสรรงบประมาณ
          </div>
          <div className="text-2xl sm:text-3xl font-heading font-bold text-amber-400 mt-1">{pending.length} แห่ง</div>
          <div className="text-[11px] text-amber-300/80 mt-1">สำรวจและออกแบบรายละเอียดพร้อมแล้ว</div>
        </div>

        <div className="bg-slate-900 border border-red-500/40 rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-red-300 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" /> วงเงินงบประมาณที่ขอรับจัดสรร
          </div>
          <div className="text-2xl sm:text-3xl font-heading font-bold text-red-400 mt-1">
            {sumPendingBudget.toFixed(1)} ลบ.
          </div>
          <div className="text-[11px] text-slate-400 mt-1">สำหรับแก้ไขปัญหาถาวรทั้ง 4 จุดวิกฤต</div>
        </div>
      </div>

      {/* Before & After Image Comparison Gallery */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-heading font-bold text-base sm:text-lg text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" /> ผลการดำเนินงานแก้ไขปัญหาแล้วเสร็จ พร้อมภาพเปรียบเทียบ ก่อน-หลัง (Before & After)
          </h3>
          <span className="text-xs text-slate-400">{completed.length} โครงการที่เสร็จสมบูรณ์</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {completed.map((p) => (
            <div key={p.project_id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
              <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <span className="gold-gradient text-slate-950 font-heading font-extrabold text-xs px-2 py-0.5 rounded mr-1.5">
                    ทล.{p.route_no}
                  </span>
                  <strong className="font-heading text-sm text-white">{p.location_name}</strong>
                  <span className="text-xs text-slate-400 ml-1">({p.km_range})</span>
                </div>
                <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-heading px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                  แก้ไขแล้วเสร็จ
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-2 bg-slate-950">
                <div className="relative rounded-lg overflow-hidden border border-red-500/40">
                  <span className="absolute top-2 left-2 bg-red-600/90 text-white text-[10px] font-heading font-bold px-2 py-0.5 rounded shadow z-10">
                    BEFORE (ก่อนแก้ไข)
                  </span>
                  <img
                    src={p.before_image_url || "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=600&q=80"}
                    className="w-full h-36 sm:h-40 object-cover hover:scale-105 transition duration-300"
                    alt="Before mitigation"
                  />
                </div>
                <div className="relative rounded-lg overflow-hidden border border-emerald-500/40">
                  <span className="absolute top-2 left-2 bg-emerald-600/90 text-white text-[10px] font-heading font-bold px-2 py-0.5 rounded shadow z-10">
                    AFTER (หลังแก้ไข)
                  </span>
                  <img
                    src={p.after_image_url || "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80"}
                    className="w-full h-36 sm:h-40 object-cover hover:scale-105 transition duration-300"
                    alt="After mitigation"
                  />
                </div>
              </div>

              <div className="p-3 text-xs text-slate-300 flex items-center justify-between">
                <span>{p.solution_detail}</span>
                <span className="text-amber-300 font-heading font-bold shrink-0 ml-2">
                  {Number(p.budget_mb || 0).toFixed(1)} ลบ.
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Urgent Pending Budget Projects Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-amber-400 flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" /> รายละเอียดโครงการที่ขอรับการสนับสนุนงบประมาณเร่งด่วน
          </h3>
          <span className="text-xs text-slate-400">รวม 4 รายการ (145.00 ล้านบาท)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-950 text-slate-400 font-heading text-xs uppercase">
              <tr>
                <th className="p-3.5">รหัส</th>
                <th className="p-3.5">สายทาง / ตอนควบคุม</th>
                <th className="p-3.5">ช่วง กม.</th>
                <th className="p-3.5">แนวทางการแก้ไขปัญหาเชิงวิศวกรรม</th>
                <th className="p-3.5 text-right">งบประมาณ (ล้านบาท)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {pending.map((p) => (
                <tr key={p.project_id} className="hover:bg-slate-800/50 transition">
                  <td className="p-3.5 font-heading font-bold text-amber-400">{p.project_id}</td>
                  <td className="p-3.5 font-semibold text-white">
                    ทล.{p.route_no} {p.location_name}
                  </td>
                  <td className="p-3.5 text-slate-300">{p.km_range}</td>
                  <td className="p-3.5 text-slate-300">{p.solution_detail}</td>
                  <td className="p-3.5 text-right font-heading font-bold text-red-400">
                    {Number(p.budget_mb || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-950/80 font-heading font-bold text-sm border-t-2 border-amber-500/40">
              <tr>
                <td colSpan={4} className="p-3.5 text-right text-slate-300">
                  รวมงบประมาณที่ขอรับจัดสรรทั้งสิ้น:
                </td>
                <td className="p-3.5 text-right text-amber-400 text-base">
                  {sumPendingBudget.toFixed(2)} ล้านบาท
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
