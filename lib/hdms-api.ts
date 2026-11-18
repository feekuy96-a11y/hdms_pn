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
      // A direct fallback must retain the same public-only contract as the Edge
      // endpoint. Never fall through to an Admin RPC here: an Edge outage must
      // show a recoverable error, not expose Draft/inactive records.
      const { data, error } = await client.rpc("doh_get_public_system_data_display_rpc");
      if (!error && data && Array.isArray(data.floodRoutes)) {
        data.systemSettings = data.systemSettings?.main || data.systemSettings;
        return data as T;
      }
      throw new Error("ไม่สามารถโหลดข้อมูลสาธารณะได้ในขณะนี้");
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

    default:
      throw new Error(`คำสั่ง ${action} ไม่รองรับ`);
  }
}

// Saving or re-importing a highway layer sends a whole GeoJSON FeatureCollection and the server then
// rebuilds the system payload, so it needs far longer than a small edit. Aborting it early would also
// leave the admin unsure whether the save went through.
const HEAVY_ACTION_TIMEOUT_MS = 90_000;
const DEFAULT_ACTION_TIMEOUT_MS = 20_000;
const MEDIA_ACTION_TIMEOUT_MS = 35_000;
// Actions that only read. Every other action is a write: for those the app reloads the data itself
// afterwards, so it asks the server not to send the whole system payload back a second time.
const READ_ONLY_ACTIONS = new Set([
  "getSystemDataAction",
  "getPublicSystemDataAction",
  "getDeletedRoutesAction",
  "snapRouteAction",
  "reverseGeocodeGoogleAction",
  "computeGoogleDetourRouteAction",
]);

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
      signal: AbortSignal.timeout(
        action === "updateHighwayLayerAction"
          ? HEAVY_ACTION_TIMEOUT_MS
          : action === "uploadExternalMediaAction"
            ? MEDIA_ACTION_TIMEOUT_MS
            : DEFAULT_ACTION_TIMEOUT_MS
      ),
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
