import { OFFLINE_STORAGE } from "./constants";

export interface OfflineReportItem {
  id: string;
  floodId: string;
  waterLevelCm: number;
  trafficStatus: string;
  latitude: number;
  longitude: number;
  reporterName: string;
  remark: string;
  photoUrl?: string;
  roadSide?: string;
  affectedLanes?: string;
  affectedShoulder?: string;
  directionMeta?: Record<string, unknown>;
  createdAt: string;
  synced: boolean;
}

// One shared connection. Every helper below used to open a fresh connection and never close it, and
// the admin page polls the queue every few seconds, so connections piled up for as long as the tab
// stayed open.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported in this environment"));
    }

    const request = window.indexedDB.open(OFFLINE_STORAGE.DB_NAME, OFFLINE_STORAGE.VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(OFFLINE_STORAGE.STORE_NAME)) {
        const store = db.createObjectStore(OFFLINE_STORAGE.STORE_NAME, { keyPath: "id" });
        store.createIndex("synced", "synced", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Let a newer tab/version upgrade the database, and reopen on demand afterwards.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  dbPromise = opening;
  // A failed open must not be cached forever.
  opening.catch(() => {
    if (dbPromise === opening) dbPromise = null;
  });
  return opening;
}

/**
 * บันทึกรายงานสถานะน้ำท่วมลง IndexedDB เมื่อทำงานออฟไลน์
 */
export async function saveOfflineReport(item: Omit<OfflineReportItem, "id" | "createdAt" | "synced">): Promise<OfflineReportItem> {
  const db = await openDB();
  const record: OfflineReportItem = {
    ...item,
    id: "OFFLINE-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
    synced: false,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORAGE.STORE_NAME, "readwrite");
    const store = tx.objectStore(OFFLINE_STORAGE.STORE_NAME);
    const req = store.add(record);

    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

/**
 * ดึงรายการรายงานทั้งหมดที่ยังไม่ได้ซิงค์ขึ้น Server
 */
export async function getUnsyncedReports(): Promise<OfflineReportItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORAGE.STORE_NAME, "readonly");
      const store = tx.objectStore(OFFLINE_STORAGE.STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = (req.result as OfflineReportItem[]) || [];
        resolve(items.filter((i) => !i.synced));
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to read from IndexedDB:", err);
    return [];
  }
}

/**
 * ทำเครื่องหมายว่าซิงค์ข้อมูลสำเร็จแล้ว หรือลบออกจากคิว
 */
export async function markReportAsSynced(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORAGE.STORE_NAME, "readwrite");
      const store = tx.objectStore(OFFLINE_STORAGE.STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to delete synced item:", err);
  }
}
