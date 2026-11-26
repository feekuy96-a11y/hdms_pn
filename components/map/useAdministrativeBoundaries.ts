"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type * as Leaflet from "leaflet";
import {
  BOUNDARY_INDEX_PATH, boundaryAreaPath, parseBoundaryIndex, parseBoundarySelection,
  readBoundaryJson, type BoundaryIndex, type BoundarySelection,
} from "@/lib/admin-boundaries";

export function useAdministrativeBoundaries(
  ready: boolean,
  mapRef: RefObject<Leaflet.Map | null>,
  engineRef: RefObject<typeof Leaflet | null>,
) {
  const [enabled, setEnabled] = useState(false);
  const [index, setIndex] = useState<BoundaryIndex | null>(null);
  const [provinceCode, setProvinceCode] = useState("94");
  const [districtCode, setDistrictCode] = useState("");
  const [subdistrictCode, setSubdistrictCode] = useState("");
  const [selections, setSelections] = useState<Record<string, BoundarySelection>>({});
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const lastFit = useRef("");
  const current = subdistrictCode || districtCode || provinceCode;
  const selection = selections[current];
  const districts = selections[provinceCode]?.children ?? [];
  const subdistricts = selections[districtCode]?.children ?? [];
  const pending = !index ? "index" : selection ? "" : current;

  useEffect(() => {
    if (!enabled || !pending) return;
    const request = new AbortController();
    async function load() {
      try {
        if (pending === "index") {
          const payload = parseBoundaryIndex(await readBoundaryJson(BOUNDARY_INDEX_PATH, 32_000, request.signal));
          if (!request.signal.aborted) setIndex(payload);
        } else {
          const payload = parseBoundarySelection(await readBoundaryJson(boundaryAreaPath(pending), 1_000_000, request.signal), pending);
          if (!request.signal.aborted) {
            setSelections(old => {
              // Keep this cascade, not an unbounded client-side nationwide geometry cache.
              const keep = Object.entries(old).filter(([code]) => pending.startsWith(code));
              return Object.fromEntries([...keep, [pending, payload]]);
            });
          }
        }
      } catch {
        if (!request.signal.aborted) setError(pending);
      }
    }
    void load();
    return () => request.abort();
  }, [enabled, pending, retry]);

  useEffect(() => {
    const map = mapRef.current;
    const L = engineRef.current;
    if (!enabled || !ready || !map || !L || !selection) return;
    const paneName = "hdms-administrative-boundaries";
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = "350";
    pane.style.pointerEvents = "none";
    pane.classList.add(paneName);
    const renderer = L.svg({ pane: paneName });
    const shared = selection.feature.properties.codes.length > 1;
    const overlay = L.geoJSON(selection.feature, {
      pane: paneName, interactive: false,
      style: {
        renderer, color: "var(--status-info-ink)", weight: current.length === 2 ? 3 : 2,
        dashArray: shared ? "2 5" : "7 4", fill: false, opacity: 0.9, interactive: false,
      },
    }).addTo(map);
    if (lastFit.current !== current && overlay.getBounds().isValid()) {
      lastFit.current = current;
      map.fitBounds(overlay.getBounds(), { padding: [28, 28], maxZoom: 15, animate: false });
    }
    return () => {
      if (map.hasLayer(overlay)) map.removeLayer(overlay);
      if (map.hasLayer(renderer)) map.removeLayer(renderer);
    };
  }, [current, enabled, engineRef, mapRef, ready, selection]);

  const resetError = () => setError("");
  return {
    enabled, index, provinceCode, districtCode, subdistrictCode,
    districts, subdistricts,
    sharedNames: selection && selection.feature.properties.codes.length > 1
      ? subdistricts.filter(area => selection.feature.properties.codes.includes(area.code)).map(area => area.name)
      : [],
    status: !enabled ? "idle" : pending && error === pending ? "error" : pending ? "loading" : "ready",
    onRetry: () => { resetError(); setRetry(value => value + 1); },
    onToggle: (next: boolean) => { setEnabled(next); resetError(); if (!next) lastFit.current = ""; },
    onProvince: (code: string) => {
      if (!index?.provinces.some(p => p.code === code)) return;
      setProvinceCode(code); setDistrictCode(""); setSubdistrictCode(""); resetError();
    },
    onDistrict: (code: string) => {
      if (code && !districts.some(d => d.code === code)) return;
      setDistrictCode(code); setSubdistrictCode(""); resetError();
    },
    onSubdistrict: (code: string) => {
      if (code && !subdistricts.some(s => s.code === code)) return;
      setSubdistrictCode(code); resetError();
    },
  } as const;
}

export type AdministrativeBoundaryControls = ReturnType<typeof useAdministrativeBoundaries>;
