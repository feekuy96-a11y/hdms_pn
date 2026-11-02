import { createClient } from "@supabase/supabase-js";
import {
  SystemDataPayload,
  FloodRoute,
  DetourRoute,
  TimelineUpdate,
  MitigationProject,
  HighwayLayer,
  DohOfficeLocation,
  MapLineStyleItem,
  SystemSettingsConfig,
} from "./default-data";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://iiuearxdsbilcpsfzhyp.supabase.co";

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdWVhcnhkc2JpbGNwc2Z6aHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODAyMTksImV4cCI6MjEwNzM1NjIxOX0.NlmieOWIm9medTsUzHkQdEvUySj-tat4KwIDOsCVvxg";

if (typeof WebSocket === "undefined" && typeof globalThis !== "undefined") {
  (globalThis as any).WebSocket = class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly readyState = 3;
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };
}

export const supabaseServer = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * ดึงข้อมูลทั้งระบบ 5 โครงสร้างหลักจาก Supabase RPC doh_get_system_data_rpc()
 */
export async function getSystemDataFromSupabase(): Promise<SystemDataPayload | null> {
  try {
    const { data, error } = await supabaseServer.rpc("doh_get_system_data_rpc");
    if (error) {
      console.warn("[Supabase Server] RPC doh_get_system_data_rpc error:", error.message);
      return null;
    }
    if (data && Array.isArray(data.floodRoutes)) {
      return data as SystemDataPayload;
    }
    return null;
  } catch (err) {
    console.warn("[Supabase Server] Network error while calling getSystemDataFromSupabase:", (err as Error).message);
    return null;
  }
}

/**
 * บันทึกรายงานระดับน้ำหน้างานแบบ Atomic RPC
 */
export async function recordTimelineUpdateSupabase(payload: {
  timelineId: string;
  floodId: string;
  waterLevelCm: number;
  trafficStatus: string;
  latitude: number;
  longitude: number;
  photoUrl: string;
  reporterName: string;
  remark: string;
}): Promise<boolean> {
  try {
    const { error } = await supabaseServer.rpc("doh_update_timeline_rpc", { payload });
    if (error) {
      console.warn("[Supabase Server] doh_update_timeline_rpc error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Error in recordTimelineUpdateSupabase:", (err as Error).message);
    return false;
  }
}

/**
 * บันทึกหรืออัปเดตเส้นทางน้ำท่วม (doh_flood_routes)
 */
export async function upsertFloodRouteSupabase(route: FloodRoute): Promise<boolean> {
  try {
    const { error } = await supabaseServer.from("doh_flood_routes").upsert({
      id: route.id,
      route_no: route.route_no,
      section_name: route.section_name,
      km_start: route.km_start,
      km_end: route.km_end,
      lat_start: route.lat_start,
      lon_start: route.lon_start,
      lat_end: route.lat_end,
      lon_end: route.lon_end,
      coordinates_json: route.coordinates_json,
      water_level_cm: route.water_level_cm,
      traffic_status: route.traffic_status,
      latest_photo_url: route.latest_photo_url || "",
      district: route.district || "",
      subdistrict: route.subdistrict || "",
      detour_advice: route.detour_advice || "",
      is_active: route.is_active ?? true,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[Supabase Server] upsertFloodRoute error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in upsertFloodRoute:", (err as Error).message);
    return false;
  }
}

/**
 * บันทึกหรืออัปเดตเส้นทางเลี่ยง (doh_detour_routes)
 */
export async function upsertDetourRouteSupabase(route: DetourRoute): Promise<boolean> {
  try {
    const { error } = await supabaseServer.from("doh_detour_routes").upsert({
      id: route.id,
      flood_id_ref: route.flood_id_ref,
      route_name: route.route_name,
      lat_start: route.lat_start,
      lon_start: route.lon_start,
      lat_end: route.lat_end,
      lon_end: route.lon_end,
      coordinates_json: route.coordinates_json,
      description: route.description || "",
      is_active: route.is_active ?? true,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[Supabase Server] upsertDetourRoute error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in upsertDetourRoute:", (err as Error).message);
    return false;
  }
}

/**
 * ลบเส้นทางน้ำท่วมหรือทางเลี่ยง
 */
export async function deleteRouteSupabase(
  table: "doh_flood_routes" | "doh_detour_routes",
  id: string
): Promise<boolean> {
  try {
    const { error } = await supabaseServer.from(table).delete().eq("id", id);
    if (error) {
      console.warn(`[Supabase Server] delete ${table} error:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[Supabase Server] Network error deleting ${table}:`, (err as Error).message);
    return false;
  }
}

/**
 * บันทึกหรืออัปเดตโครงการผู้ว่าฯ (doh_mitigation_projects)
 */
export async function upsertMitigationProjectSupabase(proj: MitigationProject): Promise<boolean> {
  try {
    const { error } = await supabaseServer.from("doh_mitigation_projects").upsert({
      project_id: proj.project_id,
      route_no: proj.route_no,
      location_name: proj.location_name,
      km_range: proj.km_range,
      status_group: proj.status_group,
      solution_detail: proj.solution_detail,
      budget_mb: proj.budget_mb,
      before_image_url: proj.before_image_url || "",
      after_image_url: proj.after_image_url || "",
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[Supabase Server] upsertMitigationProject error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in upsertMitigationProject:", (err as Error).message);
    return false;
  }
}

/**
 * ลบโครงการผู้ว่าฯ
 */
export async function deleteMitigationProjectSupabase(projectId: string): Promise<boolean> {
  try {
    const { error } = await supabaseServer
      .from("doh_mitigation_projects")
      .delete()
      .eq("project_id", projectId);
    if (error) {
      console.warn("[Supabase Server] deleteMitigationProject error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in deleteMitigationProject:", (err as Error).message);
    return false;
  }
}

/**
 * อัปเดตเลเยอร์ทางหลวง (doh_highway_layers)
 */
export async function updateHighwayLayerSupabase(payload: {
  layerId: string;
  layerName?: string;
  colorHex?: string;
  lineWidth?: number;
  geojsonData?: any;
  metadata?: Record<string, any>;
}): Promise<boolean> {
  try {
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (payload.layerName !== undefined) updateData.layer_name = payload.layerName;
    if (payload.colorHex !== undefined) updateData.color_hex = payload.colorHex;
    if (payload.lineWidth !== undefined) updateData.line_width = payload.lineWidth;
    if (payload.geojsonData !== undefined) updateData.geojson_data = payload.geojsonData;
    if (payload.metadata !== undefined) updateData.metadata = payload.metadata;

    const { error } = await supabaseServer
      .from("doh_highway_layers")
      .upsert({
        layer_id: payload.layerId,
        layer_name: payload.layerName || payload.layerId,
        ...updateData,
      });

    if (error) {
      console.warn("[Supabase Server] updateHighwayLayer error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in updateHighwayLayer:", (err as Error).message);
    return false;
  }
}

/**
 * สลับสถานะเหตุการณ์น้ำท่วม (is_active)
 */
export async function setIncidentStatusSupabase(id: string, isActive: boolean): Promise<boolean> {
  try {
    const { error } = await supabaseServer
      .from("doh_flood_routes")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.warn("[Supabase Server] setIncidentStatus error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in setIncidentStatus:", (err as Error).message);
    return false;
  }
}

/**
 * บันทึกสไตล์เส้นแผนที่ (doh_map_styles)
 */
export async function updateMapStylesSupabase(
  styles: Record<"flood" | "detour" | "primary" | "secondary", MapLineStyleItem>
): Promise<boolean> {
  try {
    for (const [key, val] of Object.entries(styles)) {
      await supabaseServer.from("doh_map_styles").upsert({
        style_key: key,
        style_data: val,
        updated_at: new Date().toISOString(),
      });
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in updateMapStyles:", (err as Error).message);
    return false;
  }
}

/**
 * บันทึกหรืออัปเดตหมุดสำนักงาน/หมวดทางหลวง (doh_offices)
 */
export async function upsertOfficeSupabase(office: DohOfficeLocation): Promise<boolean> {
  try {
    const { error } = await supabaseServer.from("doh_offices").upsert({
      id: office.id,
      name: office.name,
      type: office.type,
      address: office.address || "",
      phone: office.phone || "",
      lat: office.lat,
      lon: office.lon,
      is_active: office.is_active ?? true,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[Supabase Server] upsertOffice error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in upsertOffice:", (err as Error).message);
    return false;
  }
}

/**
 * ลบหมุดสำนักงาน
 */
export async function deleteOfficeSupabase(id: string): Promise<boolean> {
  try {
    const { error } = await supabaseServer.from("doh_offices").delete().eq("id", id);
    if (error) {
      console.warn("[Supabase Server] deleteOffice error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in deleteOffice:", (err as Error).message);
    return false;
  }
}

/**
 * บันทึกการตั้งค่าระบบและหน่วยงาน (doh_system_settings)
 */
export async function updateSystemSettingsSupabase(settings: SystemSettingsConfig): Promise<boolean> {
  try {
    const { error } = await supabaseServer.from("doh_system_settings").upsert({
      setting_key: "main",
      setting_value: settings,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[Supabase Server] updateSystemSettings error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase Server] Network error in updateSystemSettings:", (err as Error).message);
    return false;
  }
}

