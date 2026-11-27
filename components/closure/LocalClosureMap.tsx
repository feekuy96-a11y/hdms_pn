"use client";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { SystemDataPayload } from "@/db/default-data";
import type { ClosureCoordinate, LocalClosureRecord } from "@/lib/closure-local-record";

const Map = dynamic(() => import("@/components/map/LongdoGisMap").then(m=>m.LongdoGisMap), { ssr: false });
const noSelection = () => {};
export function LocalClosureMap({ data, record, center, pick, onPick }: {
  data: SystemDataPayload; record: LocalClosureRecord; center: ClosureCoordinate | null;
  pick?: "A"|"B"|null; onPick?: (lat:number,lon:number,mode:string)=>void;
}) {
  const context = useMemo(() => ({
    ...data, floodRoutes: [], detourRoutes: [], offices: [],
  }),[data]);
  const pins = useMemo(() => ([
    [record.a.position,"A"], [record.b.position,"B"],
  ] as const).flatMap(([p,label]) => p ? [{ lon:p[0],lat:p[1],label,mode:`CLOSURE-${label}`,draggable:false }] : []),
  [record.a.position,record.b.position]);
  const readOnlyBounds = useMemo(() => onPick ? undefined :
    [...(record.a.position ? [record.a.position] : []), ...record.line, ...(record.b.position ? [record.b.position] : [])],
  [onPick,record.a.position,record.b.position,record.line]);
  return <div data-testid="local-closure-map" className="relative h-72 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
    <Map systemData={context} selectedFloodId="" onSelectFlood={noSelection}
      adminPickMode={pick ? `CLOSURE-${pick}` : null} onCoordinatePicked={onPick}
      draftCoordinates={record.line} draftPickMarkers={pins} draftMode="FLOOD" focusCoordinates={center} fitPreviewCoordinates={readOnlyBounds}/>
  </div>;
}
