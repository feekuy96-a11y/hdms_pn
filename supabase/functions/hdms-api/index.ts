import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200, customHeaders?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, ...customHeaders } });
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const text = (value: unknown, label: string) => typeof value === "string" && value.trim() ? value.trim() : fail(`${label} required`);
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fail("Invalid numeric value");
const traffic = (value: unknown) => ["CLOSED", "WARNING", "PASSABLE", "LIGHT_VEHICLES_ONLY", "ONE_LANE"].includes(String(value)) ? value : fail("Invalid traffic status");
const roadSide = (value: unknown) => ["LEFT", "RIGHT", "BOTH", "UNKNOWN"].includes(String(value || "UNKNOWN")) ? String(value || "UNKNOWN") : "UNKNOWN";
const shoulder = (value: unknown) => ["NONE", "LEFT", "RIGHT", "BOTH", "AFFECTED", "UNKNOWN"].includes(String(value || "NONE")) ? String(value || "NONE") : "NONE";
const detourDir = (value: unknown) => {
  if (value === "TWO_WAY" || value === "FORWARD_ONLY" || value === "REVERSE_ONLY") return value;
  fail("Invalid detour direction; refusing to overwrite it with two-way", 422);
};
const typeTable = (type: unknown) => type === "FLOOD" ? "doh_flood_routes" : type === "DETOUR" ? "doh_detour_routes" : fail("Invalid record type");

const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const externalImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function googleDrivePublicImageUrl(fileId: string) {
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(fileId)}`;
}

function normalizeGoogleDriveImageUrl(value: unknown) {
  if (typeof value !== "string" || !value) return value;
  try {
    const url = new URL(value);
    if ((url.hostname === "drive.google.com" && url.pathname === "/uc") || url.hostname === "drive.usercontent.google.com") {
      const fileId = url.searchParams.get("id");
      if (fileId) return googleDrivePublicImageUrl(fileId);
    }
  } catch {
    // Preserve malformed or non-URL legacy values so the caller can show its normal fallback.
  }
  return value;
}

function normalizeSystemMediaUrls(data: any) {
  if (Array.isArray(data?.floodRoutes)) {
    data.floodRoutes = data.floodRoutes.map((route: any) => {
      const directionMeta = route?.direction_meta && typeof route.direction_meta === "object"
        ? {
            ...route.direction_meta,
            photos: Array.isArray(route.direction_meta.photos)
              ? route.direction_meta.photos.map((photo: any) => ({ ...photo, dataUrl: normalizeGoogleDriveImageUrl(photo?.dataUrl) }))
              : route.direction_meta.photos,
          }
        : route?.direction_meta;
      return { ...route, latest_photo_url: normalizeGoogleDriveImageUrl(route?.latest_photo_url), direction_meta: directionMeta };
    });
  }
  if (Array.isArray(data?.mitigationProjects)) {
    data.mitigationProjects = data.mitigationProjects.map((project: any) => ({
      ...project,
      before_image_url: normalizeGoogleDriveImageUrl(project?.before_image_url),
      after_image_url: normalizeGoogleDriveImageUrl(project?.after_image_url),
    }));
  }
  return data;
}

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function pemToBytes(pem: string) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function googleDriveAccessToken() {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replaceAll("\\n", "\n");
  if (!email || !privateKey) fail("Google Drive is not configured", 503);
  const now = Math.floor(Date.now() / 1000);
  const head = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({ iss: email, scope: GOOGLE_DRIVE_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3500 }));
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`)));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${base64Url(signature)}` }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) fail("Google Drive authorization failed", 502);
  const data = await response.json();
  if (typeof data.access_token !== "string") fail("Google Drive authorization failed", 502);
  return data.access_token;
}

function decodeImageDataUrl(value: unknown) {
  const raw = text(value, "Image data");
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(raw);
  if (!match || !externalImageTypes.has(match[1].toLowerCase())) fail("Unsupported image format", 422);
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength === 0 || bytes.byteLength > 500 * 1024) fail("Image must be 500 KB or smaller", 422);
  return { mimeType: match[1].toLowerCase(), bytes };
}

async function deleteGoogleDriveFile(fileId: string, accessToken?: string) {
  const token = accessToken || await googleDriveAccessToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok && response.status !== 404) fail("Google Drive cleanup failed", 502);
}

async function uploadImageToGoogleDrive(payload: any) {
  const { mimeType, bytes } = decodeImageDataUrl(payload.dataUrl);
  const folderId = text(Deno.env.get("GOOGLE_DRIVE_FOLDER_ID"), "Google Drive folder");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const safeName = typeof payload.fileName === "string" && /^[\p{L}\p{N} _.-]{1,120}$/u.test(payload.fileName)
    ? payload.fileName
    : `hdms-${crypto.randomUUID()}.${extension}`;
  const accessToken = await googleDriveAccessToken();
  const boundary = `hdms-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: safeName,
    parents: [folderId],
    mimeType,
    appProperties: {
      hdmsType: typeof payload.ownerType === "string" ? payload.ownerType.slice(0, 40) : "media",
      hdmsRecordId: typeof payload.ownerId === "string" ? payload.ownerId.slice(0, 120) : "pending",
    },
  });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--`,
  ]);
  const uploaded = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!uploaded.ok) fail("Google Drive upload failed", 502);
  const file = await uploaded.json();
  if (typeof file.id !== "string") fail("Google Drive upload failed", 502);
  const permission = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "anyone", role: "reader" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!permission.ok) {
    await deleteGoogleDriveFile(file.id, accessToken).catch(() => undefined);
    fail("Google Drive permission update failed", 502);
  }
  return { mediaId: file.id, url: googleDrivePublicImageUrl(file.id), mimeType, sizeBytes: bytes.byteLength, provider: "google-drive" };
}

function appsScriptConfigured() {
  return Boolean(Deno.env.get("APPS_SCRIPT_WEB_APP_URL") && Deno.env.get("APPS_SCRIPT_API_SECRET"));
}

async function callAppsScript(action: string, payload: Record<string, unknown>, timeoutMs = 20_000) {
  const endpoint = text(Deno.env.get("APPS_SCRIPT_WEB_APP_URL"), "Apps Script URL");
  const secret = text(Deno.env.get("APPS_SCRIPT_API_SECRET"), "Apps Script secret");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, action, ...payload }),
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) fail("Apps Script request failed", 502);
  const result = await response.json().catch(() => null);
  if (!result || result.ok !== true) fail(`Apps Script request failed${result?.error ? `: ${result.error}` : ""}`, 502);
  return result;
}

async function uploadExternalMedia(payload: any) {
  const validated = decodeImageDataUrl(payload.dataUrl);
  if (!appsScriptConfigured()) return uploadImageToGoogleDrive(payload);
  const result = await callAppsScript("uploadMedia", {
    dataUrl: payload.dataUrl,
    fileName: payload.fileName,
    ownerType: payload.ownerType,
    ownerId: payload.ownerId,
  }, 25_000);
  if (typeof result.mediaId !== "string" || typeof result.url !== "string") fail("Apps Script returned invalid media data", 502);
  return {
    mediaId: result.mediaId,
    url: googleDrivePublicImageUrl(result.mediaId),
    mimeType: validated.mimeType,
    sizeBytes: validated.bytes.byteLength,
    provider: "google-drive",
  };
}

async function syncReportingRow(payload: any) {
  if (!appsScriptConfigured()) return { success: true, synced: false, reason: "not-configured" };
  await callAppsScript("syncReportingRow", { source: "hdms-pn", idempotencyKey: text(payload.recordId, "Record ID"), record: payload }, 12_000);
  return { success: true, synced: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    let action = "";
    let args: any[] = [];
    let light = false;

    if (req.method === "GET") {
      const reqUrl = new URL(req.url);
      action = reqUrl.searchParams.get("action") || "";
      if (action !== "getPublicSystemDataAction" && action !== "getSystemDataAction") {
        return reply({ error: "Method not allowed" }, 405);
      }
    } else if (req.method === "POST") {
      const raw = await req.text();
      if (raw.length > 25 * 1024 * 1024) return reply({ error: "Request too large" }, 413);
      // `light: true` (sent by the web app for writes) means the caller will reload the data itself, so
      // the response only needs to confirm success instead of re-sending the whole system payload.
      const parsed = JSON.parse(raw);
      action = parsed.action;
      args = parsed.args || [];
      light = parsed.light || false;
      if (!Array.isArray(args)) fail("Invalid arguments");
    } else {
      return reply({ error: "Method not allowed" }, 405);
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    // Public reads use the anon/publishable key. Mutations intentionally use the
    // server-only service role because this deployment is configured to allow
    // direct /admin access without a login session. Never expose serviceKey to
    // the browser or include it in a response.
    const mutation = !["getSystemDataAction", "getPublicSystemDataAction"].includes(action);
    const db = createClient(url, mutation && serviceKey ? serviceKey : key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: !mutation && authorization ? { Authorization: authorization } : {} } });
    const check = async (query: PromiseLike<{ data: any; error: any }>) => {
      const { data, error } = await query;
      if (error) {
        console.error("Database operation failed", action, error.code, error.message);
        if (action === "updateHighwayLayerAction") {
          fail(`ไม่สามารถบันทึกโครงข่าย: ${error.message || "ตรวจสอบพิกัดและรูปแบบเส้นทาง"}`, 422);
        }
        fail("Database operation failed", 400);
      }
      return data;
    };
    const system = async (display = false, publicOnly = false) => {
      let data: any = null;
      if (display) {
        // The citizen endpoint must use the public wrapper: falling back to the full
        // system payload would expose Draft records. Deploy its SQL migration first.
        const rpc = publicOnly ? "doh_get_public_system_data_display_rpc" : "doh_get_system_data_display_rpc";
        data = await check(db.rpc(rpc));
      }
      if (!data || !Array.isArray(data.floodRoutes)) {
        if (publicOnly) fail("Public payload unavailable", 503);
        data = await check(db.rpc("doh_get_system_data_rpc"));
      }
      if (!data || !Array.isArray(data.floodRoutes)) fail("Invalid system data", 502);
      data.systemSettings = data.systemSettings?.main || data.systemSettings;
      return normalizeSystemMediaUrls(data);
    };
    if (action === "getSystemDataAction") return reply(await system());
    if (action === "getPublicSystemDataAction") {
      return reply(await system(true, true), 200, {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      });
    }
    if (mutation && !serviceKey) return reply({ error: "Server mutation key is not configured" }, 503);
    const [p, second] = args;
    if (action === "uploadExternalMediaAction") return reply(await uploadExternalMedia(p));
    if (action === "deleteExternalMediaAction") {
      const mediaId = text(p?.mediaId, "Media ID");
      if (appsScriptConfigured()) await callAppsScript("deleteMedia", { mediaId }, 12_000);
      else await deleteGoogleDriveFile(mediaId);
      return reply({ success: true });
    }
    if (action === "syncReportingRowAction") return reply(await syncReportingRow(p));
    const now = new Date().toISOString();
    let savedRouteId: string | undefined;
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
      case "saveTimelineUpdateAction": {
        const timelineId = `TL-${crypto.randomUUID()}`;
        const floodId = text(p.floodId, "Flood ID");
        await check(db.rpc("doh_update_timeline_rpc", { payload: {
          timelineId,
          clientRequestId: typeof p.clientRequestId === "string" ? p.clientRequestId.slice(0, 160) : undefined,
          floodId,
          waterLevelCm: number(p.waterLevelCm, 0, 10000),
          trafficStatus: traffic(p.trafficStatus),
          latitude: number(p.latitude, -90, 90),
          longitude: number(p.longitude, -180, 180),
          photoUrl: p.photoUrl || "",
          reporterName: text(p.reporterName, "Reporter"),
          remark: p.remark || "",
          roadSide: p.roadSide ? roadSide(p.roadSide) : undefined,
          affectedLanes: typeof p.affectedLanes === "string" ? p.affectedLanes : undefined,
          affectedShoulder: p.affectedShoulder ? shoulder(p.affectedShoulder) : undefined,
          directionMeta: p.directionMeta && typeof p.directionMeta === "object" ? p.directionMeta : undefined,
        } }));
        break;
      }
      case "upsertRouteAction": {
        const table = typeTable(p.recordType);
        const id = p.id || `${p.recordType === "FLOOD" ? "F" : "D"}-${crypto.randomUUID()}`;
        const existing = p.id ? await check(db.from(table).select("*").eq("id", id).is("deleted_at", null).maybeSingle()) || {} : {};
        if (p.expectedUpdatedAt && existing.updated_at && new Date(existing.updated_at).getTime() > new Date(p.expectedUpdatedAt).getTime()) {
          fail("ข้อมูลนี้เพิ่งถูกแก้ไขโดยเจ้าหน้าที่ท่านอื่น กรุณารีเฟรชข้อมูลล่าสุดก่อนบันทึก", 409);
        }
        const geometry = p.coordinates ?? existing.coordinates_json ?? [];
        if (!Array.isArray(geometry) || geometry.length < 2) fail("At least two route points required");
        geometry.forEach((point: any) => { number(point[0], -180, 180); number(point[1], -90, 90); });
        const baseRow: Record<string, unknown> = { id, lat_start: number(p.latStart ?? existing.lat_start, -90, 90), lon_start: number(p.lonStart ?? existing.lon_start, -180, 180), lat_end: number(p.latEnd ?? existing.lat_end, -90, 90), lon_end: number(p.lonEnd ?? existing.lon_end, -180, 180), coordinates_json: geometry, is_active: typeof p.isActive === "boolean" ? p.isActive : (existing.is_active ?? true), updated_at: now };
        const extRow: Record<string, unknown> = {};
        if (p.recordType === "FLOOD") {
          Object.assign(baseRow, { route_no: text(p.routeNo ?? existing.route_no, "Route"), section_name: text(p.sectionName ?? existing.section_name, "Section"), km_start: text(p.kmStart ?? existing.km_start, "Start KM"), km_end: text(p.kmEnd ?? existing.km_end, "End KM"), water_level_cm: number(p.waterLevelCm ?? existing.water_level_cm ?? 0, 0, 10000), traffic_status: traffic(p.trafficStatus ?? existing.traffic_status ?? "WARNING"), latest_photo_url: p.photoUrl ?? p.latestPhotoUrl ?? existing.latest_photo_url ?? "", district: p.district ?? existing.district ?? "", subdistrict: p.subdistrict ?? existing.subdistrict ?? "", detour_advice: p.detourAdvice ?? existing.detour_advice ?? "" });
          // Only an explicit value is stored. A missing value stays UNKNOWN so the UI asks for review;
          // it is never guessed from direction/lanes and never defaulted to BOTH.
          const resolvedSide = roadSide(p.roadSide ?? p.directionMeta?.roadSide ?? existing.road_side ?? "UNKNOWN");
          const metaObj = (p.directionMeta && typeof p.directionMeta === "object") ? { ...p.directionMeta, roadSide: resolvedSide } : (existing.direction_meta ?? {});
          Object.assign(extRow, { road_side: resolvedSide, affected_lanes: String(p.affectedLanes ?? existing.affected_lanes ?? ""), affected_shoulder: shoulder(p.affectedShoulder ?? existing.affected_shoulder ?? "NONE"), reporter_name: String(p.reporterName ?? existing.reporter_name ?? ""), direction_meta: metaObj });
        } else {
          const revGeometry = Array.isArray(p.reverseCoordinates) ? p.reverseCoordinates : (existing.reverse_coordinates_json ?? []);
          if (Array.isArray(revGeometry) && revGeometry.length > 0) {
            revGeometry.forEach((point: any) => { number(point[0], -180, 180); number(point[1], -90, 90); });
          }
          const revWaypoints = Array.isArray(p.reverseWaypoints) ? p.reverseWaypoints : (existing.reverse_waypoints_json ?? []);
          Object.assign(baseRow, { flood_id_ref: (p.detourRefId === "" ? null : p.detourRefId ?? existing.flood_id_ref ?? null), route_name: text(p.detourName ?? existing.route_name, "Detour name"), description: p.detourDesc ?? existing.description ?? "" });
          Object.assign(extRow, { reverse_coordinates_json: revGeometry, reverse_waypoints_json: revWaypoints, direction_mode: detourDir(p.directionMode ?? existing.direction_mode), detour_meta: (p.detourMeta && typeof p.detourMeta === "object") ? p.detourMeta : (existing.detour_meta ?? {}) });
        }
        // Do not silently discard selected direction/lane fields on database errors.
        const fullUpsert = await db.from(table).upsert({ ...baseRow, ...extRow });
        if (fullUpsert.error) {
          console.error("Route upsert rejected", fullUpsert.error.code, fullUpsert.error.message);
          fail("บันทึกไม่สำเร็จ: โปรดตรวจสอบ schema/migration ของช่องจราจรและทิศทาง", 422);
        }
        // Verify persisted values rather than trusting a successful HTTP/database write alone.
        // This detects schema defaults/triggers/serialization that silently change operator input.
        const readColumns = p.recordType === "FLOOD"
          ? "id,road_side,affected_lanes,affected_shoulder,direction_meta"
          : "id,direction_mode,reverse_coordinates_json,detour_meta";
        const persisted = await check(db.from(table).select(readColumns).eq("id", id).single());
        if (p.recordType === "FLOOD") {
          if (persisted.road_side !== extRow.road_side ||
              persisted.affected_lanes !== extRow.affected_lanes ||
              persisted.direction_meta?.directionCode !== (extRow.direction_meta as any)?.directionCode) {
            fail("บันทึกแล้วแต่ค่าฝั่งถนน/ช่องจราจร/ทิศทางที่อ่านกลับมาไม่ตรง กรุณาตรวจสอบก่อนเผยแพร่", 409);
          }
        } else if (persisted.direction_mode !== extRow.direction_mode) {
          fail("บันทึกแล้วแต่ทิศทางเดินรถที่อ่านกลับมาไม่ตรง กรุณาตรวจสอบก่อนเผยแพร่", 409);
        }
        savedRouteId = id;
        break;
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
    return reply(light === true ? { success: true, savedId: savedRouteId } : { success: true, savedId: savedRouteId, systemData: await system() });
  } catch (error: any) {
    return reply({ error: error.status ? error.message : "Invalid request" }, error.status || 400);
  }
});
