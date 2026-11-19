"use client";

import React, { useEffect, useRef, useState } from "react";
import { AdviceText } from "@/components/AdviceText";
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
  Route,
  Clock,
  Camera,
  Navigation,
  ChevronUp,
  ChevronDown,
  Link2,
} from "lucide-react";
import { EventDetourLinkModal } from "@/components/admin/EventDetourLinkModal";
import {
  deleteRouteAction,
  toggleDetourStatusAction,
  uploadExternalMediaAction,
  upsertRouteAction,
} from "@/app/actions/doh-actions";
import {
  composeDirectionalAdvice,
  compressImageToAdaptiveBase64,
  extractDirectionalAdvice,
  extractDirectionalAdviceForEdit,
  generateAutoDetourAdvice,
  splitDetourAdviceByDirection,
} from "@/lib/gis-utils";
import { resolveDetourGoogleMapsNavigation } from "@/lib/detour-navigation";
import {
  calculatePolylineRoadDistanceKm,
  detourDurationSeconds as readDetourDurationSeconds,
  isDetourDirectionAllowed,
  sortDetoursByOrder,
} from "@/lib/detour-presentation";
import { normalizeMediaUrl, parseFloodDirectionMeta } from "@/lib/flood-event-schema";
import { getLinkedEventsForDetour, type LinkedFloodEventEntry } from "@/lib/event-detour-links";
import { exportLineFeatures, GisExportFormat, parseLineCoordinates } from "@/lib/gis-export";
import { DirectionSwitch } from "@/components/ui/DirectionSwitch";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";

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
  const [viewingDetour, setViewingDetour] = useState<DetourRoute | null>(null);
  const [viewingDetourDir, setViewingDetourDir] = useState<"FORWARD" | "REVERSE">("FORWARD");

  // Quick In-Modal Editor State
  const [editingDetour, setEditingDetour] = useState<DetourRoute | null>(null);
  const [editDetourName, setEditDetourName] = useState("");
  const [editDetourRefId, setEditDetourRefId] = useState("");
  const [editDetourDesc, setEditDetourDesc] = useState("");
  const [editDetourAdviceView, setEditDetourAdviceView] = useState<"FORWARD" | "REVERSE" | "COMBINED">("COMBINED");
  const [editDetourGoogleMapsUrlFwd, setEditDetourGoogleMapsUrlFwd] = useState("");
  const [editDetourGoogleMapsUrlRev, setEditDetourGoogleMapsUrlRev] = useState("");
  const [editDetourDurationMinFwd, setEditDetourDurationMinFwd] = useState("");
  const [editDetourDurationMinRev, setEditDetourDurationMinRev] = useState("");
  const [editDetourStartPhotoUrl, setEditDetourStartPhotoUrl] = useState("");
  const [editDetourStartPhotoCaption, setEditDetourStartPhotoCaption] = useState("");
  const [editDetourEndPhotoUrl, setEditDetourEndPhotoUrl] = useState("");
  const [editDetourEndPhotoCaption, setEditDetourEndPhotoCaption] = useState("");
  const [editDetourRoadCondition, setEditDetourRoadCondition] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [selectedDetourIds, setSelectedDetourIds] = useState<Set<string>>(() => new Set());
  const [exportScope, setExportScope] = useState<"FILTERED" | "ALL" | "SELECTED">("FILTERED");
  const [linkModalState, setLinkModalState] = useState<{
    mode: "BY_EVENT" | "BY_DETOUR";
    detourId?: string;
    eventId?: string;
  } | null>(null);
  const viewingDialog = useModalAccessibility(Boolean(viewingDetour), () => setViewingDetour(null));
  const editingDialog = useModalAccessibility(Boolean(editingDetour), () => setEditingDetour(null));
  const autoTableRef = useRef<HTMLDivElement | null>(null);
  const [tableLayoutMode, setTableLayoutMode] = useState<"cards" | "table" | null>(null);

  const detourList = systemData.detourRoutes || [];
  const floodList = systemData.floodRoutes || [];

  const totalCount = detourList.length;
  const activeCount = detourList.filter((d) => d.is_active).length;
  const inactiveCount = totalCount - activeCount;

  const linkedEventsByDetourId = React.useMemo(() => {
    const map = new Map<string, LinkedFloodEventEntry[]>();
    for (const d of detourList) {
      map.set(d.id, getLinkedEventsForDetour(d, systemData, { includeInactiveFloods: true }));
    }
    return map;
  }, [detourList, systemData]);

  // Filtered Detours sorted by explicit Admin order
  const filteredDetours = React.useMemo(() => {
    const matched = detourList.filter((d) => {
      if (detourFilter === "ACTIVE" && !d.is_active) return false;
      if (detourFilter === "INACTIVE" && d.is_active) return false;
      const linkedEvents = linkedEventsByDetourId.get(d.id) || [];
      if (floodFilter !== "ALL") {
        const matchesFlood =
          d.flood_id_ref === floodFilter ||
          linkedEvents.some((ev) => ev.floodRoutes.some((f) => f.id === floodFilter));
        if (!matchesFlood) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = d.route_name.toLowerCase().includes(q);
        const matchDesc = (d.description || "").toLowerCase().includes(q);
        const matchFlood = linkedEvents.some(
          (ev) =>
            ev.routeNo.toLowerCase().includes(q) ||
            ev.sectionName.toLowerCase().includes(q) ||
            ev.kmRangeLabel.toLowerCase().includes(q) ||
            ev.eventTitle.toLowerCase().includes(q)
        );
        return matchName || matchDesc || matchFlood;
      }
      return true;
    });
    return sortDetoursByOrder(matched, floodFilter !== "ALL" ? floodFilter : undefined);
  }, [detourList, linkedEventsByDetourId, detourFilter, floodFilter, searchQuery]);

  useEffect(() => {
    const el = autoTableRef.current;
    if (!el) return;
    const updateMode = (width: number) => {
      if (!width) return;
      setTableLayoutMode(width > 500 ? "table" : "cards");
    };
    updateMode(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) updateMode(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [filteredDetours.length]);

  // Sibling detours within the same flood scope (used for Up/Down reordering)
  const getReorderSiblings = (item: DetourRoute): DetourRoute[] => {
    const scopeKey = item.flood_id_ref || "";
    const siblings = filteredDetours.filter((d) => (d.flood_id_ref || "") === scopeKey);
    return sortDetoursByOrder(siblings, item.flood_id_ref || undefined);
  };

  const handleMoveDetourOrder = async (item: DetourRoute, direction: "UP" | "DOWN") => {
    if (reorderingId) return;
    const siblings = getReorderSiblings(item);
    const currentIndex = siblings.findIndex((d) => d.id === item.id);
    if (currentIndex === -1) return;
    const targetIndex = direction === "UP" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    setReorderingId(item.id);
    try {
      let latestRes: any = null;
      const scopeFloodId = item.flood_id_ref || undefined;
      for (let i = 0; i < reordered.length; i++) {
        const d = reordered[i];
        const nextOrder = i + 1;
        const prevOrder = scopeFloodId
          ? (d.detour_meta?.event_orders?.[scopeFloodId] ?? d.detour_meta?.order_index)
          : d.detour_meta?.order_index;
        if (prevOrder === nextOrder && d.id !== item.id && d.id !== siblings[targetIndex].id) {
          continue;
        }
        const linkedFlood = d.flood_id_ref ? floodList.find((f) => f.id === d.flood_id_ref) : undefined;
        const linkedEventId = linkedFlood
          ? parseFloodDirectionMeta(linkedFlood.direction_meta, linkedFlood).eventId
          : d.detour_meta?.eventId;
        const nextMeta: Record<string, any> = {
          ...(d.detour_meta || {}),
          order_index: nextOrder,
          ...(scopeFloodId
            ? {
              event_orders: {
                ...(d.detour_meta?.event_orders || {}),
                [scopeFloodId]: nextOrder,
              },
            }
            : {}),
          ...(linkedEventId ? { eventId: linkedEventId } : {}),
        };

        latestRes = await upsertRouteAction({
          id: d.id,
          recordType: "DETOUR",
          detourName: d.route_name,
          detourRefId: d.flood_id_ref || "",
          detourDesc: d.description || "",
          latStart: d.lat_start,
          lonStart: d.lon_start,
          latEnd: d.lat_end,
          lonEnd: d.lon_end,
          coordinates: typeof d.coordinates_json === "string" ? JSON.parse(d.coordinates_json) : d.coordinates_json,
          reverseCoordinates: typeof d.reverse_coordinates_json === "string" ? JSON.parse(d.reverse_coordinates_json) : d.reverse_coordinates_json,
          reverseWaypoints: typeof d.reverse_waypoints_json === "string" ? JSON.parse(d.reverse_waypoints_json) : d.reverse_waypoints_json,
          directionMode: d.direction_mode,
          detourMeta: nextMeta,
        });
      }
      if (latestRes?.success) {
        onDataRefresh(latestRes.systemData);
        onToast(`ปรับลำดับ "${item.route_name}" เป็นทางเลี่ยงที่ ${targetIndex + 1} เรียบร้อย`);
      }
    } catch (err: any) {
      onToast("ไม่สามารถบันทึกลำดับทางเลี่ยงได้: " + err.message);
    } finally {
      setReorderingId(null);
    }
  };

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
    setEditDetourGoogleMapsUrlFwd(d.detour_meta?.google_maps_url_forward || d.detour_meta?.google_maps_url || "");
    setEditDetourGoogleMapsUrlRev(d.detour_meta?.google_maps_url_reverse || "");
    const fwdSec = readDetourDurationSeconds(d.detour_meta, "FORWARD");
    const revSec = readDetourDurationSeconds(d.detour_meta, "REVERSE");
    setEditDetourDurationMinFwd(fwdSec ? String(Math.max(1, Math.round(fwdSec / 60))) : "");
    setEditDetourDurationMinRev(revSec ? String(Math.max(1, Math.round(revSec / 60))) : "");
    setEditDetourStartPhotoUrl(d.detour_meta?.start_point_photo?.url || "");
    setEditDetourStartPhotoCaption(d.detour_meta?.start_point_photo?.caption || "");
    setEditDetourEndPhotoUrl(d.detour_meta?.end_point_photo?.url || "");
    setEditDetourEndPhotoCaption(d.detour_meta?.end_point_photo?.caption || "");
    setEditDetourRoadCondition(d.detour_meta?.road_condition || "");
  };

  const handleEditPointPhotoUpload = async (
    target: "START" | "END",
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { dataUrl } = await compressImageToAdaptiveBase64(file, 250 * 1024);
      if (target === "START") {
        setEditDetourStartPhotoUrl(dataUrl);
        onToast("แนบภาพบริเวณทางเข้าจุดเริ่มต้น (A) เรียบร้อย");
      } else {
        setEditDetourEndPhotoUrl(dataUrl);
        onToast("แนบภาพบริเวณทางเข้าจุดสิ้นสุด (B) เรียบร้อย");
      }
    } catch {
      onToast("ไม่สามารถประมวลผลไฟล์ภาพได้ กรุณาลองใหม่");
    }
  };

  // Auto Generate Advice inside Modal
  const handleGenerateAdviceInModal = async () => {
    if (!editingDetour) return;
    const linkedFlood = floodList.find((f) => f.id === editDetourRefId);
    const forwardCoords = typeof editingDetour.coordinates_json === "string"
      ? JSON.parse(editingDetour.coordinates_json)
      : editingDetour.coordinates_json;
    const reverseCoords = typeof editingDetour.reverse_coordinates_json === "string"
      ? JSON.parse(editingDetour.reverse_coordinates_json)
      : editingDetour.reverse_coordinates_json;

    if (!["TWO_WAY", "FORWARD_ONLY", "REVERSE_ONLY"].includes(String(editingDetour.direction_mode || ""))) {
      onToast("ไม่สามารถสร้างคำแนะนำได้: ไม่พบค่าทิศทางเดินรถที่ถูกต้อง");
      return;
    }

    const parseCoordArray = (val: unknown): [number, number][] | undefined => {
      if (!val) return undefined;
      if (Array.isArray(val)) return val as [number, number][];
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    };

    const advice = await generateAutoDetourAdvice(
      [editingDetour.lon_start, editingDetour.lat_start],
      [editingDetour.lon_end, editingDetour.lat_end],
      forwardCoords,
      linkedFlood?.route_no || "43",
      systemData.highwayLayers || [],
      reverseCoords,
      editingDetour.direction_mode,
      {
        forwardWaypoints: parseCoordArray(editingDetour.detour_meta?.waypoints_json),
        reverseWaypoints: parseCoordArray(editingDetour.reverse_waypoints_json),
      }
    );

    setEditDetourDesc(advice);
    onToast("สร้างคำแนะนำการเดินทางตามทิศทางที่กำหนดสำเร็จ");
  };

  // Save Detour from Modal
  const handleSaveModal = async () => {
    if (!editingDetour) return;
    if (!editDetourName.trim()) {
      onToast("กรุณาระบุชื่อเส้นทางเลี่ยง");
      return;
    }

    if (!["TWO_WAY", "FORWARD_ONLY", "REVERSE_ONLY"].includes(String(editingDetour.direction_mode || ""))) {
      onToast("ไม่พบข้อมูลทิศทางเดินรถที่ถูกต้อง กรุณากำหนดทิศทางใหม่จากตัวแก้ไขแผนที่ก่อนบันทึก");
      return;
    }

    setIsSubmitting(true);
    try {
      const linkedFlood = floodList.find((f) => f.id === editDetourRefId);
      const linkedEventId = linkedFlood ? parseFloodDirectionMeta(linkedFlood.direction_meta, linkedFlood).eventId : undefined;
      const existingMeta = editingDetour.detour_meta || {};
      const sameFlood = (editingDetour.flood_id_ref || "") === (editDetourRefId || "");
      let resolvedOrder = existingMeta.order_index;
      if (editDetourRefId && existingMeta.event_orders && typeof existingMeta.event_orders[editDetourRefId] === "number") {
        resolvedOrder = existingMeta.event_orders[editDetourRefId];
      } else if (!sameFlood || typeof resolvedOrder !== "number") {
        const siblings = detourList.filter((d) => d.id !== editingDetour.id && (d.flood_id_ref || "") === (editDetourRefId || ""));
        let maxOrder = 0;
        siblings.forEach((d, i) => {
          const raw = (editDetourRefId && d.detour_meta?.event_orders?.[editDetourRefId]) ?? d.detour_meta?.order_index;
          const val = typeof raw === "number" && Number.isFinite(raw) ? raw : i + 1;
          if (val > maxOrder) maxOrder = val;
        });
        resolvedOrder = maxOrder + 1;
      }
      const updatedDetourMeta: Record<string, any> = {
        ...existingMeta,
        order_index: resolvedOrder,
        ...(editDetourRefId
          ? {
            event_orders: {
              ...(existingMeta.event_orders || {}),
              [editDetourRefId]: resolvedOrder,
            },
          }
          : {}),
        eventId: linkedEventId,
      };
      if (editDetourGoogleMapsUrlFwd.trim()) {
        updatedDetourMeta.google_maps_url_forward = editDetourGoogleMapsUrlFwd.trim();
        updatedDetourMeta.google_maps_url = editDetourGoogleMapsUrlFwd.trim();
      } else {
        delete updatedDetourMeta.google_maps_url_forward;
        delete updatedDetourMeta.google_maps_url;
      }
      if (editDetourGoogleMapsUrlRev.trim()) {
        updatedDetourMeta.google_maps_url_reverse = editDetourGoogleMapsUrlRev.trim();
      } else {
        delete updatedDetourMeta.google_maps_url_reverse;
      }
      if (editDetourRoadCondition.trim()) {
        updatedDetourMeta.road_condition = editDetourRoadCondition.trim();
      } else {
        delete updatedDetourMeta.road_condition;
      }

      const fwdCoordsParsed = typeof editingDetour.coordinates_json === "string"
        ? JSON.parse(editingDetour.coordinates_json)
        : editingDetour.coordinates_json;
      const revCoordsParsed = typeof editingDetour.reverse_coordinates_json === "string"
        ? JSON.parse(editingDetour.reverse_coordinates_json)
        : editingDetour.reverse_coordinates_json;
      const fwdPolyKm = calculatePolylineRoadDistanceKm(fwdCoordsParsed);
      const revPolyKm = calculatePolylineRoadDistanceKm(
        Array.isArray(revCoordsParsed) && revCoordsParsed.length >= 2 ? revCoordsParsed : fwdCoordsParsed
      );
      if (fwdPolyKm > 0) {
        updatedDetourMeta.forward_distance_km = fwdPolyKm;
        updatedDetourMeta.forward_distance_m = Math.round(fwdPolyKm * 1000);
      }
      if (revPolyKm > 0 && editingDetour.direction_mode !== "FORWARD_ONLY") {
        updatedDetourMeta.reverse_distance_km = revPolyKm;
        updatedDetourMeta.reverse_distance_m = Math.round(revPolyKm * 1000);
      }

      const parsedFwdMin = Number(editDetourDurationMinFwd);
      if (Number.isFinite(parsedFwdMin) && parsedFwdMin > 0) {
        updatedDetourMeta.forward_duration_min = Math.round(parsedFwdMin);
        updatedDetourMeta.forward_duration_s = Math.round(parsedFwdMin * 60);
      } else {
        delete updatedDetourMeta.forward_duration_min;
        delete updatedDetourMeta.forward_duration_s;
      }

      const parsedRevMin = Number(editDetourDurationMinRev);
      if (Number.isFinite(parsedRevMin) && parsedRevMin > 0) {
        updatedDetourMeta.reverse_duration_min = Math.round(parsedRevMin);
        updatedDetourMeta.reverse_duration_s = Math.round(parsedRevMin * 60);
      } else {
        delete updatedDetourMeta.reverse_duration_min;
        delete updatedDetourMeta.reverse_duration_s;
      }

      let resolvedStartPhotoUrl = editDetourStartPhotoUrl.trim();
      if (resolvedStartPhotoUrl.startsWith("data:")) {
        try {
          const uploadedStart = await uploadExternalMediaAction({
            dataUrl: resolvedStartPhotoUrl,
            fileName: `detour-start-${editingDetour.id}.webp`,
            ownerType: "DETOUR",
            ownerId: editingDetour.id,
          });
          resolvedStartPhotoUrl = uploadedStart.url;
        } catch {
          // Keep compressed dataUrl if staging endpoint is not mocked in offline/unit test
        }
      }
      if (resolvedStartPhotoUrl) {
        updatedDetourMeta.start_point_photo = {
          url: resolvedStartPhotoUrl,
          ...(editDetourStartPhotoCaption.trim() ? { caption: editDetourStartPhotoCaption.trim() } : {}),
        };
      } else {
        delete updatedDetourMeta.start_point_photo;
      }

      let resolvedEndPhotoUrl = editDetourEndPhotoUrl.trim();
      if (resolvedEndPhotoUrl.startsWith("data:")) {
        try {
          const uploadedEnd = await uploadExternalMediaAction({
            dataUrl: resolvedEndPhotoUrl,
            fileName: `detour-end-${editingDetour.id}.webp`,
            ownerType: "DETOUR",
            ownerId: editingDetour.id,
          });
          resolvedEndPhotoUrl = uploadedEnd.url;
        } catch {
          // Keep compressed dataUrl if staging endpoint is not mocked in offline/unit test
        }
      }
      if (resolvedEndPhotoUrl) {
        updatedDetourMeta.end_point_photo = {
          url: resolvedEndPhotoUrl,
          ...(editDetourEndPhotoCaption.trim() ? { caption: editDetourEndPhotoCaption.trim() } : {}),
        };
      } else {
        delete updatedDetourMeta.end_point_photo;
      }

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
        reverseCoordinates: typeof editingDetour.reverse_coordinates_json === "string" ? JSON.parse(editingDetour.reverse_coordinates_json) : editingDetour.reverse_coordinates_json,
        reverseWaypoints: typeof editingDetour.reverse_waypoints_json === "string" ? JSON.parse(editingDetour.reverse_waypoints_json) : editingDetour.reverse_waypoints_json,
        directionMode: editingDetour.direction_mode,
        detourMeta: updatedDetourMeta,
      });

      // Update active state if changed
      const finalResult = editIsActive !== editingDetour.is_active
        ? await toggleDetourStatusAction(editingDetour.id, editIsActive)
        : res;

      if (res.success && finalResult.success) {
        onDataRefresh(finalResult.systemData);
        setEditingDetour(null);
        showSuccessModal(
          "บันทึกข้อมูลเส้นทางเลี่ยงสำเร็จ",
          `ข้อมูล [${editDetourName}] ถูกจัดเก็บและอัปเดตลงระบบเรียบร้อย`
        );
      } else {
        onToast("บันทึกไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่");
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
  const exportRecords = () => exportScope === "ALL"
    ? detourList
    : exportScope === "SELECTED"
      ? detourList.filter((route) => selectedDetourIds.has(route.id))
      : filteredDetours;

  const handleExportCSV = (records = exportRecords()) => {
    if (records.length === 0) {
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

    const rows = records.map((d) => {
      const linkedEvents = linkedEventsByDetourId.get(d.id) || [];
      const legacyFlood = d.flood_id_ref ? floodList.find((f) => f.id === d.flood_id_ref) : undefined;
      const linkedFloodIds = Array.from(
        new Set(
          linkedEvents
            .flatMap((ev) => ev.floodRoutes.map((f) => f.id))
            .concat(d.flood_id_ref ? [d.flood_id_ref] : [])
        )
      ).join("; ");
      const routeNos =
        Array.from(new Set(linkedEvents.map((ev) => ev.routeNo).filter(Boolean))).join(", ") ||
        (legacyFlood ? legacyFlood.route_no : "");
      const sectionSummary =
        linkedEvents
          .map((ev) => `${ev.routeNo} ${ev.sectionName}${ev.kmRangeLabel ? ` ${ev.kmRangeLabel}` : ""}`.trim())
          .join(" | ") ||
        (legacyFlood ? legacyFlood.section_name || "" : "");

      return [
        `"${d.id}"`,
        `"${(d.route_name || "").replace(/"/g, '""')}"`,
        `"${linkedFloodIds.replace(/"/g, '""')}"`,
        `"${routeNos.replace(/"/g, '""')}"`,
        `"${sectionSummary.replace(/"/g, '""')}"`,
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

  const handleExport = async (format: GisExportFormat) => {
    const records = exportRecords();
    if (!records.length) return onToast(exportScope === "SELECTED" ? "กรุณาเลือกรายการก่อนส่งออก" : "ไม่มีข้อมูลเส้นทางเลี่ยงสำหรับส่งออก");
    if (format === "csv") return handleExportCSV();
    const features = records.map((route) => ({
      type: "Feature" as const,
      properties: {
        id: route.id, name: route.route_name, route_name: route.route_name,
        description: route.description, flood_id_ref: route.flood_id_ref || "",
        active: route.is_active, updated_at: route.updated_at,
      },
      geometry: { type: "LineString" as const, coordinates: parseLineCoordinates(route.coordinates_json) },
    })).filter((feature) => feature.geometry.coordinates.length >= 2);
    if (!features.length) return onToast("รายการตามตัวกรองไม่มีแนวเส้นสำหรับส่งออก GIS");
    await exportLineFeatures(features, format, `detours-${new Date().toISOString().slice(0, 10)}`);
    onToast(`ส่งออก ${format.toUpperCase()} สำเร็จ`);
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
            {new Set(Array.from(linkedEventsByDetourId.values()).flatMap((evs) => evs.map((e) => e.eventId))).size}
          </span>
          <span className="text-[10px] text-sky-400/80">เหตุการณ์ที่มีเส้นทางเลี่ยง</span>
        </div>
      </div>

      {/* 2. Top Action Bar: Search, Filters & Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search Input */}
          <div className="relative min-w-[180px] flex-1 basis-[210px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              aria-label="ค้นหาเส้นทางเลี่ยง"
              placeholder="ค้นหาเส้นทางเลี่ยง, ทล., ตอนควบคุม..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition"
            />
          </div>

          {/* Status Filter */}
          <select
            aria-label="กรองตามสถานะทางเลี่ยง"
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
            aria-label="กรองตามจุดน้ำท่วม"
            value={floodFilter}
            onChange={(e) => setFloodFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-400 font-heading max-w-[200px] truncate"
          >
            <option value="ALL">จุดน้ำท่วมทั้งหมด</option>
            {floodList.map((f) => (
              <option key={f.id} value={f.id}>
                ทล.{f.route_no} - {f.section_name} {f.is_active ? "(กำลังเกิดเหตุ)" : "(ปกติแล้ว)"}
              </option>
            ))}
          </select>
          {(detourFilter !== "ALL" || floodFilter !== "ALL" || searchQuery.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                setDetourFilter("ALL");
                setFloodFilter("ALL");
                setSearchQuery("");
              }}
              className="min-h-10 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 text-xs text-slate-300 hover:text-white transition cursor-pointer"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <button
            type="button"
            onClick={() => setLinkModalState({ mode: "BY_DETOUR" })}
            className="min-h-10 bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/50 font-heading font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>จัดการความสัมพันธ์ (หลายจุด)</span>
          </button>
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200">
            <FileText className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
            <select aria-label="ขอบเขตส่งออกทางเลี่ยง" value={exportScope} onChange={(e) => setExportScope(e.target.value as typeof exportScope)} className="min-h-10 max-w-28 bg-transparent font-heading outline-none">
              <option value="FILTERED">ตามตัวกรอง</option><option value="ALL">ทั้งหมด</option><option value="SELECTED">ที่เลือก</option>
            </select>
            <select aria-label="รูปแบบส่งออกทางเลี่ยง" defaultValue="" onChange={(e) => { if (e.target.value) void handleExport(e.target.value as GisExportFormat); e.target.value = ""; }} className="min-h-10 bg-transparent font-heading outline-none">
              <option value="" disabled>ส่งออก…</option>
              <option value="csv">CSV</option><option value="geojson">GeoJSON</option><option value="kml">KML</option><option value="kmz">KMZ</option><option value="shapefile">Shapefile ZIP</option>
            </select>
          </label>
          <button
            type="button"
            onClick={onAddDetour}
            className="min-h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
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
        <div ref={autoTableRef} className="doh-auto-table space-y-3">
          {/* Mobile Card View (จอแคบ / มือถือ / พื้นที่แสดงจริงแคบ) */}
          {tableLayoutMode !== "table" && <div className="doh-auto-table-cards block md:hidden space-y-3">
            {filteredDetours.map((item, idx) => {
              const linkedEvents = linkedEventsByDetourId.get(item.id) || [];
              const ext = extractDirectionalAdvice(item.description || "");
              const siblings = getReorderSiblings(item);
              const groupPos = siblings.findIndex((d) => d.id === item.id);
              const canMoveUp = groupPos > 0 && !reorderingId;
              const canMoveDown = groupPos >= 0 && groupPos < siblings.length - 1 && !reorderingId;

              return (
                <div
                  key={item.id}
                  onClick={() => setViewingDetour(item)}
                  className={`p-3.5 rounded-2xl border border-slate-800 bg-slate-950/80 shadow-md space-y-2.5 cursor-pointer hover:border-slate-700 transition ${!item.is_active ? "opacity-60" : ""
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`เลือกทางเลี่ยง ${item.route_name}`}
                        checked={selectedDetourIds.has(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setSelectedDetourIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          })
                        }
                        className="h-4 w-4 accent-amber-500 rounded"
                      />
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950" title="เส้นทางเลี่ยง">
                        <Route className="h-4 w-4" />
                      </span>
                      <span className="font-heading font-black text-sm text-white">{item.route_name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus(item.id, item.is_active);
                      }}
                      className={`min-h-9 px-2.5 py-1 rounded-full text-[10px] font-heading font-bold border whitespace-nowrap transition cursor-pointer ${item.is_active
                          ? "bg-emerald-950 text-emerald-300 border-emerald-600"
                          : "bg-slate-900 text-slate-400 border-slate-700"
                        }`}
                    >
                      {item.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-sky-300 font-medium">
                      {item.direction_mode === "FORWARD_ONLY"
                        ? "→ เฉพาะขาไป (A → B)"
                        : item.direction_mode === "REVERSE_ONLY"
                          ? "→ เฉพาะขากลับ (B → A)"
                          : "⇄ เดินรถ ๒ ทิศทาง (A ⇄ B)"}
                    </span>
                    {linkedEvents.map((ev) => (
                      <span
                        key={ev.eventId}
                        className="bg-amber-400/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.2 rounded font-bold"
                      >
                        ผูก ทล.{ev.routeNo} ({ev.sectionName}){ev.kmRangeLabel ? ` ${ev.kmRangeLabel}` : ""}
                      </span>
                    ))}
                  </div>

                  {ext.hasBoth ? (
                    <div className="text-[11px] space-y-1 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                      <div className="text-amber-200 line-clamp-1">
                        <strong className="text-amber-400">🚗 ขาไป:</strong> {ext.forward}
                      </div>
                      <div className="text-sky-200 line-clamp-1">
                        <strong className="text-sky-400">🚙 ขากลับ:</strong> {ext.reverse}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                      {item.description || "-"}
                    </p>
                  )}

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400 font-mono">
                      ลำดับที่ {groupPos + 1} · {Array.isArray(item.coordinates_json) ? item.coordinates_json.length : 0} จุดโหนด
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ขึ้น`}
                        disabled={!canMoveUp}
                        onClick={() => handleMoveDetourOrder(item, "UP")}
                        title="เลื่อนลำดับขึ้น"
                        className="min-h-9 px-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ลง`}
                        disabled={!canMoveDown}
                        onClick={() => handleMoveDetourOrder(item, "DOWN")}
                        title="เลื่อนลำดับลง"
                        className="min-h-9 px-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingDetour(item)}
                        className="min-h-10 px-2.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-100 font-heading font-bold text-xs hover:bg-slate-700"
                      >
                        รายละเอียด
                      </button>
                      <button
                        type="button"
                        aria-label={`ผูกหลายเหตุการณ์ ${item.route_name}`}
                        onClick={() => setLinkModalState({ mode: "BY_DETOUR", detourId: item.id })}
                        className="min-h-10 px-2.5 rounded-lg border border-sky-500/50 bg-sky-950/50 text-sky-300 font-heading font-bold text-xs hover:bg-sky-900 inline-flex items-center gap-1"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>ผูกหลายเหตุการณ์</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="min-h-10 px-3 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg font-heading font-bold text-xs border border-slate-700"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        aria-label={`ลบทางเลี่ยง ${item.route_name}`}
                        title="ลบเส้นทางเลี่ยง"
                        onClick={() => handleDeleteDetour(item)}
                        className="min-h-10 min-w-10 inline-flex items-center justify-center bg-red-950/60 text-red-400 hover:bg-red-900 rounded-lg border border-red-900/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>}

          {/* Desktop & Tablet Table View */}
          {tableLayoutMode !== "cards" && <div className="doh-auto-table-desktop hidden md:block overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 shadow-xl">
            <table className="w-full min-w-[880px] table-auto text-left text-xs text-slate-300">
              <thead className="bg-[#091122] text-slate-400 font-heading border-b border-slate-800">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 w-20 text-center whitespace-nowrap">สถานะ</th>
                  <th className="p-3 min-w-[170px] whitespace-nowrap">ชื่อเส้นทางเลี่ยง</th>
                  <th className="p-3 min-w-[150px] whitespace-nowrap">ผูกกับจุดน้ำท่วม</th>
                  <th className="p-3 min-w-[200px]">คำแนะนำการเดินทาง (ไป-กลับ)</th>
                  <th className="p-3 w-20 text-center whitespace-nowrap">พิกัด/โหนด</th>
                  <th className="p-3 w-20 text-center whitespace-nowrap">อัปเดต</th>
                  <th className="p-3 text-right min-w-[130px] whitespace-nowrap">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-body">
                {filteredDetours.map((item, idx) => {
                  const linkedEvents = linkedEventsByDetourId.get(item.id) || [];
                  const ext = extractDirectionalAdvice(item.description || "");
                  const coordsCount = Array.isArray(item.coordinates_json) ? item.coordinates_json.length : 0;
                  const siblings = getReorderSiblings(item);
                  const groupPos = siblings.findIndex((d) => d.id === item.id);
                  const canMoveUp = groupPos > 0 && !reorderingId;
                  const canMoveDown = groupPos >= 0 && groupPos < siblings.length - 1 && !reorderingId;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setViewingDetour(item)}
                      className={`hover:bg-slate-900/60 transition ${!item.is_active ? "opacity-50 bg-slate-950/40" : ""
                        }`}
                    >
                      <td className="p-3 text-center font-mono text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="checkbox"
                            aria-label={`เลือกทางเลี่ยง ${item.route_name}`}
                            checked={selectedDetourIds.has(item.id)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              setSelectedDetourIds((previous) => {
                                const next = new Set(previous);
                                if (event.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              })
                            }
                            className="h-4 w-4 accent-amber-500 rounded"
                          />
                          {idx + 1}
                        </div>
                      </td>

                      {/* Status Toggle Switch */}
                      <td className="p-3 text-center whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item.id, item.is_active)}
                          className={`min-h-9 px-2.5 py-1 rounded-full text-[10px] font-heading font-bold border whitespace-nowrap transition cursor-pointer ${item.is_active
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
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-slate-950" title="เส้นทางเลี่ยง">
                            <Route className="h-4 w-4" />
                          </span>
                          <div>
                            <span>{item.route_name}</span>
                            <span className="block text-[10px] font-normal text-sky-300 mt-0.5">
                              {item.direction_mode === "FORWARD_ONLY"
                                ? "→ เฉพาะขาไป (A → B)"
                                : item.direction_mode === "REVERSE_ONLY"
                                  ? "→ เฉพาะขากลับ (B → A)"
                                  : "⇄ เดินรถ ๒ ทิศทาง (A ⇄ B)"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Linked Flood Incident */}
                      <td className="p-3">
                        {linkedEvents.length > 0 ? (
                          <div className="space-y-1">
                            {linkedEvents.map((ev) => (
                              <div key={ev.eventId}>
                                <span className="bg-amber-400/20 text-amber-300 border border-amber-500/40 text-[10px] font-heading font-bold px-1.5 py-0.5 rounded">
                                  ทล.{ev.routeNo}
                                </span>
                                <span className="block text-[11px] text-slate-200 mt-0.5 truncate max-w-[180px]" title={`${ev.sectionName}${ev.kmRangeLabel ? ` ${ev.kmRangeLabel}` : ""}`}>
                                  {ev.sectionName}{ev.kmRangeLabel ? ` (${ev.kmRangeLabel})` : ""}
                                </span>
                              </div>
                            ))}
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
                      <td className="p-3 text-center font-mono text-[11px] text-slate-400 whitespace-nowrap">
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
                      <td className="p-3 text-right whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          {/* Move Order Up/Down */}
                          <button
                            type="button"
                            aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ขึ้น`}
                            disabled={!canMoveUp}
                            onClick={() => handleMoveDetourOrder(item, "UP")}
                            title={`เลื่อนลำดับขึ้น (ปัจจุบันลำดับที่ ${groupPos + 1})`}
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`เลื่อนทางเลี่ยง ${item.route_name} ลง`}
                            disabled={!canMoveDown}
                            onClick={() => handleMoveDetourOrder(item, "DOWN")}
                            title={`เลื่อนลำดับลง (ปัจจุบันลำดับที่ ${groupPos + 1})`}
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                          >
                            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          {/* Focus on map */}
                          {item.lat_start && item.lon_start && onFocusCoordinates && (
                            <button
                              type="button"
                              aria-label={`ซูมไปยังทางเลี่ยง ${item.route_name} บนแผนที่`}
                              onClick={() => onFocusCoordinates([item.lon_start, item.lat_start])}
                              title="ซูมไปยังเส้นทางบนแผนที่"
                              className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-700 transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}

                          {/* Link multiple events */}
                          <button
                            type="button"
                            aria-label={`ผูกหลายเหตุการณ์ ${item.route_name}`}
                            onClick={() => setLinkModalState({ mode: "BY_DETOUR", detourId: item.id })}
                            title="ผูกหลายเหตุการณ์ (Many-to-Many)"
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-700/60 transition cursor-pointer"
                          >
                            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          {/* Quick Edit Modal */}
                          <button
                            type="button"
                            aria-label="แก้ไข"
                            onClick={() => handleOpenEditModal(item)}
                            title="แก้ไขรายละเอียด & คำแนะนำ"
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 transition cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            aria-label={`ลบทางเลี่ยง ${item.route_name}`}
                            onClick={() => handleDeleteDetour(item)}
                            title="ลบเส้นทางเลี่ยง"
                            className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-600 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {viewingDetour && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/75 backdrop-blur-sm p-2 sm:items-center sm:p-4" onClick={() => setViewingDetour(null)}>
          <div ref={viewingDialog.dialogRef} role="dialog" aria-modal="true" aria-label="รายละเอียดเส้นทางเลี่ยง" tabIndex={-1} onKeyDown={viewingDialog.onKeyDown} className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl space-y-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-heading font-black text-white flex items-center gap-2">
                  <Signpost className="w-5 h-5 text-amber-400" />
                  <span>{viewingDetour.route_name}</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {viewingDetour.direction_mode === "FORWARD_ONLY" ? "เฉพาะขาไป (A → B)" : viewingDetour.direction_mode === "REVERSE_ONLY" ? "เฉพาะขากลับ (B → A)" : viewingDetour.direction_mode === "TWO_WAY" ? "เดินรถ ๒ ทิศทาง (A ⇄ B)" : "ไม่ระบุทิศทาง (ต้องตรวจสอบ)"}
                </p>
              </div>
              <button type="button" aria-label="ปิดรายละเอียด" onClick={() => setViewingDetour(null)} className="rounded-xl p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <dl className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <dt className="text-slate-400">สถานะการใช้งาน</dt>
                <dd className="font-bold text-white mt-0.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${viewingDetour.is_active ? "bg-emerald-950 text-emerald-300 border border-emerald-600" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                    {viewingDetour.is_active ? "เปิดใช้งาน" : "ปิดชั่วคราว"}
                  </span>
                </dd>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-slate-400">จุดน้ำท่วมที่ผูกไว้</dt>
                  <button
                    type="button"
                    onClick={() => {
                      const detourId = viewingDetour.id;
                      setViewingDetour(null);
                      setLinkModalState({ mode: "BY_DETOUR", detourId });
                    }}
                    className="text-[11px] font-heading font-bold text-sky-300 hover:text-sky-200 underline cursor-pointer"
                  >
                    จัดการความสัมพันธ์
                  </button>
                </div>
                <dd className="font-bold text-amber-300 mt-1 space-y-1">
                  {(() => {
                    const linkedEvents = linkedEventsByDetourId.get(viewingDetour.id) || [];
                    if (linkedEvents.length === 0) {
                      return "ทางเลี่ยงอิสระ (ไม่ผูกจุดน้ำท่วม)";
                    }
                    return linkedEvents.map((ev) => (
                      <div key={ev.eventId} className="text-xs text-amber-300">
                        • ทล.{ev.routeNo} {ev.sectionName}{ev.kmRangeLabel ? ` (${ev.kmRangeLabel})` : ""}
                      </div>
                    ));
                  })()}
                </dd>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono">
                <dt className="text-slate-400 font-sans">พิกัดจุด A (เริ่มต้น)</dt>
                <dd className="text-white mt-0.5">{viewingDetour.lat_start}, {viewingDetour.lon_start}</dd>
              </div>
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono">
                <dt className="text-slate-400 font-sans">พิกัดจุด B (สิ้นสุด)</dt>
                <dd className="text-white mt-0.5">{viewingDetour.lat_end}, {viewingDetour.lon_end}</dd>
              </div>
            </dl>

            {/* Lightweight SVG Route Shape Mini-Map Preview */}
            {(() => {
              const rawCoords =
                viewingDetourDir === "REVERSE" &&
                Array.isArray(viewingDetour.reverse_coordinates_json) &&
                viewingDetour.reverse_coordinates_json.length >= 2
                  ? viewingDetour.reverse_coordinates_json
                  : viewingDetour.coordinates_json;
              const coords = Array.isArray(rawCoords)
                ? rawCoords.filter(
                    (pt): pt is [number, number] =>
                      Array.isArray(pt) &&
                      pt.length >= 2 &&
                      Number.isFinite(Number(pt[0])) &&
                      Number.isFinite(Number(pt[1]))
                  )
                : [];
              if (coords.length < 2) return null;
              const lats = coords.map((c) => Number(c[0]));
              const lons = coords.map((c) => Number(c[1]));
              const minLat = Math.min(...lats);
              const maxLat = Math.max(...lats);
              const minLon = Math.min(...lons);
              const maxLon = Math.max(...lons);
              const spanLat = Math.max(0.0005, maxLat - minLat);
              const spanLon = Math.max(0.0005, maxLon - minLon);
              const W = 280;
              const H = 88;
              const PAD = 14;
              const toPt = (lat: number, lon: number) => {
                const x = PAD + ((lon - minLon) / spanLon) * (W - PAD * 2);
                const y = H - PAD - ((lat - minLat) / spanLat) * (H - PAD * 2);
                return [Number(x.toFixed(1)), Number(y.toFixed(1))];
              };
              const points = coords.map((c) => toPt(Number(c[0]), Number(c[1])));
              const polylineStr = points.map((p) => p.join(",")).join(" ");
              const startPt = points[0];
              const endPt = points[points.length - 1];
              return (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-2.5">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>พรีวิวรูปทรงแนวเส้นทาง ({viewingDetourDir === "FORWARD" ? "A → B" : "B → A"})</span>
                    <span className="font-mono">{coords.length} จุดพิกัด</span>
                  </div>
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="h-22 w-full rounded-lg bg-slate-900/90"
                    role="img"
                    aria-label={`แผนที่ย่อแนวเส้นทาง ${viewingDetour.route_name}`}
                  >
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={polylineStr}
                    />
                    <circle cx={startPt[0]} cy={startPt[1]} r="5" fill="#10b981" stroke="#0f172a" strokeWidth="1.5" />
                    <circle cx={endPt[0]} cy={endPt[1]} r="5" fill="#f43f5e" stroke="#0f172a" strokeWidth="1.5" />
                  </svg>
                </div>
              );
            })()}

            {/* Directional Tabs for Turn-by-Turn Advice */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-heading font-bold text-amber-300">คำแนะนำการเดินทางทีละขั้นตอน:</span>
                <DirectionSwitch
                  size="sm"
                  ariaLabel="เลือกทิศทางคำแนะนำการเดินทาง"
                  value={viewingDetourDir}
                  onChange={setViewingDetourDir}
                  options={[
                    {
                      value: "FORWARD",
                      label: "ขาไป (A → B)",
                      ariaLabel: "ขาไป A → B",
                      disabled: !isDetourDirectionAllowed(viewingDetour.direction_mode, "FORWARD"),
                    },
                    {
                      value: "REVERSE",
                      label: "ขากลับ (B → A)",
                      ariaLabel: "ขากลับ B → A",
                      disabled: !isDetourDirectionAllowed(viewingDetour.direction_mode, "REVERSE"),
                    },
                  ]}
                />
              </div>
              {(() => {
                const fwdKm = calculatePolylineRoadDistanceKm(viewingDetour.coordinates_json);
                const revKm = calculatePolylineRoadDistanceKm(
                  viewingDetour.reverse_coordinates_json || viewingDetour.coordinates_json
                );
                const polyKm = viewingDetourDir === "REVERSE" ? revKm : fwdKm;
                const durSec = readDetourDurationSeconds(viewingDetour.detour_meta, viewingDetourDir);
                const durMin = durSec ? Math.max(1, Math.round(durSec / 60)) : null;
                return (
                  <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Route className="w-3.5 h-3.5 text-amber-300" />
                      <span>ระยะทางตามแนวเส้น:</span>
                      <strong className="text-white font-mono">
                        {polyKm > 0 ? `${polyKm.toFixed(1)} กม.` : "ไม่ระบุ"}
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-300" />
                      <span>เวลาโดยประมาณ:</span>
                      <strong className="text-white font-mono">
                        {durMin ? `ประมาณ ${durMin} นาที` : "ยังไม่มีข้อมูลเวลาเดินทาง"}
                      </strong>
                    </span>
                  </div>
                );
              })()}
              {(() => {
                const ext = extractDirectionalAdvice(viewingDetour.description || "");
                const parsed = splitDetourAdviceByDirection(viewingDetour.description || "", viewingDetour.direction_mode);
                const adviceText =
                  ext.hasBoth && viewingDetour.direction_mode !== "FORWARD_ONLY" && viewingDetour.direction_mode !== "REVERSE_ONLY"
                    ? viewingDetourDir === "FORWARD"
                      ? [ext.forwardHeader, ext.forward].filter(Boolean).join("\n")
                      : [ext.reverseHeader, ext.reverse].filter(Boolean).join("\n")
                    : viewingDetourDir === "FORWARD"
                      ? parsed.forwardText
                      : parsed.reverseText;
                return (
                  <div className="rounded-xl border border-amber-500/20 bg-slate-950/80 p-3 text-xs text-amber-100/95 leading-relaxed max-h-48 overflow-y-auto font-sans">
                    {adviceText ? <AdviceText text={adviceText} /> : "ไม่มีคำแนะนำการเดินทางเฉพาะทิศทาง"}
                  </div>
                );
              })()}
            </div>

            {/* Google Maps Test Navigation */}
            {(() => {
              const nav = resolveDetourGoogleMapsNavigation(viewingDetour, viewingDetourDir, floodList);
              return (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-heading text-slate-300">
                      {nav.source === "APPROVED_URL" ? "✅ ใช้ลิงก์ที่เจ้าหน้าที่อนุมัติไว้" : "🧭 สร้างเส้นทางและจุดผ่านทางอัตโนมัติ"}
                    </span>
                    {nav.isValid && nav.url ? (
                      <a
                        href={nav.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-heading font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow transition"
                      >
                        <Navigation className="w-3.5 h-3.5" /> ทดสอบเปิด Google Maps ({viewingDetourDir === "FORWARD" ? "A → B" : "B → A"})
                      </a>
                    ) : (
                      <span className="text-xs text-rose-400 font-medium">⚠️ {nav.warning}</span>
                    )}
                  </div>
                  {nav.disclaimer && <p className="text-[10px] text-slate-400">{nav.disclaimer}</p>}
                </div>
              );
            })()}

            <div className="pt-3 border-t border-slate-800 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const item = viewingDetour;
                  setViewingDetour(null);
                  handleOpenEditModal(item);
                }}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-heading font-bold text-slate-950 transition"
              >
                แก้ไขข้อมูล
              </button>
              <button
                type="button"
                onClick={() => {
                  const item = viewingDetour;
                  setViewingDetour(null);
                  handleDeleteDetour(item);
                }}
                className="rounded-xl border border-rose-500/60 bg-rose-950/40 hover:bg-rose-900 px-4 py-2 text-xs font-heading font-bold text-rose-300 transition"
              >
                ลบทางเลี่ยง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Quick Detour Editor */}
      {editingDetour && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div ref={editingDialog.dialogRef} role="dialog" aria-modal="true" aria-label="แก้ไขข้อมูลเส้นทางเลี่ยง" tabIndex={-1} onKeyDown={editingDialog.onKeyDown} className="bg-[#0c162c] border border-amber-500/60 rounded-3xl p-5 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-heading font-black text-base text-white flex items-center gap-2">
                  <Signpost className="w-5 h-5 text-amber-400" />
                  <span>แก้ไขข้อมูลเส้นทางเลี่ยงน้ำท่วม</span>
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingDetour(null)}
                aria-label="ปิดหน้าต่างแก้ไขเส้นทางเลี่ยง"
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
                  <label htmlFor="edit-detour-name-input" className="text-slate-300 block mb-1">ชื่อเส้นทางเลี่ยง *</label>
                  <input
                    id="edit-detour-name-input"
                    type="text"
                    value={editDetourName}
                    onChange={(e) => setEditDetourName(e.target.value)}
                    placeholder="เช่น ทางเลี่ยง ทล.4092 สายหนองจิก - โคกโพธิ์"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-heading font-bold"
                  />
                </div>

                <div>
                  <label htmlFor="edit-detour-ref-select" className="text-slate-300 block mb-1">ผูกกับจุดน้ำท่วมอ้างอิง</label>
                  <select
                    id="edit-detour-ref-select"
                    value={editDetourRefId}
                    onChange={(e) => setEditDetourRefId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="">-- ไม่ระบุ --</option>
                    {floodList.map((f) => (
                      <option key={f.id} value={f.id}>
                        ทล.{f.route_no} - {f.section_name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-sky-300/90 leading-snug">
                    ช่องนี้เป็นจุดน้ำท่วมอ้างอิงเดิม (Legacy) การผูกหลายเหตุการณ์สามารถจัดการได้อย่างปลอดภัยผ่านปุ่ม &quot;จัดการความสัมพันธ์ (หลายจุด)&quot; โดยไม่ถูกหน้านี้เขียนทับ
                  </p>
                </div>
              </div>

              {/* Row 2: Directional Advice Header & Switch Tabs */}
              <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="edit-detour-advice-textarea" className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5" />
                      <span>คำแนะนำเส้นทางเลี่ยงสำหรับประชาชน</span>
                    </label>
                    <DirectionSwitch
                      size="sm"
                      ariaLabel="เลือกมุมมองทิศทางคำแนะนำ"
                      value={editDetourAdviceView}
                      onChange={setEditDetourAdviceView}
                      options={[
                        { value: "FORWARD", label: "ขาไป (A → B)", ariaLabel: "ขาไป A → B" },
                        { value: "REVERSE", label: "ขากลับ (B → A)", ariaLabel: "ขากลับ B → A" },
                        { value: "COMBINED", label: "ทั้ง ๒ ทิศทาง", ariaLabel: "ทั้ง ๒ ทิศทาง" },
                      ]}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateAdviceInModal}
                    className="text-[10px] bg-amber-500 text-slate-950 font-heading font-bold px-2.5 py-1 rounded-lg shadow hover:bg-amber-400 flex items-center gap-1 shrink-0"
                  >
                    <Sparkles className="w-3 h-3" /> วิเคราะห์คำแนะนำอัตโนมัติ
                  </button>
                </div>

                {(() => {
                  const editParts = extractDirectionalAdviceForEdit(editDetourDesc);
                  return (
                    <textarea
                      id="edit-detour-advice-textarea"
                      rows={8}
                      value={
                        editDetourAdviceView === "FORWARD"
                          ? editParts.forward
                          : editDetourAdviceView === "REVERSE"
                            ? editParts.reverse
                            : editDetourDesc
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (editDetourAdviceView === "FORWARD" || editDetourAdviceView === "REVERSE") {
                          const forwardText = editDetourAdviceView === "FORWARD" ? val : editParts.forward;
                          const reverseText = editDetourAdviceView === "REVERSE" ? val : editParts.reverse;
                          setEditDetourDesc(
                            composeDirectionalAdvice(
                              editParts.forwardHeader,
                              forwardText,
                              editParts.reverseHeader,
                              reverseText
                            )
                          );
                        } else {
                          setEditDetourDesc(val);
                        }
                      }}
                      placeholder="กรอกคำแนะนำการเดินทาง หรือกด 'วิเคราะห์คำแนะนำอัตโนมัติ'..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono leading-relaxed"
                    />
                  );
                })()}
              </div>

              {/* Row 2.2: Estimated Duration (Minutes) + Polyline Distance Preview */}
              {(() => {
                const fwdKm = calculatePolylineRoadDistanceKm(editingDetour.coordinates_json);
                const revKm = calculatePolylineRoadDistanceKm(
                  editingDetour.reverse_coordinates_json || editingDetour.coordinates_json
                );
                return (
                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-heading font-bold text-sky-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>เวลาเดินทางโดยประมาณสำหรับประชาชน (นาที)</span>
                      </span>
                      {fwdKm > 0 && (
                        <span className="text-[11px] text-amber-200 font-mono">
                          ระยะทางเส้นจริง: ขาไป {fwdKm.toFixed(1)} กม.
                          {editingDetour.direction_mode === "TWO_WAY" && revKm > 0 ? ` · ขากลับ ${revKm.toFixed(1)} กม.` : ""}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="edit-detour-duration-fwd" className="text-[11px] text-slate-300 block mb-1">
                          เวลาโดยประมาณ ขาไป (A → B) (นาที):
                        </label>
                        <input
                          id="edit-detour-duration-fwd"
                          type="number"
                          min={1}
                          max={1440}
                          step={1}
                          disabled={editingDetour.direction_mode === "REVERSE_ONLY"}
                          value={editDetourDurationMinFwd}
                          onChange={(e) => setEditDetourDurationMinFwd(e.target.value)}
                          placeholder="เช่น 25"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono disabled:opacity-40"
                        />
                      </div>
                      <div>
                        <label htmlFor="edit-detour-duration-rev" className="text-[11px] text-slate-300 block mb-1">
                          เวลาโดยประมาณ ขากลับ (B → A) (นาที):
                        </label>
                        <input
                          id="edit-detour-duration-rev"
                          type="number"
                          min={1}
                          max={1440}
                          step={1}
                          disabled={editingDetour.direction_mode === "FORWARD_ONLY"}
                          value={editDetourDurationMinRev}
                          onChange={(e) => setEditDetourDurationMinRev(e.target.value)}
                          placeholder="เช่น 25"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono disabled:opacity-40"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Row 2.4: Point A & Point B Entrance Photos */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-heading font-bold text-amber-300 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />
                    <span>ภาพทางเข้าเส้นทางเลี่ยงบนแผนที่ (จุดเริ่มต้น A / จุดสิ้นสุด B)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">แสดงหมุดกล้องบนแผนที่เมื่อคลิก</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-heading font-bold text-emerald-300">จุดเริ่มต้น A (ขาไป A → B)</span>
                      <label className="cursor-pointer rounded-md border border-emerald-700/70 bg-emerald-950/40 hover:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-heading font-bold text-emerald-200 transition">
                        {editDetourStartPhotoUrl ? "เปลี่ยนภาพ" : "+ แนบภาพจุดเริ่ม A"}
                        <input
                          type="file"
                          accept="image/*"
                          aria-label="แนบภาพจุดเริ่มต้น A"
                          className="sr-only"
                          onChange={(e) => handleEditPointPhotoUpload("START", e)}
                        />
                      </label>
                    </div>
                    {editDetourStartPhotoUrl && (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <img
                            src={normalizeMediaUrl(editDetourStartPhotoUrl)}
                            alt="ภาพทางเข้าจุดเริ่มต้น A"
                            className="h-24 w-full rounded-md object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditDetourStartPhotoUrl("");
                              setEditDetourStartPhotoCaption("");
                            }}
                            aria-label="ลบภาพจุดเริ่มต้น A"
                            className="absolute top-1 right-1 rounded-full bg-slate-950/90 p-1 text-rose-400 hover:bg-rose-950 hover:text-white border border-rose-500/40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <input
                          type="text"
                          aria-label="คำอธิบายภาพจุดเริ่มต้น A"
                          value={editDetourStartPhotoCaption}
                          onChange={(e) => setEditDetourStartPhotoCaption(e.target.value)}
                          placeholder="คำอธิบายทางเข้าจุดเริ่ม A..."
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
                        />
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-heading font-bold text-sky-300">จุดสิ้นสุด B (ขากลับ B → A)</span>
                      <label className="cursor-pointer rounded-md border border-sky-700/70 bg-sky-950/40 hover:bg-sky-900/60 px-2 py-0.5 text-[10px] font-heading font-bold text-sky-200 transition">
                        {editDetourEndPhotoUrl ? "เปลี่ยนภาพ" : "+ แนบภาพจุดสิ้นสุด B"}
                        <input
                          type="file"
                          accept="image/*"
                          aria-label="แนบภาพจุดสิ้นสุด B"
                          className="sr-only"
                          onChange={(e) => handleEditPointPhotoUpload("END", e)}
                        />
                      </label>
                    </div>
                    {editDetourEndPhotoUrl && (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <img
                            src={normalizeMediaUrl(editDetourEndPhotoUrl)}
                            alt="ภาพทางเข้าจุดสิ้นสุด B"
                            className="h-24 w-full rounded-md object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditDetourEndPhotoUrl("");
                              setEditDetourEndPhotoCaption("");
                            }}
                            aria-label="ลบภาพจุดสิ้นสุด B"
                            className="absolute top-1 right-1 rounded-full bg-slate-950/90 p-1 text-rose-400 hover:bg-rose-950 hover:text-white border border-rose-500/40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <input
                          type="text"
                          aria-label="คำอธิบายภาพจุดสิ้นสุด B"
                          value={editDetourEndPhotoCaption}
                          onChange={(e) => setEditDetourEndPhotoCaption(e.target.value)}
                          placeholder="คำอธิบายทางเข้าจุดสิ้นสุด B (ฝั่งขากลับ)..."
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2.5: Approved Google Maps Navigation URLs */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-heading font-bold text-emerald-400 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Google Maps URL ที่เจ้าหน้าที่ตรวจสอบและอนุมัติแล้ว (Optional)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">ถ้ามี จะใช้นำทางแทนการคำนวณอัตโนมัติ</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <span className="text-[11px] text-slate-300 block mb-1">ลิงก์ขาไป (A → B):</span>
                    <input
                      type="url"
                      value={editDetourGoogleMapsUrlFwd}
                      onChange={(e) => setEditDetourGoogleMapsUrlFwd(e.target.value)}
                      placeholder="https://maps.app.goo.gl/... หรือ Google Maps URL"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-300 block mb-1">ลิงก์ขากลับ (B → A):</span>
                    <input
                      type="url"
                      value={editDetourGoogleMapsUrlRev}
                      onChange={(e) => setEditDetourGoogleMapsUrlRev(e.target.value)}
                      placeholder="https://maps.app.goo.gl/... หรือ Google Maps URL"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Road Condition */}
              <div>
                <label className="text-slate-300 block mb-1">สภาพผิวทาง (Road Surface Condition)</label>
                <input
                  type="text"
                  value={editDetourRoadCondition}
                  onChange={(e) => setEditDetourRoadCondition(e.target.value)}
                  placeholder="เช่น ผิวทางลาดยาง สัญจรได้ตามปกติ หรือ ทางลูกรัง/หินคลุก"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
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

      <EventDetourLinkModal
        isOpen={Boolean(linkModalState)}
        initialMode={linkModalState?.mode || "BY_DETOUR"}
        initialEventId={linkModalState?.eventId}
        initialDetourId={linkModalState?.detourId}
        systemData={systemData}
        onDataRefresh={onDataRefresh}
        onClose={() => setLinkModalState(null)}
        onToast={onToast}
      />
    </div>
  );
}
