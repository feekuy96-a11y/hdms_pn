"use client";

import React from "react";
import { SystemDataPayload } from "@/db/default-data";
import { clearAdminMapDraft } from "@/components/admin/tabs/map-draft-storage";
import {
  MapTabHeader,
  DraftRecoveryBanner,
  RouteImportAndDraftOptions,
  MapFormSections,
} from "@/components/admin/tabs/MapFormSections";
import { useDualRoadSnapping } from "@/components/admin/tabs/useDualRoadSnapping";
import { useMapRouteSubmit } from "@/components/admin/tabs/useMapRouteSubmit";
import { useMapRouteDraft } from "@/components/admin/tabs/useMapRouteDraft";
import { useMapRouteMediaAndImport } from "@/components/admin/tabs/useMapRouteMediaAndImport";
import { useMapRouteHydration } from "@/components/admin/tabs/useMapRouteHydration";
import { useMapCoordinatePicker } from "@/components/admin/tabs/useMapCoordinatePicker";
import { useMapFreeGeometryEdit } from "@/components/admin/tabs/useMapFreeGeometryEdit";
import { useMapRouteActions } from "@/components/admin/tabs/useMapRouteActions";
import { useMapFloodSituation } from "@/components/admin/tabs/useMapFloodSituation";
import { useMapMetaAndMarkerSync, useMapRouteFormState } from "@/components/admin/tabs/useMapRouteFormState";
export { buildDetourRoutingParams } from "@/components/admin/tabs/map-management-helpers";
import type { VertexEditEvent } from "@/lib/line-edit";


interface MapManagementTabProps {
  systemData: SystemDataPayload;
  onDataRefresh: (data?: any) => Promise<any> | void;
  onToast: (msg: string) => void;
  showConfirmModal?: (title: string, message: string, onConfirm: () => void) => void;
  showSuccessModal: (title: string, message: string) => void;
  showErrorModal?: (title: string, message: string) => void;
  onNavigateToIncidents?: () => void;

  // Map interactions
  adminPickMode: string | null;
  setAdminPickMode: (mode: string | null) => void;
  pickedCoordinate?: { lat: number; lon: number; mode: string } | null;
  draftCoordinates: [number, number][];
  setDraftCoordinates: (coords: [number, number][]) => void;
  draftWaypoints: [number, number][];
  setDraftWaypoints: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftReverseCoordinates?: [number, number][];
  setDraftReverseCoordinates?: (coords: [number, number][]) => void;
  draftReverseWaypoints?: [number, number][];
  setDraftReverseWaypoints?: React.Dispatch<React.SetStateAction<[number, number][]>>;
  draftDirectionMeta?: {
    arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
    showArrows?: boolean;
    directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  } | null;
  setDraftDirectionMeta?: (meta: {
    arrowDirection?: "TWO_WAY" | "FORWARD" | "REVERSE" | "UNKNOWN";
    showArrows?: boolean;
    directionMode?: "TWO_WAY" | "FORWARD_ONLY" | "REVERSE_ONLY";
  } | null) => void;
  draftConflictPoints?: Array<{ coord: [number, number]; label: string }>;
  setDraftConflictPoints?: (points: Array<{ coord: [number, number]; label: string }>) => void;
  onDraftModeChange?: (mode: "FLOOD" | "DETOUR") => void;
  onDraftPickMarkersChange?: (markers: { lat: number; lon: number; label: string; mode: string }[]) => void;
  vertexEvent?: VertexEditEvent | null;
  onVertexEditChange?: (active: boolean) => void;
  onVertexEditTargetChange?: (target: "FORWARD" | "REVERSE") => void;

  // Editing state passed from parent
  editingRoute?: { type: "FLOOD" | "DETOUR"; id: string } | null;
  onClearEditingRoute?: () => void;
}

export function MapManagementTab({
  systemData,
  onDataRefresh,
  onToast,
  showConfirmModal,
  showSuccessModal,
  showErrorModal,
  onNavigateToIncidents,
  adminPickMode,
  setAdminPickMode,
  pickedCoordinate,
  draftCoordinates,
  setDraftCoordinates,
  draftWaypoints,
  setDraftWaypoints,
  draftReverseCoordinates = [],
  setDraftReverseCoordinates,
  draftReverseWaypoints = [],
  setDraftReverseWaypoints,
  draftDirectionMeta,
  setDraftDirectionMeta,
  draftConflictPoints = [],
  setDraftConflictPoints,
  onDraftModeChange,
  onDraftPickMarkersChange,
  vertexEvent,
  onVertexEditChange,
  onVertexEditTargetChange,
  editingRoute,
  onClearEditingRoute,
}: MapManagementTabProps) {
  const {
    routeMode, setRouteMode, routingRequest, originalRouteCoordinates, originalReverseRouteCoordinates,
    routeEditId, setRouteEditId, routeNo, setRouteNo, kmStart, setKmStart, kmEnd, setKmEnd,
    sectionName, setSectionName, startArea, setStartArea, endArea, setEndArea,
    sectionNameManuallyEdited, reporterName, setReporterName,
    selectedHighwayName, setSelectedHighwayName, isHighwayDropdownOpen, setIsHighwayDropdownOpen,
    highwaySearchQuery, setHighwaySearchQuery, highwayComboboxRef,
    detourRefId, setDetourRefId, detourName, setDetourName, detourDesc, setDetourDesc,
    detourAdviceView, setDetourAdviceView, detourGoogleMapsUrlFwd, setDetourGoogleMapsUrlFwd,
    detourGoogleMapsUrlRev, setDetourGoogleMapsUrlRev, detourRoadCondition, setDetourRoadCondition,
    detourDurationMinFwd, setDetourDurationMinFwd, detourDurationMinRev, setDetourDurationMinRev,
    durationFwdManualRef, durationRevManualRef, editOriginalFloodDirRef,
    detourStartPhotoUrl, setDetourStartPhotoUrl, detourStartPhotoCaption, setDetourStartPhotoCaption,
    detourEndPhotoUrl, setDetourEndPhotoUrl, detourEndPhotoCaption, setDetourEndPhotoCaption,
    forceStraightThrough, setForceStraightThrough, detourDirectionMode, setDetourDirectionMode,
    detourDistanceMeters, setDetourDistanceMeters, detourDurationSeconds, setDetourDurationSeconds,
    closedRoadConflicts, setClosedRoadConflicts, passabilityWarnings, setPassabilityWarnings,
    startLat, setStartLat, startLon, setStartLon, endLat, setEndLat, endLon, setEndLon,
    startCoordinateText, setStartCoordinateText, endCoordinateText, setEndCoordinateText,
    revStartLat, setRevStartLat, revStartLon, setRevStartLon, revEndLat, setRevEndLat, revEndLon, setRevEndLon,
    revStartCoordinateText, setRevStartCoordinateText, revEndCoordinateText, setRevEndCoordinateText,
    snappingStatusText, setSnappingStatusText, isGeocoding, setIsGeocoding,
    fieldImages, setFieldImages, isSubmitting, setIsSubmitting, saveAsDraft, setSaveAsDraft,
    detailedPhotos, setDetailedPhotos, parentEventMode, setParentEventMode,
    selectedParentEventId, setSelectedParentEventId, eventCode, setEventCode, eventTitle, setEventTitle,
    villageOrLandmark, setVillageOrLandmark, isFetchingAddress, setIsFetchingAddress,
    startedAt, setStartedAt, causeAndNote, setCauseAndNote, existingParentEvents,
    handleDetourPointPhotoUpload, resetBaseFormState, isFormDirty,
  } = useMapRouteFormState({
    systemData,
    onDraftModeChange,
    setDraftCoordinates,
    setDraftWaypoints,
    setDraftReverseCoordinates,
    setDraftReverseWaypoints,
    setDraftConflictPoints,
    onDraftPickMarkersChange,
    draftCoordinates,
    draftWaypoints,
    onToast,
  });

  // Flood Situation, Highway Division & Traffic Status Hook
  const {
    roadSide, setRoadSide,
    affectedLanes, setAffectedLanes,
    affectedShoulder, setAffectedShoulder,
    waterLevelKnown, setWaterLevelKnown,
    useCarriagewaySnapping, setUseCarriagewaySnapping,
    routeWaterLevel, setRouteWaterLevel,
    routeStatus, setRouteStatus,
    selectedMeasure, setSelectedMeasure,
    directionCode, setDirectionCode,
    affectedParts, setAffectedParts,
    reverseRouteWaterLevel, setReverseRouteWaterLevel,
    reverseRouteStatus, setReverseRouteStatus,
    reverseWaterLevelKnown, setReverseWaterLevelKnown,
    reverseAffectedParts, setReverseAffectedParts,
    availableHighways, selectedHighwayOption, selectedHighwayLaneCount,
    isSelectedHighwayDivided, isDividedBothFlood, availableOfficeNames,
    handleWaterLevelInputChange, handleReverseWaterLevelInputChange,
    toggleAffectedPartWithAutoStatus, ensureReverseFloodGeometry,
    resetFloodSituationState,
  } = useMapFloodSituation({
    systemData,
    routeMode,
    routeNo,
    selectedHighwayName,
    sectionName,
    kmStart,
    kmEnd,
    draftReverseCoordinates,
    setDraftReverseCoordinates,
    originalReverseRouteCoordinatesRef: originalReverseRouteCoordinates,
  });

  const supportsTwoWayLineEdit =
    (routeMode === "DETOUR" && detourDirectionMode === "TWO_WAY") || isDividedBothFlood;

  useMapMetaAndMarkerSync({
    routeMode, roadSide, detourDirectionMode, setDraftDirectionMeta,
    startLat, startLon, endLat, endLon, revStartLat, revStartLon, revEndLat, revEndLon,
    supportsTwoWayLineEdit, onDraftPickMarkersChange,
    sectionNameManuallyEdited, startArea, endArea,
    selectedHighwaySectionName: selectedHighwayOption?.sectionName,
    routeNo, setSectionName,
  });

  // Freehand Vertex Editing & Reverse Endpoints Hook
  const {
    freeEditEnabled,
    setFreeEditEnabled,
    setFreeEditTarget,
    activeEditTarget,
    freeVertexTool,
    setFreeVertexTool,
    freePastRef: freePast,
    freeFutureRef: freeFuture,
    updateFreeGeometry,
    undoFreeGeometry,
    resetFreeGeometryHistory,
    handleSeedReverseEndpoints,
    handleClearReverseEndpoints,
    handleSelectEditDirection,
  } = useMapFreeGeometryEdit({
    routeMode,
    editingRouteId: editingRoute?.id,
    supportsTwoWayLineEdit,
    detourDirectionMode,
    directionCode,
    vertexEvent,
    onVertexEditChange,
    onVertexEditTargetChange,
    draftCoordinates,
    setDraftCoordinates,
    draftReverseCoordinates,
    setDraftReverseCoordinates,
    startLat, setStartLat, startLon, setStartLon,
    endLat, setEndLat, endLon, setEndLon,
    revStartLat, setRevStartLat, revStartLon, setRevStartLon,
    revEndLat, setRevEndLat, revEndLon, setRevEndLon,
    routingRequestRef: routingRequest,
    originalReverseRouteCoordinatesRef: originalReverseRouteCoordinates,
    setAdminPickMode,
    setSnappingStatusText,
    onToast,
  });

  const { recoverableDraft, setRecoverableDraft, handleRestoreSavedDraft } = useMapRouteDraft({
    routeEditId,
    editingRouteId: editingRoute?.id,
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
    detourDirectionMode, setDetourDirectionMode,
    saveAsDraft, setSaveAsDraft,
    draftCoordinates, setDraftCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseCoordinates, setDraftReverseCoordinates,
    draftReverseWaypoints, setDraftReverseWaypoints,
    onToast,
  });

  // Hydrate existing record on edit + listen to preset flood context
  useMapRouteHydration({
    editingRoute,
    systemData,
    setRouteMode,
    setRouteEditId,
    setRouteNo,
    setKmStart,
    setKmEnd,
    setSectionName,
    setSelectedHighwayName,
    sectionNameManuallyEdited,
    setRouteWaterLevel,
    setRouteStatus,
    editOriginalFloodDirRef,
    setRoadSide,
    setAffectedLanes,
    setAffectedShoulder,
    setReporterName,
    setWaterLevelKnown,
    setUseCarriagewaySnapping,
    setSaveAsDraft,
    setStartLat,
    setStartLon,
    setEndLat,
    setEndLon,
    setRevStartLat,
    setRevStartLon,
    setRevEndLat,
    setRevEndLon,
    setStartArea,
    setEndArea,
    originalRouteCoordinates,
    originalReverseRouteCoordinates,
    setDraftCoordinates,
    setDraftReverseCoordinates,
    setDraftReverseWaypoints,
    setDraftConflictPoints,
    setClosedRoadConflicts,
    setReverseRouteWaterLevel,
    setReverseRouteStatus,
    setReverseWaterLevelKnown,
    setReverseAffectedParts,
    setSelectedParentEventId,
    setEventCode,
    setEventTitle,
    setVillageOrLandmark,
    setStartedAt,
    setCauseAndNote,
    setDirectionCode,
    setAffectedParts,
    setDetailedPhotos,
    setFieldImages,
    setDetourRefId,
    setDetourName,
    setDetourDesc,
    setDetourDirectionMode,
    setDetourGoogleMapsUrlFwd,
    setDetourGoogleMapsUrlRev,
    setDetourRoadCondition,
    setDetourDistanceMeters,
    setDetourDurationSeconds,
    durationFwdManualRef,
    durationRevManualRef,
    setDetourDurationMinFwd,
    setDetourDurationMinRev,
    setPassabilityWarnings,
    setDetourStartPhotoUrl,
    setDetourStartPhotoCaption,
    setDetourEndPhotoUrl,
    setDetourEndPhotoCaption,
  });

  // Trigger Road Snapping
  const { triggerDualRoadSnapping } = useDualRoadSnapping({
    systemData,
    routeMode,
    detourDirectionMode,
    forceStraightThrough,
    useCarriagewaySnapping,
    isDividedBothFlood,
    roadSide,
    freeEditEnabled,
    setFreeEditEnabled,
    revStartLat,
    revStartLon,
    revEndLat,
    revEndLon,
    draftCoordinates,
    setDraftCoordinates,
    setDraftReverseCoordinates,
    draftWaypoints,
    draftReverseWaypoints,
    routingRequest,
    durationFwdManualRef,
    durationRevManualRef,
    detourDurationSeconds,
    setDetourDistanceMeters,
    setDetourDurationSeconds,
    setDetourDurationMinFwd,
    setDetourDurationMinRev,
    setClosedRoadConflicts,
    setPassabilityWarnings,
    setDraftConflictPoints,
    setSnappingStatusText,
    onToast,
  });

  // Coordinate Picker & Auto Geocode
  const { handleAutoGeocode } = useMapCoordinatePicker({
    pickedCoordinate,
    startLat, startLon, endLat, endLon,
    revStartLat, revStartLon, revEndLat, revEndLon,
    setStartLat, setStartLon, setEndLat, setEndLon,
    setRevStartLat, setRevStartLon, setRevEndLat, setRevEndLon,
    setStartArea, setEndArea, setIsGeocoding,
    setAdminPickMode,
    freeEditEnabled, setFreeEditEnabled,
    activeEditTarget,
    draftCoordinates, setDraftCoordinates,
    draftReverseCoordinates, setDraftReverseCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseWaypoints, setDraftReverseWaypoints,
    updateFreeGeometry,
    triggerDualRoadSnapping,
    onToast,
  });

  // Waypoint, Endpoint Swap, Restore, KM Slicing & Address Lookup Hook
  const {
    handleSwapEndpoints,
    handleAddMidpointWaypoint,
    handleUndoWaypoint,
    handleRemoveWaypoint,
    handleRestoreOriginalRoute,
    handleFetchLocationFromCoords,
    handleSlicePolylineFromKm,
  } = useMapRouteActions({
    highwayLayers: systemData.highwayLayers,
    routeMode,
    activeEditTarget,
    isSelectedHighwayDivided,
    routeNo,
    sectionName,
    kmStart,
    kmEnd,
    roadSide,
    directionCode,
    villageOrLandmark,
    setVillageOrLandmark,
    setIsFetchingAddress,
    startLat, setStartLat, startLon, setStartLon,
    endLat, setEndLat, endLon, setEndLon,
    revStartLat, setRevStartLat, revStartLon, setRevStartLon,
    revEndLat, setRevEndLat, revEndLon, setRevEndLon,
    draftCoordinates, setDraftCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseCoordinates, setDraftReverseCoordinates,
    draftReverseWaypoints, setDraftReverseWaypoints,
    detourStartPhotoUrl, setDetourStartPhotoUrl,
    detourStartPhotoCaption, setDetourStartPhotoCaption,
    detourEndPhotoUrl, setDetourEndPhotoUrl,
    detourEndPhotoCaption, setDetourEndPhotoCaption,
    routingRequestRef: routingRequest,
    originalRouteCoordinatesRef: originalRouteCoordinates,
    originalReverseRouteCoordinatesRef: originalReverseRouteCoordinates,
    triggerDualRoadSnapping,
    setSnappingStatusText,
    onToast,
  });

  // Clear Route
  const handleClearRoute = () => {
    resetFreeGeometryHistory(true);
    resetFloodSituationState();
    resetBaseFormState();
    setFreeEditTarget("FORWARD");
    setRecoverableDraft(null);
    onToast("ล้างเส้นทางร่างและแบบฟอร์มแล้ว");
  };

  // Adaptive Image Upload, Detour Advice Generator & Route File Import
  const {
    handleImageUpload,
    handleGenerateDetourAdviceClick,
    handleRouteFileImport,
  } = useMapRouteMediaAndImport({
    systemData,
    routeMode,
    routeNo, setRouteNo,
    setSectionName,
    setDetourName,
    setDetourDesc,
    startLat, startLon, endLat, endLon,
    setStartLat, setStartLon, setEndLat, setEndLon,
    draftCoordinates, setDraftCoordinates,
    draftWaypoints, setDraftWaypoints,
    draftReverseCoordinates, draftReverseWaypoints,
    detourDirectionMode,
    setSaveAsDraft,
    detailedPhotos, setDetailedPhotos, setFieldImages,
    sectionNameManuallyEdited,
    onToast, showErrorModal,
  });

  const requestClearRoute = () => {
    if (isFormDirty && showConfirmModal) {
      showConfirmModal(
        "ล้างข้อมูลทั้งหมด?",
        "ข้อมูลที่ยังไม่ได้บันทึก จุด A/B จุดดัด เส้นพรีวิว และรูปภาพในแบบฟอร์มนี้จะถูกล้าง โดยไม่กระทบข้อมูลที่บันทึกแล้ว",
        handleClearRoute
      );
      return;
    }
    handleClearRoute();
  };

  // Submit Flood or Detour Route
  const { handleSubmitRoute } = useMapRouteSubmit({
    systemData, onDataRefresh, onToast, showSuccessModal, showErrorModal,
    onNavigateToIncidents, onClearEditingRoute, editingRoute,
    routeMode, routeEditId, setRouteEditId, saveAsDraft, setIsSubmitting,
    startLat, startLon, endLat, endLon, revStartLat, revStartLon, revEndLat, revEndLon,
    draftCoordinates, draftReverseCoordinates, draftReverseWaypoints,
    closedRoadConflicts, detourName, detourRefId, detourDesc, detourDirectionMode,
    detourRoadCondition, detourDurationMinFwd, detourDurationMinRev,
    detourDistanceMeters, detourGoogleMapsUrlFwd, detourGoogleMapsUrlRev,
    detourStartPhotoUrl, detourStartPhotoCaption, detourEndPhotoUrl, detourEndPhotoCaption,
    routeNo, sectionName, kmStart, kmEnd, directionCode, roadSide, isDividedBothFlood,
    affectedParts, reverseAffectedParts, routeWaterLevel, reverseRouteWaterLevel,
    waterLevelKnown, reverseWaterLevelKnown, routeStatus, reverseRouteStatus,
    startedAt, selectedMeasure, reporterName, causeAndNote,
    startArea, endArea, villageOrLandmark, detailedPhotos, fieldImages, setFieldImages,
    selectedParentEventId, eventCode, eventTitle, existingParentEvents,
    affectedLanes, affectedShoulder, startCoordinateText, endCoordinateText,
    setClosedRoadConflicts, availableHighways, useCarriagewaySnapping,
    editOriginalFloodDirRef, handleClearRoute,
  });

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Top Form Control Card: Mode Switcher, Edit Status, Draft Recovery & File Options */}
      <div className="rounded-2xl border border-surface bg-surface-panel p-3.5 sm:p-4 space-y-3.5 shadow-lg">
        {/* Switcher: Flood vs Detour Header */}
        <MapTabHeader
          routeMode={routeMode}
          onSelectRouteMode={(mode) => {
            if (routeMode !== mode) {
              handleClearRoute();
              setRouteMode(mode);
            }
          }}
        />

        {routeEditId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-xs text-sky-100">
            <span>
              กำลังแก้ไขข้อมูล{routeMode === "DETOUR" ? "เส้นทางเลี่ยง" : "เหตุการณ์น้ำท่วม"}:{" "}
              <strong className="font-heading text-white">{routeNo ? `ทล.${routeNo}` : routeEditId}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                setRouteEditId("");
                handleClearRoute();
                if (onClearEditingRoute) onClearEditingRoute();
              }}
              className="min-h-8 rounded-lg border border-sky-400/50 bg-surface-card px-2.5 py-1 text-xs font-heading font-bold text-sky-200 hover:text-white transition cursor-pointer"
            >
              ออกจากโหมดแก้ไข
            </button>
          </div>
        )}

        {/* Phase 2.4: Draft Auto-Save Recovery Banner */}
        <DraftRecoveryBanner
          recoverableDraft={recoverableDraft}
          routeEditId={routeEditId}
          onRestore={handleRestoreSavedDraft}
          onClear={() => {
            clearAdminMapDraft();
            setRecoverableDraft(null);
            onToast("ลบร่างข้อมูลที่ค้างไว้แล้ว");
          }}
        />

        {/* Save options: import a file, or keep the record hidden from citizens until it is reviewed */}
        <RouteImportAndDraftOptions
          saveAsDraft={saveAsDraft}
          onSaveAsDraftChange={setSaveAsDraft}
          onImportFile={handleRouteFileImport}
        />
      </div>

      {/* Main Map Form Container */}
      <MapFormSections
        routeMode={routeMode}
        highwayProps={{
          parentEventMode, setParentEventMode,
          selectedParentEventId, setSelectedParentEventId,
          eventCode, setEventCode, setEventTitle, existingParentEvents,
          routeNo, setRouteNo, selectedHighwayName, setSelectedHighwayName,
          sectionName, setSectionName, sectionNameManuallyEditedRef: sectionNameManuallyEdited,
          villageOrLandmark, setVillageOrLandmark, setReporterName,
          handleFetchLocationFromCoords, isFetchingAddress,
          highwayComboboxRef, isHighwayDropdownOpen, setIsHighwayDropdownOpen,
          availableHighways, highwaySearchQuery, setHighwaySearchQuery,
          kmStart, setKmStart, kmEnd, setKmEnd, directionCode, setDirectionCode,
          roadSide, setRoadSide, isSelectedHighwayDivided, draftCoordinates,
          ensureReverseFloodGeometry, setDraftReverseCoordinates, setDraftReverseWaypoints,
          setFreeEditTarget, routeEditId, handleSlicePolylineFromKm,
          detourRefId, setDetourRefId, floodRoutes: systemData.floodRoutes,
          detourName, setDetourName, detourDirectionMode, setDetourDirectionMode,
          isGeocoding, startLon, startLat, endLon, endLat, handleAutoGeocode,
        }}
        geometryProps={{
          onToast, adminPickMode, setAdminPickMode,
          startLat, setStartLat, startLon, setStartLon, endLat, setEndLat, endLon, setEndLon,
          startCoordinateText, setStartCoordinateText, endCoordinateText, setEndCoordinateText,
          revStartLat, setRevStartLat, revStartLon, setRevStartLon,
          revEndLat, setRevEndLat, revEndLon, setRevEndLon,
          revStartCoordinateText, setRevStartCoordinateText,
          revEndCoordinateText, setRevEndCoordinateText,
          onSeedReverseEndpoints: handleSeedReverseEndpoints,
          onClearReverseEndpoints: handleClearReverseEndpoints,
          detourStartPhotoUrl, setDetourStartPhotoUrl,
          detourStartPhotoCaption, setDetourStartPhotoCaption,
          detourEndPhotoUrl, setDetourEndPhotoUrl,
          detourEndPhotoCaption, setDetourEndPhotoCaption,
          handleDetourPointPhotoUpload, snappingStatusText, setSnappingStatusText,
          freeEditEnabled, setFreeEditEnabled, freeVertexTool, setFreeVertexTool,
          supportsTwoWayLineEdit, activeEditTarget, handleSelectEditDirection,
          draftCoordinates, setDraftCoordinates,
          draftReverseCoordinates, setDraftReverseCoordinates,
          draftWaypoints, draftReverseWaypoints, setDraftReverseWaypoints,
          routingRequestRef: routingRequest, freePastRef: freePast, freeFutureRef: freeFuture,
          undoFreeGeometry, forceStraightThrough, setForceStraightThrough,
          triggerDualRoadSnapping, handleSwapEndpoints, handleAddMidpointWaypoint,
          handleUndoWaypoint, handleRemoveWaypoint,
          originalRouteCoordsRef: originalRouteCoordinates,
          originalReverseRouteCoordsRef: originalReverseRouteCoordinates,
          handleRestoreOriginalRoute, requestClearRoute,
          closedRoadConflicts, passabilityWarnings, detourDirectionMode, detourDistanceMeters,
        }}
        detourProps={{
          detourDesc, setDetourDesc, detourAdviceView, setDetourAdviceView,
          detourRoadCondition, setDetourRoadCondition, detourDurationMinFwd,
          setDetourDurationMinFwd: (val) => {
            durationFwdManualRef.current = val.trim() !== "";
            setDetourDurationMinFwd(val);
          },
          detourDurationMinRev,
          setDetourDurationMinRev: (val) => {
            durationRevManualRef.current = val.trim() !== "";
            setDetourDurationMinRev(val);
          },
          detourDirectionMode,
          detourGoogleMapsUrlFwd, setDetourGoogleMapsUrlFwd,
          detourGoogleMapsUrlRev, setDetourGoogleMapsUrlRev,
          draftCoordinates, draftReverseCoordinates,
          onGenerateAdvice: handleGenerateDetourAdviceClick,
        }}
        floodProps={{
          selectedHighwayOption, selectedHighwayLaneCount,
          isSelectedHighwayDivided, isDividedBothFlood,
          directionCode, setDirectionCode, roadSide, setRoadSide, draftCoordinates,
          setDraftReverseCoordinates, setDraftReverseWaypoints,
          setFreeEditTarget, ensureReverseFloodGeometry,
          affectedParts, setAffectedParts, reverseAffectedParts, setReverseAffectedParts,
          routeWaterLevel, setRouteWaterLevel, reverseRouteWaterLevel, setReverseRouteWaterLevel,
          waterLevelKnown, setWaterLevelKnown, reverseWaterLevelKnown, setReverseWaterLevelKnown,
          routeStatus, setRouteStatus, reverseRouteStatus, setReverseRouteStatus,
          handleWaterLevelInputChange, handleReverseWaterLevelInputChange,
          toggleAffectedPartWithAutoStatus,
          useCarriagewaySnapping, setUseCarriagewaySnapping,
          startedAt, setStartedAt, selectedMeasure, setSelectedMeasure,
          reporterName, setReporterName, availableOfficeNames,
          causeAndNote, setCauseAndNote, detailedPhotos, setDetailedPhotos,
          setFieldImages, handleImageUpload,
        }}
        submitBarProps={{
          saveAsDraft, isSubmitting, onSubmit: handleSubmitRoute, routeEditId,
          onCancelEdit: () => {
            setRouteEditId("");
            handleClearRoute();
            if (onClearEditingRoute) onClearEditingRoute();
          },
        }}
      />
    </div>
  );
}

