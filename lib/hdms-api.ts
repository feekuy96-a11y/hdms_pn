import { createClient } from "@/lib/supabase/client";

async function executeDirectAction<T = any>(client: any, action: string, args: unknown[]): Promise<T> {
  const now = new Date().toISOString();
  const [p, second] = args as [any, any];

  const refreshSystemData = async () => {
    const { data, error } = await client.rpc("doh_get_system_data_rpc");
    if (error) throw error;
    if (data) {
      data.systemSettings = data.systemSettings?.main || data.systemSettings;
      return data;
    }
    throw new Error("ไม่สามารถโหลดข้อมูลระบบได้");
  };

  switch (action) {
    case "getSystemDataAction":
      return (await refreshSystemData()) as T;

    case "getPublicSystemDataAction": {
      // Light highway geometry when the display RPC exists, otherwise the normal full payload.
      const { data, error } = await client.rpc("doh_get_system_data_display_rpc");
      if (!error && data && Array.isArray(data.floodRoutes)) {
        data.systemSettings = data.systemSettings?.main || data.systemSettings;
        return data as T;
      }
      return (await refreshSystemData()) as T;
    }

    case "setIncidentStatusAction": {
      const { error } = await client.from("doh_flood_routes").update({ is_active: second, updated_at: now }).eq("id", p);
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "toggleDetourStatusAction": {
      const { error } = await client.from("doh_detour_routes").update({ is_active: second, updated_at: now }).eq("id", p);
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "deleteRouteAction": {
      const table = p === "FLOOD" ? "doh_flood_routes" : "doh_detour_routes";
      const { error } = await client.from(table).update({ deleted_at: now, updated_at: now }).eq("id", second);
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "restoreRouteAction": {
      const table = p === "FLOOD" ? "doh_flood_routes" : "doh_detour_routes";
      const { error } = await client.from(table).update({ deleted_at: null, updated_at: now }).eq("id", second);
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "getDeletedRoutesAction": {
      const { data } = await client.from("doh_flood_routes").select("id,route_no,section_name,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      return (data || []) as T;
    }

    case "snapRouteAction": {
      const { data } = await client.rpc("doh_snap_line_rpc", {
        p_a_lng: p[0], p_a_lat: p[1], p_b_lng: second[0], p_b_lat: second[1], p_max_m: 250,
      });
      return (data?.found && data.geojson?.type === "LineString" ? data.geojson.coordinates : null) as T;
    }

    case "saveTimelineUpdateAction": {
      const { error } = await client.rpc("doh_update_timeline_rpc", {
        payload: {
          timelineId: `TL-${Date.now()}`,
          floodId: p.floodId,
          waterLevelCm: p.waterLevelCm,
          trafficStatus: p.trafficStatus,
          latitude: p.latitude,
          longitude: p.longitude,
          photoUrl: p.photoUrl || "",
          reporterName: p.reporterName || "เจ้าหน้าที่",
          remark: p.remark || "",
        },
      });
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "upsertRouteAction": {
      const id = p.id || `${p.recordType === "FLOOD" ? "F" : "D"}-${Date.now()}`;
      if (p.recordType === "FLOOD") {
        const { error } = await client.from("doh_flood_routes").upsert({
          id,
          route_no: p.routeNo,
          section_name: p.sectionName,
          km_start: p.kmStart,
          km_end: p.kmEnd,
          lat_start: p.latStart,
          lon_start: p.lonStart,
          lat_end: p.latEnd,
          lon_end: p.lonEnd,
          coordinates_json: p.coordinates,
          water_level_cm: p.waterLevelCm ?? 0,
          traffic_status: p.trafficStatus ?? "WARNING",
          latest_photo_url: p.photoUrl ?? p.latestPhotoUrl ?? "",
          district: p.district ?? "",
          subdistrict: p.subdistrict ?? "",
          detour_advice: p.detourAdvice ?? "",
          is_active: typeof p.isActive === "boolean" ? p.isActive : true,
          deleted_at: null,
          updated_at: now,
        });
        if (error) throw error;
      } else {
        const { error } = await client.from("doh_detour_routes").upsert({
          id,
          flood_id_ref: p.detourRefId || null,
          route_name: p.detourName,
          lat_start: p.latStart,
          lon_start: p.lonStart,
          lat_end: p.latEnd,
          lon_end: p.lonEnd,
          coordinates_json: p.coordinates,
          description: p.detourDesc ?? "",
          is_active: typeof p.isActive === "boolean" ? p.isActive : true,
          deleted_at: null,
          updated_at: now,
        });
        if (error) throw error;
      }
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "saveOfficeAction": {
      const { error } = await client.from("doh_offices").upsert({
        id: p.id,
        name: p.name,
        type: p.type,
        address: p.address || "",
        phone: p.phone || "",
        lat: p.lat,
        lon: p.lon,
        is_active: p.is_active ?? true,
        updated_at: now,
      });
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "deleteOfficeAction": {
      const { error } = await client.from("doh_offices").delete().eq("id", p);
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "upsertMitigationProjectAction": {
      const { error } = await client.from("doh_mitigation_projects").upsert({
        project_id: p.projectId || `P-${Date.now()}`,
        route_no: p.routeNo,
        location_name: p.locationName,
        km_range: p.kmRange,
        status_group: p.statusGroup,
        solution_detail: p.solutionDetail,
        budget_mb: p.budgetMb,
        before_image_url: p.beforeImageUrl || "",
        after_image_url: p.afterImageUrl || "",
        updated_at: now,
      });
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "deleteMitigationProjectAction": {
      const { error } = await client.from("doh_mitigation_projects").delete().eq("project_id", p);
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "updateMapStyleAction": {
      const rows = ["flood", "detour", "primary", "secondary"].map((style_key) => ({
        style_key,
        style_data: p[style_key],
        updated_at: now,
      }));
      const { error } = await client.from("doh_map_styles").upsert(rows);
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "updateSystemSettingsAction": {
      const { error } = await client.from("doh_system_settings").upsert({
        setting_key: "main",
        setting_value: { name: p.name, org: p.org || "", desc: p.desc || "", phone: p.phone || "", logoUrl: p.logoUrl || "" },
        updated_at: now,
      });
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "updateHighwayLayerAction": {
      const { error } = await client.rpc("doh_import_routes_rpc", { payload: p });
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "deleteHighwayLayerAction": {
      const { error } = await client.from("doh_highway_layers").delete().eq("layer_id", p);
      if (error) throw error;
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    default:
      throw new Error(`คำสั่ง ${action} ไม่รองรับ`);
  }
}

// Saving or re-importing a highway layer sends a whole GeoJSON FeatureCollection and the server then
// rebuilds the system payload, so it needs far longer than a small edit. Aborting it early would also
// leave the admin unsure whether the save went through.
const HEAVY_ACTION_TIMEOUT_MS = 90_000;
const DEFAULT_ACTION_TIMEOUT_MS = 20_000;
// Actions that only read. Every other action is a write: for those the app reloads the data itself
// afterwards, so it asks the server not to send the whole system payload back a second time.
const READ_ONLY_ACTIONS = new Set(["getSystemDataAction", "getPublicSystemDataAction", "getDeletedRoutesAction", "snapRouteAction"]);

/** An HTTP error answered by the Edge Function (so callers can tell it apart from a network failure). */
export class HdmsHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HdmsHttpError";
    this.status = status;
  }
}

export async function invokeHdms<T = any>(action: string, args: unknown[]): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase");
  const client = createClient();
  const { data: { session } } = await client.auth.getSession();

  let response: Response;
  try {
    response = await fetch(`${url}/functions/v1/hdms-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(READ_ONLY_ACTIONS.has(action) ? { action, args } : { action, args, light: true }),
      signal: AbortSignal.timeout(action === "updateHighwayLayerAction" ? HEAVY_ACTION_TIMEOUT_MS : DEFAULT_ACTION_TIMEOUT_MS),
    });

  } catch {
    // Reads can fall back to the public RPC when the Edge endpoint is briefly
    // unavailable. Mutations must not be retried through a second transport:
    // a timeout can otherwise create a duplicate route while reporting an
    // ambiguous result to the administrator.
    if (action === "getSystemDataAction" || action === "getPublicSystemDataAction" || action === "snapRouteAction" || action === "getDeletedRoutesAction") {
      return executeDirectAction<T>(client, action, args);
    }
    throw new Error("ไม่สามารถเชื่อมต่อบริการบันทึกข้อมูลได้ โปรดลองอีกครั้ง");
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new HdmsHttpError(result.error || `ไม่สามารถดำเนินการได้ (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}
