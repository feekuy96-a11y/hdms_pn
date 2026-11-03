"use client";

import React, { useEffect, useState } from "react";
import { MitigationProject, SystemDataPayload } from "@/db/default-data";
import { HIGHWAY_ROUTES } from "@/lib/constants";
import { Briefcase, Plus, Printer, Save, Edit, Trash2, Image as ImageIcon } from "lucide-react";
import { upsertMitigationProjectAction, deleteMitigationProjectAction } from "@/app/actions/doh-actions";
import { createClient } from "@/lib/supabase/client";

interface GovernorProjectsTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  setIsDispatchModalOpen: (open: boolean) => void;
  showConfirmModal: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
}

export function GovernorProjectsTab({
  systemData,
  onDataRefresh,
  onToast,
  setIsDispatchModalOpen,
  showConfirmModal,
  showSuccessModal,
}: GovernorProjectsTabProps) {
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [projId, setProjId] = useState("");
  const [projRouteNo, setProjRouteNo] = useState("42");
  const [projKmRange, setProjKmRange] = useState("");
  const [projLocation, setProjLocation] = useState("");
  const [projStatus, setProjStatus] = useState<"COMPLETED" | "PENDING_BUDGET">("COMPLETED");
  const [projBudget, setProjBudget] = useState(30.0);
  const [projSolution, setProjSolution] = useState("");
  const [projBeforeImg, setProjBeforeImg] = useState("");
  const [projAfterImg, setProjAfterImg] = useState("");
  const [projBeforeFile, setProjBeforeFile] = useState<File | null>(null);
  const [projAfterFile, setProjAfterFile] = useState<File | null>(null);
  const [beforeFilePreview, setBeforeFilePreview] = useState("");
  const [afterFilePreview, setAfterFilePreview] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!projBeforeFile) { setBeforeFilePreview(""); return; }
    const url = URL.createObjectURL(projBeforeFile);
    setBeforeFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [projBeforeFile]);

  useEffect(() => {
    if (!projAfterFile) { setAfterFilePreview(""); return; }
    const url = URL.createObjectURL(projAfterFile);
    setAfterFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [projAfterFile]);

  const uploadProjectImage = async (file: File, side: "before" | "after", projectId: string) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("เลือกรูป JPG, PNG หรือ WebP เท่านั้น");
    if (file.size > 500 * 1024) throw new Error("ขนาดรูปต้องไม่เกิน 500 KB");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `projects/${projectId}/${side}-${crypto.randomUUID()}.${extension}`;
    const client = createClient();
    const { error } = await client.storage.from("flood-images").upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;
    return client.storage.from("flood-images").getPublicUrl(path).data.publicUrl;
  };

  const handleSaveProject = async () => {
    if (!projLocation || !projSolution) {
      onToast("กรุณาระบุสถานที่และแนวทางการแก้ไขปัญหา");
      return;
    }
    const id = projId || `P-${Date.now()}`;
    setIsSaving(true);
    try {
      const beforeImageUrl = projBeforeFile ? await uploadProjectImage(projBeforeFile, "before", id) : projBeforeImg;
      const afterImageUrl = projAfterFile ? await uploadProjectImage(projAfterFile, "after", id) : projAfterImg;
      const res = await upsertMitigationProjectAction({
        projectId: id,
        routeNo: projRouteNo,
        locationName: projLocation,
        kmRange: projKmRange || "กม.0+000 - 1+000",
        statusGroup: projStatus,
        solutionDetail: projSolution,
        budgetMb: Number(projBudget) || 0,
        beforeImageUrl,
        afterImageUrl,
      });

      if (res.success) {
        onDataRefresh(res.systemData);
        showSuccessModal("บันทึกโครงการสำเร็จ", `บันทึกข้อมูลโครงการ [${id}] เรียบร้อยแล้ว`);
        setIsProjectFormOpen(false);
      }
    } catch (e: any) {
      onToast("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = (projectId: string) => {
    showConfirmModal("ยืนยันการลบโครงการ?", `ท่านกำลังจะลบโครงการ [${projectId}] ออกจากแผนงานผู้ว่าฯ`, async () => {
      try {
        const res = await deleteMitigationProjectAction(projectId);
        if (res.success) {
          onDataRefresh(res.systemData);
          showSuccessModal("ลบโครงการสำเร็จ", `ลบข้อมูลโครงการ [${projectId}] เรียบร้อยแล้ว`);
        }
      } catch (e: any) {
        onToast("เกิดข้อผิดพลาด: " + e.message);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-black text-lg text-white flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber-400" /> แผนงานโครงการแก้ไขปัญหาน้ำท่วม (รายงานผู้ว่าฯ)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ติดตามโครงการแก้ไขปัญหาเร่งด่วน ๑๐ โครงการ (งบประมาณ ๑๔๕ ล้านบาท) และพิมพ์เอกสารราชการ
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setProjId("");
              setProjRouteNo("42");
              setProjKmRange("");
              setProjLocation("");
              setProjStatus("COMPLETED");
              setProjBudget(30.0);
              setProjSolution("");
              setProjBeforeImg("");
              setProjAfterImg("");
              setProjBeforeFile(null);
              setProjAfterFile(null);
              setIsProjectFormOpen(true);
            }}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-heading font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" /> เพิ่มโครงการใหม่
          </button>
          <button
            type="button"
            onClick={() => setIsDispatchModalOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-heading font-semibold text-xs px-3.5 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 shadow"
          >
            <Printer className="w-4 h-4" /> พิมพ์
          </button>
        </div>
      </div>

      {/* Add / Edit Project Form */}
      {isProjectFormOpen && (
        <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border-2 border-amber-400/80 space-y-4 shadow-2xl animate-scale-up">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-amber-400" />
              {projId ? `แก้ไขโครงการ [${projId}]` : "เพิ่มโครงการแก้ไขปัญหาน้ำท่วมใหม่"}
            </h3>
            <button
              type="button"
              onClick={() => setIsProjectFormOpen(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ปิดฟอร์ม
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1">หมายเลขทางหลวง (ทล.) *</label>
              <select
                value={projRouteNo}
                onChange={(e) => setProjRouteNo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                {HIGHWAY_ROUTES.map((h) => (
                  <option key={h.no} value={h.no}>
                    ทล.{h.no} - {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">ช่วง กม. *</label>
              <input
                type="text"
                value={projKmRange}
                onChange={(e) => setProjKmRange(e.target.value)}
                placeholder="เช่น กม.12+500 - 13+800"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">สถานะโครงการ *</label>
              <select
                value={projStatus}
                onChange={(e: any) => setProjStatus(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-heading font-medium"
              >
                <option value="COMPLETED">แก้ไขแล้วเสร็จ (Completed)</option>
                <option value="PENDING_BUDGET">รอรับงบประมาณ (Pending Budget)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1">ชื่อโครงการ / สถานที่ดำเนินงาน *</label>
              <input
                type="text"
                value={projLocation}
                onChange={(e) => setProjLocation(e.target.value)}
                placeholder="เช่น ก่อสร้างคันกั้นน้ำและท่อระบายน้ำลอด ต.ดอนรัก"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">งบประมาณที่ใช้ (ล้านบาท) *</label>
              <input
                type="number"
                step="0.01"
                value={projBudget}
                onChange={(e) => setProjBudget(Number(e.target.value))}
                placeholder="เช่น 15.5"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300 block mb-1">รายละเอียดแนวทางการแก้ไขปัญหาทางวิศวกรรม *</label>
            <textarea
              rows={3}
              value={projSolution}
              onChange={(e) => setProjSolution(e.target.value)}
              placeholder="เช่น เสริมผิวจราจรยกสูง ๕๐ ซม. พร้อมขยายสะพานระบายน้ำเพื่อรองรับน้ำหลาก..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white leading-relaxed"
            />
          </div>

          {/* Before & After image uploads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
            <div>
              <label className="text-xs text-rose-300 block mb-1 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" /> รูปถ่ายก่อนแก้ไข
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setProjBeforeFile(e.target.files?.[0] || null)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white file:mr-2 file:rounded-lg file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-white"
              />
              <p className="mt-1 text-[10px] text-slate-500">JPG, PNG หรือ WebP · ไม่เกิน 500 KB</p>
              {projBeforeFile && <p className="text-[10px] text-amber-300">เลือกรูป: {projBeforeFile.name}</p>}
              {(beforeFilePreview || projBeforeImg) && (
                <div className="mt-1.5 rounded-lg overflow-hidden h-24 border border-slate-800 bg-slate-900">
                  <img src={beforeFilePreview || projBeforeImg} alt="ภาพก่อนดำเนินงาน" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-emerald-300 block mb-1 flex items-center gap-1">
                <ImageIcon className="w-3.5 h-3.5" /> รูปถ่ายหลังแก้ไข
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setProjAfterFile(e.target.files?.[0] || null)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white file:mr-2 file:rounded-lg file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-white"
              />
              <p className="mt-1 text-[10px] text-slate-500">JPG, PNG หรือ WebP · ไม่เกิน 500 KB</p>
              {projAfterFile && <p className="text-[10px] text-amber-300">เลือกรูป: {projAfterFile.name}</p>}
              {(afterFilePreview || projAfterImg) && (
                <div className="mt-1.5 rounded-lg overflow-hidden h-24 border border-slate-800 bg-slate-900">
                  <img src={afterFilePreview || projAfterImg} alt="ภาพหลังดำเนินงาน" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsProjectFormOpen(false)}
              className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs hover:bg-slate-700 transition"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSaveProject}
              disabled={isSaving}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-heading font-bold px-5 py-2 rounded-xl text-xs shadow-lg transition flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" /> {isSaving ? "กำลังอัปโหลดและบันทึก" : "บันทึกโครงการ"}
            </button>
          </div>
        </div>
      )}

      {/* Projects List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(systemData.mitigationProjects || []).map((p) => (
          <div
            key={p.project_id}
            className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5 shadow-lg relative group hover:border-slate-700 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-heading font-bold text-amber-300 text-xs">
                โครงการ [{p.project_id}] ทล.{p.route_no}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded font-heading ${
                    p.status_group === "COMPLETED"
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                      : "bg-amber-950 text-amber-300 border border-amber-700"
                  }`}
                >
                  {p.status_group === "COMPLETED" ? "แก้ไขแล้วเสร็จ" : "รอรับงบประมาณ"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setProjId(p.project_id);
                    setProjRouteNo(p.route_no);
                    setProjKmRange(p.km_range);
                    setProjLocation(p.location_name);
                    setProjStatus(p.status_group);
                    setProjBudget(p.budget_mb);
                    setProjSolution(p.solution_detail);
                    setProjBeforeImg(p.before_image_url || "");
                    setProjAfterImg(p.after_image_url || "");
                    setProjBeforeFile(null);
                    setProjAfterFile(null);
                    setIsProjectFormOpen(true);
                  }}
                  title="แก้ไขโครงการ"
                  className="p-1.5 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-amber-300 rounded-lg text-xs transition"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteProject(p.project_id)}
                  title="ลบโครงการ"
                  className="p-1.5 bg-slate-900 hover:bg-red-600 hover:text-white text-red-400 rounded-lg text-xs transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <h4 className="font-heading font-bold text-sm text-white">{p.location_name}</h4>
            <p className="text-xs text-slate-400">{p.solution_detail}</p>

            {/* Before / After Thumbnail Previews */}
            {(p.before_image_url || p.after_image_url) && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {p.before_image_url && (
                  <div className="relative rounded-lg overflow-hidden h-20 border border-slate-800">
                    <img src={p.before_image_url} alt="Before" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 left-1 bg-red-600 text-white text-[9px] font-heading font-black px-1.5 py-0.2 rounded shadow">ก่อนทำ</span>
                  </div>
                )}
                {p.after_image_url && (
                  <div className="relative rounded-lg overflow-hidden h-20 border border-slate-800">
                    <img src={p.after_image_url} alt="After" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 left-1 bg-emerald-600 text-white text-[9px] font-heading font-black px-1.5 py-0.2 rounded shadow">แล้วเสร็จ</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                งบประมาณ: <strong className="text-emerald-400 font-mono">{p.budget_mb} ลบ.</strong>
              </span>
              <span className="text-slate-400 font-mono">ช่วง {p.km_range}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

