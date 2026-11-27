"use client";
import { useMemo, useState, type FormEvent } from "react";
import { Construction, MapPin, Route, ImagePlus, Save } from "lucide-react";
import type { FloodRoute, SystemDataPayload } from "@/db/default-data";
import { snapRouteAction } from "@/app/actions/doh-actions";
import { resolveDetourPinArea } from "@/lib/area-lookup";
import { getLinkedDetoursForFlood } from "@/lib/event-detour-links";
import { haversineDistanceKm } from "@/lib/gis/geo-math";
import { compressImageToAdaptiveBase64 } from "@/lib/gis/image-compress";
import { parseRouteCoordinates } from "@/components/public/public-route-helpers";
import { readLocalClosure, safeLocalPhoto, saveLocalClosure, type ClosureCoordinate, type ClosureStop, type LocalClosureRecord } from "@/lib/closure-local-record";
import { LocalClosureMap } from "./LocalClosureMap";

const field="min-h-11 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)]";
const button="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60";
const newStop=(): ClosureStop=>({position:null,km:"",area:"",landmark:"",photo:""});
const kmValue=(value:string)=>{const m=value.match(/^(\d{1,4})\+(\d{3})$/);return m ? +m[1]*1000 + +m[2] : -1;};

export function AdminLocalClosureForm({ incident, data, eventId }: {
  incident: FloodRoute; data: SystemDataPayload; eventId: string;
}) {
  const [open,setOpen]=useState(false);
  const [record,setRecord]=useState<LocalClosureRecord>(()=>readLocalClosure(eventId)??{
    version:1,eventId,route:incident.route_no,section:incident.section_name,
    a:newStop(),b:newStop(),line:[],reason:"",note:"",begins:"",detourIds:[],savedAt:"",
  });
  const [saved,setSaved]=useState(Boolean(record.savedAt));
  const [pick,setPick]=useState<"A"|"B"|null>(null);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const center=useMemo<ClosureCoordinate|null>(()=>
    Number.isFinite(incident.lon_start)&&Number.isFinite(incident.lat_start) ? [incident.lon_start,incident.lat_start] : null,
  [incident.lon_start,incident.lat_start]);
  const detours=useMemo(()=>getLinkedDetoursForFlood(incident,data).flatMap(({detour})=>detour.is_active?[detour]:[]),[incident,data]);
  const update=(next: Partial<LocalClosureRecord>)=>{setRecord(r=>({...r,...next}));setSaved(false);setFeedback("");};
  const pointFields=(side:"a"|"b",p:Partial<ClosureStop>)=>{
    setRecord(r=>({...r,[side]:{...r[side],...p}}));setSaved(false);setFeedback("");
  };

  function pickPoint(lat:number,lon:number,mode:string) {
    if(busy||!pick||mode!==`CLOSURE-${pick}`)return;
    const side=pick==="A"?"a":"b";
    const point:ClosureCoordinate=[lon,lat];
    setRecord(r=>({...r,line:[],[side]:{...r[side],position:point,area:""}}));
    setSaved(false);setPick(null);setFeedback("");
    void resolveDetourPinArea(...point).then(area=>{
      if(!area)return;
      setRecord(r=>r[side].position===point&&!r[side].area?{
        ...r,[side]:{...r[side],area:[area.tambon&&`ต.${area.tambon}`,area.amphoe&&`อ.${area.amphoe}`,area.province&&`จ.${area.province}`].filter(Boolean).join(" ")}
      }:r);
    }).catch(()=>{});
  }

  async function findLine() {
    if(busy||!record.a.position||!record.b.position)return;
    const [a,b]=[record.a.position,record.b.position];
    setBusy(true);setFeedback("");
    try {
      const line=parseRouteCoordinates(await snapRouteAction(a,b));
      if(line.length<2||line.length>2000||
         haversineDistanceKm(a,line[0])>0.04||haversineDistanceKm(b,line[line.length-1])>0.04) {
        throw new Error("ไม่พบแนวถนนตรงกับหมุด A/B กรุณาตรวจพิกัด ระบบจะไม่ลากเส้นตรงแทน");
      }
      update({line});
      setFeedback("แสดงแนวจากระบบแล้ว กรุณาตรวจว่าตรงกับช่วงปิดจริง");
    } catch(e) {
      update({line:[]});setFeedback(e instanceof Error ? e.message : "หาแนวถนนไม่สำเร็จ");
    } finally {setBusy(false);}
  }

  async function pickPhoto(side:"a"|"b",file:File) {
    if(busy)return;
    if(!/^(image\/(jpeg|png|webp))$/.test(file.type)||file.size>12*1024*1024){
      setFeedback("เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 12 MB");return;
    }
    setBusy(true);setFeedback("");
    try {
      const {dataUrl}=await compressImageToAdaptiveBase64(file,210*1024);
      if(!safeLocalPhoto(dataUrl))throw new Error();
      pointFields(side,{photo:dataUrl});
    } catch {setFeedback("อ่านรูปนี้ไม่ได้ กรุณาลองไฟล์อื่น");}
    finally {setBusy(false);}
  }

  function save(e:FormEvent) {
    e.preventDefault();
    if(busy)return;
    if(!record.a.position||!record.b.position){setFeedback("ปักหมุด A และ B บนแผนที่ก่อนบันทึก");return;}
    if(record.a.position[0]===record.b.position[0]&&record.a.position[1]===record.b.position[1]){
      setFeedback("หมุด A และ B ต้องเป็นคนละจุด");return;
    }
    if(kmValue(record.a.km)<0||kmValue(record.a.km)>=kmValue(record.b.km)){
      setFeedback("กรอกหลัก กม. แบบ 0+000 และให้หลัก กม. ของ A น้อยกว่า B");return;
    }
    if(!record.reason.trim()||!record.a.area.trim()||!record.b.area.trim()||
       !record.a.landmark.trim()||!record.b.landmark.trim()||!record.begins){
      setFeedback("กรอกวันเวลา เหตุผล พื้นที่และจุดสังเกตของ A/B ให้ครบ");return;
    }
    const next={...record,savedAt:new Date().toISOString()};
    try {saveLocalClosure(next);setRecord(next);setSaved(true);setFeedback("บันทึกข้อมูลในเบราว์เซอร์นี้แล้ว");}
    catch {setFeedback("บันทึกไม่ได้ พื้นที่จัดเก็บของเบราว์เซอร์อาจเต็มหรือถูกปิด");}
  }

  const viewHref=`${process.env.NEXT_PUBLIC_BASE_PATH||""}/?closure-view=${encodeURIComponent(eventId)}`;
  return <section aria-label="ข้อมูลปิดการจราจร" className="mt-4 grid gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-[var(--text-primary)]">
    <h4 className="flex items-center gap-2 text-sm font-bold"><Construction size={18} aria-hidden="true"/>ข้อมูลปิดการจราจร</h4>
    <p className="text-xs text-[var(--text-secondary)]">ปิดทั้งสองทิศทาง · ข้อมูลอยู่ในเบราว์เซอร์นี้ ไม่เปลี่ยนแผนที่ของผู้ใช้คนอื่น</p>
    {!open ? <div className="flex flex-wrap gap-2">
      <button className={button} type="button" onClick={()=>setOpen(true)}>{saved?"แก้ไขข้อมูลปิดการจราจร":"กรอกข้อมูลปิดการจราจร"}</button>
      {saved&&<a className={button} href={viewHref} target="_blank" rel="noopener">ดูบนแผนที่หน้าประชาชน</a>}
    </div> : <form className="grid gap-4" onSubmit={save}>
      <div className="flex flex-wrap gap-2">
        {(["A","B"] as const).map(side=><button type="button" key={side} className={button} aria-pressed={pick===side} disabled={busy}
            onClick={()=>{setPick(pick===side?null:side);setFeedback("");}}><MapPin size={16} aria-hidden="true"/>ปักจุด {side}</button>)}
        <button type="button" className={button} disabled={busy||Boolean(pick)||!record.a.position||!record.b.position} onClick={()=>void findLine()}>
          <Route size={16} aria-hidden="true"/>หาแนวถนน A–B</button>
      </div>
      {pick&&<p role="status" className="text-xs">แตะแผนที่เพื่อปักจุด {pick}</p>}
      <LocalClosureMap data={data} record={record} center={center} pick={pick} onPick={pickPoint}/>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["a","b"] as const).map(side=>{
          const p=record[side],label=side.toUpperCase();
          return <fieldset key={side} className="grid min-w-0 gap-2 rounded-lg border border-[var(--border-subtle)] p-3">
            <legend className="px-1 text-sm font-bold">{side==="a"?"จุดต้น A":"จุดปลาย B"}</legend>
            <p className="text-xs">พิกัด: {p.position?`${p.position[1]}, ${p.position[0]}`:"ยังไม่ได้ปัก"}</p>
            <label className="text-sm">หลัก กม. {label}<input className={field} value={p.km} maxLength={12} placeholder="0+000" onChange={e=>pointFields(side,{km:e.target.value})}/></label>
            <label className="text-sm">พื้นที่ {label}<input className={field} value={p.area} maxLength={180} onChange={e=>pointFields(side,{area:e.target.value})}/></label>
            <label className="text-sm">จุดสังเกต {label}<input className={field} value={p.landmark} maxLength={180} onChange={e=>pointFields(side,{landmark:e.target.value})}/></label>
            <label className="text-sm"><ImagePlus size={15} className="mr-1 inline" aria-hidden="true"/>แนบรูปจุด {label}
              <input className={field} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
                onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void pickPhoto(side,f);}}/></label>
            {p.photo&&<><img src={p.photo} alt={`รูปจุดปิด ${label}`} className="h-24 w-full rounded object-contain"/>
              <button type="button" className={button} onClick={()=>pointFields(side,{photo:""})}>นำรูป {label} ออก</button></>}
          </fieldset>;
        })}
      </div>
      <label className="text-sm">เริ่มปิด (วันและเวลาไทย)<input className={field} type="datetime-local" value={record.begins} onChange={e=>update({begins:e.target.value})}/></label>
      <label className="text-sm">เหตุผลที่ปิด<textarea className={field} value={record.reason} maxLength={500} onChange={e=>update({reason:e.target.value})}/></label>
      <label className="text-sm">รายละเอียดเพิ่มเติม<textarea className={field} value={record.note} maxLength={500} onChange={e=>update({note:e.target.value})}/></label>
      <fieldset className="grid gap-1"><legend className="text-sm font-bold">ทางเลี่ยงที่เกี่ยวข้อง</legend>
        {detours.length===0&&<p className="text-xs">ยังไม่มีทางเลี่ยงที่ผูกกับเหตุการณ์นี้</p>}
        {detours.map(detour=><label key={detour.id} className="flex min-h-11 items-center gap-2 break-words text-sm">
          <input type="checkbox" checked={record.detourIds.includes(detour.id)}
            onChange={e=>update({detourIds:e.target.checked?[...record.detourIds,detour.id]:record.detourIds.filter(id=>id!==detour.id)})}/>
          {detour.route_name}</label>)}
      </fieldset>
      <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">
        <button disabled={busy} className={button+" bg-[var(--bg-input)]"}><Save size={16} aria-hidden="true"/>บันทึกข้อมูลปิดการจราจร</button>
        <button type="button" className={button} disabled={busy} onClick={()=>{setPick(null);setOpen(false);}}>ย่อฟอร์ม</button>
        {saved&&<a className={button} href={viewHref} target="_blank" rel="noopener">ดูบนแผนที่หน้าประชาชน</a>}
      </div>
      {feedback&&<p role="status" className="text-sm">{feedback}</p>}
    </form>}
  </section>;
}
