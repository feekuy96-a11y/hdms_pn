// Reads the detour advice text format that officers and the AI generator produce, so every screen can
// show it the same way (bold heading, numbered steps with a bold "จุดเริ่มต้น:" / "จุดสิ้นสุด:", indented
// summary lines with a bold label). Text that does not follow the format is kept as plain lines, nothing
// is dropped. No imports: it can be tested on its own.
//
// Format (one block per direction, the numbers may be written "1." or "1.จุดเริ่มต้น:" without a space):
//   === ทิศทางขาไป: จุด A → จุด B (ต.รูสะมิแล อ.เมือง → ต.บานา อ.เมือง) ===
//   1. จุดเริ่มต้น: บริเวณ ... (ระยะทาง 5.0 กม.)
//   2. เมื่อถึงวงเวียน ให้ใช้ทางออกที่ 2 ...
//   6. จุดสิ้นสุด: ถึงจุดบรรจบทางหลวงสายหลัก ... สัญจรต่อได้ตามปกติ
//   - รวมระยะทางเลี่ยง: 12.6 กม.
//   - ระยะเวลาเดินทาง: ประมาณ 19 นาที
//   - สภาพเส้นทาง: ผิวทางลาดยาง รถยนต์ทุกชนิดสามารถสัญจรได้ตามปกติ

export type AdviceBlock =
  | { kind: "heading"; text: string }
  | { kind: "step"; number: string; label: string; text: string }
  | { kind: "summary"; label: string; text: string }
  | { kind: "text"; text: string };

const HEADING = /^={2,}\s*(.+?)\s*={2,}$/;
const STEP = /^(\d{1,2})\s*[.)]\s*(.*)$/;
const STEP_LABEL = /^(จุดเริ่มต้น|จุดสิ้นสุด)\s*[:：]\s*(.*)$/;
const SUMMARY = /^[-–•]\s*(.*)$/;
const LABELLED = /^([^:：]{2,40}?)\s*[:：]\s*(.*)$/;

export function parseAdviceText(raw: string): AdviceBlock[] {
  const blocks: AdviceBlock[] = [];
  for (const source of (raw || "").split(/\r?\n/)) {
    const line = source.trim();
    if (!line) continue;

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
      continue;
    }

    const step = line.match(STEP);
    if (step) {
      const labelled = step[2].match(STEP_LABEL);
      blocks.push(
        labelled
          ? { kind: "step", number: step[1], label: `${labelled[1]}:`, text: labelled[2] }
          : { kind: "step", number: step[1], label: "", text: step[2] }
      );
      continue;
    }

    const summary = line.match(SUMMARY);
    if (summary) {
      const labelled = summary[1].match(LABELLED);
      blocks.push(
        labelled
          ? { kind: "summary", label: `${labelled[1]}:`, text: labelled[2] }
          : { kind: "summary", label: "", text: summary[1] }
      );
      continue;
    }

    blocks.push({ kind: "text", text: line });
  }
  return blocks;
}

/** Google Maps "directions" link for comparing a detour with Google's own route (no API key needed). */
export function buildGoogleMapsDirectionsUrl(
  from: [number, number],
  to: [number, number],
  via: [number, number][] = [],
  maxWaypoints = 8
): string {
  // Inputs are [longitude, latitude]; Google wants "latitude,longitude".
  const point = (p: [number, number]) => `${Number(p[1]).toFixed(6)},${Number(p[0]).toFixed(6)}`;
  const params = new URLSearchParams({ api: "1", origin: point(from), destination: point(to), travelmode: "driving" });
  if (via.length > 0) {
    const count = Math.min(maxWaypoints, via.length);
    const picked: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      // Spread the picks evenly along the line so the route keeps its shape.
      picked.push(via[Math.round(((i + 1) * (via.length + 1)) / (count + 1)) - 1] ?? via[via.length - 1]);
    }
    params.set("waypoints", picked.map(point).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

