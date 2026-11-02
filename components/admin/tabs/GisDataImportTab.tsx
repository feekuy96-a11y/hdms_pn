"use client";

import React, { useState } from "react";
import { SystemDataPayload } from "@/db/default-data";
import { LineStylesMap } from "@/lib/constants";
import {
  FileSpreadsheet,
  Upload,
  MapPin,
  Tag,
  Building,
  CheckCircle2,
  Trash2,
  Save,
} from "lucide-react";
import {
  updateHighwayLayerAction,
  deleteHighwayLayerAction,
} from "@/app/actions/doh-actions";
import {
  simplifyCoordinates,
  extractFeaturesFromGeoJson,
  extractFeaturesFromKml,
  extractFeaturesFromKmz,
  extractAvailableGisFields,
  detectSmartFieldMapping,
  ExtractedGisFeature,
} from "@/lib/gis-utils";

interface GisDataImportTabProps {
  systemData: SystemDataPayload;
  lineStyles: LineStylesMap;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  setIncomingGisLines?: (lines: [number, number][][]) => void;
}

export function GisDataImportTab({
  systemData,
  lineStyles,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  showErrorModal,
  setIncomingGisLines,
}: GisDataImportTabProps) {
  const [importedGisFeatures, setImportedGisFeatures] = useState<ExtractedGisFeature[]>([]);
  const [, setImportedPreviewLines] = useState<[number, number][][]>([]);
  const [importedLayerName, setImportedLayerName] = useState("");
  const [importedLayerDesc, setImportedLayerDesc] = useState("");
  const [availableGisFields, setAvailableGisFields] = useState<string[]>([]);
  const [selectedRouteCodeField, setSelectedRouteCodeField] = useState("");
  const [manualRouteCode, setManualRouteCode] = useState("");
  const [selectedRouteNameField, setSelectedRouteNameField] = useState("");
  const [manualRouteName, setManualRouteName] = useState("");
  const [selectedRouteTypeField, setSelectedRouteTypeField] = useState("");
  const [targetLayerCategory, setTargetLayerCategory] = useState<"MAIN_HIGHWAY" | "SECOND_HIGHWAY">("MAIN_HIGHWAY");
  const [labelDisplayMode, setLabelDisplayMode] = useState<"hover" | "permanent" | "click">("hover");

  // Specifications
  const [layerLanes, setLayerLanes] = useState("๔ ช่องจราจร (มีเกาะกลาง/มาตรฐานชั้น ๑)");
  const [layerSurface, setLayerSurface] = useState("ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)");
  const [layerResponsibleOffice, setLayerResponsibleOffice] = useState("หมวดทางหลวงปัตตานี");
  const [layerSpeedLimit, setLayerSpeedLimit] = useState("๙๐ กม./ชม. (ทางหลวงแผ่นดินทั่วไป)");
  const [layerRoadStatus, setLayerRoadStatus] = useState("สัญจรได้ตามปกติ");
  const [layerRemarks, setLayerRemarks] = useState("");
  const [simplifyTolerance, setSimplifyTolerance] = useState(0.00008);
  const [isCommitting, setIsCommitting] = useState(false);

  // Handle GIS File Upload (KML, KMZ, Shapefile .zip, GeoJSON, GPX)
  const handleGisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onToast(`กำลังตรวจสอบและวิเคราะห์โครงข่าย ${file.name}...`);
    try {
      let extractedFeatures: ExtractedGisFeature[] = [];
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".kmz")) {
        extractedFeatures = await extractFeaturesFromKmz(file);
      } else if (lower.endsWith(".kml")) {
        const text = await file.text();
        extractedFeatures = extractFeaturesFromKml(text);
      } else if (lower.endsWith(".zip")) {
        const shp = (await import("shpjs")).default;
        const buf = await file.arrayBuffer();
        const geojson = await shp(buf);
        extractedFeatures = extractFeaturesFromGeoJson(geojson);
      } else {
        const text = await file.text();
        const geojson = JSON.parse(text);
        extractedFeatures = extractFeaturesFromGeoJson(geojson);
      }

      if (extractedFeatures.length === 0) {
        throw new Error("ไม่พบแนวเส้นทาง (LineString) ในไฟล์ หรือรูปแบบพิกัดไม่ใช่ WGS84");
      }

      // Simplify coordinates with Douglas-Peucker
      const decimatedFeatures = extractedFeatures.map((f) => ({
        ...f,
        coords: simplifyCoordinates(f.coords, simplifyTolerance),
      }));

      setImportedGisFeatures(decimatedFeatures);
      const decimatedLines = decimatedFeatures.map((f) => f.coords);
      setImportedPreviewLines(decimatedLines);
      setIncomingGisLines?.(decimatedLines);

      // Extract all property fields
      const fields = extractAvailableGisFields(decimatedFeatures);
      setAvailableGisFields(fields);

      // Auto-detect smart mapping
      const smart = detectSmartFieldMapping(fields);
      setSelectedRouteCodeField(smart.routeCodeField);
      setSelectedRouteNameField(smart.routeNameField);
      setSelectedRouteTypeField(smart.routeTypeField);

      // Auto layer name
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      setImportedLayerName(cleanName);
      setImportedLayerDesc(`นำเข้าจากไฟล์ ${file.name} เมื่อ ${new Date().toLocaleDateString("th-TH")}`);

      showSuccessModal(
        "ตรวจสอบโครงข่ายสำเร็จ (Dual-Color Preview)",
        `พบเส้นทาง ${decimatedFeatures.length} เส้นในไฟล์ และตรวจพบ ${fields.length} ฟิลด์ข้อมูล ระบบแสดงเส้นสีน้ำเงินตรวจสอบบนแผนที่แล้ว`
      );
    } catch (err: any) {
      if (showErrorModal) {
        showErrorModal(
          "ไฟล์ข้อมูลไม่ถูกต้อง",
          err.message || "กรุณาตรวจสอบระบบพิกัด EPSG:4326 (WGS84) และชนิดข้อมูลต้องเป็น LineString"
        );
      } else {
        onToast("ข้อผิดพลาด: " + (err.message || "ไฟล์ข้อมูลไม่ถูกต้อง"));
      }
    }
  };

  // Re-simplify tolerance on demand
  const handleResimplifyTolerance = (newTol: number) => {
    setSimplifyTolerance(newTol);
    if (importedGisFeatures.length > 0) {
      const reDecimated = importedGisFeatures.map((f) => ({
        ...f,
        coords: simplifyCoordinates(f.coords, newTol),
      }));
      setImportedGisFeatures(reDecimated);
      const lines = reDecimated.map((f) => f.coords);
      setImportedPreviewLines(lines);
      setIncomingGisLines?.(lines);
    }
  };

  // Commit GIS Layer to System
  const handleCommitGisLayer = async () => {
    if (!importedGisFeatures || importedGisFeatures.length === 0) {
      onToast("ยังไม่มีข้อมูลเส้นทางที่นำเข้า");
      return;
    }
    const isSec = targetLayerCategory === "SECOND_HIGHWAY";
    const layerId = isSec ? "SECOND_HIGHWAY" : "MAIN_HIGHWAY";
    const colorHex = isSec ? (lineStyles.secondary?.color || "#0284c7") : (lineStyles.primary?.color || "#1B5E20");
    const lineWidth = isSec ? (lineStyles.secondary?.weight || 3.5) : (lineStyles.primary?.weight || 5);

    const geojsonData = {
      type: "FeatureCollection",
      features: importedGisFeatures.map((f, idx) => {
        const props = f.properties || {};
        const code = selectedRouteCodeField ? (props[selectedRouteCodeField] || manualRouteCode || `สายทางที่ ${idx + 1}`) : (manualRouteCode || `สายทางที่ ${idx + 1}`);
        const name = selectedRouteNameField ? (props[selectedRouteNameField] || manualRouteName || importedLayerName) : (manualRouteName || importedLayerName);
        const type = selectedRouteTypeField ? (props[selectedRouteTypeField] || targetLayerCategory) : targetLayerCategory;

        return {
          type: "Feature",
          properties: {
            ...props,
            route_code: String(code).trim(),
            route_name: String(name).trim(),
            route_type: type,
            description: importedLayerDesc || "โครงข่ายสายทางกรมทางหลวง",
            length_km: f.lengthKm,
            points_count: f.coords.length,
            layer_name: importedLayerName,
            label_mode: labelDisplayMode,
          },
          geometry: { type: "LineString", coordinates: f.coords },
        };
      }),
    };

    setIsCommitting(true);
    try {
      const res = await updateHighwayLayerAction({
        layerId,
        layerName: importedLayerName || (isSec ? "ทางหลวงสายรอง" : "ทางหลวงสายหลัก"),
        colorHex,
        lineWidth,
        geojsonData,
        metadata: {
          lanes: layerLanes,
          surface: layerSurface,
          responsibleOffice: layerResponsibleOffice,
          speedLimit: layerSpeedLimit,
          roadStatus: layerRoadStatus,
          remarks: layerRemarks,
        },
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        setImportedPreviewLines([]);
        setImportedGisFeatures([]);
        setIncomingGisLines?.([]);
        setImportedLayerName("");
        setImportedLayerDesc("");
        setAvailableGisFields([]);
        showSuccessModal(
          "บันทึกโครงข่ายสายทางสำเร็จ",
          `โครงข่ายจำนวน ${geojsonData.features.length} เส้นทาง พร้อมป้ายกำกับชื่อสายทาง ถูกจัดเก็บและแสดงบนแผนที่เรียบร้อยแล้ว`
        );
      }
    } catch (e: any) {
      onToast("ข้อผิดพลาด: " + e.message);
    } finally {
      setIsCommitting(false);
    }
  };

  // Delete Highway Layer
  const handleDeleteHighwayLayer = (layerId: string, layerName: string) => {
    showConfirmModal(
      "ยืนยันการลบเลเยอร์โครงข่าย?",
      `ท่านกำลังจะลบชั้นข้อมูล [${layerName}] (${layerId}) ออกจากแผนที่ระบบ`,
      async () => {
        try {
          const res = await deleteHighwayLayerAction(layerId);
          if (res.success) {
            onDataRefresh(res.systemData);
            showSuccessModal("ลบชั้นข้อมูลสำเร็จ", `ลบเลเยอร์ [${layerName}] ออกจากระบบเรียบร้อย`);
          }
        } catch (e: any) {
          onToast("ข้อผิดพลาดในการลบเลเยอร์: " + e.message);
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-slate-800 pb-3">
        <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-amber-400" /> นำเข้าโครงข่ายสายทาง GIS & กำหนดฟิลด์แสดงผล
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          รองรับ KML, KMZ, Shapefile (.zip), GeoJSON, GPX พร้อมแผนที่ตรวจสอบ Dual-Color, การจับคู่ฟิลด์ชื่อสายทางเพื่อแสดงป้ายกำกับ/Popup และตัวตัดจุดความหนาแน่นเกิน (Douglas-Peucker)
        </p>
      </div>

      {/* Upload Dropzone */}
      <div className="bg-slate-950 p-5 rounded-2xl border-2 border-dashed border-slate-700 hover:border-amber-400 transition space-y-3 text-center">
        <Upload className="w-10 h-10 text-amber-400 mx-auto animate-bounce" />
        <div>
          <h4 className="font-heading font-bold text-sm text-white">เลือกไฟล์โครงข่ายเส้นทางหลวง</h4>
          <p className="text-xs text-slate-400 mt-1">
            รองรับ .kml, .kmz, .zip (Shapefile รวม .shp .dbf .prj), .geojson, .gpx (พิกัด EPSG:4326)
          </p>
        </div>
        <label className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-lg transition">
          เปิดเลือกไฟล์จากคอมพิวเตอร์
          <input
            type="file"
            accept=".kml,.kmz,.zip,.geojson,.json,.gpx"
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
            <div>
              <label className="text-xs text-slate-300 block mb-1">คำอธิบายเพื่อแสดงเมื่อคลิกเส้นบนแผนที่</label>
              <input
                type="text"
                value={importedLayerDesc}
                onChange={(e) => setImportedLayerDesc(e.target.value)}
                placeholder="เช่น ทางหลวงแผ่นดิน 4 ช่องจราจร..."
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
                <label className="text-slate-300 block mb-1">ฟิลด์รหัสสายทาง (Route Code)</label>
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
                <label className="text-slate-300 block mb-1">ฟิลด์ชื่อสายทาง / ป้ายกำกับ (Label/Name)</label>
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
                <label className="text-slate-300 block mb-1">ประเภททางหลวง (Classification)</label>
                <select
                  value={targetLayerCategory}
                  onChange={(e: any) => setTargetLayerCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                >
                  <option value="MAIN_HIGHWAY">ทางหลวงสายหลัก (Primary Highway - ประธาน/หลัก)</option>
                  <option value="SECOND_HIGHWAY">ทางหลวงสายรอง (Secondary Highway - เชื่อมต่ออำเภอ)</option>
                </select>
              </div>

              {/* Field 4: Label Display Mode */}
              <div>
                <label className="text-slate-300 block mb-1">โหมดการแสดงป้ายชื่อบนแผนที่ (Label Display)</label>
                <select
                  value={labelDisplayMode}
                  onChange={(e: any) => setLabelDisplayMode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
                >
                  <option value="hover">แสดงป้ายชื่อลอยเมื่อเลื่อนเมาส์ชี้ (Hover Tooltip)</option>
                  <option value="permanent">แสดงป้ายชื่อตลอดเวลาบนแนวเส้น (Permanent Label)</option>
                  <option value="click">แสดงเมื่อคลิกดูรายละเอียดเท่านั้น (Click Popup Only)</option>
                </select>
              </div>
            </div>

            {/* Extended Highway Specifications */}
            <div className="mt-3 p-3 bg-slate-950/80 rounded-xl border border-sky-950/60 space-y-3">
              <div className="flex items-center gap-2 text-sky-400 font-heading font-semibold text-xs border-b border-sky-950 pb-1.5">
                <Building className="w-4 h-4 text-sky-400" />
                <span>กำหนดรายละเอียดและคุณสมบัติทางวิศวกรรมของเส้นทาง (Highway Specifications)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {/* Lanes */}
                <div>
                  <label className="text-slate-300 block mb-1">จำนวนช่องจราจร (Lanes)</label>
                  <select
                    value={layerLanes}
                    onChange={(e) => setLayerLanes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="๒ ช่องจราจร (สวนทาง)">๒ ช่องจราจร (สวนทาง)</option>
                    <option value="๔ ช่องจราจร (มีเกาะกลาง/มาตรฐานชั้น ๑)">๔ ช่องจราจร (มีเกาะกลาง/มาตรฐานชั้น ๑)</option>
                    <option value="๖ ช่องจราจร (สายหลักหนาแน่น)">๖ ช่องจราจร (สายหลักหนาแน่น)</option>
                    <option value="๘ ช่องจราจร ขึ้นไป">๘ ช่องจราจร ขึ้นไป</option>
                  </select>
                </div>

                {/* Surface Type */}
                <div>
                  <label className="text-slate-300 block mb-1">ชนิดผิวจราจร (Pavement Surface)</label>
                  <select
                    value={layerSurface}
                    onChange={(e) => setLayerSurface(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)">ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)</option>
                    <option value="คอนกรีตเสริมเหล็ก (Rigid Pavement / Concrete)">คอนกรีตเสริมเหล็ก (Rigid Concrete)</option>
                    <option value="ผิวทางลาดยาง (Surface Treatment / AC)">ผิวทางลาดยาง (Surface Treatment)</option>
                  </select>
                </div>

                {/* Responsible Subdivision */}
                <div>
                  <label className="text-slate-300 block mb-1">หน่วยงานรับผิดชอบ (Subdivision)</label>
                  <select
                    value={layerResponsibleOffice}
                    onChange={(e) => setLayerResponsibleOffice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-heading font-medium"
                  >
                    <option value="หมวดทางหลวงปัตตานี">หมวดทางหลวงปัตตานี</option>
                    <option value="หมวดทางหลวงหนองจิก">หมวดทางหลวงหนองจิก</option>
                    <option value="หมวดทางหลวงยะรัง">หมวดทางหลวงยะรัง</option>
                    <option value="หมวดทางหลวงโคกโพธิ์">หมวดทางหลวงโคกโพธิ์</option>
                    <option value="หมวดทางหลวงสายบุรี">หมวดทางหลวงสายบุรี</option>
                    <option value="แขวงทางหลวงชนบทปัตตานี">แขวงทางหลวงชนบทปัตตานี</option>
                  </select>
                </div>

                {/* Speed Limit */}
                <div>
                  <label className="text-slate-300 block mb-1">ความเร็วจำกัดตามกฎหมาย (Speed Limit)</label>
                  <select
                    value={layerSpeedLimit}
                    onChange={(e) => setLayerSpeedLimit(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="๕๐ กม./ชม. (เขตชุมชน/หน้าโรงเรียน)">๕๐ กม./ชม. (เขตชุมชน)</option>
                    <option value="๖๐ กม./ชม. (ทางเลี่ยงเมือง/สายรอง)">๖๐ กม./ชม. (ทางเลี่ยงเมือง/สายรอง)</option>
                    <option value="๘๐ กม./ชม. (ทางหลวงชนบท/สองช่องทาง)">๘๐ กม./ชม. (สองช่องทาง)</option>
                    <option value="๙๐ กม./ชม. (ทางหลวงแผ่นดินทั่วไป)">๙๐ กม./ชม. (ทางหลวงแผ่นดินทั่วไป)</option>
                    <option value="๑๒๐ กม./ชม. (ทางหลวง ๔ ช่องจราจรเกาะกลาง)">๑๒๐ กม./ชม. (สายหลัก ๔ ช่อง)</option>
                  </select>
                </div>

                {/* Road Status */}
                <div>
                  <label className="text-slate-300 block mb-1">สถานะความพร้อมของสายทาง (Road Status)</label>
                  <select
                    value={layerRoadStatus}
                    onChange={(e) => setLayerRoadStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-400 font-medium"
                  >
                    <option value="สัญจรได้ตามปกติ">สัญจรได้ตามปกติ (Normal)</option>
                    <option value="อยู่ระหว่างงานบำรุงรักษาทาง">อยู่ระหว่างงานบำรุงรักษาทาง (Maintenance)</option>
                    <option value="มีจุดเฝ้าระวังน้ำท่วมขัง">มีจุดเฝ้าระวังน้ำท่วมขัง (Flood Watch)</option>
                  </select>
                </div>

                {/* Remarks */}
                <div>
                  <label className="text-slate-300 block mb-1">หมายเหตุเพิ่มเติม (Remarks)</label>
                  <input
                    type="text"
                    value={layerRemarks}
                    onChange={(e) => setLayerRemarks(e.target.value)}
                    placeholder="เช่น โครงข่ายหลักเชื่อมต่อ ๓ จังหวัดชายแดนใต้"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
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
              onClick={() => {
                setImportedPreviewLines([]);
                setImportedGisFeatures([]);
                setIncomingGisLines?.([]);
                setAvailableGisFields([]);
              }}
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

      {/* Highway Layers in System */}
      <div className="space-y-3">
        <h3 className="font-heading font-bold text-sm text-white">เลเยอร์โครงข่ายเดิมในระบบ</h3>
        <div className="space-y-2">
          {(systemData.highwayLayers || []).map((layer) => {
            const isMain = layer.layer_id === "MAIN_HIGHWAY";
            const layerColor = isMain ? (lineStyles.primary?.color || "#1B5E20") : (lineStyles.secondary?.color || "#0284c7");
            return (
              <div
                key={layer.layer_id}
                className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs transition hover:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full border border-white/40 shadow"
                    style={{ backgroundColor: layerColor }}
                  />
                  <div>
                    <strong className="text-white block">{layer.layer_name}</strong>
                    <span className="text-slate-400 text-[11px]">
                      รหัส: {layer.layer_id} • สี: {layerColor}
                    </span>
                    {layer.metadata && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {layer.metadata.lanes && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-sky-300">
                            {layer.metadata.lanes}
                          </span>
                        )}
                        {layer.metadata.surface && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-amber-300">
                            {layer.metadata.surface}
                          </span>
                        )}
                        {layer.metadata.responsibleOffice && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-emerald-300">
                            {layer.metadata.responsibleOffice}
                          </span>
                        )}
                        {layer.metadata.speedLimit && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-300">
                            {layer.metadata.speedLimit}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-heading font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> เปิดใช้งานบนแผนที่
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteHighwayLayer(layer.layer_id, layer.layer_name)}
                    title="ลบเลเยอร์โครงข่าย"
                    className="p-1.5 bg-slate-900 hover:bg-red-600 hover:text-white text-red-400 rounded-lg text-xs transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

