"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Construction, MapPin } from "lucide-react";
import type { SystemDataPayload } from "@/db/default-data";
import { readLocalClosure, type ClosureCoordinate } from "@/lib/closure-local-record";
import { LocalClosureMap } from "./LocalClosureMap";

const serverValue=()=>null;
const readParameter=()=>new URLSearchParams(window.location.search).get("closure-view")?.slice(0,128)??null;
const subscribe=(done:()=>void)=>{
  window.addEventListener("popstate",done);
  return ()=>window.removeEventListener("popstate",done);
};
export function useLocalClosureEvent() {
  return useSyncExternalStore(subscribe,readParameter,serverValue);
}

export function LocalClosurePublicPage({ eventId, data }: { eventId:string; data:SystemDataPayload }) {
  const [record]=useState(()=>readLocalClosure(eventId));
  const center=useMemo<ClosureCoordinate|null>(()=>{
    const a=record?.a.position, b=record?.b.position;
    return a&&b?[(a[0]+b[0])/2,(a[1]+b[1])/2]:a??b??null;
  },[record]);
  const detourNames=data.detourRoutes.filter(d=>d.is_active&&record?.detourIds.includes(d.id)).map(d=>d.route_name);
  const time=record?.begins.replace("T"," ");
  return <main className="citizen-ui min-h-screen bg-[var(--bg-card)] p-4 text-[var(--text-primary)]">
    <section className="mx-auto grid w-full max-w-4xl gap-4" aria-label="ข้อมูลปิดการจราจร">
      <a className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-semibold" href={`${process.env.NEXT_PUBLIC_BASE_PATH||""}/`}>
        <ArrowLeft size={16} aria-hidden="true"/>กลับแผนที่ประชาชน</a>
      <h1 className="flex items-center gap-2 text-lg font-bold"><Construction size={21} aria-hidden="true"/>ข้อมูลปิดการจราจร</h1>
      <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-sm">
        ข้อมูลที่บันทึกในเบราว์เซอร์นี้ ไม่ได้เผยแพร่บนแผนที่สาธารณะ</p>
      {record ? <>
        <div className="grid gap-1">
          <h2 className="break-words text-base font-bold">ทางหลวง {record.route} · {record.section}</h2>
          <p className="text-sm">ปิดทั้งสองทิศทาง · กม. {record.a.km} ถึง กม. {record.b.km}</p>
          <p className="text-sm">เริ่มปิด: {time} (เวลาไทย)</p>
          <p className="break-words text-sm">{record.reason}</p>
          {record.note&&<p className="whitespace-pre-line break-words text-sm">{record.note}</p>}
        </div>
        <LocalClosureMap data={data} record={record} center={center}/>
        {!record.line.length&&<p className="text-sm">แสดงตำแหน่ง A/B เท่านั้น ยังไม่มีแนวถนนช่วงปิด</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {([[record.a,"A"],[record.b,"B"]] as const).map(([p,label])=><section key={label} className="grid min-w-0 gap-1 rounded-lg border border-[var(--border-subtle)] p-3">
            <h3 className="flex items-center gap-1 font-bold"><MapPin size={16} aria-hidden="true"/>จุด {label} · กม. {p.km}</h3>
            <p className="break-words text-sm">{p.area}</p>
            <p className="break-words text-sm">{p.landmark}</p>
            {p.position&&<p className="text-xs">พิกัด: {p.position[1]}, {p.position[0]}</p>}
            {p.photo&&<img className="h-32 w-full rounded object-contain" src={p.photo} alt={`รูปจุดปิด ${label}`}/>}
          </section>)}
        </div>
        <section className="grid gap-1 rounded-lg border border-[var(--border-subtle)] p-3">
          <h3 className="font-bold">ทางเลี่ยงที่เกี่ยวข้อง</h3>
          {detourNames.length?<ul className="list-inside list-disc text-sm">{detourNames.map((name,i)=><li key={i}>{name}</li>)}</ul>:
          <p className="text-sm">{record.detourIds.length?"ยังอ่านชื่อทางเลี่ยงที่เลือกไม่ได้":"ไม่มีทางเลี่ยงที่ระบุ"}</p>}
        </section>
      </> : <p role="status">ไม่พบข้อมูลในเบราว์เซอร์นี้ เปิดหน้าจัดการเพื่อบันทึกก่อนครับ</p>}
    </section>
  </main>;
}
