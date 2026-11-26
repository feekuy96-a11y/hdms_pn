"use client";

import { MapPin } from "lucide-react";
import type { DetourRoute } from "@/db/default-data";
import type { DetourDirection } from "@/lib/detour-presentation";
import { normalizeMediaUrl } from "@/lib/flood-event-schema";
import { resolveDetourPhotoPointCoords } from "@/components/map/longdo-layer-builders";
import {
  getDetourEndpointTextDetails,
  getPublicDetourEndpointLabel,
  parseRouteCoordinates,
} from "@/components/map/longdo-map-popups";

export function DetourEndpointDetailsCard({
  detour, direction, compact = false,
}: {
  detour: DetourRoute;
  direction: DetourDirection;
  compact?: boolean;
}) {
  const point = direction === "REVERSE" ? "END" : "START";
  const photo = point === "START" ? detour.detour_meta?.start_point_photo : detour.detour_meta?.end_point_photo;
  const pins = resolveDetourPhotoPointCoords(detour, parseRouteCoordinates(detour.coordinates_json));
  const details = getDetourEndpointTextDetails(photo, point === "START" ? pins.start : pins.end);
  const { title, trip } = getPublicDetourEndpointLabel(detour, point, direction);
  const source = normalizeMediaUrl(photo?.url);
  const photoUrl = /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,|data:image\/svg\+xml,|\/(?!\/))/i.test(source) ? source : "";

  return (
    <section aria-label={`ข้อมูล${title}`} className="mt-2.5 min-w-0 space-y-1.5 rounded-xl border border-slate-700/80 bg-[#0d1b36] p-2.5 text-xs text-slate-200">
      <header className="flex flex-wrap items-center gap-1.5 font-heading font-bold text-amber-300">
        <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span>{title}</span>
      </header>
      <p className="text-slate-300">{trip}</p>
      <p className="break-words">{details.area ?? "ยังไม่มีข้อมูลพื้นที่จุดนี้"}</p>
      <p className="break-words font-mono">{details.coordinate ? `พิกัด: ${details.coordinate}` : "ยังไม่มีพิกัดจุดนี้"}</p>
      <p className="break-words leading-snug">{details.caption ?? "ยังไม่มีคำอธิบายจุดนี้"}</p>
      {photoUrl && (
        <img
          src={photoUrl}
          alt={details.caption || `ภาพ${title}`}
          className={`w-full rounded-lg border border-slate-800 bg-slate-950 ${compact ? "h-36 object-cover" : "h-auto max-h-[min(42dvh,20rem)] object-contain"}`}
        />
      )}
    </section>
  );
}
