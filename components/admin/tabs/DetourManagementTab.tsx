"use client";

import React, { useState } from "react";
import { DetourRoute, SystemDataPayload } from "@/db/default-data";
import {
  Signpost,
  Plus,
  FileText,
  Search,
  Trash2,
  Edit,
  Eye,
  CheckCircle2,
  XCircle,
  MapPin,
  Sparkles,
  ArrowRightLeft,
  Wand2,
  X,
  Save,
  Compass,
} from "lucide-react";
import {
  deleteRouteAction,
  toggleDetourStatusAction,
  upsertRouteAction,
} from "@/app/actions/doh-actions";
import {
  extractDirectionalAdvice,
  generateAutoDetourAdvice,
} from "@/lib/gis-utils";

interface DetourManagementTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  onEditDetourOnMap: (detourId: string) => void;
  onAddDetour: () => void;
  onFocusCoordinates?: (coords: [number, number]) => void;
}

export function DetourManagementTab({
  systemData,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  showErrorModal,
  onEditDetourOnMap,
  onAddDetour,
  onFocusCoordinates,
}: DetourManagementTabProps) {
  const [detourFilter, setDetourFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [floodFilter, setFloodFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Quick In-Modal Editor State
  const [editingDetour, setEditingDetour] = useState<DetourRoute | null>(null);
  const [editDetourName, setEditDetourName] = useState("");
  const [editDetourRefId, setEditDetourRefId] = useState("");
  const [editDetourDesc, setEditDetourDesc] = useState("");
  const [editDetourAdviceView, setEditDetourAdviceView] = useState<"FORWARD" | "REVERSE" | "COMBINED">("COMBINED");
  const [editIsActive, setEditIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const detourList = systemData.detourRoutes || [];
  const floodList = systemData.floodRoutes || [];

  const totalCount = detourList.length;
  const activeCount = detourList.filter((d) => d.is_active).length;
  const inactiveCount = totalCount - activeCount;

  // Filtered Detours
  const filteredDetours = detourList.filter((d) => {
    if (detourFilter === "ACTIVE" && !d.is_active) return false;
    if (detourFilter === "INACTIVE" && d.is_active) return false;
    if (floodFilter !== "ALL" && d.flood_id_ref !== floodFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const linkedFlood = floodList.find((f) => f.id === d.flood_id_ref);
      const matchName = d.route_name.toLowerCase().includes(q);
      const matchDesc = (d.description || "").toLowerCase().includes(q);
      const matchFlood =
        linkedFlood &&
        (linkedFlood.route_no.toLowerCase().includes(q) ||
          linkedFlood.section_name.toLowerCase().includes(q));
      return matchName || matchDesc || matchFlood;
    }
    return true;
  });

  // Toggle active status
  const handleToggleStatus = async (detourId: string, currentActive: boolean) => {
    try {
      const target = detourList.find((d) => d.id === detourId);
      if (!target) return;

      const nextActive = !currentActive;
      const res = await toggleDetourStatusAction(detourId, nextActive);

      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal(
          "อัปเดตสถานะเส้นทางเลี่ยงสำเร็จ",
          nextActive
            ? `เปิดใช้งาน [${target.route_name}] สำหรับประชาชนแล้ว`
            : `ปิดการใช้งาน [${target.route_name}] ชั่วคราวเรียบร้อย`
        );
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    }
  };

  // Open Quick Edit Modal
  const handleOpenEditModal = (d: DetourRoute) => {
    setEditingDetour(d);
    setEditDetourName(d.route_name);
    setEditDetourRefId(d.flood_id_ref || "");
    setEditDetourDesc(d.description || "");
    setEditIsActive(d.is_active !== false);
    setEditDetourAdviceView("COMBINED");
  };

  // Auto Generate Advice inside Modal
  const handleGenerateAdviceInModal = async () => {
    if (!editingDetour) return;
    const linkedFlood = floodList.find((f) => f.id === editDetourRefId);

    const advice = await generateAutoDetourAdvice([editingDetour.lon_start, editingDetour.lat_start], [editingDetour.lon_end, editingDetour.lat_end], typeof editingDetour.coordinates_json === "string" ? JSON.parse(editingDetour.coordinates_json) : editingDetour.coordinates_json, linkedFlood?.route_no || "43");

    setEditDetourDesc(advice);
    onToast("วิเคราะห์คำแนะนำการเดินทาง ๒ ทิศทางสำเร็จ");
  };

  // Save Detour from Modal
  const handleSaveModal = async () => {
    if (!editingDetour) return;
    if (!editDetourName.trim()) {
      onToast("กรุณาระบุชื่อเส้นทางเลี่ยง");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await upsertRouteAction({
        id: editingDetour.id,
        recordType: "DETOUR",
        detourName: editDetourName.trim(),
        detourRefId: editDetourRefId,
        detourDesc: editDetourDesc.trim(),
        latStart: editingDetour.lat_start,
        lonStart: editingDetour.lon_start,
        latEnd: editingDetour.lat_end,
        lonEnd: editingDetour.lon_end,
        coordinates: typeof editingDetour.coordinates_json === "string" ? JSON.parse(editingDetour.coordinates_json) : editingDetour.coordinates_json,
      });

      // Update active state if changed
      if (editIsActive !== editingDetour.is_active) {
        await toggleDetourStatusAction(editingDetour.id, editIsActive);
      }

      if (res.success) {
        onDataRefresh(res.systemData);
        setEditingDetour(null);
        showSuccessModal(
          "บันทึกข้อมูลเส้นทางเลี่ยงสำเร็จ",
          `ข้อมูล [${editDetourName}] ถูกจัดเก็บและอัปเดตลงระบบเรียบร้อย`
        );
      }
    } catch (err: any) {
      if (showErrorModal) {
        showErrorModal("เกิดข้อผิดพลาดในการบันทึก", err.message);
      } else {
        onToast("เกิดข้อผิดพลาด: " + err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Detour
  const handleDeleteDetour = (d: DetourRoute) => {
    showConfirmModal(
      "ยืนยันการลบเส้นทางเลี่ยง",
      `คุณต้องการลบ "${d.route_name}" ออกจากระบบอย่างถาวรใช่หรือไม่? ข้อมูลเส้นทางบนแผนที่จะถูกลบออกทันที`,
      async () => {
        try {
          const res = await deleteRouteAction("DETOUR", d.id);
          if (res.success) {
            onDataRefresh(res.systemData);
            showSuccessModal("ลบสำเร็จ", `ลบเส้นทางเลี่ยง ${d.route_name} เรียบร้อยแล้ว`);
          }
        } catch (e: any) {
          onToast("เกิดข้อผิดพลาด: " + e.message);
        }
      }
    );
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredDetours.length === 0) {
      onToast("ไม่มีข้อมูลเส้นทางเลี่ยงสำหรับส่งออก");
      return;
    }

    const headers = [
      "รหัสเส้นทางเลี่ยง",
      "ชื่อเส้นทางเลี่ยง",
      "รหัสจุดน้ำท่วมอ้างอิง",
      "หมายเลขทางหลวงน้ำท่วม",
      "ชื่อตอนควบคุมน้ำท่วม",
      "สถานะการใช้งาน",
      "คำแนะนำการเดินทาง",
      "พิกัดเริ่มต้น (Lat, Lon)",
      "พิกัดสิ้นสุด (Lat, Lon)",
      "จำนวนจุดพิกัดในเส้นทาง",
      "อัปเดตล่าสุด",
    ];

    const rows = filteredDetours.map((d) => {
      const linkedFlood = floodList.find((f) => f.id === d.flood_id_ref);
      return [
        `"${d.id}"`,
        `"${(d.route_name || "").replace(/"/g, '""')}"`,
        `"${d.flood_id_ref || ""}"`,
        `"${linkedFlood ? linkedFlood.route_no : ""}"`,
        `"${linkedFlood ? (linkedFlood.section_name || "").replace(/"/g, '""') : ""}"`,
        `"${d.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}"`,
        `"${(d.description || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
        `"${d.lat_start || ""}, ${d.lon_start || ""}"`,
        `"${d.lat_end || ""}, ${d.lon_end || ""}"`,
        `"${Array.isArray(d.coordinates_json) ? d.coordinates_json.length : 0}"`,
        `"${d.updated_at || ""}"`,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `DOH_Detour_Routes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast("ส่งออกข้อมูลเส้นทางเลี่ยง CSV เรียบร้อยแล้ว");
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <span className="text-[11px] text-slate-400 block font-heading">เส้นทางเลี่ยงทั้งหมด</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-amber-400 mt-0.5 block">
            {totalCount}
          </span>
          <span className="text-[10px] text-slate-400">โครงข่ายทางเลี่ยงในระบบ</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <span className="text-[11px] text-slate-400 block font-heading">เปิดใช้งาน (Active)</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-0.5 block">
            {activeCount}
          </span>
          <span className="text-[10px] text-emerald-500/80">แสดงบนแผนที่ประชาชน</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <span className="text-[11px] text-slate-400 block font-heading">ปิดชั่วคราว</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-slate-400 mt-0.5 block">
            {inactiveCount}
          </span>
          <span className="text-[10px] text-slate-400">ซ่อนจากการแสดงผล</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <span className="text-[11px] text-slate-400 block font-heading">ผูกกับจุดน้ำท่วม</span>
          <span className="text-xl sm:text-2xl font-bold font-mono text-sky-400 mt-0.5 block">
            {new Set(detourList.map((d) => d.flood_id_ref).filter(Boolean)).size}
          </span>
          <span className="text-[10px] text-sky-400/80">จุดวิกฤตที่มีเส้นทางเลี่ยง</span>
        </div>
      </div>

      {/* 2. Top Action Bar: Search, Filters & Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาเส้นทางเลี่ยง, ทล., ตอนควบคุม..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition"
            />
          </div>

          {/* Status Filter */}
          <select
            value={detourFilter}
            onChange={(e: any) => setDetourFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-400 font-heading"
          >
            <option value="ALL">สถานะทั้งหมด ({totalCount})</option>
            <option value="ACTIVE">เปิดใช้งาน ({activeCount})</option>
            <option value="INACTIVE">ปิดชั่วคราว ({inactiveCount})</option>
          </select>

          {/* Linked Flood Filter */}
          <select
            value={floodFilter}
            onChange={(e) => setFloodFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-400 font-heading max-w-[200px] truncate"
          >
            <option value="ALL">จุดน้ำท่วมทั้งหมด</option>
            {floodList.map((f) => (
              <option key={f.id} value={f.id}>
                ทล.{f.route_no} - {f.section_name}
              </option>
            ))}
          </select>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            className="bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-xl font-heading text-xs flex items-center gap-1.5 transition shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>ส่งออก CSV</span>
          </button>
          <button
            type="button"
            onClick={onAddDetour}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>วาดทางเลี่ยงใหม่บนแผนที่</span>
          </button>
        </div>
      </div>

      {/* 3. Detour Routes Data Table */}
      {filteredDetours.length === 0 ? (
        <div className="bg-slate-950 p-8 rounded-2xl border border-slate-800 text-center text-xs text-slate-400 space-y-2">
          <Signpost className="w-8 h-8 text-slate-600 mx-auto" />
          <p>ไม่พบรายการเส้นทางเลี่ยงที่ตรงกับเงื่อนไขการค้นหา</p>
          <button
            type="button"
            onClick={onAddDetour}
            className="text-amber-400 hover:underline font-heading font-bold inline-block"
          >
            + คลิกที่นี่เพื่อวาดเส้นทางเลี่ยงใหม่บนแผนที่
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#091122] text-slate-400 font-heading border-b border-slate-800">
              <tr>
                <th className="p-3 w-10 text-center">#</th>
                <th className="p-3 w-20 text-center">สถานะ</th>
                <th className="p-3 min-w-[180px]">ชื่อเส้นทางเลี่ยง</th>
                <th className="p-3 min-w-[160px]">ผูกกับจุดน้ำท่วม</th>
                <th className="p-3 min-w-[220px]">คำแนะนำการเดินทาง (ไป-กลับ)</th>
                <th className="p-3 w-24 text-center">พิกัด/โหนด</th>
                <th className="p-3 w-24 text-center">อัปเดต</th>
                <th className="p-3 text-right min-w-[140px]">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-body">
              {filteredDetours.map((item, idx) => {
                const linkedFlood = floodList.find((f) => f.id === item.flood_id_ref);
                const ext = extractDirectionalAdvice(item.description || "");
                const coordsCount = Array.isArray(item.coordinates_json) ? item.coordinates_json.length : 0;

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-900/60 transition ${
                      !item.is_active ? "opacity-50 bg-slate-950/40" : ""
                    }`}
                  >
                    <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>

                    {/* Status Toggle Switch */}
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item.id, item.is_active)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-heading font-bold border transition ${
                          item.is_active
                            ? "bg-emerald-950 text-emerald-300 border-emerald-600 hover:bg-emerald-900"
                            : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                        }`}
                        title={item.is_active ? "คลิกเพื่อปิดใช้งานชั่วคราว" : "คลิกเพื่อเปิดใช้งาน"}
                      >
                        {item.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
                      </button>
                    </td>

                    {/* Detour Name */}
                    <td className="p-3">
                      <div className="font-heading font-bold text-white text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        <span>{item.route_name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        รหัส: {item.id}
                      </div>
                    </td>

                    {/* Linked Flood Incident */}
                    <td className="p-3">
                      {linkedFlood ? (
                        <div>
                          <span className="bg-amber-400/20 text-amber-300 border border-amber-500/40 text-[10px] font-heading font-bold px-1.5 py-0.5 rounded">
                            ทล.{linkedFlood.route_no}
                          </span>
                          <span className="block text-[11px] text-slate-200 mt-1 truncate max-w-[160px]" title={linkedFlood.section_name}>
                            {linkedFlood.section_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">-- ไม่ได้ผูก --</span>
                      )}
                    </td>

                    {/* Directional Advice */}
                    <td className="p-3">
                      <div className="space-y-1">
                        {ext.hasBoth ? (
                          <>
                            <div className="text-[11px] text-amber-200 line-clamp-1" title={ext.forward}>
                              <span className="text-amber-400 font-bold">🚗 ขาไป:</span> {ext.forward}
                            </div>
                            <div className="text-[11px] text-sky-200 line-clamp-1" title={ext.reverse}>
                              <span className="text-sky-400 font-bold">🚙 ขากลับ:</span> {ext.reverse}
                            </div>
                          </>
                        ) : (
                          <div className="text-[11px] text-slate-300 line-clamp-2" title={item.description}>
                            {item.description || "-"}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Coordinates / Nodes */}
                    <td className="p-3 text-center font-mono text-[11px] text-slate-400">
                      <div>{coordsCount} จุด</div>
                      {item.lat_start && item.lon_start && (
                        <div className="text-[9px] text-slate-400">
                          {item.lat_start.toFixed(2)}, {item.lon_start.toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Updated At */}
                    <td className="p-3 text-center text-[10px] text-slate-400 whitespace-nowrap">
                      {item.updated_at ? new Date(item.updated_at).toLocaleDateString("th-TH") : "-"}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {/* Focus on map */}
                        {item.lat_start && item.lon_start && onFocusCoordinates && (
                          <button
                            type="button"
                            onClick={() => onFocusCoordinates([item.lon_start, item.lat_start])}
                            title="ซูมไปยังเส้นทางบนแผนที่"
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-700 transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Quick Edit Modal */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          title="แก้ไขรายละเอียด & คำแนะนำ"
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 transition"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Detour */}
                        <button
                          type="button"
                          onClick={() => handleDeleteDetour(item)}
                          title="ลบเส้นทางเลี่ยง"
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-600 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Modal: Quick Detour Editor */}
      {editingDetour && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0c162c] border border-amber-500/60 rounded-3xl p-5 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-heading font-black text-base text-white flex items-center gap-2">
                  <Signpost className="w-5 h-5 text-amber-400" />
                  <span>แก้ไขข้อมูลเส้นทางเลี่ยงน้ำท่วม</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  รหัส: {editingDetour.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingDetour(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-3.5 text-xs">
              {/* Row 1: Name & Linked Flood */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">ชื่อเส้นทางเลี่ยง *</label>
                  <input
                    type="text"
                    value={editDetourName}
                    onChange={(e) => setEditDetourName(e.target.value)}
                    placeholder="เช่น ทางเลี่ยง ทล.4092 สายหนองจิก - โคกโพธิ์"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-heading font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1">ผูกกับจุดน้ำท่วมอ้างอิง</label>
                  <select
                    value={editDetourRefId}
                    onChange={(e) => setEditDetourRefId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="">-- ไม่ระบุ --</option>
                    {floodList.map((f) => (
                      <option key={f.id} value={f.id}>
                        [{f.id}] ทล.{f.route_no} - {f.section_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Directional Advice Header & Switch Tabs */}
              <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5" />
                      <span>คำแนะนำเส้นทางเลี่ยงสำหรับประชาชน</span>
                    </label>
                    <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px] font-heading font-bold">
                      <button
                        type="button"
                        onClick={() => setEditDetourAdviceView("FORWARD")}
                        className={`px-2 py-0.5 rounded transition ${
                          editDetourAdviceView === "FORWARD"
                            ? "bg-amber-500 text-slate-950"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        🚗 ขาไป (A → B)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditDetourAdviceView("REVERSE")}
                        className={`px-2 py-0.5 rounded transition ${
                          editDetourAdviceView === "REVERSE"
                            ? "bg-amber-500 text-slate-950"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        🚙 ขากลับ (B → A)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditDetourAdviceView("COMBINED")}
                        className={`px-2 py-0.5 rounded transition ${
                          editDetourAdviceView === "COMBINED"
                            ? "bg-amber-500 text-slate-950"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        📋 ทั้ง ๒ ทิศทาง
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateAdviceInModal}
                    className="text-[10px] bg-amber-500 text-slate-950 font-heading font-bold px-2.5 py-1 rounded-lg shadow hover:bg-amber-400 flex items-center gap-1 shrink-0"
                  >
                    <Sparkles className="w-3 h-3" /> วิเคราะห์คำแนะนำอัตโนมัติ
                  </button>
                </div>

                <textarea
                  rows={8}
                  value={
                    editDetourAdviceView === "FORWARD"
                      ? extractDirectionalAdvice(editDetourDesc).forward
                      : editDetourAdviceView === "REVERSE"
                      ? extractDirectionalAdvice(editDetourDesc).reverse
                      : editDetourDesc
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (editDetourAdviceView === "FORWARD") {
                      const ext = extractDirectionalAdvice(editDetourDesc);
                      setEditDetourDesc(
                        `=== ทิศทางขาไป: จุด A → จุด B ===\n${val}\n\n=== ทิศทางขากลับ: จุด B → จุด A ===\n${ext.reverse}`
                      );
                    } else if (editDetourAdviceView === "REVERSE") {
                      const ext = extractDirectionalAdvice(editDetourDesc);
                      setEditDetourDesc(
                        `=== ทิศทางขาไป: จุด A → จุด B ===\n${ext.forward}\n\n=== ทิศทางขากลับ: จุด B → จุด A ===\n${val}`
                      );
                    } else {
                      setEditDetourDesc(val);
                    }
                  }}
                  placeholder="กรอกคำแนะนำการเดินทาง หรือกด 'วิเคราะห์คำแนะนำอัตโนมัติ'..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono leading-relaxed"
                />
              </div>

              {/* Row 3: Active Status Switch */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-heading font-bold text-white block">
                    สถานะการเปิดใช้งาน (Active Status)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    เปิดเพื่อให้เส้นทางเลี่ยงนี้ปรากฏบนแผนที่ของประชาชน
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Action Link to Redraw Path on Map */}
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-300 block font-heading">
                    ต้องการวาดหรือดัดแนวเส้นทางบนแผนที่?
                  </span>
                  <span className="text-[11px] text-slate-400">
                    สลับไปยังแท็บ &quot;จัดการแผนที่&quot; เพื่อลากหมุดและเกาะถนนจริง (Dual-Source Snapping)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const id = editingDetour.id;
                    setEditingDetour(null);
                    onEditDetourOnMap(id);
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 px-3 py-1.5 rounded-xl font-heading text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                >
                  <MapPin className="w-3.5 h-3.5 text-sky-400" />
                  <span>เปิดเครื่องมือวาดแผนที่</span>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingDetour(null)}
                className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveModal}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
