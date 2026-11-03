"use server";
import { supabaseServer } from "@/db/supabase-server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/require-admin";
import {
  INITIAL_SYSTEM_DATA,
  SystemDataPayload,
  FloodRoute,
  DetourRoute,
  TimelineUpdate,
  MitigationProject,
  DohOfficeLocation,
  MapLineStyleItem,
  SystemSettingsConfig,
} from "@/db/default-data";
import {
  getSystemDataFromSupabase,
  recordTimelineUpdateSupabase,
  upsertFloodRouteSupabase,
  upsertDetourRouteSupabase,
  deleteRouteSupabase,
  upsertMitigationProjectSupabase,
  deleteMitigationProjectSupabase,
  updateHighwayLayerSupabase,
  setIncidentStatusSupabase,
  setDetourStatusSupabase,
  updateMapStylesSupabase,
  upsertOfficeSupabase,
  deleteOfficeSupabase,
  updateSystemSettingsSupabase,
} from "@/db/supabase-server";


// Persistent in-memory cache for development resilience, fast rendering and offline fallback
let runtimeState: SystemDataPayload = JSON.parse(JSON.stringify(INITIAL_SYSTEM_DATA));
export async function restoreRouteAction(recordType: "FLOOD" | "DETOUR", id: string) {
  await requireAdmin();
  const table = recordType === "FLOOD" ? "doh_flood_routes" : "doh_detour_routes";
  const { data, error } = await supabaseServer.from(table).update({ deleted_at: null }).eq("id", id).select("id").single();
  if (error || !data) throw new Error("ไม่สามารถกู้คืนรายการได้");
  revalidatePath("/"); revalidatePath("/admin");
  return { success: true, systemData: await getSystemDataAction() };
}

export async function getDeletedRoutesAction() {
  await requireAdmin();
  const { data, error } = await supabaseServer.from("doh_flood_routes").select("id,route_no,section_name,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
  if (error) throw new Error("โหลดรายการที่ลบไม่สำเร็จ");
  return data || [];
}

export async function snapRouteAction(start: [number, number], end: [number, number]) {
  await requireAdmin();
  if ([start, end].some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)) throw new Error("พิกัดไม่ถูกต้อง");
  const { data, error } = await supabaseServer.rpc("doh_snap_line_rpc", { p_a_lng: start[0], p_a_lat: start[1], p_b_lng: end[0], p_b_lat: end[1], p_max_m: 250 });
  if (error) return null;
  return data?.found && data.geojson?.type === "LineString" ? data.geojson.coordinates as [number, number][] : null;
}

/**
 * ดึงข้อมูลทั้งระบบ 5 โครงสร้าง: จุดน้ำท่วม, ทางเลี่ยง, ไทม์ไลน์ระดับน้ำ, โครงการผู้ว่าฯ, เลเยอร์ทางหลวง
 */
export async function getSystemDataAction(): Promise<SystemDataPayload> {
  try {
    const cloudData = await getSystemDataFromSupabase();
    if (cloudData && Array.isArray(cloudData.floodRoutes)) {
      // Merge cloud data into runtimeState
      runtimeState = {
        ...cloudData,
        mapStyles: cloudData.mapStyles && Object.keys(cloudData.mapStyles).length > 0
          ? cloudData.mapStyles
          : runtimeState.mapStyles,
        systemSettings: cloudData.systemSettings && Object.keys(cloudData.systemSettings).length > 0
          ? cloudData.systemSettings
          : runtimeState.systemSettings,
      };
      return runtimeState;
    }
  } catch (err) {
    console.info("[DOH System] Serving resilient local state:", (err as Error).message);
  }

  return runtimeState;
}

/**
 * บันทึกรายงานสถานะระดับน้ำหน้างาน พร้อมภาพถ่ายและพิกัด GPS/UTM
 */
export async function saveTimelineUpdateAction(payload: {
  floodId: string;
  waterLevelCm: number;
  trafficStatus: "CLOSED" | "WARNING" | "PASSABLE";
  latitude: number;
  longitude: number;
  reporterName: string;
  remark: string;
  photoUrl?: string;
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  const timelineId = "TL-" + Date.now();
  const nowIso = new Date().toISOString();

  // 1. Persist to Supabase Database via Atomic RPC
  if (!(await recordTimelineUpdateSupabase({
    timelineId,
    floodId: payload.floodId,
    waterLevelCm: payload.waterLevelCm,
    trafficStatus: payload.trafficStatus,
    latitude: payload.latitude,
    longitude: payload.longitude,
    photoUrl: payload.photoUrl || "",
    reporterName: payload.reporterName,
    remark: payload.remark,
  }))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  // 2. Update runtime memory state
  const newTimeline: TimelineUpdate = {
    id: timelineId,
    flood_id_ref: payload.floodId,
    reported_at: nowIso,
    water_level_cm: payload.waterLevelCm,
    traffic_status: payload.trafficStatus,
    latitude: payload.latitude,
    longitude: payload.longitude,
    photo_url: payload.photoUrl || "",
    reporter_name: payload.reporterName,
    remark: payload.remark,
  };

  runtimeState.timelineUpdates.unshift(newTimeline);

  // Update target flood route in memory
  const targetRoute = runtimeState.floodRoutes.find((r) => r.id === payload.floodId);
  if (targetRoute) {
    const prevLevel = targetRoute.water_level_cm;
    const diff = payload.waterLevelCm - prevLevel;
    targetRoute.diff_cm = diff;
    targetRoute.trend = diff > 0 ? "RISING" : diff < 0 ? "FALLING" : "STEADY";
    targetRoute.water_level_cm = payload.waterLevelCm;
    targetRoute.traffic_status = payload.trafficStatus;
    if (payload.photoUrl) targetRoute.latest_photo_url = payload.photoUrl;
    targetRoute.updated_at = nowIso;
  }

  runtimeState.updatedAt = nowIso;
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * สร้างหรืออัปเดตเส้นทาง (น้ำท่วม หรือ ทางเลี่ยง)
 */
export async function upsertRouteAction(payload: {
  recordType: "FLOOD" | "DETOUR";
  id?: string;
  routeNo?: string;
  sectionName?: string;
  kmStart?: string;
  kmEnd?: string;
  latStart?: number;
  lonStart?: number;
  latEnd?: number;
  lonEnd?: number;
  coordinates?: [number, number][];
  waterLevelCm?: number;
  trafficStatus?: "CLOSED" | "WARNING" | "PASSABLE";
  latestPhotoUrl?: string;
  photoUrl?: string;
  detourAdvice?: string;
  detourRefId?: string;
  detourName?: string;
  detourDesc?: string;
  district?: string;
  subdistrict?: string;
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  const nowIso = new Date().toISOString();

  if (payload.recordType === "FLOOD") {
    const id = payload.id || "F-" + Date.now().toString().slice(-4);
    const existingIdx = runtimeState.floodRoutes.findIndex((r) => r.id === id);
    const existing = existingIdx > -1 ? runtimeState.floodRoutes[existingIdx] : null;

    const floodRecord: FloodRoute = {
      id,
      route_no: payload.routeNo || existing?.route_no || "42",
      section_name: payload.sectionName || existing?.section_name || "สายทางทั่วไป",
      km_start: payload.kmStart || existing?.km_start || "0+000",
      km_end: payload.kmEnd || existing?.km_end || "1+000",
      lat_start: payload.latStart ?? existing?.lat_start ?? 6.842,
      lon_start: payload.lonStart ?? existing?.lon_start ?? 101.242,
      lat_end: payload.latEnd ?? existing?.lat_end ?? 6.8485,
      lon_end: payload.lonEnd ?? existing?.lon_end ?? 101.268,
      coordinates_json: payload.coordinates ?? existing?.coordinates_json ?? [],
      water_level_cm: payload.waterLevelCm ?? existing?.water_level_cm ?? 30,
      traffic_status: payload.trafficStatus || existing?.traffic_status || "WARNING",
      latest_photo_url: payload.photoUrl || payload.latestPhotoUrl || existing?.latest_photo_url || "",
      is_active: true,
      updated_at: nowIso,
      district: payload.district || existing?.district,
      subdistrict: payload.subdistrict || existing?.subdistrict,
      detour_advice: payload.detourAdvice || existing?.detour_advice,
    };

    if (existingIdx > -1) {
      runtimeState.floodRoutes[existingIdx] = floodRecord;
    } else {
      runtimeState.floodRoutes.push(floodRecord);
    }

    // Persist to Supabase
    if (!(await upsertFloodRouteSupabase(floodRecord))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");
  } else {
    const id = payload.id || "D-" + Date.now().toString().slice(-4);
    const existingIdx = runtimeState.detourRoutes.findIndex((d) => d.id === id);
    const existing = existingIdx > -1 ? runtimeState.detourRoutes[existingIdx] : null;

    const detourRecord: DetourRoute = {
      id,
      flood_id_ref: payload.detourRefId || existing?.flood_id_ref || runtimeState.floodRoutes[0]?.id || "",
      route_name: payload.detourName || existing?.route_name || "เส้นทางเลี่ยงน้ำท่วม",
      lat_start: payload.latStart ?? existing?.lat_start ?? 6.7845,
      lon_start: payload.lonStart ?? existing?.lon_start ?? 101.178,
      lat_end: payload.latEnd ?? existing?.lat_end ?? 6.779,
      lon_end: payload.lonEnd ?? existing?.lon_end ?? 101.205,
      coordinates_json: payload.coordinates ?? existing?.coordinates_json ?? [],
      description: payload.detourDesc || existing?.description || "",
      is_active: true,
      updated_at: nowIso,
    };

    if (existingIdx > -1) {
      runtimeState.detourRoutes[existingIdx] = detourRecord;
    } else {
      runtimeState.detourRoutes.push(detourRecord);
    }

    // Persist to Supabase
    if (!(await upsertDetourRouteSupabase(detourRecord))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

    // ซิงก์คำแนะนำเส้นทางเลี่ยงไปยังจุดน้ำท่วมอ้างอิงอัตโนมัติ (เพื่อให้หน้าประชาชนแสดงผลทันที)
    if (detourRecord.flood_id_ref && detourRecord.description) {
      const linkedFlood = runtimeState.floodRoutes.find((f) => f.id === detourRecord.flood_id_ref);
      if (linkedFlood) {
        linkedFlood.detour_advice = detourRecord.description;
        if (!(await upsertFloodRouteSupabase(linkedFlood))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");
      }
    }
  }

  runtimeState.updatedAt = nowIso;
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * ลบเส้นทางน้ำท่วม หรือ ทางเลี่ยง
 */
export async function deleteRouteAction(
  recordType: "FLOOD" | "DETOUR",
  id: string
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  if (recordType === "FLOOD") {
    runtimeState.floodRoutes = runtimeState.floodRoutes.filter((r) => r.id !== id);
    if (!(await deleteRouteSupabase("doh_flood_routes", id))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");
  } else {
    runtimeState.detourRoutes = runtimeState.detourRoutes.filter((d) => d.id !== id);
    if (!(await deleteRouteSupabase("doh_detour_routes", id))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");
  }

  runtimeState.updatedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * เพิ่ม/แก้ไข โครงการแก้ไขปัญหาน้ำท่วม (รายงานผู้ว่าฯ)
 */
export async function upsertMitigationProjectAction(payload: {
  projectId?: string;
  routeNo: string;
  locationName: string;
  kmRange: string;
  statusGroup: "COMPLETED" | "PENDING_BUDGET";
  solutionDetail: string;
  budgetMb: number;
  beforeImageUrl?: string;
  afterImageUrl?: string;
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  const projectId = payload.projectId || "P-" + Date.now().toString().slice(-3);
  const existingIdx = runtimeState.mitigationProjects.findIndex((p) => p.project_id === projectId);

  const proj: MitigationProject = {
    project_id: projectId,
    route_no: payload.routeNo,
    location_name: payload.locationName,
    km_range: payload.kmRange,
    status_group: payload.statusGroup,
    solution_detail: payload.solutionDetail,
    budget_mb: payload.budgetMb,
    before_image_url: payload.beforeImageUrl || "",
    after_image_url: payload.afterImageUrl || "",
    updated_at: new Date().toISOString(),
  };

  if (existingIdx > -1) {
    runtimeState.mitigationProjects[existingIdx] = proj;
  } else {
    runtimeState.mitigationProjects.push(proj);
  }

  if (!(await upsertMitigationProjectSupabase(proj))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  runtimeState.updatedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * ลบโครงการแก้ไขปัญหาน้ำท่วม
 */
export async function deleteMitigationProjectAction(
  projectId: string
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  runtimeState.mitigationProjects = runtimeState.mitigationProjects.filter((p) => p.project_id !== projectId);
  if (!(await deleteMitigationProjectSupabase(projectId))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  runtimeState.updatedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * ปรับปรุงการตั้งค่าและชั้นข้อมูลเลเยอร์ทางหลวง (SHP/KML/GeoJSON)
 */
export async function updateHighwayLayerAction(payload: {
  layerId: string;
  layerName?: string;
  colorHex?: string;
  lineWidth?: number;
  geojsonData?: any;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  if (!(await updateHighwayLayerSupabase(payload))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");
  let layer = runtimeState.highwayLayers.find((l) => l.layer_id === payload.layerId);
  if (!layer) {
    layer = {
      layer_id: payload.layerId,
      layer_name: payload.layerName || payload.layerId,
      color_hex: payload.colorHex || "#1B5E20",
      line_width: payload.lineWidth || 4,
      geojson_data: payload.geojsonData || null,
      is_visible: true,
      metadata: payload.metadata || {},
    };
    runtimeState.highwayLayers.push(layer);
  } else {
    if (payload.layerName) layer.layer_name = payload.layerName;
    if (payload.colorHex) layer.color_hex = payload.colorHex;
    if (payload.lineWidth) layer.line_width = payload.lineWidth;
    if (payload.geojsonData) layer.geojson_data = payload.geojsonData;
    if (payload.metadata) layer.metadata = { ...(layer.metadata || {}), ...payload.metadata };
  }

  runtimeState.updatedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

export async function deleteHighwayLayerAction(
  layerId: string
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  runtimeState.highwayLayers = runtimeState.highwayLayers.filter((l) => l.layer_id !== layerId);
  const { deleteHighwayLayerSupabase } = await import("@/db/supabase-server");
  if (!(await deleteHighwayLayerSupabase(layerId))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  runtimeState.updatedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * เปลี่ยนสถานะเหตุการณ์: คืนสภาพปกติ (ซ่อน) หรือ เปิดเหตุการณ์ใหม่
 */
export async function setIncidentStatusAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  const flood = runtimeState.floodRoutes.find((r) => r.id === id);
  if (flood) {
    flood.is_active = isActive;
    flood.updated_at = new Date().toISOString();
  }

  if (!(await setIncidentStatusSupabase(id, isActive))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  runtimeState.updatedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * เปลี่ยนสถานะเส้นทางเลี่ยง: เปิดใช้งาน / ปิดใช้งานชั่วคราว
 */
export async function toggleDetourStatusAction(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  const detour = runtimeState.detourRoutes.find((d) => d.id === id);
  if (detour) {
    detour.is_active = isActive;
    detour.updated_at = new Date().toISOString();
  }

  if (!(await setDetourStatusSupabase(id, isActive))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  runtimeState.updatedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * บันทึกสไตล์เส้นและอนิเมชันของแผนที่ (สไตล์เส้นน้ำท่วม, ทางเลี่ยง, สายหลัก, สายรอง)
 */
export async function updateMapStyleAction(
  styles: Record<"flood" | "detour" | "primary" | "secondary", MapLineStyleItem>
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  runtimeState.mapStyles = styles;
  runtimeState.updatedAt = new Date().toISOString();

  if (!(await updateMapStylesSupabase(styles))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * บันทึก/อัปเดตหมุดสำนักงานและจุดบริการ (Offices & Service Points)
 */
export async function saveOfficeAction(
  office: DohOfficeLocation
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  if (!runtimeState.offices) runtimeState.offices = [];
  const idx = runtimeState.offices.findIndex((o) => o.id === office.id);
  if (idx !== -1) {
    runtimeState.offices[idx] = office;
  } else {
    runtimeState.offices.push(office);
  }
  runtimeState.updatedAt = new Date().toISOString();

  if (!(await upsertOfficeSupabase(office))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * ลบหมุดสำนักงาน
 */
export async function deleteOfficeAction(
  officeId: string
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  if (runtimeState.offices) {
    runtimeState.offices = runtimeState.offices.filter((o) => o.id !== officeId);
  }
  runtimeState.updatedAt = new Date().toISOString();

  if (!(await deleteOfficeSupabase(officeId))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}

/**
 * บันทึกการตั้งค่าระบบและหน่วยงาน (System & Branding Settings)
 */
export async function updateSystemSettingsAction(
  settings: SystemSettingsConfig
): Promise<{ success: boolean; systemData: SystemDataPayload }> {
  await requireAdmin();
  runtimeState.systemSettings = settings;
  runtimeState.updatedAt = new Date().toISOString();

  if (!(await updateSystemSettingsSupabase(settings))) throw new Error("บันทึกข้อมูลไม่สำเร็จ");

  revalidatePath("/");
  revalidatePath("/admin");
  return { success: true, systemData: runtimeState };
}
