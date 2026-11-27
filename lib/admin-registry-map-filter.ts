import type { SystemDataPayload } from "@/db/default-data";
import { getLinkedDetoursForFlood } from "@/lib/event-detour-links";

/** Default registry scope can differ from a user narrowing with search or a filter. */
export interface AdminRegistryMapFilter {
  matchedIds: ReadonlySet<string>;
  isNarrowed: boolean;
}

export function resolveAdminRegistryMapRoutes(
  systemData: SystemDataPayload,
  floodFilter: AdminRegistryMapFilter | null,
  detourFilter: AdminRegistryMapFilter | null
): Pick<SystemDataPayload, "floodRoutes" | "detourRoutes"> {
  const floods = floodFilter ? systemData.floodRoutes.filter(route => floodFilter.matchedIds.has(route.id)) : systemData.floodRoutes;
  const detours = detourFilter ? systemData.detourRoutes.filter(route => detourFilter.matchedIds.has(route.id)) : systemData.detourRoutes;
  if (!floodFilter?.isNarrowed && !detourFilter?.isNarrowed) return { floodRoutes: floods, detourRoutes: detours };

  // Resolve each relation straight from its matched flood/detour, never from the
  // other layer's newly added results. Keep the existing visible/legacy link rules.
  const linkedIds = (flood: (typeof floods)[number]) =>
    getLinkedDetoursForFlood(flood, systemData, { includeInactiveDetours: true }).map(({ detour }) => detour.id);
  const matchingDetourIds = detourFilter?.isNarrowed ? detourFilter.matchedIds : null;
  const directDetours = floodFilter?.isNarrowed ? new Set(floods.flatMap(linkedIds)) : null;
  return {
    floodRoutes: matchingDetourIds ? floods.filter(flood => linkedIds(flood).some(id => matchingDetourIds.has(id))) : floods,
    detourRoutes: directDetours ? detours.filter(detour => directDetours.has(detour.id)) : detours,
  };
}
