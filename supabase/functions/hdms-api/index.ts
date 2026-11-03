import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const text = (value: unknown, label: string) => typeof value === "string" && value.trim() ? value.trim() : fail(`${label} required`);
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fail("Invalid numeric value");
const traffic = (value: unknown) => ["CLOSED", "WARNING", "PASSABLE"].includes(String(value)) ? value : fail("Invalid traffic status");
const typeTable = (type: unknown) => type === "FLOOD" ? "doh_flood_routes" : type === "DETOUR" ? "doh_detour_routes" : fail("Invalid record type");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 25 * 1024 * 1024) return reply({ error: "Request too large" }, 413);
    const { action, args = [] } = JSON.parse(raw);
    if (!Array.isArray(args)) fail("Invalid arguments");
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    // Public reads use the anon/publishable key. Mutations intentionally use the
    // server-only service role because this deployment is configured to allow
    // direct /admin access without a login session. Never expose serviceKey to
    // the browser or include it in a response.
    const mutation = action !== "getSystemDataAction";
    const db = createClient(url, mutation && serviceKey ? serviceKey : key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: !mutation && authorization ? { Authorization: authorization } : {} } });
    const check = async (query: PromiseLike<{ data: any; error: any }>) => {
      const { data, error } = await query;
      if (error) { console.error("Database operation failed", action, error.code); fail("Database operation failed", 400); }
      return data;
    };
    const system = async () => {
      const data = await check(db.rpc("doh_get_system_data_rpc"));
      if (!data || !Array.isArray(data.floodRoutes)) fail("Invalid system data", 502);
      data.systemSettings = data.systemSettings?.main || data.systemSettings;
      return data;
    };
    if (action === "getSystemDataAction") return reply(await system());
    if (mutation && !serviceKey) return reply({ error: "Server mutation key is not configured" }, 503);
    const [p, second] = args;
    const now = new Date().toISOString();
    const patch = async (table: string, id: string, changes: Record<string, unknown>, idColumn = "id") => {
      const data = await check(db.from(table).update(changes).eq(idColumn, text(id, "ID")).select(idColumn).single());
      if (!data) fail("Record not found", 404);
    };
    const remove = async (table: string, id: string, column: string) => {
      const data = await check(db.from(table).delete().eq(column, text(id, "ID")).select(column).single());
      if (!data) fail("Record not found", 404);
    };
    switch (action) {
      case "getDeletedRoutesAction": return reply(await check(db.from("doh_flood_routes").select("id,route_no,section_name,deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false })));
      case "restoreRouteAction": await patch(typeTable(p), second, { deleted_at: null, updated_at: now }); break;
      case "deleteRouteAction": await patch(typeTable(p), second, { deleted_at: now, updated_at: now }); break;
      case "setIncidentStatusAction":
      case "toggleDetourStatusAction":
        if (typeof second !== "boolean") fail("Boolean status required");
        await patch(action === "setIncidentStatusAction" ? "doh_flood_routes" : "doh_detour_routes", p, { is_active: second, updated_at: now }); break;
      case "snapRouteAction": {
        const coords = await check(db.rpc("doh_snap_line_rpc", { p_a_lng: number(p[0], -180, 180), p_a_lat: number(p[1], -90, 90), p_b_lng: number(second[0], -180, 180), p_b_lat: number(second[1], -90, 90), p_max_m: 250 }));
        return reply(coords?.found && coords.geojson?.type === "LineString" ? coords.geojson.coordinates : null);
      }
      case "saveTimelineUpdateAction":
        await check(db.rpc("doh_update_timeline_rpc", { payload: { timelineId: `TL-${crypto.randomUUID()}`, floodId: text(p.floodId, "Flood ID"), waterLevelCm: number(p.waterLevelCm, 0, 10000), trafficStatus: traffic(p.trafficStatus), latitude: number(p.latitude, -90, 90), longitude: number(p.longitude, -180, 180), photoUrl: p.photoUrl || "", reporterName: text(p.reporterName, "Reporter"), remark: p.remark || "" } })); break;
      case "upsertRouteAction": {
        const table = typeTable(p.recordType);
        const id = p.id || `${p.recordType === "FLOOD" ? "F" : "D"}-${crypto.randomUUID()}`;
        const existing = p.id ? await check(db.from(table).select("*").eq("id", id).is("deleted_at", null).maybeSingle()) || {} : {};
        const geometry = p.coordinates ?? existing.coordinates_json ?? [];
        if (!Array.isArray(geometry) || geometry.length < 2) fail("At least two route points required");
        geometry.forEach((point: any) => { number(point[0], -180, 180); number(point[1], -90, 90); });
        const row: Record<string, unknown> = { id, lat_start: number(p.latStart ?? existing.lat_start, -90, 90), lon_start: number(p.lonStart ?? existing.lon_start, -180, 180), lat_end: number(p.latEnd ?? existing.lat_end, -90, 90), lon_end: number(p.lonEnd ?? existing.lon_end, -180, 180), coordinates_json: geometry, is_active: existing.is_active ?? true, updated_at: now };
        if (p.recordType === "FLOOD") Object.assign(row, { route_no: text(p.routeNo ?? existing.route_no, "Route"), section_name: text(p.sectionName ?? existing.section_name, "Section"), km_start: text(p.kmStart ?? existing.km_start, "Start KM"), km_end: text(p.kmEnd ?? existing.km_end, "End KM"), water_level_cm: number(p.waterLevelCm ?? existing.water_level_cm ?? 0, 0, 10000), traffic_status: traffic(p.trafficStatus ?? existing.traffic_status ?? "WARNING"), latest_photo_url: p.photoUrl ?? p.latestPhotoUrl ?? existing.latest_photo_url ?? "", district: p.district ?? existing.district ?? "", subdistrict: p.subdistrict ?? existing.subdistrict ?? "", detour_advice: p.detourAdvice ?? existing.detour_advice ?? "" });
        else Object.assign(row, { flood_id_ref: text(p.detourRefId ?? existing.flood_id_ref, "Linked flood"), route_name: text(p.detourName ?? existing.route_name, "Detour name"), description: p.detourDesc ?? existing.description ?? "" });
        // The route RPC still enforces the legacy authenticated role policy in
        // some projects. Since this deployment intentionally runs login-free,
        // perform the validated upsert through the server-only service client.
        await check(db.from(table).upsert(row)); break;
      }
      case "upsertMitigationProjectAction":
        if (!["COMPLETED", "PENDING_BUDGET"].includes(p.statusGroup)) fail("Invalid project status");
        await check(db.from("doh_mitigation_projects").upsert({ project_id: p.projectId || `P-${crypto.randomUUID()}`, route_no: text(p.routeNo, "Route"), location_name: text(p.locationName, "Location"), km_range: text(p.kmRange, "KM"), status_group: p.statusGroup, solution_detail: text(p.solutionDetail, "Solution"), budget_mb: number(p.budgetMb, 0, 1e9), before_image_url: p.beforeImageUrl || "", after_image_url: p.afterImageUrl || "", updated_at: now })); break;
      case "deleteMitigationProjectAction": await remove("doh_mitigation_projects", p, "project_id"); break;
      case "updateHighwayLayerAction": await check(db.rpc("doh_import_routes_rpc", { payload: p })); break;
      case "deleteHighwayLayerAction": await remove("doh_highway_layers", p, "layer_id"); break;
      case "updateMapStyleAction": {
        const rows = ["flood", "detour", "primary", "secondary"].map((style_key) => ({ style_key, style_data: p[style_key], updated_at: now }));
        if (rows.some((row) => !row.style_data)) fail("All map styles required");
        await check(db.from("doh_map_styles").upsert(rows)); break;
      }
      case "saveOfficeAction": await check(db.from("doh_offices").upsert({ id: text(p.id, "ID"), name: text(p.name, "Name"), type: text(p.type, "Type"), address: p.address || "", phone: p.phone || "", lat: number(p.lat, -90, 90), lon: number(p.lon, -180, 180), is_active: p.is_active ?? true, updated_at: now })); break;
      case "deleteOfficeAction": await remove("doh_offices", p, "id"); break;
      case "updateSystemSettingsAction": await check(db.from("doh_system_settings").upsert({ setting_key: "main", setting_value: { name: text(p.name, "Name"), org: p.org || "", desc: p.desc || "", phone: p.phone || "", logoUrl: p.logoUrl || "" }, updated_at: now })); break;
      default: return reply({ error: "Unknown operation" }, 400);
    }
    return reply({ success: true, systemData: await system() });
  } catch (error: any) {
    return reply({ error: error.status ? error.message : "Invalid request" }, error.status || 400);
  }
});
