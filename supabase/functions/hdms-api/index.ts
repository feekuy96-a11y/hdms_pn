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

const googleCoordPair = (value: unknown, label: string): [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) fail(`Invalid ${label} coordinate`, 422);
  return [number(value[0], -180, 180), number(value[1], -90, 90)];
};

const parseGoogleDurationSeconds = (value: unknown): number => {
  if (typeof value !== "string") return 0;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
};

const stripThaiPrefix = (value: string, prefixes: RegExp): string =>
  value.trim().replace(prefixes, "").trim();

async function reverseGeocodeGoogle(args: unknown[]) {
  if (args.length < 2) fail("Coordinates required", 422);
  const [rawLon, rawLat] = args;
  const lon = number(rawLon, -180, 180);
  const lat = number(rawLat, -90, 90);
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim() || "";
  if (!apiKey) return { configured: false, available: false };
  const gUrl = new URL("https://geocode.googleapis.com/v4/geocode/location");
  gUrl.searchParams.set("location.latitude", String(lat));
  gUrl.searchParams.set("location.longitude", String(lon));
  gUrl.searchParams.set("languageCode", "th");
  gUrl.searchParams.set("regionCode", "TH");

  let res: Response;
  try {
    res = await fetch(gUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "results.placeId,results.formattedAddress,results.addressComponents,results.types",
        "X-Goog-Maps-Solution-ID": "gmp_git_agentskills_v1",
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    console.error("Google Geocoding upstream timeout or network error");
    return { configured: true, available: false, status: 504 };
  }
  if (!res.ok) {
    console.error("Google Geocoding upstream status:", res.status);
    return { configured: true, available: false, status: res.status };
  }
  const data = await res.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length === 0) {
    return { configured: true, available: true, found: false };
  }

  let road = "";
  let village = "";
  let subdistrict = "";
  let district = "";
  let province = "";
  let formattedAddress = "";
  let placeId = "";

  for (const item of results) {
    if (!formattedAddress && typeof item?.formattedAddress === "string") formattedAddress = item.formattedAddress;
    if (!placeId && typeof item?.placeId === "string") placeId = item.placeId;
    const comps = Array.isArray(item?.addressComponents) ? item.addressComponents : [];
    for (const comp of comps) {
      const types: string[] = Array.isArray(comp?.types) ? comp.types : [];
      const textVal = String(comp?.longText ?? comp?.long_name ?? comp?.shortText ?? comp?.short_name ?? "").trim();
      if (!textVal) continue;
      if (!road && types.includes("route")) {
        road = textVal;
      } else if (!village && (types.includes("sublocality_level_2") || types.includes("sublocality_level_3") || types.includes("neighborhood"))) {
        village = textVal;
      } else if (!subdistrict && (types.includes("sublocality_level_1") || types.includes("administrative_area_level_3"))) {
        subdistrict = stripThaiPrefix(textVal, /^(?:ตำบล|ต\.|แขวง)\s*/);
      } else if (!district && (types.includes("administrative_area_level_2") || types.includes("locality"))) {
        district = stripThaiPrefix(textVal, /^(?:อำเภอ|อ\.|เขต)\s*/);
      } else if (!province && types.includes("administrative_area_level_1")) {
        province = stripThaiPrefix(textVal, /^(?:จังหวัด|จ\.)\s*/);
      }
    }
  }

  return {
    configured: true,
    available: true,
    found: true,
    road,
    village,
    subdistrict,
    district,
    province,
    formattedAddress,
    placeId,
  };
}

async function computeGoogleDetourRoute(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Invalid route request", 422);
  const reqObj = raw as Record<string, unknown>;
  const origin = googleCoordPair(reqObj.origin, "origin");
  const destination = googleCoordPair(reqObj.destination, "destination");
  const rawIntermediates = reqObj.intermediates;
  let intermediates: [number, number][] = [];
  if (rawIntermediates !== undefined) {
    if (!Array.isArray(rawIntermediates) || rawIntermediates.length > 25) fail("Invalid intermediates", 422);
    intermediates = rawIntermediates.map((pt, idx) => googleCoordPair(pt, `intermediate[${idx}]`));
  }
  const routingPreference = reqObj.routingPreference === "TRAFFIC_AWARE" ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE";
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim() || "";
  if (!apiKey) return { configured: false, available: false };

  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: origin[1], longitude: origin[0] } } },
    destination: { location: { latLng: { latitude: destination[1], longitude: destination[0] } } },
    travelMode: "DRIVE",
    routingPreference,
    computeAlternativeRoutes: false,
    languageCode: "th",
    regionCode: "TH",
    units: "METRIC",
  };
  if (intermediates.length > 0) {
    body.intermediates = intermediates.map((pt) => ({
      location: { latLng: { latitude: pt[1], longitude: pt[0] } },
      via: true,
    }));
  }

  let res: Response;
  try {
    res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-Maps-Solution-ID": "gmp_git_agentskills_v1",
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration,routes.legs.steps.startLocation",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    console.error("Google Routes upstream timeout or network error");
    return { configured: true, available: false, status: 504 };
  }
  if (!res.ok) {
    console.error("Google Routes upstream status:", res.status);
    return { configured: true, available: false, status: res.status };
  }
  const data = await res.json().catch(() => null);
  const route = Array.isArray(data?.routes) ? data.routes[0] : null;
  if (!route) return { configured: true, available: true, found: false };

  const legs = Array.isArray(route.legs) ? route.legs : [];
  const steps = legs.flatMap((leg: any) =>
    (Array.isArray(leg?.steps) ? leg.steps : []).map((step: any) => {
      const lat = step?.startLocation?.latLng?.latitude;
      const lon = step?.startLocation?.latLng?.longitude;
      return {
        maneuver: typeof step?.navigationInstruction?.maneuver === "string" ? step.navigationInstruction.maneuver : "",
        instructions: typeof step?.navigationInstruction?.instructions === "string" ? step.navigationInstruction.instructions : "",
        distanceMeters: Number(step?.distanceMeters) || 0,
        durationSeconds: parseGoogleDurationSeconds(step?.staticDuration),
        startLocation: typeof lat === "number" && typeof lon === "number" ? [lon, lat] as [number, number] : null,
      };
    })
  );

  return {
    configured: true,
    available: true,
    found: true,
    distanceMeters: Number(route.distanceMeters) || 0,
    durationSeconds: parseGoogleDurationSeconds(route.duration),
    encodedPolyline: typeof route.polyline?.encodedPolyline === "string" ? route.polyline.encodedPolyline : "",
    steps,
  };
}

async function proxyOsrmRoute(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("Invalid OSRM route request", 422);
  const reqObj = raw as Record<string, unknown>;
  const rawCoords = reqObj.coords;
  if (!Array.isArray(rawCoords) || rawCoords.length < 2 || rawCoords.length > 25) {
    fail("Invalid OSRM coordinates (2-25 points required)", 422);
  }
  const coords = rawCoords.map((pt, idx) => googleCoordPair(pt, `coords[${idx}]`));
  const coordStr = coords.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const overview = reqObj.overview === "simplified" ? "simplified" : reqObj.overview === "false" ? "false" : "full";
  const steps = reqObj.steps === true ? "true" : "false";
  const upstreamUrl = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=${overview}&geometries=geojson&steps=${steps}`;

  let res: Response;
  try {
    res = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "User-Agent": "HDMS-Pattani-DOH/2.0 (Department of Highways Pattani)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(7_000),
    });
  } catch {
    return { available: false, status: 504 };
  }
  if (!res.ok) {
    return { available: false, status: res.status };
  }
  const data = await res.json().catch(() => null);
  const routes = Array.isArray(data?.routes) ? data.routes : [];
  if (routes.length === 0) {
    return { available: true, found: false };
  }
  return { available: true, found: true, data };
}

async function proxyReverseGeocode(args: unknown[]) {
  if (args.length < 2) fail("Coordinates required", 422);
  const [rawLon, rawLat] = args;
  const lon = number(rawLon, -180, 180);
  const lat = number(rawLat, -90, 90);
  const nUrl = new URL("https://nominatim.openstreetmap.org/reverse");
  nUrl.searchParams.set("format", "jsonv2");
  nUrl.searchParams.set("lat", String(lat));
  nUrl.searchParams.set("lon", String(lon));
  nUrl.searchParams.set("accept-language", "th");
  nUrl.searchParams.set("zoom", "18");

  let res: Response;
  try {
    res = await fetch(nUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "HDMS-Pattani-DOH/2.0 (Department of Highways Pattani)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6_000),
    });
  } catch {
    return { available: false, status: 504 };
  }
  if (!res.ok) {
    return { available: false, status: res.status };
  }
  const data = await res.json().catch(() => null);
  if (!data?.address || typeof data.address !== "object") {
    return { available: true, found: false };
  }
  return { available: true, found: true, address: data.address };
}

const READ_ONLY_EDGE_ACTIONS = new Set([
  "getSystemDataAction",
  "getAdminOperationalDataAction",
  "getAdminStaticGisDataAction",
  "getPublicSystemDataAction",
  "getExternalJobsAction",
  "reverseGeocodeGoogleAction",
  "computeGoogleDetourRouteAction",
  "proxyOsrmRouteAction",
  "proxyReverseGeocodeAction",
]);

type EventDetourRequest = {
  eventId: string;
  expectedVersion: number;
  operationId: string;
  links: Array<{
    eventId: string;
    detourId: string;
    eventDirection: "A_TO_B" | "B_TO_A" | "BOTH" | "UNKNOWN";
    detourDirection: "FORWARD" | "REVERSE" | "TWO_WAY" | "UNKNOWN";
    position: number;
    eventPosition?: number;
    recommendation: "PENDING" | "RECOMMENDED" | "UNAVAILABLE" | "WITHDRAWN";
    reviewedGeometryVersion: number | null;
  }>;
};

function eventDetourRequest(value: unknown): EventDetourRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Invalid event-detour request", 422);
  const raw = value as Record<string, unknown>;
  const eventId = text(raw.eventId, "Event ID");
  const operationId = text(raw.operationId, "Operation ID");
  if (eventId.length > 128 || operationId.length < 8 || operationId.length > 128) fail("Invalid event-detour request", 422);
  if (!Number.isSafeInteger(raw.expectedVersion) || (raw.expectedVersion as number) < 0 || (raw.expectedVersion as number) > 2_147_483_647) fail("Invalid event-detour version", 422);
  if (!Array.isArray(raw.links) || raw.links.length > 100) fail("Invalid event-detour links", 422);
  const dirsByDetourId = new Map<string, Set<string>>();
  const links = raw.links.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) fail("Invalid event-detour link", 422);
    const link = candidate as Record<string, unknown>;
    const linkEventId = text(link.eventId, "Link event ID");
    const detourId = text(link.detourId, "Detour ID");
    const eventDirection = link.eventDirection;
    const detourDirection = link.detourDirection;
    const recommendation = link.recommendation;
    if (linkEventId !== eventId ||
      !["A_TO_B", "B_TO_A", "BOTH", "UNKNOWN"].includes(String(eventDirection)) ||
      !["FORWARD", "REVERSE", "TWO_WAY", "UNKNOWN"].includes(String(detourDirection)) ||
      !["PENDING", "RECOMMENDED", "UNAVAILABLE", "WITHDRAWN"].includes(String(recommendation)) ||
      detourId.length > 50 ||
      !Number.isSafeInteger(link.position) || (link.position as number) < 1 || (link.position as number) > 999_999_999) fail("Invalid event-detour link", 422);
    const set = dirsByDetourId.get(detourId) ?? new Set<string>();
    set.add(String(eventDirection));
    dirsByDetourId.set(detourId, set);
    const eventPosition = link.eventPosition;
    if (eventPosition !== undefined &&
      (!Number.isSafeInteger(eventPosition) || (eventPosition as number) < 1 || (eventPosition as number) > 100)) fail("Invalid event detour position", 422);
    const reviewedGeometryVersion = link.reviewedGeometryVersion;
    if (reviewedGeometryVersion !== null && reviewedGeometryVersion !== undefined &&
      (!Number.isSafeInteger(reviewedGeometryVersion) || (reviewedGeometryVersion as number) < 1 || (reviewedGeometryVersion as number) > 2_147_483_647)) fail("Invalid geometry review version", 422);
    return {
      eventId: linkEventId,
      detourId,
      eventDirection: eventDirection as EventDetourRequest["links"][number]["eventDirection"],
      detourDirection: detourDirection as EventDetourRequest["links"][number]["detourDirection"],
      position: link.position as number,
      ...(eventPosition === undefined ? {} : { eventPosition: eventPosition as number }),
      recommendation: recommendation as EventDetourRequest["links"][number]["recommendation"],
      reviewedGeometryVersion: reviewedGeometryVersion == null ? null : reviewedGeometryVersion as number,
    };
  });
  for (const dirSet of dirsByDetourId.values()) {
    if (dirSet.has("BOTH") && dirSet.size > 1) fail("Duplicate BOTH and single-direction link for detour", 422);
  }
  return { eventId, expectedVersion: raw.expectedVersion as number, operationId, links };
}

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
  const operationId = typeof payload.operationId === "string" && /^[0-9a-f-]{36}$/i.test(payload.operationId)
    ? payload.operationId : "";
  const accessToken = await googleDriveAccessToken();
  if (operationId) {
    const existing = await findGoogleDriveUpload(accessToken, folderId, operationId);
    if (existing) return { mediaId: existing, url: googleDrivePublicImageUrl(existing), mimeType, sizeBytes: bytes.byteLength, provider: "google-drive" };
  }
  const safeName = typeof payload.fileName === "string" && /^[\p{L}\p{N} _.-]{1,120}$/u.test(payload.fileName)
    ? payload.fileName
    : `hdms-${operationId || crypto.randomUUID()}.${extension}`;
  const boundary = `hdms-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: safeName,
    parents: [folderId],
    mimeType,
    appProperties: {
      hdmsType: typeof payload.ownerType === "string" ? payload.ownerType.slice(0, 40) : "media",
      hdmsRecordId: typeof payload.ownerId === "string" ? payload.ownerId.slice(0, 120) : "pending",
      ...(operationId ? { hdmsOperationId: operationId } : {}),
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

async function findGoogleDriveUpload(accessToken: string, folderId: string, operationId: string): Promise<string | null> {
  const query = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false and appProperties has { key='hdmsOperationId' and value='${operationId}' }`,
    fields: "files(id)", pageSize: "1", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) fail("Google Drive idempotency lookup failed", 502);
  const body = await response.json();
  return typeof body?.files?.[0]?.id === "string" ? body.files[0].id : null;
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
  const { mimeType, bytes } = decodeImageDataUrl(payload.dataUrl);
  const url = text(Deno.env.get("SUPABASE_URL"), "Supabase URL");
  const key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), "Service role key");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("hdms-media-staging").upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) fail("ไม่สามารถพักรูปใน Supabase ได้", 502);
  const publicUrl = db.storage.from("hdms-media-staging").getPublicUrl(path).data.publicUrl;
  const queued = await db.from("doh_external_jobs").insert({ kind: "MEDIA", payload: {
    path, url: publicUrl, fileName: payload.fileName, ownerType: payload.ownerType,
    ownerId: payload.ownerId, mimeType,
  } });
  if (queued.error) {
    await db.storage.from("hdms-media-staging").remove([path]);
    fail("ไม่สามารถเข้าคิวส่งรูปได้", 502);
  }
  return { mediaId: path, url: publicUrl, mimeType, sizeBytes: bytes.byteLength, provider: "supabase-staging" };
}

async function syncReportingRow(payload: any) {
  text(payload.recordId, "Record ID");
  const db = createClient(text(Deno.env.get("SUPABASE_URL"), "Supabase URL"), text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), "Service role key"));
  // The database trigger enqueued this report atomically with the saved row.
  // This call only nudges the worker after the UI has finished all route writes.
  scheduleExternalJobs(db);
  return { success: true, synced: false, queued: true };
}

function scheduleExternalJobs(db: any) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(processExternalJobs(db).catch((error: unknown) => console.error("External queue worker failed", error)));
}

async function processExternalJobs(db: any) {
  const { data: jobs, error } = await db.rpc("doh_claim_external_jobs", { p_limit: 5 });
  if (error) throw error;
  for (const job of jobs || []) {
    try {
      if (job.kind === "REPORT") {
        if (!appsScriptConfigured()) throw new Error("Apps Script is not configured");
        await callAppsScript("syncReportingRow", {
          source: "hdms-pn", idempotencyKey: text(job.payload.recordId, "Record ID"), record: job.payload,
        }, 12_000);
      } else {
        await processStagedMedia(db, job);
      }
      await db.from("doh_external_jobs").update({ status: "done", last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    } catch (cause) {
      const attempts = Number(job.attempts) || 1;
      const status = attempts >= 8 ? "failed" : "pending";
      // A save that never completed must not leave the temporary bucket growing forever.
      // Keep failed jobs for diagnosis, but remove their orphaned object after one day.
      if (status === "failed" && job.kind === "MEDIA" &&
          String(cause).includes("no saved record") &&
          Date.now() - new Date(job.created_at).getTime() > 24 * 60 * 60_000) {
        await db.storage.from("hdms-media-staging").remove([job.payload.path]);
      }
      await db.from("doh_external_jobs").update({
        status, last_error: String(cause).slice(0, 500),
        next_attempt_at: new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** (attempts - 1))).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
    }
  }
}

async function processStagedMedia(db: any, job: any) {
  const { path, url, ownerType, fileName, ownerId, mimeType } = job.payload;
  const tempUrl = text(url, "Temporary URL");
  let fileId = job.external_id;
  // Find a persisted reference before transferring. A failed route save leaves only a
  // temporary object; retries can resolve it after the record is saved.
  let rows: any[] = [];
  if (ownerType === "PROJECT") {
    const result = await db.from("doh_mitigation_projects").select("project_id,before_image_url,after_image_url,updated_at").eq("project_id", ownerId);
    if (result.error) throw result.error;
    rows = (result.data || []).filter((r: any) => r.before_image_url === tempUrl || r.after_image_url === tempUrl);
  } else if (ownerType === "DETOUR") {
    const [startMatch, endMatch] = await Promise.all([
      db.from("doh_detour_routes").select("id,detour_meta,updated_at").contains("detour_meta", { start_point_photo: { url: tempUrl } }),
      db.from("doh_detour_routes").select("id,detour_meta,updated_at").contains("detour_meta", { end_point_photo: { url: tempUrl } }),
    ]);
    if (startMatch.error || endMatch.error) throw startMatch.error || endMatch.error;
    rows = [...new Map([...(startMatch.data || []), ...(endMatch.data || [])].map((row: any) => [row.id, row])).values()];
  } else {
    const [primary, gallery] = await Promise.all([
      db.from("doh_flood_routes").select("id,latest_photo_url,direction_meta,updated_at").eq("latest_photo_url", tempUrl),
      db.from("doh_flood_routes").select("id,latest_photo_url,direction_meta,updated_at").contains("direction_meta", { photos: [{ dataUrl: tempUrl }] }),
    ]);
    if (primary.error || gallery.error) throw primary.error || gallery.error;
    rows = [...new Map([...(primary.data || []), ...(gallery.data || [])].map((row: any) => [row.id, row])).values()];
  }
  if (!rows.length && fileId) {
    const removed = await db.storage.from("hdms-media-staging").remove([path]);
    if (removed.error) throw removed.error;
    return;
  }
  if (!rows.length) throw new Error("Temporary media has no saved record yet");
  if (!fileId) {
    const downloaded = await db.storage.from("hdms-media-staging").download(text(path, "Storage path"));
    if (downloaded.error || !downloaded.data) throw downloaded.error || new Error("Staged image unavailable");
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    const uploaded = await uploadExternalMediaToDrive({ dataUrl: `data:${mimeType};base64,${btoa(binary)}`, fileName, ownerType, ownerId, operationId: job.id });
    fileId = uploaded.mediaId;
    const saved = await db.from("doh_external_jobs").update({ external_id: fileId }).eq("id", job.id);
    if (saved.error) throw saved.error;
  }
  const driveUrl = googleDrivePublicImageUrl(fileId);
  const promoted = await db.rpc("doh_promote_staged_media", { p_temp_url: tempUrl, p_drive_url: driveUrl });
  if (promoted.error) throw promoted.error;
  if (!promoted.data?.total) throw new Error("Temporary media reference changed during transfer");
  const removed = await db.storage.from("hdms-media-staging").remove([path]);
  if (removed.error) throw removed.error;
}

async function uploadExternalMediaToDrive(payload: any) {
  if (!appsScriptConfigured()) return uploadImageToGoogleDrive(payload);
  const result = await callAppsScript("uploadMedia", payload, 25_000);
  if (typeof result.mediaId !== "string") fail("Apps Script returned invalid media data", 502);
  return { mediaId: result.mediaId };
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
    const mutation = !READ_ONLY_EDGE_ACTIONS.has(action);
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
      const normalized = normalizeSystemMediaUrls(data);

      // Attach Event↔Detour many-to-many links cleanly without mutating underlying system RPCs.
      // Public responses strictly strip links referencing inactive/Draft floods or detours and
      // any WITHDRAWN/UNAVAILABLE links.
      const linkReaderDb = serviceKey
        ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : db;
      try {
        const [eventsRes, segmentsRes, linksRes] = await Promise.all([
          linkReaderDb.from("doh_flood_events").select("id,link_version"),
          linkReaderDb.from("doh_event_segments").select("flood_id,event_id,event_direction,segment_position").order("segment_position", { ascending: true }),
          linkReaderDb.from("doh_event_detour_links").select("event_id,detour_id,event_direction,detour_direction,position,event_position,recommendation,reviewed_geometry_version").order("position", { ascending: true }),
        ]);
        if (!eventsRes.error && !segmentsRes.error && !linksRes.error) {
          const allSegments = segmentsRes.data || [];
          const allEvents = eventsRes.data || [];
          const allLinks = (linksRes.data || []).map((link: any) => ({
            eventId: link.event_id,
            detourId: link.detour_id,
            eventDirection: link.event_direction,
            detourDirection: link.detour_direction,
            position: link.position,
            eventPosition: link.event_position ?? undefined,
            recommendation: link.recommendation,
            reviewedGeometryVersion: link.reviewed_geometry_version,
          }));

          if (publicOnly) {
            const activeFloodIds = new Set((normalized.floodRoutes || []).map((f: any) => f.id));
            const activeDetourIds = new Set((normalized.detourRoutes || []).map((d: any) => d.id));
            const publicSegments = allSegments.filter((s: any) => activeFloodIds.has(s.flood_id));
            const activeEventIds = new Set(publicSegments.map((s: any) => s.event_id));
            normalized.eventSegments = publicSegments;
            normalized.floodEvents = allEvents.filter((e: any) => activeEventIds.has(e.id));
            normalized.eventDetourLinks = allLinks.filter((l: any) =>
              activeEventIds.has(l.eventId) &&
              activeDetourIds.has(l.detourId) &&
              (l.recommendation === "RECOMMENDED" || l.recommendation === "PENDING")
            );
          } else {
            const nonDeletedFloodIds = new Set((normalized.floodRoutes || []).map((f: any) => f.id));
            const nonDeletedDetourIds = new Set((normalized.detourRoutes || []).map((d: any) => d.id));
            const adminSegments = allSegments.filter((s: any) => nonDeletedFloodIds.has(s.flood_id));
            const adminEventIds = new Set(adminSegments.map((s: any) => s.event_id));
            normalized.eventSegments = adminSegments;
            normalized.floodEvents = allEvents.filter((e: any) => adminEventIds.has(e.id));
            normalized.eventDetourLinks = allLinks.filter((l: any) =>
              adminEventIds.has(l.eventId) && nonDeletedDetourIds.has(l.detourId)
            );
          }
        }
      } catch {
        // Non-blocking fallback when relationship tables have not been migrated yet
      }

      return normalized;
    };
    if (action === "getSystemDataAction") {
      if (serviceKey) scheduleExternalJobs(createClient(url, serviceKey));
      return reply(await system());
    }
    if (action === "getAdminOperationalDataAction") {
      if (serviceKey) scheduleExternalJobs(createClient(url, serviceKey));
      const full = await system();
      return reply({
        updatedAt: full.updatedAt,
        floodRoutes: full.floodRoutes,
        detourRoutes: full.detourRoutes,
        timelineUpdates: full.timelineUpdates,
        mitigationProjects: full.mitigationProjects,
        eventDetourLinks: full.eventDetourLinks,
        eventSegments: full.eventSegments,
        floodEvents: full.floodEvents,
      });
    }
    if (action === "getAdminStaticGisDataAction") {
      const full = await system();
      return reply({
        updatedAt: full.updatedAt,
        highwayLayers: full.highwayLayers,
        offices: full.offices,
        mapStyles: full.mapStyles,
        systemSettings: full.systemSettings,
      });
    }
    if (action === "getPublicSystemDataAction") {
      return reply(await system(true, true), 200, {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      });
    }
    if (action === "getExternalJobsAction") {
      if (!serviceKey) return reply({ error: "External job service is not configured" }, 503);
      const jobsDb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const statuses = ["pending", "processing", "done", "failed"] as const;
      const counts: Record<string, number> = {};
      await Promise.all(statuses.map(async (status) => {
        const { count, error } = await jobsDb.from("doh_external_jobs").select("id", { count: "exact", head: true }).eq("status", status);
        if (error) fail("External job summary unavailable", 502);
        counts[status] = count || 0;
      }));
      const { data: activeRows, error: activeError } = await jobsDb.from("doh_external_jobs")
        .select("id,kind,status,payload,attempts,last_error,created_at,updated_at,next_attempt_at")
        .in("status", ["pending", "processing", "failed"])
        .order("created_at", { ascending: false }).limit(50);
      const { data: doneRows, error: doneError } = await jobsDb.from("doh_external_jobs")
        .select("id,kind,status,payload,attempts,last_error,created_at,updated_at,next_attempt_at")
        .eq("status", "done").order("updated_at", { ascending: false }).limit(20);
      if (activeError || doneError) fail("External jobs unavailable", 502);
      const rows = [...(activeRows || []), ...(doneRows || [])];
      return reply({
        counts,
        jobs: (rows || []).map((job: any) => ({
          id: job.id,
          kind: job.kind,
          status: job.status,
          recordId: typeof job.payload?.recordId === "string" ? job.payload.recordId : (typeof job.payload?.ownerId === "string" ? job.payload.ownerId : "-"),
          attempts: job.attempts || 0,
          lastError: typeof job.last_error === "string" ? job.last_error.slice(0, 500) : "",
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          nextAttemptAt: job.next_attempt_at,
        })),
      });
    }
    if (action === "reverseGeocodeGoogleAction") {
      return reply(await reverseGeocodeGoogle(args));
    }
    if (action === "computeGoogleDetourRouteAction") {
      return reply(await computeGoogleDetourRoute(args[0]));
    }
    if (action === "proxyOsrmRouteAction") {
      return reply(await proxyOsrmRoute(args[0]), 200, { "Cache-Control": "public, max-age=300" });
    }
    if (action === "proxyReverseGeocodeAction") {
      return reply(await proxyReverseGeocode(args), 200, { "Cache-Control": "public, max-age=3600" });
    }
    if (mutation && !serviceKey) return reply({ error: "Server mutation key is not configured" }, 503);
    const [p, second] = args;
    if (action === "getEventDetourLinksAction") {
      const eventId = text(p, "Event ID");
      const [eventResult, linksResult] = await Promise.all([
        db.from("doh_flood_events").select("id,link_version").eq("id", eventId).maybeSingle(),
        db.from("doh_event_detour_links")
          .select("event_id,detour_id,event_direction,detour_direction,position,event_position,recommendation,reviewed_geometry_version")
          .eq("event_id", eventId)
          .order("event_direction", { ascending: true })
          .order("position", { ascending: true }),
      ]);
      if (eventResult.error || linksResult.error) fail("Event-detour links unavailable", 502);
      if (!eventResult.data) fail("Event not found", 404);
      return reply({
        eventId,
        version: eventResult.data.link_version,
        links: (linksResult.data || []).map((link: any) => ({
          eventId: link.event_id,
          detourId: link.detour_id,
          eventDirection: link.event_direction,
          detourDirection: link.detour_direction,
          position: link.position,
          eventPosition: link.event_position ?? undefined,
          recommendation: link.recommendation,
          reviewedGeometryVersion: link.reviewed_geometry_version,
        })),
      });
    }
    if (action === "replaceEventDetourLinksAction") {
      const request = eventDetourRequest(p);
      const { data, error } = await db.rpc("doh_replace_event_detour_links", {
        p_event_id: request.eventId,
        p_expected_version: request.expectedVersion,
        p_operation_id: request.operationId,
        p_links: request.links,
      });
      if (error) {
        const message = error.message || "Event-detour links could not be saved";
        if (message.includes("EVENT_NOT_FOUND")) fail("Event not found", 404);
        if (message.includes("LINK_VERSION_CONFLICT") || message.includes("OPERATION_ID_REUSED")) fail("Event-detour links changed; reload before saving", 409);
        fail(`Invalid event-detour links: ${message}`, 422);
      }
      return reply(data);
    }
    if (action === "uploadExternalMediaAction") return reply(await uploadExternalMedia(p));
    if (action === "deleteExternalMediaAction") {
      const mediaId = text(p?.mediaId, "Media ID");
      if (/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(mediaId)) {
        const removed = await db.storage.from("hdms-media-staging").remove([mediaId]);
        if (removed.error) fail("Temporary media cleanup failed", 502);
        await db.from("doh_external_jobs").delete().eq("kind", "MEDIA").eq("payload->>path", mediaId).eq("status", "pending");
      } else if (appsScriptConfigured()) await callAppsScript("deleteMedia", { mediaId }, 12_000);
      else await deleteGoogleDriveFile(mediaId);
      return reply({ success: true });
    }
    if (action === "syncReportingRowAction") return reply(await syncReportingRow(p));
    if (action === "retryExternalJobAction") {
      const jobId = text(p, "Job ID");
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) fail("Invalid job ID");
      const { data, error } = await db.from("doh_external_jobs").update({
        status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(),
        claimed_at: null, last_error: null, updated_at: new Date().toISOString(),
      }).eq("id", jobId).eq("status", "failed").select("id").maybeSingle();
      if (error) fail("External job retry failed", 502);
      if (!data) fail("Only failed jobs can be retried", 409);
      scheduleExternalJobs(db);
      return reply({ success: true });
    }
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
        if (p.recordType === "DETOUR" && baseRow.flood_id_ref &&
            (!p.id || (p.detourRefId === baseRow.flood_id_ref && p.detourRefId !== existing.flood_id_ref))) {
          const { error: linkError } = await db.rpc("doh_append_event_detour_link", {
            p_flood_id: baseRow.flood_id_ref, p_detour_id: id,
          });
          if (linkError) fail("บันทึกเส้นทางแล้ว แต่ผูกเหตุการณ์ไม่สำเร็จ กรุณาผูกใหม่จากหน้าจัดการความสัมพันธ์", 409);
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
