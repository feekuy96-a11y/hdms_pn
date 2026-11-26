"use client";

import { useEffect, useState } from "react";
import {
  hasMeaningfulAdminMapDraft,
  readAdminMapDraft,
  writeAdminMapDraft,
  type AdminMapDraftSnapshot,
} from "@/components/admin/tabs/map-draft-storage";
import type { DetourPhotoLocationState } from "@/components/admin/tabs/useMapRouteFormState";

export interface UseMapRouteDraftParams {
  routeEditId: string | null;
  editingRouteId?: string;
  routeMode: "FLOOD" | "DETOUR";
  setRouteMode: (v: "FLOOD" | "DETOUR") => void;
  routeNo: string;
  setRouteNo: (v: string) => void;
  kmStart: string;
  setKmStart: (v: string) => void;
  kmEnd: string;
  setKmEnd: (v: string) => void;
  sectionName: string;
  setSectionName: (v: string) => void;
  reporterName: string;
  setReporterName: (v: string) => void;
  routeWaterLevel: AdminMapDraftSnapshot["routeWaterLevel"];
  setRouteWaterLevel: (v: AdminMapDraftSnapshot["routeWaterLevel"]) => void;
  routeStatus: AdminMapDraftSnapshot["routeStatus"];
  setRouteStatus: (v: AdminMapDraftSnapshot["routeStatus"]) => void;
  causeAndNote: string;
  setCauseAndNote: (v: string) => void;
  villageOrLandmark: string;
  setVillageOrLandmark: (v: string) => void;
  detourRefId: string;
  setDetourRefId: (v: string) => void;
  detourName: string;
  setDetourName: (v: string) => void;
  detourDesc: string;
  setDetourDesc: (v: string) => void;
  detourGoogleMapsUrlFwd: string;
  setDetourGoogleMapsUrlFwd: (v: string) => void;
  detourGoogleMapsUrlRev: string;
  setDetourGoogleMapsUrlRev: (v: string) => void;
  detourRoadCondition: string;
  setDetourRoadCondition: (v: string) => void;
  detourDurationMinFwd: string;
  setDetourDurationMinFwd: (v: string) => void;
  detourDurationMinRev: string;
  setDetourDurationMinRev: (v: string) => void;
  carriagewayChoice: NonNullable<AdminMapDraftSnapshot["carriagewayChoice"]>;
  setCarriagewayChoice: (v: NonNullable<AdminMapDraftSnapshot["carriagewayChoice"]>) => void;
  detourDirectionMode: AdminMapDraftSnapshot["detourDirectionMode"];
  setDetourDirectionMode: (v: AdminMapDraftSnapshot["detourDirectionMode"]) => void;
  detourStartPhotoUrl: string;
  setDetourStartPhotoUrl: (v: string) => void;
  detourStartPhotoCaption: string;
  setDetourStartPhotoCaption: (v: string) => void;
  detourStartPhotoLocation: DetourPhotoLocationState;
  setDetourStartPhotoLocation: (v: DetourPhotoLocationState) => void;
  detourEndPhotoUrl: string;
  setDetourEndPhotoUrl: (v: string) => void;
  detourEndPhotoCaption: string;
  setDetourEndPhotoCaption: (v: string) => void;
  detourEndPhotoLocation: DetourPhotoLocationState;
  setDetourEndPhotoLocation: (v: DetourPhotoLocationState) => void;
  startPhotoLocManualRef?: { current: boolean };
  endPhotoLocManualRef?: { current: boolean };
  saveAsDraft: boolean;
  setSaveAsDraft: (v: boolean) => void;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (v: [number, number][]) => void;
  draftWaypoints: [number, number][];
  setDraftWaypoints: (v: [number, number][]) => void;
  draftReverseCoordinates: [number, number][];
  setDraftReverseCoordinates: (v: [number, number][]) => void;
  draftReverseWaypoints: [number, number][];
  setDraftReverseWaypoints: (v: [number, number][]) => void;
  onToast: (msg: string) => void;
}

export function useMapRouteDraft(params: UseMapRouteDraftParams) {
  const {
    routeEditId,
    editingRouteId,
    routeMode, setRouteMode,
    routeNo, setRouteNo,
    kmStart, setKmStart,
    kmEnd, setKmEnd,
    sectionName, setSectionName,
    reporterName, setReporterName,
    routeWaterLevel, setRouteWaterLevel,
    routeStatus, setRouteStatus,
    causeAndNote, setCauseAndNote,
    villageOrLandmark, setVillageOrLandmark,
    detourRefId, setDetourRefId,
    detourName, setDetourName,
    detourDesc, setDetourDesc,
    detourGoogleMapsUrlFwd, setDetourGoogleMapsUrlFwd,
    detourGoogleMapsUrlRev, setDetourGoogleMapsUrlRev,
    detourRoadCondition, setDetourRoadCondition,
    detourDurationMinFwd, setDetourDurationMinFwd,
    detourDurationMinRev, setDetourDurationMinRev,
    detourDirectionMode, setDetourDirectionMode, carriagewayChoice, setCarriagewayChoice,
    detourStartPhotoUrl, setDetourStartPhotoUrl,
    detourStartPhotoCaption, setDetourStartPhotoCaption,
    detourStartPhotoLocation, setDetourStartPhotoLocation,
    detourEndPhotoUrl, setDetourEndPhotoUrl,
    detourEndPhotoCaption, setDetourEndPhotoCaption,
    detourEndPhotoLocation, setDetourEndPhotoLocation,
    startPhotoLocManualRef,
    endPhotoLocManualRef,
    saveAsDraft, setSaveAsDraft,
    draftCoordinates, setDraftCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseCoordinates, setDraftReverseCoordinates,
    draftReverseWaypoints, setDraftReverseWaypoints,
    onToast,
  } = params;

  const [recoverableDraft, setRecoverableDraft] = useState<AdminMapDraftSnapshot | null>(null);

  // Detect unsaved draft on mount (new-record mode only)
  useEffect(() => {
    if (editingRouteId) return;
    const saved = readAdminMapDraft();
    if (saved) setRecoverableDraft(saved);
  }, [editingRouteId]);

  // Debounced Draft Auto-Save (600ms) for new flood/detour forms
  useEffect(() => {
    if (routeEditId || editingRouteId) return;
    const snapshot: AdminMapDraftSnapshot = {
      savedAt: Date.now(),
      routeMode,
      routeNo,
      kmStart,
      kmEnd,
      sectionName,
      reporterName,
      routeWaterLevel,
      routeStatus,
      causeAndNote,
      villageOrLandmark,
      detourRefId,
      detourName,
      detourDesc,
      detourGoogleMapsUrlFwd,
      detourGoogleMapsUrlRev,
      detourRoadCondition,
      detourDurationMinFwd,
      detourDurationMinRev,
      detourDirectionMode,
      carriagewayChoice,
      detourStartPhotoUrl,
      detourStartPhotoCaption,
      detourStartPhotoLocation,
      detourEndPhotoUrl,
      detourEndPhotoCaption,
      detourEndPhotoLocation,
      saveAsDraft,
      draftCoordinates,
      draftWaypoints,
      draftReverseCoordinates,
      draftReverseWaypoints,
    };
    if (!hasMeaningfulAdminMapDraft(snapshot)) return;
    const timer = window.setTimeout(() => {
      writeAdminMapDraft(snapshot);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    routeEditId,
    editingRouteId,
    routeMode,
    routeNo,
    kmStart,
    kmEnd,
    sectionName,
    reporterName,
    routeWaterLevel,
    routeStatus,
    causeAndNote,
    villageOrLandmark,
    detourRefId,
    detourName,
    detourDesc,
    detourGoogleMapsUrlFwd,
    detourGoogleMapsUrlRev,
    detourRoadCondition,
    detourDurationMinFwd,
    detourDurationMinRev,
    detourDirectionMode,
    carriagewayChoice,
    detourStartPhotoUrl,
    detourStartPhotoCaption,
    detourStartPhotoLocation,
    detourEndPhotoUrl,
    detourEndPhotoCaption,
    detourEndPhotoLocation,
    saveAsDraft,
    draftCoordinates,
    draftWaypoints,
    draftReverseCoordinates,
    draftReverseWaypoints,
  ]);

  const handleRestoreSavedDraft = () => {
    if (!recoverableDraft) return;
    if (startPhotoLocManualRef) {
      startPhotoLocManualRef.current =
        recoverableDraft.detourStartPhotoLocation.locationSource === "MAP" ||
        recoverableDraft.detourStartPhotoLocation.locationSource === "MANUAL";
    }
    if (endPhotoLocManualRef) {
      endPhotoLocManualRef.current =
        recoverableDraft.detourEndPhotoLocation.locationSource === "MAP" ||
        recoverableDraft.detourEndPhotoLocation.locationSource === "MANUAL";
    }
    setRouteMode(recoverableDraft.routeMode);
    setRouteNo(recoverableDraft.routeNo);
    setKmStart(recoverableDraft.kmStart);
    setKmEnd(recoverableDraft.kmEnd);
    setSectionName(recoverableDraft.sectionName);
    setReporterName(recoverableDraft.reporterName);
    setRouteWaterLevel(recoverableDraft.routeWaterLevel);
    setRouteStatus(recoverableDraft.routeStatus);
    setCauseAndNote(recoverableDraft.causeAndNote);
    setVillageOrLandmark(recoverableDraft.villageOrLandmark);
    setDetourRefId(recoverableDraft.detourRefId);
    setDetourName(recoverableDraft.detourName);
    setDetourDesc(recoverableDraft.detourDesc);
    setDetourGoogleMapsUrlFwd(recoverableDraft.detourGoogleMapsUrlFwd);
    setDetourGoogleMapsUrlRev(recoverableDraft.detourGoogleMapsUrlRev);
    setDetourRoadCondition(recoverableDraft.detourRoadCondition);
    setDetourDurationMinFwd(recoverableDraft.detourDurationMinFwd);
    setDetourDurationMinRev(recoverableDraft.detourDurationMinRev);
    setDetourDirectionMode(recoverableDraft.detourDirectionMode);
    setCarriagewayChoice(recoverableDraft.carriagewayChoice ?? (recoverableDraft.routeMode === "DETOUR" && recoverableDraft.draftReverseCoordinates.length >= 2 ? "DIVIDED" : ""));
    setDetourStartPhotoUrl(recoverableDraft.detourStartPhotoUrl);
    setDetourStartPhotoCaption(recoverableDraft.detourStartPhotoCaption);
    setDetourStartPhotoLocation(recoverableDraft.detourStartPhotoLocation);
    setDetourEndPhotoUrl(recoverableDraft.detourEndPhotoUrl);
    setDetourEndPhotoCaption(recoverableDraft.detourEndPhotoCaption);
    setDetourEndPhotoLocation(recoverableDraft.detourEndPhotoLocation);
    setSaveAsDraft(recoverableDraft.saveAsDraft);
    if (recoverableDraft.draftCoordinates.length >= 2) {
      setDraftCoordinates(recoverableDraft.draftCoordinates);
    }
    if (recoverableDraft.draftWaypoints.length > 0) {
      setDraftWaypoints(recoverableDraft.draftWaypoints);
    }
    if (recoverableDraft.draftReverseCoordinates.length >= 2) {
      setDraftReverseCoordinates(recoverableDraft.draftReverseCoordinates);
    }
    if (recoverableDraft.draftReverseWaypoints.length > 0) {
      setDraftReverseWaypoints(recoverableDraft.draftReverseWaypoints);
    }
    setRecoverableDraft(null);
    onToast("กู้คืนร่างข้อมูลที่พิมพ์ค้างไว้เรียบร้อย");
  };

  return {
    recoverableDraft,
    setRecoverableDraft,
    handleRestoreSavedDraft,
  };
}
