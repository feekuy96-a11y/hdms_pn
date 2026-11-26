"use client";

import { useEffect, useRef } from "react";
import { Building2, MapPin, Phone, X } from "lucide-react";
import type { DohOfficeLocation } from "@/db/default-data";
import { resolveCitizenOfficeDirectory, type CitizenOffice } from "./citizen-office-directory";

function OfficeCard({ office }: { office: CitizenOffice }) {
  return (
    <article className="citizen-office-card">
      <div className="flex min-w-0 gap-2.5">
        <span className="citizen-office-icon"><Building2 size={18} aria-hidden="true" /></span>
        <div className="min-w-0 space-y-1">
          <h3 className="break-words text-sm font-bold">{office.name}</h3>
          {office.availability === "available" ? (
            <>
              <p>{office.address || "ยังไม่มีข้อมูลที่อยู่"}</p>
              {office.tel
                ? <p>{office.phone}</p>
                : office.phone && office.phone !== "-"
                  ? <p>{office.phone} <span>· ยังไม่ยืนยันเบอร์โทร (รูปแบบหมายเลขไม่ถูกต้อง)</span></p>
                  : <p>ยังไม่มีเบอร์โทรที่ใช้งานได้</p>}
              {!office.directions && <p>ยังไม่มีพิกัดสำหรับนำทาง</p>}
            </>
          ) : <p>{office.availability === "ambiguous" ? "ยังยืนยันข้อมูลสำนักงานไม่ได้" : "ยังไม่มีข้อมูลสำนักงาน"}</p>}
        </div>
      </div>
      <div className="citizen-office-actions">
        {office.tel
          ? <a href={office.tel} aria-label={"โทรสอบถาม " + office.name}><Phone size={16} aria-hidden="true" />โทรสอบถาม</a>
          : <button type="button" disabled aria-label={"โทรสอบถาม " + office.name}><Phone size={16} aria-hidden="true" />โทรสอบถาม</button>}
        {office.directions
          ? <a href={office.directions} target="_blank" rel="noopener noreferrer" aria-label={"นำทาง " + office.name}><MapPin size={16} aria-hidden="true" />นำทาง</a>
          : <button type="button" disabled aria-label={"นำทาง " + office.name}><MapPin size={16} aria-hidden="true" />นำทาง</button>}
      </div>
    </article>
  );
}

export function CitizenOfficeDirectory({ offices, onClose }: { offices?: DohOfficeLocation[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  const directory = resolveCitizenOfficeDirectory(offices);
  return (
    <dialog ref={dialogRef} className="citizen-office-directory" aria-labelledby="citizen-offices-title"
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === "Tab") {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not([disabled]),a[href]"
          )).filter(control => control.getClientRects().length > 0);
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="citizen-office-sheet">
        <header className="citizen-office-head">
          <div>
            <h2 id="citizen-offices-title" className="text-lg font-bold">ติดต่อหน่วยงาน</h2>
            <p>แขวงทางหลวงปัตตานีและหมวดทางหลวง</p>
          </div>
          <button type="button" aria-label="ปิดหน้าติดต่อ" className="citizen-theme-button" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="citizen-office-scroll">
          <h3 className="mb-2 text-sm font-bold">สำนักงานใหญ่</h3>
          <OfficeCard office={directory[0]} />
          <h3 className="mb-2 mt-4 text-sm font-bold">หมวดทางหลวง</h3>
          <div className="citizen-office-grid">
            {directory.slice(1).map((office) => <OfficeCard key={office.name} office={office} />)}
          </div>
        </div>
      </div>
    </dialog>
  );
}
