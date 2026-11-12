"use client";

import React, { useEffect, useState } from "react";
import { getUnsyncedReports, markReportAsSynced } from "@/lib/offline-db";
import { saveTimelineUpdateAction } from "@/app/actions/doh-actions";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function OfflineSyncStatus({ onSyncComplete }: { onSyncComplete?: () => void }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkPendingReports = async () => {
    try {
      const items = await getUnsyncedReports();
      setPendingCount(items.length);
    } catch (e) {
      setPendingCount(0);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);

      const handleOnline = () => {
        setIsOnline(true);
        triggerSync();
      };
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      checkPendingReports();
      // Nothing to refresh while the tab is in the background.
      const interval = setInterval(() => {
        if (!document.hidden) checkPendingReports();
      }, 8000);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        clearInterval(interval);
      };
    }
  }, []);

  const triggerSync = async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);

    try {
      const unsynced = await getUnsyncedReports();
      for (const item of unsynced) {
        await saveTimelineUpdateAction({
          // Keep this key stable across timeout/retry cycles. The database uses it
          // as the idempotency key for the one field report.
          clientRequestId: item.id,
          floodId: item.floodId,
          waterLevelCm: item.waterLevelCm,
          trafficStatus: item.trafficStatus as any,
          latitude: item.latitude,
          longitude: item.longitude,
          reporterName: item.reporterName,
          remark: item.remark,
          photoUrl: item.photoUrl,
          roadSide: item.roadSide as any,
          affectedLanes: item.affectedLanes,
          affectedShoulder: item.affectedShoulder as any,
          directionMeta: item.directionMeta,
        });
        await markReportAsSynced(item.id);
      }
      await checkPendingReports();
      onSyncComplete?.();
    } catch (err) {
      console.warn("Sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-[11px] font-heading">
      {isOnline ? (
        <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-lg">
          <Wifi className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">เชื่อมต่ออินเทอร์เน็ต</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2.5 py-1 rounded-lg animate-pulse">
          <WifiOff className="w-3.5 h-3.5" />
          <span>โหมดออฟไลน์ (เก็บบนเครื่อง)</span>
        </span>
      )}

      {pendingCount > 0 && (
        <button
          type="button"
          onClick={triggerSync}
          disabled={!isOnline || isSyncing}
          className="flex items-center gap-1.5 bg-amber-500 text-slate-950 font-bold px-2.5 py-1 rounded-lg shadow hover:bg-amber-400 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          <span>ซิงค์ค้างส่ง ({pendingCount})</span>
        </button>
      )}
    </div>
  );
}
