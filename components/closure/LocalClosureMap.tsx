"use client";
import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { SystemDataPayload } from "@/db/default-data";
import type { ClosureCoordinate, LocalClosureRecord } from "@/lib/closure-local-record";
import { Construction, X } from "lucide-react";
import type { ClosureDraftPresentation } from "@/components/map/longdo-draft-layer";

import { ClosureStopDetails } from "./ClosureStopDetails";

const Map = dynamic(() => import("@/components/map/LongdoGisMap").then(m=>m.LongdoGisMap), { ssr: false });
const noSelection = () => {};
type ClosureTarget="A"|"B"|"SECTION";
const labelFor=(target:ClosureTarget)=>target==="SECTION"?"ดูสรุปช่วงปิดการจราจร":`จุดปิด ${target}`;
function ClosurePopup({record,target,onClose,focusClose}:{record:LocalClosureRecord;target:ClosureTarget;onClose:()=>void;focusClose:boolean}) {
  const stop=target==="SECTION"?null:target==="A"?record.a:record.b;
  const km=record.a.km&&record.b.km?` · กม. ${record.a.km} ถึง กม. ${record.b.km}`:"";
  const route=record.roadMode==="MAP_AB"?record.route:`ทล. ${record.route}`;
  return <section aria-label="รายละเอียดช่วงปิดบนแผนที่" data-closure-popup={target} data-hdms-popup="panel"
    className="absolute inset-x-2 top-2 z-[1000] mx-auto grid max-h-[calc(100%-1rem)] max-w-[22rem] gap-2 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-sm text-[var(--text-primary)]"
    onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();onClose();}}}>
    <button type="button" aria-label="ปิดรายละเอียดบนแผนที่" data-hdms-popup-close ref={node=>{if(focusClose)node?.focus({preventScroll:true});}} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={onClose}><X size={19} aria-hidden="true"/></button>
    <h3 className="flex min-h-8 items-center gap-2 pr-10 font-bold"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--status-danger-wash)] text-[var(--status-danger-ink)]"><Construction size={17} aria-hidden="true"/></span>{stop?`จุดปิด ${target}`:"ปิดการจราจร"}</h3>
    {stop?<ClosureStopDetails stop={stop} compact/>:
      <><p className="line-clamp-1 break-words">{[route,record.section].filter(Boolean).join(" · ")}</p>
      <p className="font-semibold">ผ่านไม่ได้ทั้งสองทิศทาง{km}</p>
      <p className="line-clamp-2 break-words">{record.reason}</p>
      {record.note&&<p className="line-clamp-2 break-words">{record.note}</p>}</>}
    <p className="text-xs text-[var(--text-secondary)]">รายละเอียดเต็มอยู่ใต้แผนที่</p>
  </section>;
}

export function LocalClosureMap({ data, record, center, pick, onPick, fitEndpoints = false, vertexEditor }: {
  data: SystemDataPayload; record: LocalClosureRecord; center: ClosureCoordinate | null;
  pick?: "A"|"B"|null; onPick?: (lat:number,lon:number,mode:string)=>void;
  fitEndpoints?: boolean;
  vertexEditor?: {
    onMove: (index:number,point:ClosureCoordinate)=>void;
    onInsert: (index:number,point:ClosureCoordinate)=>void;
    onSelect: (index:number,via:"click"|"contextmenu")=>void;
  };
}) {
  const context = useMemo(() => ({
    ...data, floodRoutes: [], detourRoutes: [], offices: [],
  }),[data]);
  const pins = useMemo(() => ([
    [record.a.position,"A"], [record.b.position,"B"],
  ] as const).flatMap(([p,label]) => p ? [{ lon:p[0],lat:p[1],label,mode:`CLOSURE-${label}`,draggable:false }] : []),
  [record.a.position,record.b.position]);
  const isEditingLine = Boolean(vertexEditor);
  const rootRef=useRef<HTMLDivElement>(null);
  const [selected,setSelected]=useState<{target:ClosureTarget;focusClose:boolean}|null>(null);
  function closePopup() {
    if(selected) rootRef.current?.querySelector<HTMLElement | SVGElement>(`[aria-label="${labelFor(selected.target)}"]`)?.focus({preventScroll:true});
    setSelected(null);
  }
  const canInspect=!onPick&&!fitEndpoints;
  const closurePresentation=useMemo<ClosureDraftPresentation>(()=>({
    onSelect:canInspect?target=>setSelected({
      target,focusClose:document.activeElement?.getAttribute("aria-label")===labelFor(target),
    }):undefined,
  }),[canInspect]);
  const previewLine = fitEndpoints ? undefined : record.line;
  const readOnlyBounds = useMemo(() => onPick ? undefined :
    [...(record.a.position ? [record.a.position] : []), ...(previewLine ?? []), ...(record.b.position ? [record.b.position] : [])],
  [onPick,record.a.position,record.b.position,previewLine]);
  return <div ref={rootRef} data-testid="local-closure-map" className={`relative ${fitEndpoints?"h-[clamp(18rem,42vh,28rem)]":"h-72 sm:h-96"} overflow-hidden rounded-xl border border-[var(--border-subtle)]`}>
    <Map systemData={context} selectedFloodId="" onSelectFlood={noSelection}
      adminPickMode={pick ? `CLOSURE-${pick}` : null} onCoordinatePicked={onPick}
      vertexEditable={isEditingLine} lockVertexEndpoints
      onVertexMoved={vertexEditor?.onMove} onVertexInserted={vertexEditor?.onInsert} onVertexClicked={vertexEditor?.onSelect}
      draftCoordinates={record.line} draftPickMarkers={pins} draftMode="FLOOD" draftDirectionMeta="UNKNOWN" closurePresentation={closurePresentation} focusCoordinates={center} fitPreviewCoordinates={readOnlyBounds} animateCoordinateFocus={false}/>
    {canInspect&&selected&&<ClosurePopup record={record} target={selected.target} focusClose={selected.focusClose} onClose={closePopup}/>}
  </div>;
}
