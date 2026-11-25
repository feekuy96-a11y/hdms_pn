"use client";

import React, { useEffect, useRef, useState } from "react";
import { type DetourPointPhoto, DetourRoute, SystemDataPayload } from "@/db/default-data";
import {
  buildDetourPointPhotoPayload,
  type DetourPointPhotoLocationInput,
} from "@/components/admin/tabs/map-management-helpers";
import {
  EMPTY_DETOUR_PHOTO_LOCATION,
  type DetourPhotoLocationState,
} from "@/components/admin/tabs/useMapRouteFormState";
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
  localArea,
} from "@/lib/gis-utils";
import {
  calculatePolylineRoadDistanceKm,
  detourDurationSeconds as readDetourDurationSeconds,
  sortDetoursByOrder,
} from "@/lib/detour-presentation";
import { parseFloodDirectionMeta } from "@/lib/flood-event-schema";
import { getLinkedEventsForDetour, type LinkedFloodEventEntry } from "@/lib/event-detour-links";
import { exportLineFeatures, GisExportFormat, parseLineCoordinates } from "@/lib/gis-export";
import { useModalAccessibility } from "@/components/ui/use-modal-accessibility";

export interface UseDetourManagementParams {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
}

export function useDetourManagement({
  systemData,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  showErrorModal,
}: UseDetourManagementParams) {
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
  const [editDetourStartPhotoLocation, setEditDetourStartPhotoLocation] =
    useState<DetourPhotoLocationState>(EMPTY_DETOUR_PHOTO_LOCATION);
  const [editDetourEndPhotoUrl, setEditDetourEndPhotoUrl] = useState("");
  const [editDetourEndPhotoCaption, setEditDetourEndPhotoCaption] = useState("");
  const [editDetourEndPhotoLocation, setEditDetourEndPhotoLocation] =
    useState<DetourPhotoLocationState>(EMPTY_DETOUR_PHOTO_LOCATION);
  const modalEditDetourIdRef = useRef<string | null>(null);
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

  const resolveEditPhotoDefaults = (
    d: DetourRoute,
    endpoint: "START" | "END",
    photo?: DetourPointPhoto
  ) => {
    const isStart = endpoint === "START";
    const setLoc = isStart ? setEditDetourStartPhotoLocation : setEditDetourEndPhotoLocation;
    const coords = parseLineCoordinates(d.coordinates_json);
    const fallbackLat = isStart
      ? Number(d.lat_start) || coords[0]?.[1] || 0
      : Number(d.lat_end) || coords[coords.length - 1]?.[1] || 0;
    const fallbackLon = isStart
      ? Number(d.lon_start) || coords[0]?.[0] || 0
      : Number(d.lon_end) || coords[coords.length - 1]?.[0] || 0;
    const hasSavedCoord =
      typeof photo?.lat === "number" &&
      typeof photo?.lon === "number" &&
      Number.isFinite(photo.lat) &&
      Number.isFinite(photo.lon) &&
      Math.abs(photo.lat) <= 90 &&
      Math.abs(photo.lon) <= 180 &&
      (photo.lat !== 0 || photo.lon !== 0);
    const targetLat = hasSavedCoord ? photo!.lat! : fallbackLat;
    const targetLon = hasSavedCoord ? photo!.lon! : fallbackLon;
    const validTarget =
      Number.isFinite(targetLat) &&
      Number.isFinite(targetLon) &&
      Math.abs(targetLat) <= 90 &&
      Math.abs(targetLon) <= 180 &&
      (targetLat !== 0 || targetLon !== 0);

    const savedSub = photo?.subdistrict?.trim() || "";
    const savedDist = photo?.district?.trim() || "";
    const savedProv = photo?.province?.trim() || "";
    const shouldPopulate = Boolean(photo?.url || hasSavedCoord || savedSub || savedDist || savedProv);

    if (!shouldPopulate || (!validTarget && !savedSub && !savedDist && !savedProv)) {
      setLoc(EMPTY_DETOUR_PHOTO_LOCATION);
      return;
    }

    setLoc({
      lat: validTarget ? targetLat.toFixed(6) : "",
      lon: validTarget ? targetLon.toFixed(6) : "",
      subdistrict: savedSub || (isStart ? d.subdistrict || "" : ""),
      district: savedDist || (isStart ? d.district || "" : ""),
      province: savedProv || (validTarget ? "ปัตตานี" : ""),
    });

    if (validTarget && (!savedSub || !savedDist)) {
      const targetId = d.id;
      void localArea(targetLon, targetLat).then((loc) => {
        if (modalEditDetourIdRef.current !== targetId) return;
        setLoc((prev) => ({
          ...prev,
          subdistrict: prev.subdistrict || loc.tambon || "",
          district: prev.district || loc.amphoe || "",
          province: prev.province || loc.province || "ปัตตานี",
        }));
      });
    }
  };

  // Open Quick Edit Modal
  const handleOpenEditModal = (d: DetourRoute) => {
    modalEditDetourIdRef.current = d.id;
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
    resolveEditPhotoDefaults(d, "START", d.detour_meta?.start_point_photo);
    setEditDetourEndPhotoUrl(d.detour_meta?.end_point_photo?.url || "");
    setEditDetourEndPhotoCaption(d.detour_meta?.end_point_photo?.caption || "");
    resolveEditPhotoDefaults(d, "END", d.detour_meta?.end_point_photo);
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
        if (editingDetour && !editDetourStartPhotoLocation.lat && !editDetourStartPhotoLocation.lon) {
          resolveEditPhotoDefaults(editingDetour, "START", { url: dataUrl });
        }
        onToast("แนบภาพบริเวณทางเข้าจุดเริ่มต้น (A) เรียบร้อย");
      } else {
        setEditDetourEndPhotoUrl(dataUrl);
        if (editingDetour && !editDetourEndPhotoLocation.lat && !editDetourEndPhotoLocation.lon) {
          resolveEditPhotoDefaults(editingDetour, "END", { url: dataUrl });
        }
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
  const handleSaveModal = async (photoLocations?: {
    start?: DetourPhotoLocationState;
    end?: DetourPhotoLocationState;
  }) => {
    if (!editingDetour) return;
    const overrideLocations =
      photoLocations && typeof photoLocations === "object" && ("start" in photoLocations || "end" in photoLocations)
        ? photoLocations
        : undefined;
    const effectiveStartPhotoLoc: DetourPointPhotoLocationInput =
      overrideLocations?.start ?? editDetourStartPhotoLocation;
    const effectiveEndPhotoLoc: DetourPointPhotoLocationInput =
      overrideLocations?.end ?? editDetourEndPhotoLocation;
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
        updatedDetourMeta.start_point_photo = buildDetourPointPhotoPayload({
          url: resolvedStartPhotoUrl,
          caption: editDetourStartPhotoCaption,
          location: effectiveStartPhotoLoc,
          existingPhoto: existingMeta.start_point_photo,
        });
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
        updatedDetourMeta.end_point_photo = buildDetourPointPhotoPayload({
          url: resolvedEndPhotoUrl,
          caption: editDetourEndPhotoCaption,
          location: effectiveEndPhotoLoc,
          existingPhoto: existingMeta.end_point_photo,
        });
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

  return {
    detourFilter,
    setDetourFilter,
    floodFilter,
    setFloodFilter,
    searchQuery,
    setSearchQuery,
    viewingDetour,
    setViewingDetour,
    viewingDetourDir,
    setViewingDetourDir,
    editingDetour,
    setEditingDetour,
    editDetourName,
    setEditDetourName,
    editDetourRefId,
    setEditDetourRefId,
    editDetourDesc,
    setEditDetourDesc,
    editDetourAdviceView,
    setEditDetourAdviceView,
    editDetourGoogleMapsUrlFwd,
    setEditDetourGoogleMapsUrlFwd,
    editDetourGoogleMapsUrlRev,
    setEditDetourGoogleMapsUrlRev,
    editDetourDurationMinFwd,
    setEditDetourDurationMinFwd,
    editDetourDurationMinRev,
    setEditDetourDurationMinRev,
    editDetourStartPhotoUrl,
    setEditDetourStartPhotoUrl,
    editDetourStartPhotoCaption,
    setEditDetourStartPhotoCaption,
    editDetourStartPhotoLocation,
    setEditDetourStartPhotoLocation,
    editDetourEndPhotoUrl,
    setEditDetourEndPhotoUrl,
    editDetourEndPhotoCaption,
    setEditDetourEndPhotoCaption,
    editDetourEndPhotoLocation,
    setEditDetourEndPhotoLocation,
    editDetourRoadCondition,
    setEditDetourRoadCondition,
    editIsActive,
    setEditIsActive,
    isSubmitting,
    reorderingId,
    selectedDetourIds,
    setSelectedDetourIds,
    exportScope,
    setExportScope,
    linkModalState,
    setLinkModalState,
    viewingDialog,
    editingDialog,
    autoTableRef,
    tableLayoutMode,
    detourList,
    floodList,
    totalCount,
    activeCount,
    inactiveCount,
    linkedEventsByDetourId,
    filteredDetours,
    getReorderSiblings,
    handleMoveDetourOrder,
    handleToggleStatus,
    handleOpenEditModal,
    handleEditPointPhotoUpload,
    handleGenerateAdviceInModal,
    handleSaveModal,
    handleDeleteDetour,
    handleExportCSV,
    handleExport,
  };
}
