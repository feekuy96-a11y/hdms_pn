/**
 * คำนวณระยะทาง Haversine ระหว่างสองพิกัด [lon, lat] (กิโลเมตร)
 */
export function haversineDistanceKm(p1: [number, number], p2: [number, number]): number {
  const R = 6371; // รัศมีโลกเฉลี่ย กม.
  const dLat = ((p2[1] - p1[1]) * Math.PI) / 180;
  const dLon = ((p2[0] - p1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1[1] * Math.PI) / 180) *
    Math.cos((p2[1] * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * คำนวณความยาวรวมของเส้น Polyline (กิโลเมตร)
 */
export function calculatePolylineLengthKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistanceKm(coords[i], coords[i + 1]);
  }
  return Number(total.toFixed(2));
}

/**
 * คำนวณมุมทิศทาง (Bearing 0-360 องศา) จากพิกัดที่ 1 ไปพิกัดที่ 2 ([lon, lat])
 */
export function calculateGeoBearing(from: [number, number], to: [number, number]): number {
  const fromLat = (from[1] * Math.PI) / 180;
  const toLat = (to[1] * Math.PI) / 180;
  const deltaLon = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
