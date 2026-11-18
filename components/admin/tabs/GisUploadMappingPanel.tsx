"use client";

import React from "react";
import { Upload, MapPin, Tag, Building, Save } from "lucide-react";
import { ExtractedGisFeature } from "@/lib/gis-utils";
import { SystemDataPayload } from "@/db/default-data";

export type DohOfficeItem = NonNullable<SystemDataPayload["offices"]>[number];

export interface GisUploadMappingPanelProps {
  handleGisUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  importedGisFeatures: ExtractedGisFeature[];
  importedLayerName: string;
  setImportedLayerName: (name: string) => void;
  availableGisFields: string[];
  selectedRouteCodeField: string;
  setSelectedRouteCodeField: (field: string) => void;
  manualRouteCode: string;
  setManualRouteCode: (code: string) => void;
  selectedRouteNameField: string;
  setSelectedRouteNameField: (field: string) => void;
  manualRouteName: string;
  setManualRouteName: (name: string) => void;
  targetLayerCategory: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
  setTargetLayerCategory: (cat: "MAIN_HIGHWAY" | "SECOND_HIGHWAY") => void;
  labelDisplayMode: "hover" | "permanent" | "click";
  setLabelDisplayMode: (mode: "hover" | "permanent" | "click") => void;
  layerLanes: string;
  setLayerLanes: (lanes: string) => void;
  layerSurface: string;
  setLayerSurface: (surface: string) => void;
  layerResponsibleOffice: string;
  setLayerResponsibleOffice: (office: string) => void;
  offices: DohOfficeItem[];
  simplifyTolerance: number;
  handleResimplifyTolerance: (tolerance: number) => void;
  onCancelImport: () => void;
  isCommitting: boolean;
  handleCommitGisLayer: () => Promise<void>;
}

export function GisUploadMappingPanel({
  handleGisUpload,
  importedGisFeatures,
  importedLayerName,
  setImportedLayerName,
  availableGisFields,
  selectedRouteCodeField,
  setSelectedRouteCodeField,
  manualRouteCode,
  setManualRouteCode,
  selectedRouteNameField,
  setSelectedRouteNameField,
  manualRouteName,
  setManualRouteName,
  targetLayerCategory,
  setTargetLayerCategory,
  labelDisplayMode,
  setLabelDisplayMode,
  layerLanes,
  setLayerLanes,
  layerSurface,
  setLayerSurface,
  layerResponsibleOffice,
  setLayerResponsibleOffice,
  offices,
  simplifyTolerance,
  handleResimplifyTolerance,
  onCancelImport,
  isCommitting,
  handleCommitGisLayer,
}: GisUploadMappingPanelProps) {
  return (
    <>
      {/* Upload Dropzone */}
      <div className="bg-slate-950 p-5 rounded-2xl border-2 border-dashed border-slate-700 hover:border-amber-400 transition space-y-3 text-center">
        <Upload className="w-10 h-10 text-amber-400 mx-auto animate-bounce" />
        <div>
          <h4 className="font-heading font-bold text-sm text-white">เลือกไฟล์โครงข่ายเส้นทางหลวง</h4>
          <p className="text-xs text-slate-400 mt-1">
            รองรับ .kml, .kmz, .zip หรือ .shp (Shapefile), .geojson, .json, .gpx (พิกัด EPSG:4326)
          </p>
        </div>
        <label className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-lg transition">
          เปิดเลือกไฟล์จากคอมพิวเตอร์
          <input
            type="file"
            accept=".kml,.kmz,.zip,.shp,.geojson,.json,.gpx,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/geo+json,application/json"
            onChange={handleGisUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Dual-Color Preview Inspection & Attribute Field Mapping Panel */}
      {importedGisFeatures.length > 0 && (
        <div className="bg-slate-950 p-5 rounded-2xl border border-sky-500/60 space-y-4 shadow-2xl animate-fade-in">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
            <div>
              <span className="font-heading font-bold text-sm text-sky-300 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-sky-400" /> พรีวิวตรวจสอบโครงข่าย: พบ {importedGisFeatures.length} เส้นทาง
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                ระบบแสดงแนวเส้นทางใหม่ (เส้นประสีน้ำเงิน) บนแผนที่ พร้อมตรวจสอบแนวเส้นเดิม (สีเขียว)
              </p>
            </div>
            <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-600 px-2.5 py-1 rounded-full font-heading font-bold">
              Dual-Color Inspection Active
            </span>
          </div>

          {/* Layer Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1">ชื่อเลเยอร์โครงข่าย *</label>
              <input
                type="text"
                value={importedLayerName}
                onChange={(e) => setImportedLayerName(e.target.value)}
                placeholder="เช่น โครงข่ายทางหลวงสาย 42"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          {/* Attribute Field Mapping Card */}
          <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-heading font-bold text-xs text-amber-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-amber-400" /> การจับคู่ฟิลด์ข้อมูลโครงข่าย (GIS Attribute Mapping)
              </h4>
              <span className="text-[10px] text-slate-400">
                ตรวจพบ {availableGisFields.length} คอลัมน์จากไฟล์
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Field 1: Route Code */}
              <div>
                <label className="text-slate-300 block mb-1">ฟิลด์รหัสสายทาง</label>
                <select
                  value={selectedRouteCodeField}
                  onChange={(e) => setSelectedRouteCodeField(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">— กรอกรหัสสายทางเอง / กำหนดเอง —</option>
                  {availableGisFields.map((f) => (
                    <option key={f} value={f}>
                      คอลัมน์: {f}
                    </option>
                  ))}
                </select>
                {!selectedRouteCodeField && (
                  <input
                    type="text"
                    value={manualRouteCode}
                    onChange={(e) => setManualRouteCode(e.target.value)}
                    placeholder="ระบุรหัสสายทาง เช่น 42, 409"
                    className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-mono"
                  />
                )}
              </div>

              {/* Field 2: Route Name / Label */}
              <div>
                <label className="text-slate-300 block mb-1">ฟิลด์ชื่อสายทาง / ป้ายกำกับ</label>
                <select
                  value={selectedRouteNameField}
                  onChange={(e) => setSelectedRouteNameField(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="">— กรอกชื่อสายทางเอง / ใช้ชื่อเลเยอร์ —</option>
                  {availableGisFields.map((f) => (
                    <option key={f} value={f}>
                      คอลัมน์: {f}
                    </option>
                  ))}
                </select>
                {!selectedRouteNameField && (
                  <input
                    type="text"
                    value={manualRouteName}
                    onChange={(e) => setManualRouteName(e.target.value)}
                    placeholder="ระบุชื่อสายทาง เช่น คลองแงะ - ยะหริ่ง"
                    className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-sky-300"
                  />
                )}
              </div>

              {/* Field 3: Classification */}
              <div>
                <label className="text-slate-300 block mb-1">ประเภททางหลวง</label>
                <select
                  value={targetLayerCategory}
                  onChange={(e) => setTargetLayerCategory(e.target.value as "MAIN_HIGHWAY" | "SECOND_HIGHWAY")}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                >
                  <option value="MAIN_HIGHWAY">ทางหลวงสายหลัก</option>
                  <option value="SECOND_HIGHWAY">ทางหลวงสายรอง</option>
                </select>
              </div>

              {/* Field 4: Label Display Mode */}
              <div>
                <label className="text-slate-300 block mb-1">โหมดการแสดงป้ายชื่อบนแผนที่</label>
                <select
                  value={labelDisplayMode}
                  onChange={(e) => setLabelDisplayMode(e.target.value as "hover" | "permanent" | "click")}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                >
                  <option value="hover">แสดงเมื่อเลื่อนเมาส์ชี้</option>
                  <option value="permanent">แสดงตลอดเวลาบนแนวเส้น</option>
                  <option value="click">แสดงเมื่อคลิกดูรายละเอียด</option>
                </select>
              </div>
            </div>

            {/* Extended Highway Specifications */}
            <div className="mt-3 p-3 bg-slate-950/80 rounded-xl border border-sky-950/60 space-y-3">
              <div className="flex items-center gap-2 text-sky-400 font-heading font-semibold text-xs border-b border-sky-950 pb-1.5">
                <Building className="w-4 h-4 text-sky-400" />
                <span>กำหนดรายละเอียดและคุณสมบัติทางวิศวกรรมของเส้นทาง</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {/* Lanes */}
                <div>
                  <label className="text-slate-300 block mb-1">จำนวนช่องจราจร</label>
                  <select
                    value={layerLanes}
                    onChange={(e) => setLayerLanes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="2 ช่องจราจร">2 ช่องจราจร</option>
                    <option value="3 ช่องจราจร">3 ช่องจราจร</option>
                    <option value="4 ช่องจราจร">4 ช่องจราจร</option>
                    <option value="6 ช่องจราจร">6 ช่องจราจร</option>
                    <option value="8 ช่องจราจร">8 ช่องจราจร</option>
                  </select>
                </div>

                {/* Surface Type */}
                <div>
                  <label className="text-slate-300 block mb-1">ชนิดผิวจราจร</label>
                  <select
                    value={layerSurface}
                    onChange={(e) => setLayerSurface(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="AC.">AC.</option>
                    <option value="Conc.">Conc.</option>
                    <option value="DST.">DST.</option>
                  </select>
                </div>

                {/* Responsible Subdivision */}
                <div>
                  <label className="text-slate-300 block mb-1">หน่วยงานรับผิดชอบ</label>
                  <select
                    value={layerResponsibleOffice}
                    onChange={(e) => setLayerResponsibleOffice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-heading font-medium"
                  >
                    {offices.map((office) => (
                      <option key={office.id} value={office.name}>
                        {office.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Sample Mapping Table (First 5 Rows) */}
            <div className="mt-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-300">ตัวอย่างข้อมูลหลังจับคู่ฟิลด์ (๕ สายทางแรก):</span>
                <span className="text-[10px] text-slate-400 font-mono">ทั้งหมด {importedGisFeatures.length} สายทาง</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-[11px] text-left text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-heading">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">รหัสสายทาง</th>
                      <th className="p-2">ชื่อสายทาง / ตอนควบคุม</th>
                      <th className="p-2">ระยะทาง (กม.)</th>
                      <th className="p-2">จุดพิกัด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-body">
                    {importedGisFeatures.slice(0, 5).map((f, idx) => {
                      const props = f.properties || {};
                      const code = selectedRouteCodeField
                        ? (props[selectedRouteCodeField] || manualRouteCode || `สายทางที่ ${idx + 1}`)
                        : (manualRouteCode || `สายทางที่ ${idx + 1}`);
                      const name = selectedRouteNameField
                        ? (props[selectedRouteNameField] || manualRouteName || importedLayerName)
                        : (manualRouteName || importedLayerName);

                      return (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="p-2 font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-2 font-heading font-bold text-amber-300">ทล.{code}</td>
                          <td className="p-2 text-white">{name}</td>
                          <td className="p-2 font-mono text-emerald-400">{f.lengthKm} กม.</td>
                          <td className="p-2 font-mono text-slate-400">{f.coords.length} จุด</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Douglas-Peucker Slider */}
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">ความละเอียดการตัดจุดส่วนเกิน (Douglas-Peucker)</span>
              <span className="text-amber-400 font-mono font-bold">{simplifyTolerance}</span>
            </div>
            <input
              type="range"
              min="0.00001"
              max="0.0005"
              step="0.00001"
              value={simplifyTolerance}
              onChange={(e) => handleResimplifyTolerance(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <p className="text-[10px] text-slate-400">
              ค่ามาตรฐาน 0.00008 เหมาะสมสำหรับการเรนเดอร์ถนนหลวงได้อย่างราบรื่นและไม่กินแรม
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancelImport}
              className="bg-slate-800 text-slate-300 px-3.5 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={isCommitting}
              onClick={handleCommitGisLayer}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {isCommitting ? "กำลังบันทึก..." : "บันทึกโครงข่ายเข้าสู่ระบบ"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
