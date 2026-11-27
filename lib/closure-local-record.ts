export type ClosureCoordinate = [number, number];
export type ClosureStop = {
  position: ClosureCoordinate | null;
  km: string; area: string; landmark: string; photo: string;
};
export type LocalClosureRecord = {
  version: 1; eventId: string; route: string; section: string; begins: string;
  reason: string; note: string; a: ClosureStop; b: ClosureStop;
  line: ClosureCoordinate[]; detourIds: string[]; savedAt: string;
};

const key = (eventId: string) => `hdms:closure-local:v1:${eventId}`;
const coordinate = (value: unknown): value is ClosureCoordinate =>
  Array.isArray(value) && value.length === 2 && value.every(p => typeof p === "number" && Number.isFinite(p)) &&
  Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90 && (value[0] !== 0 || value[1] !== 0);
const short = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
export const safeLocalPhoto = (value: unknown): value is string =>
  typeof value === "string" && value.length < 320_000 && /^data:image\/(?:jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value);
const stop = (p: ClosureStop | null | undefined): p is ClosureStop =>
  !!p && (p.position === null || coordinate(p.position)) &&
  short(p.km,12) && short(p.area,180) && short(p.landmark,180) && (p.photo === "" || safeLocalPhoto(p.photo));

export function readLocalClosure(eventId: string): LocalClosureRecord | null {
  if (!short(eventId,128) || !eventId || typeof window === "undefined") return null;
  try {
    const text = window.localStorage.getItem(key(eventId));
    if (!text || text.length > 1_100_000) return null;
    const row = JSON.parse(text) as LocalClosureRecord | null;
    if (!row || row.version !== 1 || row.eventId !== eventId ||
        !short(row.route,80) || !short(row.section,260) || !short(row.savedAt,35) || !short(row.begins,20) ||
        !short(row.reason,500) || !short(row.note,500) || !stop(row.a) || !stop(row.b) ||
        !Array.isArray(row.line) || row.line.length > 2000 || !row.line.every(coordinate) ||
        !Array.isArray(row.detourIds) || row.detourIds.length > 60 || !row.detourIds.every(id=>short(id,128))) return null;
    return row;
  } catch { return null; }
}

export function saveLocalClosure(record: LocalClosureRecord) {
  window.localStorage.setItem(key(record.eventId), JSON.stringify(record));
}
