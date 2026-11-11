/** Shared map/legend helpers. Colors are data; do not hard-code a different color per view. */
function parseRgb(hex: string): [number, number, number] | null {
  const value = String(hex || "").trim().replace(/^#/, "");
  const expanded = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return [0, 2, 4].map((index) => parseInt(expanded.slice(index, index + 2), 16)) as [number, number, number];
}
function luminance(hex: string): number | null {
  const rgb = parseRgb(hex);
  if (!rgb) return null;
  const channel = (component: number) => {
    const c = component / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return channel(rgb[0]) * 0.2126 + channel(rgb[1]) * 0.7152 + channel(rgb[2]) * 0.0722;
}
/** Keep configured arrow color unless it blends into the underlying route line. */
export function resolveVisibleArrowColor(lineColor: string, configuredColor?: string): string {
  const base = luminance(lineColor);
  if (base === null) return configuredColor || "#ffffff";
  const foreground = luminance(configuredColor || "");
  if (foreground !== null) {
    const ratio = (Math.max(base, foreground) + 0.05) / (Math.min(base, foreground) + 0.05);
    if (ratio >= 3) return configuredColor!;
  }
  const white = (1.05) / (base + 0.05);
  const black = (base + 0.05) / 0.05;
  return black >= white ? "#0f172a" : "#ffffff";
}
