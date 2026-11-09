"use client";

import React, { useState, useEffect } from "react";
import { SystemDataPayload, DohOfficeLocation } from "@/db/default-data";
import { APP_CONFIG, DEFAULT_DOH_OFFICES } from "@/lib/constants";
import { Settings, Building, Plus, Edit, Trash2, Phone, ExternalLink, Upload, Image as ImageIcon, MapPin } from "lucide-react";
import { updateSystemSettingsAction, saveOfficeAction, deleteOfficeAction } from "@/app/actions/doh-actions";
import { compressImageToBase64 } from "@/lib/gis-utils";
import { ActionButton } from "@/components/admin/ui";

interface SystemSettingsTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  adminPickMode?: string | null;
  setAdminPickMode: (mode: string | null) => void;
  pickedCoordinate?: { lat: number; lon: number; mode: string } | null;
  onOfficeEditModeChange?: (officeId: string | null) => void;
}

export function SystemSettingsTab({
  systemData,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  adminPickMode,
  setAdminPickMode,
  pickedCoordinate,
  onOfficeEditModeChange,
}: SystemSettingsTabProps) {
  const [sysName, setSysName] = useState(systemData.systemSettings?.name || APP_CONFIG.TITLE);
  const [sysOrg, setSysOrg] = useState(systemData.systemSettings?.org || APP_CONFIG.ORGANIZATION);
  const [sysDesc, setSysDesc] = useState(
    systemData.systemSettings?.desc || "ระบบติดตามและรายงานสถานการณ์อุทกภัย เส้นทางน้ำท่วมและทางเลี่ยงแบบเรียลไทม์"
  );
  const [sysPhone, setSysPhone] = useState(systemData.systemSettings?.phone || APP_CONFIG.HOTLINE);
  const [sysLogo, setSysLogo] = useState(systemData.systemSettings?.logoUrl || "");

  const [isOfficeFormOpen, setIsOfficeFormOpen] = useState(false);
  const [officeEditId, setOfficeEditId] = useState("");
  const [officeName, setOfficeName] = useState("");
  const [officeType, setOfficeType] = useState<"HEADQUARTERS" | "SUBDIVISION" | "SERVICE_POINT">("SUBDIVISION");
  const [officeAddress, setOfficeAddress] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [officeLat, setOfficeLat] = useState(6.815);
  const [officeLon, setOfficeLon] = useState(101.25);
  const [officeCoordText, setOfficeCoordText] = useState("6.815, 101.25");

  const parseCoordinatePair = (value: string): [number, number] | null => {
    const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (numbers.length < 2) return null;
    const [lat, lon] = numbers;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return [lat, lon];
  };

  useEffect(() => {
    if (pickedCoordinate && ["OFFICE_PIN", "OFFICE_DRAG"].includes(pickedCoordinate.mode)) {
      setOfficeLat(pickedCoordinate.lat);
      setOfficeLon(pickedCoordinate.lon);
      setOfficeCoordText(`${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
      onToast(`${pickedCoordinate.mode === "OFFICE_DRAG" ? "ย้าย" : "ปัก"}หมุดพิกัดสำนักงาน: ${pickedCoordinate.lat}, ${pickedCoordinate.lon}`);
    }
  }, [pickedCoordinate, onToast]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressImageToBase64(file, 400, 0.85);
      setSysLogo(base64);
      onToast("อัปโหลดไฟล์ตราสัญลักษณ์สำเร็จ กรุณากดบันทึกข้อมูลระบบ");
    } catch {
      onToast("ไม่สามารถประมวลผลไฟล์รูปภาพได้");
    }
  };

  const handleSaveSystemSettings = async () => {
    try {
      const res = await updateSystemSettingsAction({
        name: sysName,
        org: sysOrg,
        desc: sysDesc,
        phone: sysPhone,
        logoUrl: sysLogo,
      });
      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal("บันทึกข้อมูลระบบเรียบร้อย", "ข้อมูลชื่อระบบ เบอร์ติดต่อ และตราสัญลักษณ์จะแสดงบนหน้าประชาชนและแอดมินทันที");
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    }
  };

  const handleSaveOffice = async () => {
    if (!officeName || !officeAddress) {
      onToast("กรุณากรอกชื่อและที่ตั้งสำนักงาน");
      return;
    }
    const id = officeEditId || "OFF-" + Date.now().toString().slice(-4);
    try {
      const res = await saveOfficeAction({
        id,
        name: officeName,
        type: officeType,
        address: officeAddress,
        phone: officePhone || "073-349041",
        lat: Number(officeLat),
        lon: Number(officeLon),
        is_active: true,
      });
      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal("บันทึกสำนักงานสำเร็จ", `บันทึกหมุด [${officeName}] เรียบร้อยแล้ว`);
        setIsOfficeFormOpen(false);
        setOfficeEditId("");
        onOfficeEditModeChange?.(null);
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    }
  };

  const handleDeleteOffice = (officeId: string) => {
    showConfirmModal("ยืนยันการลบจุดสำนักงาน?", `ท่านกำลังจะลบจุด [${officeId}] ออกจากแผนที่ประชาชน`, async () => {
      try {
        const res = await deleteOfficeAction(officeId);
        if (res.success) {
          onDataRefresh(res.systemData);
          showSuccessModal("ลบจุดสำนักงานเรียบร้อย", `ลบจุด [${officeId}] แล้ว`);
        }
      } catch (e: any) {
        onToast("เกิดข้อผิดพลาด: " + e.message);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="border-b border-slate-800 pb-3">
        <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-amber-400" /> ข้อมูลระบบและหน่วยงาน
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          กำหนดชื่อระบบ ข้อมูลติดต่อส่วนราชการ และปักหมุดสำนักงานแขวงและหมวดทางหลวง
        </p>
      </div>

      {/* System Metadata Form */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
        <h3 className="font-heading font-bold text-sm text-amber-300">ข้อมูลทั่วไปและเบอร์โทรฉุกเฉิน</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-300">ชื่อระบบทางการ *</label>
            <input
              type="text"
              value={sysName}
              onChange={(e) => setSysName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300">ชื่อหน่วยงานราชการ *</label>
            <input
              type="text"
              value={sysOrg}
              onChange={(e) => setSysOrg(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300">สายด่วน / เบอร์ติดต่อประสานงาน</label>
            <input
              type="text"
              value={sysPhone}
              onChange={(e) => setSysPhone(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300">คำอธิบายระบบโดยย่อ</label>
            <input
              type="text"
              value={sysDesc}
              onChange={(e) => setSysDesc(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Agency Logo Upload (Issue #9) */}
        <div className="pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-200 block mb-1.5">
            ตราสัญลักษณ์ / โลโก้หน่วยงาน (แทนที่ไอคอนระบบ)
          </label>
          <div className="flex flex-wrap items-center gap-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-700 bg-slate-950 flex items-center justify-center overflow-hidden shrink-0">
              {sysLogo ? (
                <img src={sysLogo} alt="Logo Preview" className="w-full h-full object-contain p-1" />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-600" />
              )}
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-heading font-medium flex items-center gap-1.5 border border-slate-700 transition">
                  <Upload className="w-3.5 h-3.5 text-amber-400" /> อัปโหลดรูปภาพตราสัญลักษณ์
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
                {sysLogo && (
                  <button
                    type="button"
                    onClick={() => setSysLogo("")}
                    className="text-xs text-red-400 hover:text-red-300 py-1.5 px-2 font-medium"
                  >
                    ลบรูปภาพ
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                รองรับ PNG, JPG, SVG, WebP แนะนำพื้นหลังโปร่งใส (จะแสดงผลแทนที่ไอคอน ขท. / สามเหลี่ยมเตือนภัย บนแถบบาร์หลัก)
              </p>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleSaveSystemSettings}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold px-4 py-2 rounded-xl text-xs shadow-md transition"
          >
            บันทึกข้อมูลระบบ
          </button>
        </div>
      </div>

      {/* Office & Service Points Management */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-sky-400" /> หมุดสำนักงานและจุดบริการ
            </h3>
            <p className="text-xs text-slate-400">
              แสดงเป็นไอคอนอาคารบนแผนที่ประชาชน (แตะดูที่อยู่ เบอร์โทรตรง และปุ่มนำทาง GPS)
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOfficeEditId("");
              setOfficeName("");
              setOfficeAddress("");
              setOfficePhone("");
              setOfficeLat(6.815);
              setOfficeLon(101.25);
              setOfficeCoordText("6.815, 101.25");
              setIsOfficeFormOpen(true);
              onOfficeEditModeChange?.(null);
            }}
            className="bg-sky-600 hover:bg-sky-500 text-white font-heading font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition shadow"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มสำนักงาน
          </button>
        </div>

        {/* Office Create/Edit Dialog */}
        {isOfficeFormOpen && (
          <div className="bg-slate-950 p-4 rounded-2xl border-2 border-sky-500/60 space-y-3 shadow-xl">
            <h4 className="font-heading font-bold text-xs text-sky-300">
              {officeEditId ? "แก้ไขข้อมูลสำนักงาน" : "เพิ่มหมุดสำนักงานใหม่"}
            </h4>
            {officeEditId && (
              <p role="status" className="rounded-xl border border-sky-700/70 bg-sky-950/50 px-3 py-2 text-xs text-sky-200">
                หมุดของรายการนี้ปลดล็อกแล้ว สามารถลากหมุดอาคารบนแผนที่เพื่อปรับพิกัด และกดบันทึกเพื่อยืนยันตำแหน่งใหม่
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300">ชื่อสำนักงาน / หมวดทางหลวง *</label>
                <input
                  type="text"
                  placeholder="เช่น หมวดทางหลวงหนองจิก"
                  value={officeName}
                  onChange={(e) => setOfficeName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">ประเภทหน่วยงาน</label>
                <select
                  value={officeType}
                  onChange={(e: any) => setOfficeType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  <option value="HEADQUARTERS">สำนักงานใหญ่แขวงทางหลวง</option>
                  <option value="SUBDIVISION">หมวดทางหลวง</option>
                  <option value="SERVICE_POINT">จุดบริการ / เต็นท์อำนวยการ</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-300">ที่ตั้งและสายทาง *</label>
                <input
                  type="text"
                  placeholder="เช่น ต.ดอนยาง อ.หนองจิก จ.ปัตตานี (ทล.43 กม. 53+000)"
                  value={officeAddress}
                  onChange={(e) => setOfficeAddress(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300">เบอร์โทรศัพท์ติดต่อ</label>
                <input
                  type="text"
                  placeholder="เช่น 073-349041 ต่อ 103"
                  value={officePhone}
                  onChange={(e) => setOfficePhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    พิกัดตำแหน่ง (Lat, Lon) *
                  </label>
                  <ActionButton
                    variant="pick"
                    active={adminPickMode === "OFFICE_PIN"}
                    onClick={() => setAdminPickMode("OFFICE_PIN")}
                    className="!min-h-8 !py-1 !px-2.5 !text-[11px]"
                  >
                    {adminPickMode === "OFFICE_PIN" ? "กำลังจิ้มพิกัดบนแผนที่..." : "จิ้มพิกัดบนแผนที่"}
                  </ActionButton>
                </div>
                <div>
                  <input
                    type="text"
                    value={officeCoordText}
                    onChange={(e) => {
                      setOfficeCoordText(e.target.value);
                      const pair = parseCoordinatePair(e.target.value);
                      if (pair) {
                        setOfficeLat(pair[0]);
                        setOfficeLon(pair[1]);
                      }
                    }}
                    onBlur={() => {
                      const pair = parseCoordinatePair(officeCoordText);
                      if (pair) {
                        setOfficeLat(pair[0]);
                        setOfficeLon(pair[1]);
                        setOfficeCoordText(`${pair[0]}, ${pair[1]}`);
                      } else {
                        setOfficeCoordText(`${officeLat}, ${officeLon}`);
                      }
                    }}
                    placeholder="วางจาก Google Maps เช่น 6.731259, 101.095258"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                  <span className="block text-[10px] text-slate-500 mt-1">
                    * สามารถคัดลอกจาก Google Maps (ละติจูด, ลองจิจูด) มาวางลงในช่องนี้ได้ทันที
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setIsOfficeFormOpen(false); setOfficeEditId(""); setAdminPickMode(null); onOfficeEditModeChange?.(null); }}
                className="bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl text-xs"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveOffice}
                className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-heading font-bold px-4 py-1.5 rounded-xl text-xs shadow"
              >
                บันทึกหมุดสำนักงาน
              </button>
            </div>
          </div>
        )}

        {/* Office Items List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(systemData.offices || DEFAULT_DOH_OFFICES).map((off) => (
            <div
              key={off.id}
              className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2 relative"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded font-heading ${
                      off.type === "HEADQUARTERS"
                        ? "bg-amber-400 text-slate-950"
                        : "bg-sky-900 text-sky-300 border border-sky-700"
                    }`}
                  >
                    {off.type === "HEADQUARTERS" ? "สำนักงานใหญ่" : "หมวดทางหลวง"}
                  </span>
                  <h4 className="font-heading font-bold text-sm text-white mt-1">{off.name}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{off.address}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setOfficeEditId(off.id);
                      setOfficeName(off.name);
                      setOfficeType(off.type);
                      setOfficeAddress(off.address);
                      setOfficePhone(off.phone);
                      setOfficeLat(off.lat);
                      setOfficeLon(off.lon);
                      setOfficeCoordText(`${off.lat}, ${off.lon}`);
                      setIsOfficeFormOpen(true);
                      onOfficeEditModeChange?.(off.id);
                    }}
                    aria-label={`แก้ไขสำนักงาน ${off.name}`}
                    className="p-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-amber-300 rounded-lg text-xs"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteOffice(off.id)}
                    aria-label={`ลบสำนักงาน ${off.name}`}
                    className="p-1 bg-slate-900 hover:bg-red-600 hover:text-white text-red-400 rounded-lg text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-amber-300 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {off.phone}
                </span>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${off.lat},${off.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-sky-400 hover:underline flex items-center gap-1 font-heading"
                >
                  <ExternalLink className="w-3 h-3" /> นำทาง
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

