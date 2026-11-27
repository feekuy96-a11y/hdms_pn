"use client";
import { useMemo, useState, type FormEvent } from "react";
import { Construction, MapPin, Route, ImagePlus, Save, Layers, PencilLine, Undo2, Trash2, Check, Milestone, Flag, ClipboardList, MapPinCheck } from "lucide-react";
import type { FloodRoute, SystemDataPayload } from "@/db/default-data";
import { snapRouteAction } from "@/app/actions/doh-actions";
import { groupHighwayFeatures, cleanHighwaySectionName } from "@/lib/highway-schema";
import { closureHighwayRange, orderedClosureKm } from "@/lib/closure-highway-range";
import { resolveDetourPinArea } from "@/lib/area-lookup";
import { getLinkedDetoursForFlood } from "@/lib/event-detour-links";
import { haversineDistanceKm } from "@/lib/gis/geo-math";
import { compressImageToAdaptiveBase64 } from "@/lib/gis/image-compress";
import { parseRouteCoordinates } from "@/components/public/public-route-helpers";
import { readLocalClosure, safeLocalPhoto, saveLocalClosure, type ClosureCoordinate, type ClosureRoadMode, type ClosureStop, type LocalClosureRecord } from "@/lib/closure-local-record";
import { LocalClosureMap } from "./LocalClosureMap";
import { StickyActionBar } from "@/components/admin/ui";

const field="min-h-11 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60";
const button="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60";
const primary=button+" bg-[var(--text-primary)] text-[var(--bg-card)]";
const step="min-w-0 space-y-3 border-t border-[var(--border-subtle)] pt-1";
const stepTitle="flex items-center gap-2 pr-3 text-sm font-bold";
const stepNumber="inline-grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--bg-input)] text-xs tabular-nums";
const helper="text-xs leading-relaxed text-[var(--text-secondary)]";
const labelStyle="grid min-w-0 gap-1.5 text-sm font-medium";
const newStop=(): ClosureStop=>({position:null,km:"",area:"",landmark:"",photo:""});
const routeKey=(no:string)=>no.trim().replace(/^ทล\.?\s*/, "").replace(/^0+(?=\d)/, "");
const areaLabel=(area:Awaited<ReturnType<typeof resolveDetourPinArea>>)=>
  area ? [area.tambon&&`ต.${area.tambon}`,area.amphoe&&`อ.${area.amphoe}`,area.province&&`จ.${area.province}`].filter(Boolean).join(" ") : "";

export function AdminLocalClosureForm({ incident, data, eventId }: {
  incident: FloodRoute; data: SystemDataPayload; eventId: string;
}) {
  const chapters=useMemo(()=>groupHighwayFeatures(data.highwayLayers||[]).filter(section=>section.branches.some(
    branch=>branch.branchType==="MAIN_CARRIAGEWAY"&&branch.directionCode!=="B_TO_A"&&branch.coordinates.length>=2
  )),[data.highwayLayers]);
  const incidentRoad=chapters.find(section=>routeKey(section.routeNo)===routeKey(incident.route_no)&&
    cleanHighwaySectionName(section.sectionName)===cleanHighwaySectionName(incident.section_name));
  const [open,setOpen]=useState(false);
  const [record,setRecord]=useState<LocalClosureRecord>(()=>readLocalClosure(eventId)??{
    version:1,eventId,route:incidentRoad?.routeNo||"ถนนทั่วไป",section:incidentRoad?.sectionName||"",
    roadMode:incidentRoad?"HIGHWAY_KM":"MAP_AB",highwayGroupId:incidentRoad?.groupId,
    a:{...newStop(),km:incidentRoad?.kmStart||""},b:{...newStop(),km:incidentRoad?.kmEnd||""},line:[],reason:"",note:"",begins:"",detourIds:[],savedAt:"",
  });
  const [saved,setSaved]=useState(Boolean(record.savedAt));
  const [pick,setPick]=useState<"A"|"B"|null>(null);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const [feedbackStage,setFeedbackStage]=useState<"map"|"details"|"save">("save");
  const [vertexEditing,setVertexEditing]=useState(false);
  const [vertexIndex,setVertexIndex]=useState<number|null>(null);
  const [undoLines,setUndoLines]=useState<ClosureCoordinate[][]>([]);
  const resetLineEditing=()=>{setVertexEditing(false);setVertexIndex(null);setUndoLines([]);};
  const mode=record.roadMode??"MAP_AB";
  const selected=chapters.find(section=>section.groupId===record.highwayGroupId);
  const [roadNo,setRoadNo]=useState(()=>selected?.routeNo||"");
  const availableRoads=[...new Set(chapters.map(section=>section.routeNo))];
  const selectableSections=chapters.filter(section=>section.routeNo===roadNo);
  const center=useMemo<ClosureCoordinate|null>(()=>
    Number.isFinite(incident.lon_start)&&Number.isFinite(incident.lat_start) ? [incident.lon_start,incident.lat_start] : null,
  [incident.lon_start,incident.lat_start]);
  const detours=useMemo(()=>getLinkedDetoursForFlood(incident,data).flatMap(({detour})=>detour.is_active?[detour]:[]),[incident,data]);
  const update=(next: Partial<LocalClosureRecord>)=>{setRecord(r=>({...r,...next}));setSaved(false);setFeedback("");};
  const pointFields=(side:"a"|"b",p:Partial<ClosureStop>)=>{
    setRecord(r=>({...r,[side]:{...r[side],...p}}));setSaved(false);setFeedback("");
  };

  function setRoadMode(roadMode:ClosureRoadMode) {
    if(roadMode===mode)return;
    setPick(null);resetLineEditing();
    setRoadNo(roadMode==="HIGHWAY_KM" ? incidentRoad?.routeNo||"" : "");
    update({roadMode,highwayGroupId:roadMode==="HIGHWAY_KM"?incidentRoad?.groupId:undefined,
      route:roadMode==="HIGHWAY_KM"?incidentRoad?.routeNo||"": "ถนนทั่วไป",
      section:roadMode==="HIGHWAY_KM"?incidentRoad?.sectionName||"":"",
      a:{...newStop(),km:roadMode==="HIGHWAY_KM"?incidentRoad?.kmStart||"":""},
      b:{...newStop(),km:roadMode==="HIGHWAY_KM"?incidentRoad?.kmEnd||"":""},line:[]});
  }

  function changeHighwaySection(groupId:string,routeNo:string) {
    const section=chapters.find(item=>item.groupId===groupId&&item.routeNo===routeNo);
    resetLineEditing();
    update({highwayGroupId:section?.groupId,route:section?.routeNo||"",
      section:section?.sectionName||"",a:{...newStop(),km:section?.kmStart||""},b:{...newStop(),km:section?.kmEnd||""},line:[]});
  }

  function changeHighwayKm(side:"a"|"b",value:string) {
    resetLineEditing();
    update({line:[],a:{...newStop(),km:side==="a"?value:record.a.km},b:{...newStop(),km:side==="b"?value:record.b.km}});
  }

  function lookUpArea(side:"a"|"b",point:ClosureCoordinate) {
    void resolveDetourPinArea(...point).then(area=>{
      if(!area)return;
      setRecord(r=>r[side].position===point&&!r[side].area?{
        ...r,[side]:{...r[side],area:areaLabel(area)}
      }:r);
    }).catch(()=>{});
  }

  function generateHighwayLine() {
    if(busy||!selected)return;
    setFeedbackStage("map");
    const aKm=record.a.km.trim(),bKm=record.b.km.trim();
    if(!orderedClosureKm(aKm,bKm)){setFeedback("กรอกช่วง กม. แบบ 0+000 และให้จุดต้นน้อยกว่าจุดปลาย");return;}
    const line=closureHighwayRange(selected,aKm,bKm);
    if(line.length<2){setFeedback(`ไม่พบแนวที่ครอบคลุมช่วงที่กรอกในตอนนี้ กรุณาตรวจช่วง กม.${selected.kmStart}–${selected.kmEnd}`);return;}
    resetLineEditing();
    const a=line[0],b=line[line.length-1];
    update({line,a:{...newStop(),position:a,km:aKm},b:{...newStop(),position:b,km:bKm}});
    lookUpArea("a",a);lookUpArea("b",b);
    setFeedback("สร้างแนวและหมุด A/B จากช่วง กม. แล้ว กรุณาตรวจบนแผนที่ก่อนบันทึก");
  }

  function pickPoint(lat:number,lon:number,mode:string) {
    if(busy||!pick||mode!==`CLOSURE-${pick}`)return;
    resetLineEditing();
    const side=pick==="A"?"a":"b";
    const point:ClosureCoordinate=[lon,lat];
    setRecord(r=>({...r,line:[],[side]:{...r[side],position:point,area:""}}));
    setSaved(false);setPick(null);setFeedback("");
    lookUpArea(side,point);
  }

  async function findLine() {
    if(busy||!record.a.position||!record.b.position)return;
    const [a,b]=[record.a.position,record.b.position];
    setFeedbackStage("map");
    resetLineEditing();setBusy(true);setFeedback("");
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

  function editLine(index:number,operation:"move"|"insert"|"remove",point?:ClosureCoordinate) {
    if(!vertexEditing||busy||index<=0||index>=record.line.length||
       (operation!=="insert"&&index===record.line.length-1)||
       (operation==="insert"&&record.line.length>=2000)||
       (operation!=="remove"&&(!point||!point.every(Number.isFinite))))return;
    const next=record.line.slice();
    if(operation==="remove")next.splice(index,1);
    else if(operation==="insert")next.splice(index,0,point!);
    else next[index]=point!;
    setUndoLines(previous=>[...previous.slice(-11),record.line]);
    setVertexIndex(null);update({line:next});
  }

  function undoLine() {
    const previous=undoLines.at(-1);
    if(!previous)return;
    update({line:previous});setUndoLines(undoLines.slice(0,-1));setVertexIndex(null);
  }

  async function pickPhoto(side:"a"|"b",file:File) {
    if(busy)return;
    setFeedbackStage("details");
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
    setFeedbackStage("save");
    if(mode==="HIGHWAY_KM"&&(!selected||record.line.length<2)){
      setFeedback("เลือกตอนควบคุมและสร้างแนวจากช่วง กม. ก่อนบันทึก");return;
    }
    if(!record.a.position||!record.b.position){setFeedback("ปักหมุด A และ B บนแผนที่ก่อนบันทึก");return;}
    if(record.a.position[0]===record.b.position[0]&&record.a.position[1]===record.b.position[1]){
      setFeedback("หมุด A และ B ต้องเป็นคนละจุด");return;
    }
    if((mode==="HIGHWAY_KM"||record.a.km.trim()||record.b.km.trim())&&!orderedClosureKm(record.a.km,record.b.km)){
      setFeedback("กรอกหลัก กม. แบบ 0+000 และให้หลัก กม. ของ A น้อยกว่า B");return;
    }
    if(!record.reason.trim()||!record.a.area.trim()||!record.b.area.trim()||
       !record.a.landmark.trim()||!record.b.landmark.trim()){
      setFeedback("กรอกเหตุผล พื้นที่และจุดสังเกตของ A/B ให้ครบ");return;
    }
    const next={...record,savedAt:new Date().toISOString()};
    try {saveLocalClosure(next);setRecord(next);setSaved(true);setFeedback("บันทึกข้อมูลในเบราว์เซอร์นี้แล้ว");}
    catch {setFeedback("บันทึกไม่ได้ พื้นที่จัดเก็บของเบราว์เซอร์อาจเต็มหรือถูกปิด");}
  }

  const viewHref=`${process.env.NEXT_PUBLIC_BASE_PATH||""}/?closure-view=${encodeURIComponent(eventId)}`;
  return <section aria-label="ข้อมูลปิดการจราจร" className="mt-4 grid min-w-0 gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-[var(--text-primary)] sm:p-4">
    <header className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--status-danger-wash)] text-[var(--status-danger-ink)]"><Construction size={21} aria-hidden="true"/></span>
      <div className="min-w-0 space-y-0.5">
        <h4 className="text-base font-bold">ข้อมูลปิดการจราจร</h4>
        <p className={helper}>ปิดทั้งสองทิศทาง · บันทึกเฉพาะในเบราว์เซอร์นี้</p>
      </div>
    </header>
    {!open ? <div className="flex flex-wrap gap-2">
      <button className={primary} type="button" onClick={()=>setOpen(true)}>{saved?"แก้ไขข้อมูลปิดการจราจร":"กรอกข้อมูลปิดการจราจร"}</button>
      {saved&&<a className={button} href={viewHref} target="_blank" rel="noopener">ดูบนแผนที่หน้าประชาชน</a>}
    </div> : <form className="grid min-w-0 gap-5" onSubmit={save}>
      <fieldset className={step}>
        <legend className={stepTitle}><span className={stepNumber} aria-hidden="true">1</span>เลือกประเภทถนน</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["HIGHWAY_KM","ทางหลวงในความรับผิดชอบ"],["MAP_AB","ถนนทั่วไป · ปัก A/B"]] as const).map(([value,label])=>
            <label key={value} className="relative flex min-h-14 cursor-pointer items-start gap-2 rounded-xl border border-[var(--border-subtle)] p-2.5 text-sm has-[:checked]:border-[var(--focus-ring)] has-[:checked]:bg-[var(--bg-input)]">
              <input type="radio" name="closure-road-mode" value={value} checked={mode===value} disabled={busy}
                onChange={()=>setRoadMode(value)} className="mt-1 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"/>
              {value==="HIGHWAY_KM"?<Layers size={17} className="mt-0.5 shrink-0" aria-hidden="true"/>:<MapPin size={17} className="mt-0.5 shrink-0" aria-hidden="true"/>}
              <span className="min-w-0"><span className="block font-semibold">{label}</span><span className={helper} aria-hidden="true">{value==="HIGHWAY_KM"?"เลือกสายทาง ตอนควบคุม และช่วง กม.":"เลือกจุดเริ่มต้นและจุดสิ้นสุดบนแผนที่"}</span></span>
            </label>)}
        </div>
      </fieldset>
      {mode==="HIGHWAY_KM" ? <fieldset className={step}>
        <legend className={stepTitle}><span className={stepNumber} aria-hidden="true">2</span>กำหนดช่วงจากหลักกิโลเมตร</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={labelStyle}>หมายเลขทางหลวง<select aria-label="หมายเลขทางหลวง" className={field} value={roadNo}
            onChange={e=>{setRoadNo(e.target.value);changeHighwaySection("",e.target.value);}}>
            <option value="">เลือกหมายเลขทางหลวง</option>
            {availableRoads.map(no=><option key={no} value={no}>ทล.{no}</option>)}
          </select></label>
          <label className={labelStyle}>ตอนควบคุม<select aria-label="ตอนควบคุม" className={field} value={selected?.groupId||""} disabled={!roadNo}
            onChange={e=>changeHighwaySection(e.target.value,roadNo)}>
            <option value="">เลือกตอนควบคุม</option>
            {selectableSections.map(section=><option key={section.groupId} value={section.groupId}>{section.sectionName}</option>)}
          </select></label>
        </div>
        {selected&&<p className="flex items-center gap-2 rounded-lg bg-[var(--bg-input)] px-3 py-2 text-xs tabular-nums"><Milestone size={15} aria-hidden="true"/>ช่วงในบัญชีสายทาง: กม. {selected.kmStart} ถึง {selected.kmEnd}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={labelStyle}>กม. เริ่มต้น (A)<input className={field} value={record.a.km} placeholder="0+000" maxLength={12}
            disabled={!selected} onChange={e=>changeHighwayKm("a",e.target.value)}/></label>
          <label className={labelStyle}>กม. สิ้นสุด (B)<input className={field} value={record.b.km} placeholder="0+000" maxLength={12}
            disabled={!selected} onChange={e=>changeHighwayKm("b",e.target.value)}/></label>
        </div>
        <button type="button" className={primary} disabled={busy||!selected||!record.a.km.trim()||!record.b.km.trim()} onClick={generateHighwayLine}>
          <Route size={16} aria-hidden="true"/>สร้างแนวจากช่วง กม.
        </button>
      </fieldset> : <fieldset className={step}>
        <legend className={stepTitle}><span className={stepNumber} aria-hidden="true">2</span>กำหนดตำแหน่งบนแผนที่</legend>
        <p className="text-xs text-[var(--text-secondary)]">แตะปุ่มของจุดที่ต้องการ แล้วแตะตำแหน่งบนแผนที่ หากปักผิดให้กดย้ายจุดและแตะใหม่</p>
        <label className={labelStyle}>ชื่อถนนหรือช่วงที่ปิด (ถ้าทราบ)<input className={field} value={record.section}
          maxLength={260} onChange={e=>update({section:e.target.value})}/></label>
        <div className="flex flex-wrap gap-2">
        {(["A","B"] as const).map(side=><button type="button" key={side} className={button} aria-pressed={pick===side} disabled={busy}
            onClick={()=>{resetLineEditing();setPick(pick===side?null:side);setFeedback("");}}><MapPin size={16} aria-hidden="true"/>
          {record[side==="A"?"a":"b"].position?"ย้ายจุด":"ปักจุด"} {side}</button>)}
        <button type="button" className={primary} disabled={busy||Boolean(pick)||!record.a.position||!record.b.position} onClick={()=>void findLine()}>
          <Route size={16} aria-hidden="true"/>หาแนวถนน A–B</button>
        </div>
      </fieldset>}
      <fieldset className={step}>
        <legend className={stepTitle}><span className={stepNumber} aria-hidden="true">3</span>ตรวจและปรับแนวบนแผนที่</legend>
        {feedback&&feedbackStage==="map"&&<p role="status" className="rounded-lg bg-[var(--bg-input)] px-3 py-2 text-sm">{feedback}</p>}
        {pick&&<p role="status" className="flex items-center gap-2 rounded-lg bg-[var(--bg-input)] px-3 py-2 text-sm font-semibold"><MapPin size={17} aria-hidden="true"/>แตะแผนที่เพื่อปักจุด {pick}</p>}
        {record.line.length>=2&&<div role="group" aria-label="เครื่องมือแก้แนวเส้น" className="flex flex-wrap gap-2">
          <button type="button" className={vertexEditing?primary:button} aria-pressed={vertexEditing} disabled={busy||Boolean(pick)}
            onClick={()=>{setVertexEditing(!vertexEditing);setVertexIndex(null);}}>{vertexEditing?<Check size={16} aria-hidden="true"/>:<PencilLine size={16} aria-hidden="true"/>}{vertexEditing?"เสร็จสิ้นการดัดเส้น":"ดัดแนวเส้น"}</button>
          {vertexEditing&&<>
            <button type="button" className={button} disabled={vertexIndex===null} onClick={()=>vertexIndex!==null&&editLine(vertexIndex,"remove")}><Trash2 size={16} aria-hidden="true"/>ลบจุดที่เลือก</button>
            <button type="button" className={button} disabled={undoLines.length===0} onClick={undoLine}><Undo2 size={16} aria-hidden="true"/>ย้อนกลับ</button>
          </>}
        </div>}
        {vertexEditing&&<p className={helper}><strong>เพิ่มจุด:</strong> แตะจุดกึ่งกลาง · <strong>ย้ายจุด:</strong> ลากจุดกลางเส้น · <strong>ลบจุด:</strong> เลือกจุดแล้วกดลบ หมุด A/B จะอยู่ที่เดิม</p>}
        <LocalClosureMap data={data} record={record} center={center} pick={pick} fitEndpoints onPick={mode==="MAP_AB"?pickPoint:undefined}
          vertexEditor={vertexEditing?{onMove:(index,point)=>editLine(index,"move",point),onInsert:(index,point)=>editLine(index,"insert",point),
            onSelect:(index,via)=>via==="contextmenu"?editLine(index,"remove"):setVertexIndex(index)}:undefined}/>
      </fieldset>
      <fieldset className={step}>
        <legend className={stepTitle}><span className={stepNumber} aria-hidden="true">4</span>พื้นที่และจุดสังเกต</legend>
        {feedback&&feedbackStage==="details"&&<p role="status" className="text-sm">{feedback}</p>}
        <p className={helper}>ตรวจพื้นที่ของแต่ละหมุด แล้วใส่จุดสังเกตที่คนเดินทางรู้จัก</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {(["a","b"] as const).map(side=>{
          const p=record[side],label=side.toUpperCase();
          return <div key={side} role="group" aria-label={side==="a"?"จุดเริ่มต้น A":"จุดสิ้นสุด B"} className="grid min-w-0 content-start gap-3 rounded-xl border border-[var(--border-subtle)] p-3">
            <div className="flex min-w-0 items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--bg-input)]"><MapPin size={18} aria-hidden="true"/></span>
              <div className="min-w-0"><p className="text-sm font-bold">{side==="a"?"จุดเริ่มต้น A":"จุดสิ้นสุด B"}</p>
                <p className={helper}>{mode==="HIGHWAY_KM"&&p.km?<span className="tabular-nums">กม. {p.km}</span>:p.position?"ระบุตำแหน่งแล้ว":"ยังไม่ได้ปัก"}</p></div>
            </div>
            <label className={labelStyle}>พื้นที่ {label}<input className={field} value={p.area} maxLength={180} onChange={e=>pointFields(side,{area:e.target.value})}/></label>
            <label className={labelStyle}>จุดสังเกต {label}<input className={field} value={p.landmark} maxLength={180} onChange={e=>pointFields(side,{landmark:e.target.value})}/></label>
            {p.position&&<p className={helper}>พิกัด: <span className="tabular-nums">{p.position[1].toFixed(6)}, {p.position[0].toFixed(6)}</span></p>}
            <label className={labelStyle}><span className="flex items-center gap-2"><ImagePlus size={16} aria-hidden="true"/>แนบรูปจุด {label}</span>
              <input className={field+" py-1.5 file:mr-2 file:rounded-md file:border-0 file:bg-[var(--bg-card)] file:px-2 file:py-1 file:text-[var(--text-primary)]"} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
                onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void pickPhoto(side,f);}}/></label>
            {p.photo&&<><img src={p.photo} alt={`รูปจุดปิด ${label}`} className="h-24 w-full rounded object-contain"/>
              <button type="button" className={button} onClick={()=>pointFields(side,{photo:""})}>นำรูป {label} ออก</button></>}
          </div>;
        })}
        </div>
      </fieldset>
      <fieldset className={step}>
        <legend className={stepTitle}><span className={stepNumber} aria-hidden="true">5</span>เหตุผลและทางเลี่ยง</legend>
      <label className={labelStyle}>เหตุผลที่ปิด<textarea className={field+" min-h-20 py-2"} value={record.reason} maxLength={500} onChange={e=>update({reason:e.target.value})}/></label>
      <label className={labelStyle}>รายละเอียดเพิ่มเติม<textarea placeholder="เช่น ปิดจนกว่าสถานการณ์จะคลี่คลาย" className={field+" min-h-20 py-2"} value={record.note} maxLength={500} onChange={e=>update({note:e.target.value})}/></label>
      <p className="text-xs text-[var(--text-secondary)]">หากทราบช่วงเวลา ให้พิมพ์ในรายละเอียดเพิ่มเติม{record.begins&&` · เวลาเริ่มที่บันทึกไว้เดิม: ${record.begins.replace("T"," ")} (เวลาไทย)`}</p>
      <fieldset className="grid gap-1"><legend className="text-sm font-bold">ทางเลี่ยงที่เกี่ยวข้อง</legend>
        {detours.length===0&&<p className="text-xs">ยังไม่มีทางเลี่ยงที่ผูกกับเหตุการณ์นี้</p>}
        {detours.map(detour=><label key={detour.id} className="flex min-h-11 items-center gap-2 break-words text-sm">
          <input type="checkbox" checked={record.detourIds.includes(detour.id)}
            onChange={e=>update({detourIds:e.target.checked?[...record.detourIds,detour.id]:record.detourIds.filter(id=>id!==detour.id)})}/>
          {detour.route_name}</label>)}
      </fieldset>
      </fieldset>
      <fieldset className={step}>
        <legend className={stepTitle}><span className={stepNumber} aria-hidden="true">6</span>ตรวจข้อมูลก่อนบันทึก</legend>
      <div className="grid gap-2 rounded-xl bg-[var(--bg-input)] p-3">
        <p className="flex items-center gap-2 text-sm font-bold"><ClipboardList size={17} aria-hidden="true"/>ปิดทั้งสองทิศทาง</p>
        {mode==="HIGHWAY_KM"&&selected?<><p className="break-words text-sm">ทล. {selected.routeNo} · {selected.sectionName}</p>
          <p className="flex items-center gap-2 text-sm tabular-nums"><Flag size={16} aria-hidden="true"/>กม. {record.a.km||"–"} ถึง {record.b.km||"–"}</p></>:record.a.position&&record.b.position&&<p className="flex items-center gap-2 text-sm"><MapPinCheck size={16} aria-hidden="true"/>ระบุตำแหน่ง A และ B แล้ว</p>}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">บันทึกในเบราว์เซอร์นี้เท่านั้น ไม่เผยแพร่บนแผนที่สาธารณะ</p>
      {saved&&<a className={button+" w-fit"} href={viewHref} target="_blank" rel="noopener">ดูบนแผนที่หน้าประชาชน</a>}
      </fieldset>
      <StickyActionBar themed>
        <button type="submit" disabled={busy} data-hdms-primary className={primary}><Save size={16} aria-hidden="true"/>บันทึกข้อมูลปิดการจราจร</button>
        <button type="button" className={button} disabled={busy} onClick={()=>{setPick(null);setOpen(false);}}>ย่อฟอร์ม</button>
        {feedback&&feedbackStage==="save"&&<p role="status" className="basis-full text-sm">{feedback}</p>}
      </StickyActionBar>
    </form>}
  </section>;
}
