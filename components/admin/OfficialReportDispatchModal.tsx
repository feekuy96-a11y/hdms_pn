"use client";

import React from "react";
import { SystemDataPayload } from "@/db/default-data";
import { formatThaiBuddhistDate } from "@/lib/gis-utils";
import { APP_CONFIG } from "@/lib/constants";
import { Printer, X } from "lucide-react";

interface OfficialReportDispatchModalProps {
  systemData: SystemDataPayload;
  isOpen: boolean;
  onClose: () => void;
}

export function OfficialReportDispatchModal({
  systemData,
  isOpen,
  onClose,
}: OfficialReportDispatchModalProps) {
  if (!isOpen) return null;

  const activeFloods = systemData.floodRoutes.filter((r) => r.is_active);
  const closedCount = activeFloods.filter((r) => r.traffic_status === "CLOSED").length;
  const warningCount = activeFloods.filter((r) => r.traffic_status !== "CLOSED").length;

  const handlePrint = () => {
    window.print();
  };

  const todayStr = formatThaiBuddhistDate(new Date(), false);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Control Bar (Hidden when printing) */}
        <div className="bg-[#0f2347] text-white px-4 py-3 flex items-center justify-between border-b border-amber-500 print:hidden">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500 text-slate-950 font-heading font-extrabold text-xs px-2 py-0.5 rounded">
              งานสารบรรณและรายงานราชการ
            </span>
            <span className="font-heading font-bold text-xs sm:text-sm">
              แบบรายงานสถานการณ์อุทกภัยสายทาง (ด่วนที่สุด) เสนอผู้ว่าราชการจังหวัดปัตตานี
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg text-xs font-heading font-bold flex items-center gap-1.5 shadow"
            >
              <Printer className="w-3.5 h-3.5" /> พิมพ์แบบรายงาน (Print A4)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-300 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Document Content */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 font-body text-slate-900 bg-white">
          {/* Government Formal Header */}
          <div className="text-center space-y-1 border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex justify-between items-start text-xs font-bold text-red-700">
              <span className="border-2 border-red-700 px-2 py-0.5 rounded">ด่วนที่สุด</span>
              <span>แบบ รง.ทล.๐๑ (ศูนย์ปฏิบัติการอุทกภัย)</span>
            </div>

            <div className="pt-2 font-heading font-bold text-lg sm:text-xl text-slate-950">
              รายงานสถานการณ์อุทกภัยและผลกระทบการจราจรบนทางหลวง
            </div>
            <div className="text-sm font-semibold text-slate-700">
              แขวงทางหลวงปัตตานี สำนักงานทางหลวงที่ ๑๘ กรมทางหลวง กระทรวงคมนาคม
            </div>
            <div className="text-xs text-slate-600">
              ประจำวันที่ {todayStr} (ข้อมูล ณ เวลา {new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.)
            </div>
          </div>

          {/* Section 1: Summary Memo */}
          <div className="space-y-2 text-xs leading-relaxed mb-4">
            <p>
              <strong>เรียน</strong> ผู้ว่าราชการจังหวัดปัตตานี / ผู้อำนวยการสำนักงานทางหลวงที่ ๑๘
            </p>
            <p className="indent-8">
              แขวงทางหลวงปัตตานี ขอรายงานสรุปสถานการณ์อุทกภัย น้ำป่าไหลหลาก และน้ำท่วมขังบนโครงข่ายทางหลวงในเขตความรับผิดชอบ
              ปัจจุบันพบสายทางที่ได้รับผลกระทบรวมทั้งสิ้น <strong>{activeFloods.length} แห่ง</strong> โดยแบ่งเป็น สายทางที่รถทุกชนิดผ่านไม่ได้เด็ดขาด จำนวน <strong>{closedCount} แห่ง</strong> และสายทางที่ต้องเฝ้าระวังระดับน้ำท่วมผิวจราจรผ่านได้ ๑ ช่องทาง จำนวน <strong>{warningCount} แห่ง</strong> มีรายละเอียดจำแนกตามสายทางและหมวดทางหลวง ดังนี้
            </p>
          </div>

          {/* Section 2: Official 8-Column Data Table */}
          <div className="border border-slate-900 rounded overflow-hidden mb-6">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-slate-100 text-slate-950 border-b-2 border-slate-900 font-heading font-bold text-center">
                <tr>
                  <th className="p-2 border-r border-slate-300 w-10">ลำดับ</th>
                  <th className="p-2 border-r border-slate-300 w-16">สายทาง</th>
                  <th className="p-2 border-r border-slate-300">ชื่อตอนควบคุม / บริเวณที่เกิดเหตุ</th>
                  <th className="p-2 border-r border-slate-300 w-24">ช่วง กม.</th>
                  <th className="p-2 border-r border-slate-300 w-20">ระดับน้ำ (ซม.)</th>
                  <th className="p-2 border-r border-slate-300 w-24">สภาพการจราจร</th>
                  <th className="p-2 border-r border-slate-300">เส้นทางเลี่ยงที่แนะนำ</th>
                  <th className="p-2 w-28">หมวดฯ รับผิดชอบ</th>
                </tr>
                <tr className="bg-slate-50 text-[10px] text-slate-500 border-b border-slate-400">
                  <th className="p-0.5 border-r border-slate-300">(๑)</th>
                  <th className="p-0.5 border-r border-slate-300">(๒)</th>
                  <th className="p-0.5 border-r border-slate-300">(๓)</th>
                  <th className="p-0.5 border-r border-slate-300">(๔)</th>
                  <th className="p-0.5 border-r border-slate-300">(๕)</th>
                  <th className="p-0.5 border-r border-slate-300">(๖)</th>
                  <th className="p-0.5 border-r border-slate-300">(๗)</th>
                  <th className="p-0.5">(๘)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {activeFloods.map((r, idx) => {
                  const detour = systemData.detourRoutes.find((d) => d.flood_id_ref === r.id);
                  const isClosed = r.traffic_status === "CLOSED";
                  return (
                    <tr key={r.id} className={isClosed ? "bg-red-50/50" : "bg-white"}>
                      <td className="p-2 text-center border-r border-slate-300 font-bold">{idx + 1}</td>
                      <td className="p-2 text-center border-r border-slate-300 font-heading font-bold text-slate-900">
                        ทล.{r.route_no}
                      </td>
                      <td className="p-2 border-r border-slate-300 font-semibold">{r.section_name}</td>
                      <td className="p-2 border-r border-slate-300 text-center font-mono">{r.km_start} - {r.km_end}</td>
                      <td className="p-2 border-r border-slate-300 text-center font-bold text-red-700">
                        {r.water_level_cm} ซม.
                      </td>
                      <td className="p-2 border-r border-slate-300 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isClosed ? "bg-red-200 text-red-900" : "bg-amber-200 text-amber-900"}`}>
                          {isClosed ? "ปิดการจราจร" : "ผ่านได้ ๑ ช่อง"}
                        </span>
                      </td>
                      <td className="p-2 border-r border-slate-300 text-slate-700 text-[10px]">
                        {detour ? detour.route_name : "ไม่มีทางเลี่ยง / รอระดับน้ำลด"}
                      </td>
                      <td className="p-2 text-center text-slate-700 text-[10px]">
                        หมวดทางหลวงปัตตานี
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section 3: Safety Actions Taken */}
          <div className="space-y-1 text-xs mb-8">
            <h5 className="font-heading font-bold text-slate-950">มาตรการอำนวยความสะดวกและความปลอดภัยที่ดำเนินการแล้ว:</h5>
            <ul className="list-disc list-inside space-y-0.5 text-slate-700 pl-2">
              <li>ติดตั้งป้ายเตือนน้ำท่วมทางหลวงและป้ายแนะนำทางเลี่ยงก่อนถึงจุดเกิดเหตุล่วงหน้า ๕๐๐ เมตร</li>
              <li>ติดตั้งป้ายไฟกระพริบพลังงานแสงอาทิตย์แจ้งเตือนผู้ใช้ทางในเวลากลางคืน</li>
              <li>จัดชุดเจ้าหน้าที่หมวดทางหลวงเฝ้าระวังระดับน้ำและอำนวยความสะดวกการจราจรตลอด ๒๔ ชั่วโมง</li>
              <li>จัดรถบรรทุกยกสูงสำหรับรับ-ส่งประชาชนในจุดวิกฤตที่รถเล็กผ่านไม่ได้</li>
            </ul>
          </div>

          {/* Section 4: Signature Blocks (Standard DOH Protocol) */}
          <div className="grid grid-cols-2 gap-8 text-center text-xs pt-4 border-t border-slate-300">
            <div>
              <p className="mb-12">(ลงชื่อ)...........................................................ผู้รายงาน</p>
              <p className="font-bold">นายช่างหัวหน้าหมวดทางหลวง</p>
              <p className="text-slate-600">เจ้าหน้าที่ผู้รับผิดชอบสายทาง</p>
            </div>
            <div>
              <p className="mb-12">(ลงชื่อ)...........................................................ผู้รับรอง</p>
              <p className="font-bold">ผู้อำนวยการแขวงทางหลวงปัตตานี</p>
              <p className="text-slate-600">สำนักงานทางหลวงที่ ๑๘ กรมทางหลวง</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
