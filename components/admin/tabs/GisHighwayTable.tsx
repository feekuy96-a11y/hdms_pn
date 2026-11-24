"use client";

import React, { useMemo, useState, useDeferredValue } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import type { SystemDataPayload } from "@/db/default-data";
import { exportLineFeatures, type GisExportFormat } from "@/lib/gis-export";
import { updateHighwayLayerAction } from "@/app/actions/doh-actions";
import { groupHighwayFeatures, type HighwaySectionGroup } from "@/lib/highway-schema";
import { HighwaySpecificationsTableSection } from "@/components/admin/tabs/HighwaySpecificationsTableSection";
import type {
  EditingRouteSpecsState,
  HighwayFeatureSummary,
} from "@/components/admin/tabs/GisHighwayModals";
import type { DohOfficeItem } from "@/components/admin/tabs/GisUploadMappingPanel";

export type LineStylesMap = Record<string, import("@/db/default-data").MapLineStyleItem>;

export interface GisHighwayTableProps {
  systemData: SystemDataPayload;
  lineStyles: LineStylesMap;
  offices: DohOfficeItem[];
  allHighwayFeatures: HighwayFeatureSummary[];
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  handleDeleteHighwayLayer: (layerId: string, layerName: string) => void;
  setEditingRouteSpecs: React.Dispatch<React.SetStateAction<EditingRouteSpecsState | null>>;
  setSelectedRoute: (route: { layerId: string; featureIdx: number } | null) => void;
  openGeometryEditor: (layerId: string, featureIdx: number) => void;
  handleDeleteHighwayFeature: (layerId: string, featureIdx: number, routeTitle: string) => void;
}

export function GisHighwayTable({
  systemData,
  lineStyles,
  offices,
  allHighwayFeatures,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  handleDeleteHighwayLayer,
  setEditingRouteSpecs,
  setSelectedRoute,
  openGeometryEditor,
  handleDeleteHighwayFeature,
}: GisHighwayTableProps) {
  // Grouped highway sections (Parent-Child)
  const highwaySectionGroups = useMemo(() => {
    return groupHighwayFeatures(systemData.highwayLayers || []);
  }, [systemData.highwayLayers]);

  const [routeSearch, setRouteSearch] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [highwayFilterVisibility, setHighwayFilterVisibility] = useState<"ALL" | "VISIBLE" | "HIDDEN">("ALL");
  const [highwayFilterType, setHighwayFilterType] = useState<"ALL" | "MAIN" | "SECONDARY">("ALL");
  const [highwayFilterOffice, setHighwayFilterOffice] = useState<string>("ALL");

  const deferredRouteSearch = useDeferredValue(routeSearch);

  const availableOffices = useMemo(() => {
    const set = new Set<string>();
    highwaySectionGroups.forEach((g) => {
      if (g.responsibleOffice && g.responsibleOffice.trim()) {
        set.add(g.responsibleOffice.trim());
      }
    });
    return Array.from(set).sort();
  }, [highwaySectionGroups]);

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const matchingHighwayFeatures = useMemo(() => {
    const query = deferredRouteSearch.trim().toLocaleLowerCase("th");
    if (!query) return allHighwayFeatures;
    return allHighwayFeatures.filter((item) =>
      [
        item.routeNo,
        item.sectionName,
        item.kmStart,
        item.kmEnd,
        item.responsibleOffice,
        item.highwayType === "MAIN_HIGHWAY" ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง",
      ].some((value) => String(value).toLocaleLowerCase("th").includes(query))
    );
  }, [allHighwayFeatures, deferredRouteSearch]);

  const matchingHighwayGroups = useMemo(() => {
    const query = deferredRouteSearch.trim().toLocaleLowerCase("th");
    return highwaySectionGroups.filter((group) => {
      // 1. Visibility filter
      if (highwayFilterVisibility === "VISIBLE" && !group.isVisible) return false;
      if (highwayFilterVisibility === "HIDDEN" && group.isVisible) return false;

      // 2. Highway Type filter
      if (highwayFilterType === "MAIN" && group.highwayType !== "MAIN_HIGHWAY") return false;
      if (highwayFilterType === "SECONDARY" && group.highwayType !== "SECOND_HIGHWAY") return false;

      // 3. Responsible Office filter
      if (highwayFilterOffice !== "ALL" && group.responsibleOffice !== highwayFilterOffice) return false;

      // 4. Text Search
      if (!query) return true;
      const fields = [
        group.routeNo,
        group.sectionName,
        group.kmStart,
        group.kmEnd,
        group.responsibleOffice,
        group.highwayType === "MAIN_HIGHWAY" ? "ทางหลวงสายหลัก" : "ทางหลวงสายรอง",
        ...group.branches.map((b) => b.branchLabel),
      ];
      return fields.some((val) => String(val).toLocaleLowerCase("th").includes(query));
    });
  }, [highwaySectionGroups, deferredRouteSearch, highwayFilterVisibility, highwayFilterType, highwayFilterOffice]);

  // Export Highway Specs CSV
  const handleExportHighwaySpecsCSV = () => {
    if (allHighwayFeatures.length === 0) {
      onToast("ไม่มีรายการทางหลวงสำหรับส่งออก");
      return;
    }
    const headers = [
      "ลำดับ",
      "การแสดงผลบนแผนที่",
      "หมายเลขทางหลวง",
      "ชื่อสายทาง_ตอนควบคุม",
      "กม_เริ่มต้น",
      "กม_สิ้นสุด",
      "ระยะทาง_กม",
      "จำนวนช่องจราจร",
      "ชนิดผิวจราจร",
      "หน่วยงานรับผิดชอบ",
      "ประเภททางหลวง",
      "หมายเหตุ",
    ];
    const rows = allHighwayFeatures.map((item, idx) =>
      [
        idx + 1,
        item.isVisible ? "แสดง" : "ซ่อน",
        `"ทล.${item.routeNo}"`,
        `"${item.sectionName.replace(/"/g, '""')}"`,
        `"${item.kmStart}"`,
        `"${item.kmEnd}"`,
        item.lengthKm || "",
        `"${item.lanes}"`,
        `"${item.surface}"`,
        `"${item.responsibleOffice}"`,
        item.highwayType === "MAIN_HIGHWAY" ? "สายหลัก" : "สายรอง",
        `"${(item.remarks || "").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `DOH_Highway_Specifications_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast("ส่งออกบัญชีคุณสมบัติทางหลวง CSV สำเร็จ");
  };

  const handleExportHighwayGis = async (format: GisExportFormat) => {
    if (format === "csv") return handleExportHighwaySpecsCSV();
    const features = matchingHighwayFeatures.flatMap((item) => {
      const layer = (systemData.highwayLayers || []).find((candidate) => candidate.layer_id === item.layerId);
      const feature = layer?.geojson_data?.features?.[item.featureIdx];
      if (!feature?.geometry || feature.geometry.type !== "LineString") return [];
      return [{
        type: "Feature" as const,
        properties: {
          ...(feature.properties || {}),
          route_no: item.routeNo,
          section_name: item.sectionName,
          highway_type: item.highwayType,
          km_start: item.kmStart,
          km_end: item.kmEnd,
        },
        geometry: { type: "LineString" as const, coordinates: feature.geometry.coordinates },
      }];
    });
    if (!features.length) return onToast("ไม่มีแนวเส้นตามผลการค้นหาสำหรับส่งออก GIS");
    await exportLineFeatures(features, format, `highway-network-${new Date().toISOString().slice(0, 10)}`);
    onToast(`ส่งออก ${format.toUpperCase()} สำเร็จ`);
  };

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

  // Toggle Eye visibility for all features in a highway section group
  const handleToggleGroupVisibility = async (group: HighwaySectionGroup) => {
    const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === group.layerId);
    if (!layer || !layer.geojson_data?.features) return;

    try {
      const updatedGeojson = JSON.parse(JSON.stringify(layer.geojson_data));
      const targetVis = !group.isVisible;
      const branchIdxSet = new Set(group.branches.map((b) => b.featureIdx));

      updatedGeojson.features.forEach((feature: any, idx: number) => {
        if (branchIdxSet.has(idx) && feature?.properties) {
          feature.properties.is_visible = targetVis;
        }
      });

      const res = await updateHighwayLayerAction({
        layerId: group.layerId,
        geojsonData: updatedGeojson,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        onToast(
          `สลับการแสดงผล ทล.${group.routeNo} ${group.sectionName} เป็น ${targetVis ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"}`
        );
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาดในการเปลี่ยนการแสดงผล: " + e.message);
    }
  };

  // Delete all features belonging to a highway section group
  const handleDeleteHighwayGroup = (group: HighwaySectionGroup) => {
    showConfirmModal(
      "ยืนยันการลบตอนควบคุมสายทาง",
      `คุณต้องการลบตอนควบคุม [ทล.${group.routeNo} ${group.sectionName}] (ทั้งหมด ${group.branches.length} ฝั่งคันทาง) ออกจากโครงข่ายใช่หรือไม่?`,
      async () => {
        const layer = (systemData.highwayLayers || []).find((l) => l.layer_id === group.layerId);
        if (!layer || !layer.geojson_data?.features) return;
        try {
          const updatedGeojson = JSON.parse(JSON.stringify(layer.geojson_data));
          const branchIdxSet = new Set(group.branches.map((b) => b.featureIdx));
          updatedGeojson.features = updatedGeojson.features.filter((_: any, idx: number) => !branchIdxSet.has(idx));
          const res = await updateHighwayLayerAction({
            layerId: group.layerId,
            geojsonData: updatedGeojson,
          });
          if (res.success) {
            onDataRefresh(res.systemData);
            showSuccessModal("ลบสำเร็จ", `ลบตอนควบคุม [ทล.${group.routeNo} ${group.sectionName}] เรียบร้อยแล้ว`);
          }
        } catch (e: any) {
          onToast("เกิดข้อผิดพลาดในการลบ: " + e.message);
        }
      }
    );
  };

  return (
    <>
      {/* Highway Layers in System */}
      <div className="space-y-3">
        <h3 className="font-heading font-bold text-sm text-white">เลเยอร์โครงข่ายเดิมในระบบ</h3>
        <div className="space-y-2">
          {(systemData.highwayLayers || []).map((layer) => {
            const firstType = layer.geojson_data?.features?.[0]?.properties?.highway_type;
            const isMain =
              firstType === "MAIN_HIGHWAY" ||
              (firstType !== "SECOND_HIGHWAY" && layer.layer_id !== "SECOND_HIGHWAY");
            const layerColor = isMain
              ? lineStyles.primary?.color || "#1B5E20"
              : lineStyles.secondary?.color || "#0284c7";
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
                      รหัส: {layer.layer_id} • สี: {layerColor} • จำนวน {layer.geojson_data?.features?.length || 0}{" "}
                      สายทาง
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-heading font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> เปิดใช้งานบนแผนที่
                  </span>
                  <button
                    type="button"
                    aria-label={`ลบเลเยอร์โครงข่าย ${layer.layer_name}`}
                    onClick={() => handleDeleteHighwayLayer(layer.layer_id, layer.layer_name)}
                    title="ลบเลเยอร์โครงข่าย"
                    className="min-h-10 min-w-10 inline-flex items-center justify-center bg-slate-900 hover:bg-red-600 hover:text-white text-red-400 rounded-lg text-xs transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Individual Highway Specifications Table (Issue #13) */}
      <HighwaySpecificationsTableSection
        highwaySectionGroups={highwaySectionGroups}
        allHighwayFeatures={allHighwayFeatures}
        matchingHighwayGroups={matchingHighwayGroups}
        handleExportHighwayGis={handleExportHighwayGis}
        setEditingRouteSpecs={setEditingRouteSpecs}
        offices={offices}
        routeSearch={routeSearch}
        setRouteSearch={setRouteSearch}
        highwayFilterVisibility={highwayFilterVisibility}
        setHighwayFilterVisibility={setHighwayFilterVisibility}
        highwayFilterType={highwayFilterType}
        setHighwayFilterType={setHighwayFilterType}
        highwayFilterOffice={highwayFilterOffice}
        setHighwayFilterOffice={setHighwayFilterOffice}
        availableOffices={availableOffices}
        expandedGroupIds={expandedGroupIds}
        toggleGroupExpand={toggleGroupExpand}
        setSelectedRoute={setSelectedRoute}
        handleToggleGroupVisibility={handleToggleGroupVisibility}
        handleToggleFeatureVisibility={handleToggleFeatureVisibility}
        openGeometryEditor={openGeometryEditor}
        handleDeleteHighwayGroup={handleDeleteHighwayGroup}
        handleDeleteHighwayFeature={handleDeleteHighwayFeature}
      />
    </>
  );
}
