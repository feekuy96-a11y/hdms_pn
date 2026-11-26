"use client";

import React from "react";
import {
  FileSpreadsheet,
  Plus,
  MapPin,
  Building,
  Trash2,
  Eye,
  EyeOff,
  Sliders,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { GisExportFormat } from "@/lib/gis-export";
import { HighwaySectionGroup } from "@/lib/highway-schema";
import { EditingRouteSpecsState, HighwayFeatureSummary } from "@/components/admin/tabs/GisHighwayModals";
import { formatKilometerPost } from "@/components/admin/tabs/gis-import-helpers";
import type { DohOfficeItem } from "@/components/admin/tabs/GisUploadMappingPanel";

export interface HighwaySpecificationsTableSectionProps {
  highwaySectionGroups: HighwaySectionGroup[];
  allHighwayFeatures: HighwayFeatureSummary[];
  matchingHighwayGroups: HighwaySectionGroup[];
  handleExportHighwayGis: (format: GisExportFormat) => Promise<void>;
  setEditingRouteSpecs: React.Dispatch<React.SetStateAction<EditingRouteSpecsState | null>>;
  offices: DohOfficeItem[];
  routeSearch: string;
  setRouteSearch: (val: string) => void;
  highwayFilterVisibility: "ALL" | "VISIBLE" | "HIDDEN";
  setHighwayFilterVisibility: (val: "ALL" | "VISIBLE" | "HIDDEN") => void;
  highwayFilterType: "ALL" | "MAIN" | "SECONDARY";
  setHighwayFilterType: (val: "ALL" | "MAIN" | "SECONDARY") => void;
  highwayFilterOffice: string;
  setHighwayFilterOffice: (val: string) => void;
  availableOffices: string[];
  expandedGroupIds: Set<string>;
  toggleGroupExpand: (groupId: string) => void;
  setSelectedRoute: (route: { layerId: string; featureIdx: number } | null) => void;
  handleToggleGroupVisibility: (group: HighwaySectionGroup) => Promise<void>;
  handleToggleFeatureVisibility: (layerId: string, featureIdx: number) => Promise<void>;
  openGeometryEditor: (layerId: string, featureIdx: number) => void;
  handleDeleteHighwayGroup: (group: HighwaySectionGroup) => void;
  handleDeleteHighwayFeature: (layerId: string, featureIdx: number, title: string) => void;
}

export function HighwaySpecificationsTableSection({
  highwaySectionGroups,
  allHighwayFeatures,
  matchingHighwayGroups,
  handleExportHighwayGis,
  setEditingRouteSpecs,
  offices,
  routeSearch,
  setRouteSearch,
  highwayFilterVisibility,
  setHighwayFilterVisibility,
  highwayFilterType,
  setHighwayFilterType,
  highwayFilterOffice,
  setHighwayFilterOffice,
  availableOffices,
  expandedGroupIds,
  toggleGroupExpand,
  setSelectedRoute,
  handleToggleGroupVisibility,
  handleToggleFeatureVisibility,
  openGeometryEditor,
  handleDeleteHighwayGroup,
  handleDeleteHighwayFeature,
}: HighwaySpecificationsTableSectionProps) {
  return (
    <div
      className="space-y-3 pt-3 border-t border-slate-800"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 600px" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[260px]">
          <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
            <Building className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" /> ตารางรายการทางหลวงและคุณสมบัติทางวิศวกรรม
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            คลิกไอคอนรูปดวงตาเพื่อ เปิด/ปิด การแสดงผลเส้นทาง หรือคลิก &quot;ตั้งค่า&quot; เพื่อปรับแต่งช่องจราจร (มีผลต่อความหนาเส้นบนแผนที่) ผิวจราจร และข้อมูลเฉพาะสายทาง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <span className="text-[11px] bg-slate-900 border border-slate-700 px-2.5 py-1.5 rounded-xl text-amber-300 font-mono">
            {highwaySectionGroups.length} ตอนควบคุม ({allHighwayFeatures.length} เส้นย่อย)
          </span>
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 shadow-sm">
            <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
            <select
              aria-label="ส่งออกโครงข่ายตามผลการค้นหา"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void handleExportHighwayGis(e.target.value as GisExportFormat);
                e.target.value = "";
              }}
              className="min-h-10 bg-transparent font-heading outline-none"
            >
              <option value="" disabled>
                ส่งออกตามผลค้นหา…
              </option>
              <option value="csv">CSV</option>
              <option value="geojson">GeoJSON</option>
              <option value="kml">KML</option>
              <option value="kmz">KMZ</option>
              <option value="shapefile">Shapefile ZIP</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              setEditingRouteSpecs({
                layerId: "MAIN_HIGHWAY",
                featureIdx: -1,
                routeNo: "",
                sectionName: "",
                kmStart: "",
                kmEnd: "",
                lengthKm: "",
                responsibleOffice: offices[0]?.name || "",
                highwayType: "MAIN_HIGHWAY",
                lanes: "4 ช่องจราจร",
                surface: "AC.",
                remarks: "",
                isVisible: true,
              })
            }
            className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>+ เพิ่มสายทางใหม่</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="block text-xs text-slate-300">
            <span className="font-heading font-medium">ค้นหาสายทาง</span>
            <input
              type="search"
              value={routeSearch}
              onChange={(event) => setRouteSearch(event.target.value)}
              placeholder="หมายเลข ชื่อตอน ก.ม. หรือหน่วยงาน"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </label>
          <label className="block text-xs text-slate-300">
            <span className="font-heading font-medium">สถานะแสดงผลบนแผนที่</span>
            <select
              aria-label="กรองสถานะแสดงผลบนแผนที่"
              value={highwayFilterVisibility}
              onChange={(e) => setHighwayFilterVisibility(e.target.value as "ALL" | "VISIBLE" | "HIDDEN")}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
            >
              <option value="ALL">ทั้งหมด (แสดงและซ่อน)</option>
              <option value="VISIBLE">เฉพาะที่แสดงบนแผนที่ (Eye)</option>
              <option value="HIDDEN">เฉพาะที่ซ่อนอยู่ (EyeOff)</option>
            </select>
          </label>
          <label className="block text-xs text-slate-300">
            <span className="font-heading font-medium">ประเภทสายทาง</span>
            <select
              aria-label="กรองประเภทสายทาง"
              value={highwayFilterType}
              onChange={(e) => setHighwayFilterType(e.target.value as "ALL" | "MAIN" | "SECONDARY")}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
            >
              <option value="ALL">ทุกประเภททางหลวง</option>
              <option value="MAIN">ทางหลวงสายหลัก</option>
              <option value="SECONDARY">ทางหลวงสายรอง</option>
            </select>
          </label>
          <label className="block text-xs text-slate-300">
            <span className="font-heading font-medium">หน่วยงานรับผิดชอบ</span>
            <select
              aria-label="กรองหน่วยงานรับผิดชอบ"
              value={highwayFilterOffice}
              onChange={(e) => setHighwayFilterOffice(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-amber-300 focus:border-amber-400 focus:outline-none font-medium"
            >
              <option value="ALL">ทุกหน่วยงาน/หมวดทางหลวง</option>
              {availableOffices.map((off) => (
                <option key={off} value={off}>
                  {off}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {matchingHighwayGroups.length === 0 ? (
        <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-center text-xs text-slate-400">
          {highwaySectionGroups.length === 0 ? "ยังไม่มีรายการเส้นทางในระบบ กรุณาอัปโหลดไฟล์ด้านบน" : "ไม่พบสายทางที่ตรงกับคำค้นหาและตัวกรองที่เลือก"}
        </div>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-inner">
          <table className="w-full min-w-[880px] text-left text-xs text-slate-300">
            <thead className="bg-[var(--bg-input)] text-[color:var(--text-primary)] font-heading border-b border-slate-800">
              <tr>
                <th className="p-3 w-10 text-center sticky left-0 bg-[var(--bg-input)] z-10">#</th>
                <th className="p-3 w-16 text-center sticky left-10 bg-[var(--bg-input)] z-10 whitespace-nowrap">แสดงผล</th>
                <th className="p-3 whitespace-nowrap min-w-[120px]">หมายเลขทางหลวง</th>
                <th className="p-3 whitespace-nowrap min-w-[200px]">ชื่อสายทาง / ตอนควบคุม</th>
                <th className="p-3 whitespace-nowrap min-w-[140px]">ช่วง กม. & ระยะทาง</th>
                <th className="p-3 whitespace-nowrap min-w-[130px]">ช่องจราจร & ผิวทาง</th>
                <th className="p-3 whitespace-nowrap min-w-[140px]">หน่วยงานรับผิดชอบ</th>
                <th className="p-3 min-w-[120px]">หมายเหตุ</th>
                <th className="p-3 text-right whitespace-nowrap sticky right-0 bg-[var(--bg-input)] z-10">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-body">
              {matchingHighwayGroups.map((group, gIdx) => {
                const isExpanded = expandedGroupIds.has(group.groupId);
                const isMultiBranch = group.branches.length > 1;
                const primaryBranch = group.primaryBranch || group.branches[0];

                return (
                  <React.Fragment key={group.groupId}>
                    {/* แถวหลัก (Parent Control Section) */}
                    <tr
                      onClick={(event) => {
                        if (!(event.target as HTMLElement).closest("button")) {
                          if (isMultiBranch) {
                            toggleGroupExpand(group.groupId);
                          }
                          if (primaryBranch) {
                            setSelectedRoute({ layerId: group.layerId, featureIdx: primaryBranch.featureIdx });
                          }
                        }
                      }}
                      className={`cursor-pointer hover:bg-slate-900/60 transition ${
                        !group.isVisible ? "opacity-50 bg-slate-950/40" : isExpanded ? "bg-slate-900/30" : ""
                      }`}
                    >
                      <td className="p-3 text-center font-mono text-slate-400 sticky left-0 bg-[var(--bg-card)] z-10">{gIdx + 1}</td>
                      <td className="p-3 text-center sticky left-10 bg-[var(--bg-card)] z-10">
                        <button
                          type="button"
                          onClick={() => handleToggleGroupVisibility(group)}
                          aria-label={group.isVisible ? `ซ่อนสายทาง ทล.${group.routeNo} ${group.sectionName} บนแผนที่` : `แสดงสายทาง ทล.${group.routeNo} ${group.sectionName} บนแผนที่`}
                          className={`min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg border transition ${
                            group.isVisible
                              ? "bg-emerald-950/80 text-emerald-300 border-emerald-600 hover:bg-emerald-900"
                              : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                          }`}
                          title={group.isVisible ? "คลิกเพื่อซ่อนสายทางนี้บนแผนที่" : "คลิกเพื่อแสดงสายทางนี้บนแผนที่"}
                        >
                          {group.isVisible ? <Eye className="w-4 h-4" aria-hidden="true" /> : <EyeOff className="w-4 h-4" aria-hidden="true" />}
                        </button>
                      </td>
                      <td className="p-3">
                        <span className="font-heading font-black text-xs px-2 py-0.5 rounded bg-amber-400 text-slate-950 shadow-sm inline-block whitespace-nowrap">
                          ทล.{group.routeNo}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white max-w-[240px] truncate" title={group.sectionName}>
                            {group.sectionName}
                          </span>
                          {isMultiBranch ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupExpand(group.groupId);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-sky-950/90 text-sky-300 border border-sky-600/70 hover:bg-sky-900 transition font-medium whitespace-nowrap"
                              title={isExpanded ? "คลิกเพื่อย่อรายละเอียด ๒ ฝั่ง" : "คลิกเพื่อดูรายละเอียดเส้นทางทั้ง ๒ ฝั่ง"}
                            >
                              {isExpanded ? <ChevronDown className="w-3 h-3 text-sky-400" /> : <ChevronRight className="w-3 h-3 text-sky-400" />}
                              <span>
                                {group.branches.length} ฝั่ง ({group.branches.map((b) => (b.directionCode === "A_TO_B" ? "A→B" : b.directionCode === "B_TO_A" ? "B→A" : "A⇄B")).join(", ")})
                              </span>
                            </button>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-900 text-slate-400 border border-slate-700 whitespace-nowrap">
                              คันทางเดี่ยว
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                        <div className="text-amber-300">
                          {group.kmStart} - {group.kmEnd}
                        </div>
                        <div className="text-emerald-400 text-[10px]">{group.lengthKm ? `${group.lengthKm} กม.` : "-"}</div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-950 text-sky-300 border border-sky-700 font-mono">
                          {group.lanes}
                        </span>
                        <span className="ml-1 text-[11px] text-slate-300 font-mono">{group.surface}</span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-300 whitespace-nowrap">{group.responsibleOffice}</td>
                      <td className="p-3 text-[11px] text-slate-400 max-w-[120px] truncate" title={group.remarks}>
                        {group.remarks || "-"}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap sticky right-0 bg-[var(--bg-card)] z-10">
                        <div className="inline-flex items-center gap-1.5">
                          {isMultiBranch && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupExpand(group.groupId);
                              }}
                              aria-label={isExpanded ? `ย่อรายละเอียด ทล.${group.routeNo} ${group.sectionName}` : `เปิดดูรายละเอียด ทล.${group.routeNo} ${group.sectionName}`}
                              className="min-h-9 min-w-9 inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 hover:border-sky-400 rounded-xl text-xs transition"
                              title={isExpanded ? "ย่อรายละเอียดเส้น ๒ ฝั่ง" : "เปิดดูรายละเอียดเส้น ๒ ฝั่ง"}
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
                            </button>
                          )}
                          {primaryBranch && (
                            <button
                              type="button"
                              onClick={() => openGeometryEditor(group.layerId, primaryBranch.featureIdx)}
                              className="min-h-9 bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 hover:border-sky-400 px-2.5 py-1.5 rounded-xl font-heading text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                              title="แก้แนวถนน ปักจุดและเกาะแนวถนน"
                            >
                              <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> แนวถนน
                            </button>
                          )}
                          {primaryBranch && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingRouteSpecs({
                                  layerId: group.layerId,
                                  featureIdx: primaryBranch.featureIdx,
                                  routeNo: group.routeNo,
                                  sectionName: group.sectionName,
                                  kmStart: group.kmStart !== "-" ? group.kmStart : "",
                                  kmEnd: group.kmEnd !== "-" ? group.kmEnd : "",
                                  lengthKm: group.lengthKm !== "-" ? group.lengthKm : "",
                                  responsibleOffice: group.responsibleOffice,
                                  highwayType: group.highwayType,
                                  lanes: group.lanes,
                                  surface: group.surface,
                                  remarks: group.remarks !== "-" ? group.remarks : "",
                                  isVisible: group.isVisible,
                                })
                              }
                              className="min-h-9 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-400 px-2.5 py-1.5 rounded-xl font-heading text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                              title="ตั้งค่าคุณสมบัติทางวิศวกรรม"
                            >
                              <Sliders className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" /> ตั้งค่า
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteHighwayGroup(group)}
                            aria-label={`ลบสายทาง ทล.${group.routeNo} ${group.sectionName}`}
                            className="min-h-9 min-w-9 inline-flex items-center justify-center bg-slate-900 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-600 rounded-xl transition shadow-sm"
                            title="ลบสายทางนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* แถวย่อย Child Branches (เมื่อกดขยาย) */}
                    {isExpanded &&
                      isMultiBranch &&
                      group.branches.map((branch, bIdx) => {
                        const isBranchVis = branch.properties?.is_visible !== false;
                        return (
                          <tr
                            key={`${group.groupId}-b-${branch.featureIdx}`}
                            onClick={(event) => {
                              if (!(event.target as HTMLElement).closest("button")) {
                                setSelectedRoute({ layerId: group.layerId, featureIdx: branch.featureIdx });
                              }
                            }}
                            className={`cursor-pointer bg-slate-900/40 hover:bg-slate-900/80 transition text-xs border-l-4 ${
                              branch.directionCode === "A_TO_B"
                                ? "border-l-sky-500"
                                : branch.directionCode === "B_TO_A"
                                  ? "border-l-indigo-500"
                                  : "border-l-amber-500"
                            } ${!isBranchVis ? "opacity-50" : ""}`}
                          >
                            <td className="p-2.5 text-center font-mono text-slate-500 text-[11px] sticky left-0 bg-[var(--bg-input)] z-10">
                              ↳ {bIdx + 1}
                            </td>
                            <td className="p-2.5 text-center sticky left-10 bg-[var(--bg-input)] z-10">
                              <button
                                type="button"
                                onClick={() => handleToggleFeatureVisibility(group.layerId, branch.featureIdx)}
                                aria-label={isBranchVis ? `ซ่อนเส้นฝั่ง ${branch.branchLabel} บนแผนที่` : `แสดงเส้นฝั่ง ${branch.branchLabel} บนแผนที่`}
                                className={`min-h-9 min-w-9 inline-flex items-center justify-center rounded-md border transition ${
                                  isBranchVis
                                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-600 hover:bg-emerald-900"
                                    : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                                }`}
                                title={isBranchVis ? "คลิกเพื่อซ่อนเส้นฝั่งนี้บนแผนที่" : "คลิกเพื่อแสดงเส้นฝั่งนี้บนแผนที่"}
                              >
                                {isBranchVis ? <Eye className="w-3.5 h-3.5" aria-hidden="true" /> : <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />}
                              </button>
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap inline-block ${
                                  branch.directionCode === "A_TO_B"
                                    ? "bg-sky-950 text-sky-300 border border-sky-600"
                                    : branch.directionCode === "B_TO_A"
                                      ? "bg-indigo-950 text-indigo-300 border border-indigo-600"
                                      : "bg-slate-800 text-slate-300 border border-slate-600"
                                }`}
                              >
                                {branch.directionCode === "A_TO_B" ? "ขาไป (A → B)" : branch.directionCode === "B_TO_A" ? "ขากลับ (B → A)" : "๒ ทิศทาง"}
                              </span>
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span className="text-slate-300 font-medium">{branch.branchLabel}</span>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] whitespace-nowrap">
                              <div className="text-amber-300/90">
                                {formatKilometerPost(branch.properties?.km_start) || group.kmStart} - {formatKilometerPost(branch.properties?.km_end) || group.kmEnd}
                              </div>
                              <div className="text-emerald-400/90 text-[10px]">
                                {branch.geometricLengthKm ? `${branch.geometricLengthKm} กม.` : `${group.lengthKm} กม.`}
                              </div>
                            </td>
                            <td className="p-2.5 text-[11px] whitespace-nowrap">
                              <span className="font-mono text-slate-300">{group.lanes}</span>
                              <span className="ml-1 text-[10px] text-slate-500 font-mono">{group.surface}</span>
                            </td>
                            <td className="p-2.5 text-[11px] text-slate-400 whitespace-nowrap">{group.responsibleOffice}</td>
                            <td className="p-2.5 text-[11px] text-slate-500 truncate max-w-[120px]" title={branch.properties?.remarks}>
                              {branch.properties?.remarks || "-"}
                            </td>
                            <td className="p-2.5 text-right whitespace-nowrap sticky right-0 bg-[var(--bg-input)] z-10">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openGeometryEditor(group.layerId, branch.featureIdx)}
                                  className="bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 hover:border-sky-400 px-2 py-1 rounded-lg font-heading text-[11px] font-bold transition inline-flex items-center gap-1 shadow-sm"
                                  title={`แก้ไขแนวถนนฝั่ง ${branch.branchLabel}`}
                                >
                                  <MapPin className="w-3 h-3" /> แนวถนน
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingRouteSpecs({
                                      layerId: group.layerId,
                                      featureIdx: branch.featureIdx,
                                      routeNo: group.routeNo,
                                      sectionName: branch.properties?.section_name || group.sectionName,
                                      kmStart: branch.properties?.km_start ? formatKilometerPost(branch.properties.km_start) : group.kmStart,
                                      kmEnd: branch.properties?.km_end ? formatKilometerPost(branch.properties.km_end) : group.kmEnd,
                                      lengthKm: branch.properties?.length_km ? String(branch.properties.length_km) : group.lengthKm,
                                      responsibleOffice: group.responsibleOffice,
                                      highwayType: group.highwayType,
                                      lanes: group.lanes,
                                      surface: group.surface,
                                      remarks: branch.properties?.remarks || group.remarks,
                                      isVisible: branch.properties?.is_visible !== false,
                                    })
                                  }
                                  className="bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-400 px-2 py-1 rounded-lg font-heading text-[11px] font-bold transition inline-flex items-center gap-1 shadow-sm"
                                  title={`ตั้งค่าคุณสมบัติฝั่ง ${branch.branchLabel}`}
                                >
                                  <Sliders className="w-3 h-3 text-amber-400" /> ตั้งค่า
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteHighwayFeature(
                                      group.layerId,
                                      branch.featureIdx,
                                      `ทล.${group.routeNo} ${branch.branchLabel}`
                                    )
                                  }
                                  aria-label={`ลบเส้นทางฝั่ง ${branch.branchLabel}`}
                                  className="min-h-9 min-w-9 inline-flex items-center justify-center bg-slate-900 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-600 rounded-lg transition shadow-sm"
                                  title="ลบเส้นทางฝั่งนี้"
                                >
                                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
