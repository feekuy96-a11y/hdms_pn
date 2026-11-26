import type { FloodRoute, SystemDataPayload } from "@/db/default-data";

export type PublicShareResult = "shared" | "cancelled" | "copied" | "manual";

type ShareBrowser = Pick<Navigator, "share" | "canShare"> & {
  clipboard?: Pick<Clipboard, "writeText">;
};

export type PublicFloodShareRef = { kind: "event" | "segment"; id: string };

const FLOOD_QUERY = "flood";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
type PublicFloodShareData = Pick<SystemDataPayload, "floodRoutes" | "eventSegments">;

export function getFloodShareRef(flood: FloodRoute, data: PublicFloodShareData): PublicFloodShareRef | null {
  if (!flood.is_active || !ID_PATTERN.test(flood.id)) return null;
  const eventId = data.eventSegments?.find((row) => row.flood_id === flood.id)?.event_id;
  return eventId && ID_PATTERN.test(eventId) ? { kind: "event", id: eventId } : { kind: "segment", id: flood.id };
}

/** Build a public event link from the deployed homepage, never the current map URL. */
export function getPublicFloodShareUrl(origin: string, ref: PublicFloodShareRef, basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""): string {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("The public site requires an HTTP(S) origin");
  }
  const base = basePath.replace(/^\/+|\/+$/g, "");
  url.pathname = base ? `/${base}/` : "/";
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.searchParams.set(FLOOD_QUERY, `${ref.kind}:${ref.id}`);
  return url.href;
}

export function readPublicFloodShareRef(search: string): PublicFloodShareRef | "invalid" | null {
  const values = new URLSearchParams(search).getAll(FLOOD_QUERY);
  if (!values.length) return null;
  if (values.length !== 1) return "invalid";
  const parts = values[0].split(":");
  const [kind, id] = parts;
  return parts.length === 2 &&
    (kind === "event" || kind === "segment") && id && ID_PATTERN.test(id) ? { kind, id } : "invalid";
}

export function clearPublicFloodShareParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(FLOOD_QUERY)) return;
  url.searchParams.delete(FLOOD_QUERY);
  window.history.replaceState(window.history.state, "", url);
}

export function resolvePublicFloodShare(ref: PublicFloodShareRef, data: PublicFloodShareData): FloodRoute | undefined {
  const active = data.floodRoutes.filter((flood) => flood.is_active);
  if (ref.kind === "segment") return active.find((flood) => flood.id === ref.id);
  const rows = data.eventSegments?.filter((row) => row.event_id === ref.id) ?? [];
  rows.sort((a, b) => a.segment_position - b.segment_position || a.flood_id.localeCompare(b.flood_id));
  return rows.map((row) => active.find((flood) => flood.id === row.flood_id)).find(Boolean);
}

/** Invoke only from a user gesture. Cancellation must never copy or contact a target. */
export async function sharePublicLink(
  browser: Partial<ShareBrowser>,
  data: { title: string; url: string },
): Promise<PublicShareResult> {
  try {
    if (browser.share && (!browser.canShare || browser.canShare(data))) {
      await browser.share(data);
      return "shared";
    }
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled";
  }
  try {
    if (browser.clipboard) {
      await browser.clipboard.writeText(data.url);
      return "copied";
    }
  } catch {
    // Offer a selectable link when browser permissions or activation prevent writing.
  }
  return "manual";
}
