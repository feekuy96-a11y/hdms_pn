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
  Eye,
  EyeOff,
  Sliders,
  Settings,
  X,
  Check,
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

  // Individual Highway Specifications Modal State (Issue #13)
  const [editingRouteSpecs, setEditingRouteSpecs] = useState<{
    layerId: string;
    featureIdx: number;
    routeNo: string;
    sectionName: string;
    kmStart: string;
    kmEnd: string;
    lengthKm: string | number;
    responsibleOffice: string;
    highwayType: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
    lanes: string;
    surface: string;
    remarks: string;
    isVisible: boolean;
  } | null>(null);

  // Toggle Eye visibility for a single feature inside a highway layer
  const handleToggleFeatureVisibility = async (layerId: string, featureIdx: number) => {
    const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === layerId);
    if (!layer || !layer.geojson_data?.features?.[featureIdx]) return;

    try {
      const updatedGeojson = JSON.parse(JSON.stringify(layer.geojson_data));
      const targetFeature = updatedGeojson.features[featureIdx];
      const currentVis = targetFeature.properties?.is_visible !== false;
      targetFeature.properties.is_visible = !currentVis;

      const res = await updateHighwayLayerAction({
        layerId,
        geojsonData: updatedGeojson,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        onToast(
          `สลับการแสดงผล [${targetFeature.properties?.route_no || targetFeature.properties?.section_name || "สายทาง"}] เป็น ${
            !currentVis ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"
          }`
        );
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาดในการเปลี่ยนการแสดงผล: " + e.message);
    }
  };

  // Save updated specifications for a single feature
  const handleSaveRouteSpecsModal = async () => {
    if (!editingRouteSpecs) return;
    const { layerId, featureIdx, ...specs } = editingRouteSpecs;
    const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === layerId);
    if (!layer || !layer.geojson_data?.features?.[featureIdx]) return;

    try {
      const updatedGeojson = JSON.parse(JSON.stringify(layer.geojson_data));
      const targetFeature = updatedGeojson.features[featureIdx];
      targetFeature.properties = {
        ...(targetFeature.properties || {}),
        route_no: specs.routeNo.trim(),
        route_code: specs.routeNo.trim(),
        section_name: specs.sectionName.trim(),
        route_name: specs.sectionName.trim(),
        km_start: specs.kmStart.trim(),
        km_end: specs.kmEnd.trim(),
        length_km: Number(specs.lengthKm) || targetFeature.properties?.length_km || 0,
        responsible_office: specs.responsibleOffice,
        highway_type: specs.highwayType,
        lanes: specs.lanes,
        surface: specs.surface,
        remarks: specs.remarks.trim(),
        is_visible: specs.isVisible,
      };

      const res = await updateHighwayLayerAction({
        layerId,
        geojsonData: updatedGeojson,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        setEditingRouteSpecs(null);
        showSuccessModal(
          "บันทึกคุณสมบัติทางหลวงสำเร็จ",
          `บันทึกข้อมูล ทล.${specs.routeNo} ${specs.sectionName} ช่องจราจร [${specs.lanes}] เรียบร้อยแล้ว (ขนาดเส้นบนแผนที่ถูกปรับเปลี่ยนทันที)`
        );
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    }
  };

  // Flattened highway features list for specifications table (Issue #13)
  const allHighwayFeatures = React.useMemo(() => {
    const list: Array<{
      layerId: string;
      layerName: string;
      featureIdx: number;
      routeNo: string;
      sectionName: string;
      kmStart: string;
      kmEnd: string;
      lengthKm: number | string;
      responsibleOffice: string;
      highwayType: "MAIN_HIGHWAY" | "SECOND_HIGHWAY";
      lanes: string;
      surface: string;
      remarks: string;
      isVisible: boolean;
      pointsCount: number;
    }> = [];

    (systemData.highwayLayers || []).forEach((layer) => {
      const isSec = layer.layer_id === "SECOND_HIGHWAY";
      if (layer.geojson_data && Array.isArray(layer.geojson_data.features)) {
        layer.geojson_data.features.forEach((feature: any, idx: number) => {
          const props = feature.properties || {};
          list.push({
            layerId: layer.layer_id,
            layerName: layer.layer_name,
            featureIdx: idx,
            routeNo: props.route_no || props.route_code || props.ROAD_NO || props.route || props.code || `${idx + 1}`,
            sectionName: props.section_name || props.route_name || props.ROAD_NAME || props.section || props.name || layer.layer_name,
            kmStart: props.km_start || "-",
            kmEnd: props.km_end || "-",
            lengthKm: props.length_km || "-",
            responsibleOffice: props.responsible_office || layer.metadata?.responsibleOffice || "หมวดทางหลวงปัตตานี",
            highwayType: isSec ? "SECOND_HIGHWAY" : "MAIN_HIGHWAY",
            lanes: props.lanes || layer.metadata?.lanes || "๔ ช่องจราจร (มีเกาะกลาง/มาตรฐานชั้น ๑)",
            surface: props.surface || layer.metadata?.surface || "ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)",
            remarks: props.remarks || layer.metadata?.remarks || "-",
            isVisible: props.is_visible !== false,
            pointsCount: feature.geometry?.coordinates?.length || 0,
          });
        });
      }
    });

    return list;
  }, [systemData.highwayLayers]);

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
                      รหัส: {layer.layer_id} • สี: {layerColor} • จำนวน {layer.geojson_data?.features?.length || 0} สายทาง
                    </span>
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

      {/* Individual Highway Specifications Table (Issue #13) */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
          <div>
            <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-amber-400" /> ตารางรายการทางหลวงและคุณสมบัติทางวิศวกรรม (Highway Specifications)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              คลิกไอคอนรูปดวงตาเพื่อ เปิด/ปิด การแสดงผลเส้นทาง หรือคลิก &quot;ตั้งค่า&quot; เพื่อปรับแต่งช่องจราจร (มีผลต่อความหนาเส้นบนแผนที่) ผิวจราจร และข้อมูลเฉพาะสายทาง
            </p>
          </div>
          <span className="text-[11px] bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-xl text-amber-300 font-mono self-start sm:self-auto">
            {allHighwayFeatures.length} เส้นทางในระบบ
          </span>
        </div>

        {allHighwayFeatures.length === 0 ? (
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-center text-xs text-slate-400">
            ยังไม่มีรายการเส้นทางในระบบ กรุณาอัปโหลดไฟล์ KML, KMZ หรือ Shapefile ด้านบน
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#091122] text-slate-400 font-heading border-b border-slate-800">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 w-16 text-center">แสดงผล</th>
                  <th className="p-3">หมายเลขทางหลวง</th>
                  <th className="p-3">ชื่อสายทาง / ตอนควบคุม</th>
                  <th className="p-3">ช่วง กม.</th>
                  <th className="p-3">ระยะทาง</th>
                  <th className="p-3">ช่องจราจร (แผนที่)</th>
                  <th className="p-3">ชนิดผิวจราจร</th>
                  <th className="p-3">หน่วยงานรับผิดชอบ</th>
                  <th className="p-3">หมายเหตุ</th>
                  <th className="p-3 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-body">
                {allHighwayFeatures.map((item, idx) => {
                  return (
                    <tr
                      key={`${item.layerId}-${item.featureIdx}`}
                      className={`hover:bg-slate-900/60 transition ${!item.isVisible ? "opacity-50 bg-slate-950/40" : ""}`}
                    >
                      <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleFeatureVisibility(item.layerId, item.featureIdx)}
                          className={`p-1.5 rounded-lg border transition ${
                            item.isVisible
                              ? "bg-emerald-950/80 text-emerald-300 border-emerald-600 hover:bg-emerald-900"
                              : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                          }`}
                          title={item.isVisible ? "คลิกเพื่อซ่อนเส้นทางนี้บนแผนที่" : "คลิกเพื่อแสดงเส้นทางนี้บนแผนที่"}
                        >
                          {item.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="p-3">
                        <span className="font-heading font-black text-xs px-2 py-0.5 rounded bg-amber-400 text-slate-950 shadow-sm inline-block">
                          ทล.{item.routeNo}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-white max-w-[200px] truncate" title={item.sectionName}>
                        {item.sectionName}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-amber-300 whitespace-nowrap">
                        {item.kmStart} - {item.kmEnd}
                      </td>
                      <td className="p-3 font-mono text-emerald-400 whitespace-nowrap">
                        {item.lengthKm ? `${item.lengthKm} กม.` : "-"}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-950 text-sky-300 border border-sky-700 whitespace-nowrap">
                          {item.lanes}
                        </span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-300 max-w-[140px] truncate" title={item.surface}>
                        {item.surface}
                      </td>
                      <td className="p-3 text-[11px] text-slate-300 whitespace-nowrap">
                        {item.responsibleOffice}
                      </td>
                      <td className="p-3 text-[11px] text-slate-400 max-w-[120px] truncate" title={item.remarks}>
                        {item.remarks || "-"}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingRouteSpecs({
                              layerId: item.layerId,
                              featureIdx: item.featureIdx,
                              routeNo: item.routeNo,
                              sectionName: item.sectionName,
                              kmStart: item.kmStart !== "-" ? item.kmStart : "",
                              kmEnd: item.kmEnd !== "-" ? item.kmEnd : "",
                              lengthKm: item.lengthKm !== "-" ? item.lengthKm : "",
                              responsibleOffice: item.responsibleOffice,
                              highwayType: item.highwayType,
                              lanes: item.lanes,
                              surface: item.surface,
                              remarks: item.remarks !== "-" ? item.remarks : "",
                              isVisible: item.isVisible,
                            })
                          }
                          className="bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-400 px-2.5 py-1.5 rounded-xl font-heading text-xs font-bold transition inline-flex items-center gap-1 shadow-sm"
                        >
                          <Sliders className="w-3.5 h-3.5 text-amber-400" /> ตั้งค่า
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Highway Specifications Editor (Issue #13) */}
      {editingRouteSpecs && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0c162c] border border-amber-500/60 rounded-3xl p-5 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-heading font-black text-base text-white flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <span>ตั้งค่าคุณสมบัติทางวิศวกรรม (Highway Specifications)</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  ทล.{editingRouteSpecs.routeNo} {editingRouteSpecs.sectionName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRouteSpecs(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Row 1: Route No & Section Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">หมายเลขทางหลวง *</label>
                  <input
                    type="text"
                    value={editingRouteSpecs.routeNo}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, routeNo: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-heading font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-slate-300 block mb-1">ชื่อสายทาง / ตอนควบคุม *</label>
                  <input
                    type="text"
                    value={editingRouteSpecs.sectionName}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, sectionName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Row 2: KM Range & Distance */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">ช่วง กม. เริ่มต้น</label>
                  <input
                    type="text"
                    value={editingRouteSpecs.kmStart}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, kmStart: e.target.value })}
                    placeholder="เช่น 12+500"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">ช่วง กม. สิ้นสุด</label>
                  <input
                    type="text"
                    value={editingRouteSpecs.kmEnd}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, kmEnd: e.target.value })}
                    placeholder="เช่น 18+200"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">ระยะทาง (กม.)</label>
                  <input
                    type="number"
                    step="any"
                    value={editingRouteSpecs.lengthKm}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, lengthKm: e.target.value })}
                    placeholder="เช่น 5.7"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Row 3: Lanes (Affects Map line width) & Surface */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">
                    จำนวนช่องจราจร (มีผลต่อความหนาเส้นบนแผนที่) *
                  </label>
                  <select
                    value={editingRouteSpecs.lanes}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, lanes: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sky-300 font-heading font-medium"
                  >
                    <option value="๒ ช่องจราจร (สวนทาง)">๒ ช่องจราจร (สวนทาง) - ความหนา 3.5px</option>
                    <option value="๔ ช่องจราจร (มีเกาะกลาง/มาตรฐานชั้น ๑)">๔ ช่องจราจร (มาตรฐานชั้น ๑) - ความหนา 5.5px</option>
                    <option value="๖ ช่องจราจร (สายหลักหนาแน่น)">๖ ช่องจราจร (สายหลัก) - ความหนา 7.5px</option>
                    <option value="๘ ช่องจราจร ขึ้นไป">๘ ช่องจราจร ขึ้นไป - ความหนา 9.0px</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">ชนิดผิวจราจร (Pavement Surface)</label>
                  <select
                    value={editingRouteSpecs.surface}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, surface: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-amber-300"
                  >
                    <option value="ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)">ผิวทางแอสฟัลต์คอนกรีต (Asphalt Concrete)</option>
                    <option value="คอนกรีตเสริมเหล็ก (Rigid Concrete)">คอนกรีตเสริมเหล็ก (Rigid Concrete)</option>
                    <option value="ผิวทางลาดยาง (Surface Treatment)">ผิวทางลาดยาง (Surface Treatment)</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Responsible Office & Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">หน่วยงานที่รับผิดชอบ *</label>
                  <select
                    value={editingRouteSpecs.responsibleOffice}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, responsibleOffice: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="หมวดทางหลวงปัตตานี">หมวดทางหลวงปัตตานี</option>
                    <option value="หมวดทางหลวงหนองจิก">หมวดทางหลวงหนองจิก</option>
                    <option value="หมวดทางหลวงยะรัง">หมวดทางหลวงยะรัง</option>
                    <option value="หมวดทางหลวงโคกโพธิ์">หมวดทางหลวงโคกโพธิ์</option>
                    <option value="หมวดทางหลวงสายบุรี">หมวดทางหลวงสายบุรี</option>
                    <option value="แขวงทางหลวงชนบทปัตตานี">แขวงทางหลวงชนบทปัตตานี</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">ประเภททางหลวง</label>
                  <select
                    value={editingRouteSpecs.highwayType}
                    onChange={(e: any) => setEditingRouteSpecs({ ...editingRouteSpecs, highwayType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="MAIN_HIGHWAY">ทางหลวงสายหลัก</option>
                    <option value="SECOND_HIGHWAY">ทางหลวงสายรอง</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Remarks */}
              <div>
                <label className="text-slate-300 block mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={editingRouteSpecs.remarks}
                  onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, remarks: e.target.value })}
                  placeholder="เช่น เส้นทางหลักเชื่อมโยง สงขลา - ปัตตานี"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* Row 6: Visibility Switch */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-heading font-bold text-white block">
                    แสดงผลบนแผนที่ (Map Layer Visibility)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    เปิดเพื่อให้เส้นทางนี้ปรากฏบนแผนที่ของทั้งประชาชนและเจ้าหน้าที่
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRouteSpecs.isVisible}
                    onChange={(e) => setEditingRouteSpecs({ ...editingRouteSpecs, isVisible: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingRouteSpecs(null)}
                className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveRouteSpecsModal}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" /> บันทึกคุณสมบัติทางวิศวกรรม
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

