import { parseClosureRecord, type RoadClosureRecord } from "./closure-record";
import { haversineDistanceKm } from "./gis/geo-math";

export function createClosureImportSql(record: RoadClosureRecord, eventId: string) {
  if (!eventId || eventId.length > 128 || !parseClosureRecord(record,eventId)
    || !record.roadMode || !record.route.trim() || !record.reason.trim()
    || !record.a.area.trim() || !record.b.area.trim() || !record.a.landmark.trim() || !record.b.landmark.trim()
    || !record.a.position || !record.b.position || record.line.length < 2) {
    throw new Error("ตรวจแนวเส้น หมุด A/B และกรอกรายละเอียดให้ครบก่อนเตรียม SQL");
  }
  if (haversineDistanceKm(record.a.position,record.line[0]) > 0.04
    || haversineDistanceKm(record.b.position,record.line[record.line.length-1]) > 0.04) {
    throw new Error("แนวเส้นไม่ตรงกับหมุด A/B กรุณาตรวจแนวก่อนเตรียม SQL");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  if(bytes.length > 1_050_000) throw new Error("รายละเอียดและรูปมีขนาดเกินที่กำหนด");
  // Only the base64 alphabet reaches the SQL literal; user fields cannot change its syntax.
  const chunks:string[]=[];
  for(let i=0;i<bytes.length;i+=8192) chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
  const encoded=btoa(chunks.join(""));
  return `WITH closure_input AS (
  SELECT convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb AS payload
)
INSERT INTO public.doh_road_closure_records (event_id, payload)
SELECT payload->>'eventId', payload FROM closure_input
ON CONFLICT (event_id) DO NOTHING
RETURNING event_id;`;
}
