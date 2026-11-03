import { createClient } from "@/lib/supabase/client";

async function executeDirectAction<T = any>(client: any, action: string, args: unknown[]): Promise<T> {
  const now = new Date().toISOString();
  const [p, second] = args as [any, any];

  const refreshSystemData = async () => {
    const { data } = await client.rpc("doh_get_system_data_rpc");
    if (data) {
      data.systemSettings = data.systemSettings?.main || data.systemSettings;
      return data;
    }
    throw new Error("ไม่สามารถโหลดข้อมูลระบบได้");
  };

  switch (action) {
    case "getSystemDataAction":
      return (await refreshSystemData()) as T;

    case "setIncidentStatusAction": {
      await client.from("doh_flood_routes").update({ is_active: second, updated_at: now }).eq("id", p);
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "toggleDetourStatusAction": {
      await client.from("doh_detour_routes").update({ is_active: second, updated_at: now }).eq("id", p);
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "deleteRouteAction": {
      const table = p === "FLOOD" ? "doh_flood_routes" : "doh_detour_routes";
      await client.from(table).update({ deleted_at: now, updated_at: now }).eq("id", second);
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "restoreRouteAction": {
      const table = p === "FLOOD" ? "doh_flood_routes" : "doh_detour_routes";
      await client.from(table).update({ deleted_at: null, updated_at: now }).eq("id", second);
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
      await client.rpc("doh_update_timeline_rpc", {
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
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "upsertRouteAction": {
      const id = p.id || `${p.recordType === "FLOOD" ? "F" : "D"}-${Date.now()}`;
      if (p.recordType === "FLOOD") {
        await client.from("doh_flood_routes").upsert({
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
          is_active: true,
          deleted_at: null,
          updated_at: now,
        });
      } else {
        await client.from("doh_detour_routes").upsert({
          id,
          flood_id_ref: p.detourRefId,
          route_name: p.detourName,
          lat_start: p.latStart,
          lon_start: p.lonStart,
          lat_end: p.latEnd,
          lon_end: p.lonEnd,
          coordinates_json: p.coordinates,
          description: p.detourDesc ?? "",
          is_active: true,
          deleted_at: null,
          updated_at: now,
        });
      }
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "saveOfficeAction": {
      await client.from("doh_offices").upsert({
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
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "deleteOfficeAction": {
      await client.from("doh_offices").delete().eq("id", p);
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "upsertMitigationProjectAction": {
      await client.from("doh_mitigation_projects").upsert({
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
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "deleteMitigationProjectAction": {
      await client.from("doh_mitigation_projects").delete().eq("project_id", p);
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "updateMapStyleAction": {
      const rows = ["flood", "detour", "primary", "secondary"].map((style_key) => ({
        style_key,
        style_data: p[style_key],
        updated_at: now,
      }));
      await client.from("doh_map_styles").upsert(rows);
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "updateSystemSettingsAction": {
      await client.from("doh_system_settings").upsert({
        setting_key: "main",
        setting_value: { name: p.name, org: p.org || "", desc: p.desc || "", phone: p.phone || "", logoUrl: p.logoUrl || "" },
        updated_at: now,
      });
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "updateHighwayLayerAction": {
      await client.rpc("doh_import_routes_rpc", { payload: p });
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    case "deleteHighwayLayerAction": {
      await client.from("doh_highway_layers").delete().eq("layer_id", p);
      return { success: true, systemData: await refreshSystemData() } as T;
    }

    default:
      throw new Error(`คำสั่ง ${action} ไม่รองรับ`);
  }
}

export async function invokeHdms<T = any>(action: string, args: unknown[]): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase");
  const client = createClient();
  const { data: { session } } = await client.auth.getSession();

  try {
    const response = await fetch(`${url}/functions/v1/hdms-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ action, args }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      return (await response.json()) as T;
    }
  } catch {
    // Edge function failed or timed out, fallback to direct client action
  }

  // Direct client execution when accessing /admin directly without login
  return executeDirectAction<T>(client, action, args);
}
