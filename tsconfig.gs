/**
 * ============================================================================
 * ระบบรายงานสถานการณ์อุทกภัยและโครงข่ายทางหลวง แขวงทางหลวงปัตตานี (PRODUCTION V2)
 * รองรับทั้ง Container-bound Script (สร้างจาก Sheet) และ Standalone Script
 * ============================================================================
 */

const CONFIG = {
  APP_TITLE: 'ศูนย์ข้อมูลน้ำท่วมและโครงข่ายทางหลวง แขวงทางหลวงปัตตานี',
  DB_FILE_NAME: 'DOH_Pattani_Flood_Database',
  DRIVE_FOLDER_NAME: 'DOH_Pattani_Flood_System_Storage',
  PROP_SPREADSHEET_ID: 'DOH_PATTANI_DB_SHEET_ID',
  SHEETS: {
    FLOOD_ROUTES: 'Flood_Routes',
    DETOUR_ROUTES: 'Detour_Routes',
    TIMELINE: 'Timeline_Updates',
    PROJECTS: 'Mitigation_Projects',
    LAYERS: 'Highway_Layers'
  }
};

/**
 * 1. Entry Point สำหรับเปิด Web Application
 */
function doGet(e) {
  ensureDatabaseInitialized_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 2. ฟังก์ชันติดตั้งระบบครั้งแรก (กด Run จากหน้า Apps Script Editor)
 * สร้างไฟล์ Google Sheets (หากยังไม่มี), สร้าง 5 ตาราง และสร้างโฟลเดอร์ Google Drive
 */
function setupSystem() {
  const ss = ensureDatabaseInitialized_();
  const folder = getOrCreateSystemFolder_();
  Logger.log('Database URL: ' + ss.getUrl());
  Logger.log('Drive Folder URL: ' + folder.getUrl());
  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    driveFolderUrl: folder.getUrl()
  };
}

/**
 * 3. ดึงข้อมูลทั้งหมดจากทั้ง 5 ตารางส่งกลับไปยังหน้าเว็บ
 */
function getSystemData() {
  const ss = ensureDatabaseInitialized_();
  return {
    updatedAt: new Date().toISOString(),
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    floodRoutes: readSheetAsObjects_(ss.getSheetByName(CONFIG.SHEETS.FLOOD_ROUTES)),
    detourRoutes: readSheetAsObjects_(ss.getSheetByName(CONFIG.SHEETS.DETOUR_ROUTES)),
    timelineUpdates: readSheetAsObjects_(ss.getSheetByName(CONFIG.SHEETS.TIMELINE)),
    mitigationProjects: readSheetAsObjects_(ss.getSheetByName(CONFIG.SHEETS.PROJECTS)),
    highwayLayers: readSheetAsObjects_(ss.getSheetByName(CONFIG.SHEETS.LAYERS))
  };
}

/**
 * 4. บันทึกรายงานระดับน้ำหน้างาน + อัปโหลดรูปลง Google Drive + อัปเดตสถานะสายทาง
 */
function saveTimelineUpdate(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ensureDatabaseInitialized_();
    const tlSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);
    const floodSheet = ss.getSheetByName(CONFIG.SHEETS.FLOOD_ROUTES);

    let photoUrl = payload.existingPhotoUrl || '';
    if (payload.imageBase64) {
      photoUrl = uploadBase64ImageToDrive_(
        payload.imageBase64,
        'FLOOD_' + (payload.floodId || 'PTN') + '_' + Date.now() + '.jpg'
      );
    }

    const nowIso = new Date().toISOString();
    const timelineId = 'TL-' + Date.now();
    const waterLevel = Number(payload.waterLevelCm || 0);

    tlSheet.appendRow([
      timelineId,
      String(payload.floodId || ''),
      nowIso,
      waterLevel,
      String(payload.trafficStatus || 'WARNING'),
      Number(payload.latitude || 0),
      Number(payload.longitude || 0),
      photoUrl,
      String(payload.reporterName || 'เจ้าหน้าที่หมวดทางหลวง'),
      String(payload.remark || '')
    ]);

    // อัปเดตค่าระดับน้ำล่าสุดและสถานะจราจรในตาราง Flood_Routes
    const rows = floodSheet.getDataRange().getValues();
    if (rows.length > 1) {
      const headers = rows[0];
      const idIdx = headers.indexOf('ID');
      const wlIdx = headers.indexOf('Water_Level_cm');
      const stIdx = headers.indexOf('Traffic_Status');
      const phIdx = headers.indexOf('Latest_Photo_URL');
      const upIdx = headers.indexOf('Updated_At');

      for (let r = 1; r < rows.length; r++) {
        if (String(rows[r][idIdx]) === String(payload.floodId)) {
          if (wlIdx > -1) floodSheet.getRange(r + 1, wlIdx + 1).setValue(waterLevel);
          if (stIdx > -1) floodSheet.getRange(r + 1, stIdx + 1).setValue(String(payload.trafficStatus || 'WARNING'));
          if (phIdx > -1 && photoUrl) floodSheet.getRange(r + 1, phIdx + 1).setValue(photoUrl);
          if (upIdx > -1) floodSheet.getRange(r + 1, upIdx + 1).setValue(nowIso);
          break;
        }
      }
    }

    return { success: true, systemData: getSystemData() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 5. ลบประวัติการอัปเดตระดับน้ำ
 */
function deleteTimelineRecord(timelineId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = ensureDatabaseInitialized_();
    deleteRowById_(ss.getSheetByName(CONFIG.SHEETS.TIMELINE), 'ID', timelineId);
    return { success: true, systemData: getSystemData() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 6. เพิ่มหรือแก้ไขเส้นทางน้ำท่วม (Red Line) และเส้นทางเลี่ยง (Yellow Line)
 */
function saveRouteRecord(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ensureDatabaseInitialized_();
    const nowIso = new Date().toISOString();
    const isDetour = payload.recordType === 'DETOUR';

    if (!isDetour) {
      const sheet = ss.getSheetByName(CONFIG.SHEETS.FLOOD_ROUTES);
      const recordId = payload.id || ('F-' + Utilities.formatDate(new Date(), 'GMT+7', 'ddHHmmss'));
      let photoUrl = payload.latestPhotoUrl || '';
      if (payload.imageBase64) {
        photoUrl = uploadBase64ImageToDrive_(payload.imageBase64, 'ROUTE_' + recordId + '.jpg');
      }

      const rowData = [
        recordId,
        String(payload.routeNo || '42'),
        String(payload.sectionName || ''),
        String(payload.kmStart || ''),
        String(payload.kmEnd || ''),
        Number(payload.latStart || 0),
        Number(payload.lonStart || 0),
        Number(payload.latEnd || 0),
        Number(payload.lonEnd || 0),
        typeof payload.coordinatesJson === 'string' ? payload.coordinatesJson : JSON.stringify(payload.coordinatesJson || []),
        Number(payload.waterLevelCm || 0),
        String(payload.trafficStatus || 'WARNING'),
        photoUrl,
        payload.isActive !== false,
        nowIso
      ];

      const isUpdate = upsertRowById_(sheet, 'ID', recordId, rowData);

      if (!isUpdate) {
        const tlSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);
        tlSheet.appendRow([
          'TL-' + Date.now(),
          recordId,
          nowIso,
          Number(payload.waterLevelCm || 0),
          String(payload.trafficStatus || 'WARNING'),
          Number(payload.latStart || 0),
          Number(payload.lonStart || 0),
          photoUrl,
          'ศูนย์ควบคุม ขท.ปัตตานี',
          'เปิดจุดรายงานเส้นทางน้ำท่วมบนแผนที่'
        ]);
      }
    } else {
      const sheet = ss.getSheetByName(CONFIG.SHEETS.DETOUR_ROUTES);
      const recordId = payload.id || ('D-' + Utilities.formatDate(new Date(), 'GMT+7', 'ddHHmmss'));
      const rowData = [
        recordId,
        String(payload.floodIdRef || ''),
        String(payload.routeName || ''),
        Number(payload.latStart || 0),
        Number(payload.lonStart || 0),
        Number(payload.latEnd || 0),
        Number(payload.lonEnd || 0),
        typeof payload.coordinatesJson === 'string' ? payload.coordinatesJson : JSON.stringify(payload.coordinatesJson || []),
        String(payload.description || ''),
        payload.isActive !== false,
        nowIso
      ];
      upsertRowById_(sheet, 'ID', recordId, rowData);
    }

    return { success: true, systemData: getSystemData() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 7. ลบเส้นทางน้ำท่วม หรือ เส้นทางเลี่ยง
 */
function deleteRouteRecord(recordType, recordId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = ensureDatabaseInitialized_();
    const targetSheet = recordType === 'DETOUR' ? CONFIG.SHEETS.DETOUR_ROUTES : CONFIG.SHEETS.FLOOD_ROUTES;
    deleteRowById_(ss.getSheetByName(targetSheet), 'ID', recordId);
    return { success: true, systemData: getSystemData() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 8. เพิ่ม/แก้ไข โครงการแก้ไขปัญหาน้ำท่วม (สำหรับรายงานผู้ว่าราชการจังหวัด)
 */
function saveMitigationProject(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ensureDatabaseInitialized_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.PROJECTS);
    const projectId = payload.projectId || ('P-' + Utilities.formatDate(new Date(), 'GMT+7', 'ddHHmmss'));

    let beforeUrl = payload.beforeImageUrl || '';
    let afterUrl = payload.afterImageUrl || '';

    if (payload.beforeImageBase64) {
      beforeUrl = uploadBase64ImageToDrive_(payload.beforeImageBase64, 'BEFORE_' + projectId + '.jpg');
    }
    if (payload.afterImageBase64) {
      afterUrl = uploadBase64ImageToDrive_(payload.afterImageBase64, 'AFTER_' + projectId + '.jpg');
    }

    const rowData = [
      projectId,
      String(payload.routeNo || '42'),
      String(payload.locationName || ''),
      String(payload.kmRange || ''),
      String(payload.statusGroup || 'PENDING_BUDGET'),
      String(payload.solutionDetail || ''),
      Number(payload.budgetMb || 0),
      beforeUrl,
      afterUrl
    ];

    upsertRowById_(sheet, 'Project_ID', projectId, rowData);
    return { success: true, systemData: getSystemData() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 9. ลบโครงการแก้ไขปัญหาน้ำท่วม
 */
function deleteMitigationProject(projectId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = ensureDatabaseInitialized_();
    deleteRowById_(ss.getSheetByName(CONFIG.SHEETS.PROJECTS), 'Project_ID', projectId);
    return { success: true, systemData: getSystemData() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 10. บันทึกการตั้งค่าเลเยอร์ทางหลวง (สายหลัก/สายรอง) และอัปโหลดไฟล์ GeoJSON เก็บลง Google Drive
 */
function saveHighwayLayerConfig(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ensureDatabaseInitialized_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.LAYERS);
    const rows = sheet.getDataRange().getValues();

    let driveFileId = payload.driveFileId || '';
    if (payload.geojsonString) {
      const folder = getOrCreateSystemFolder_();
      const fileName = payload.layerId + '_' + Date.now() + '.geojson';
      const file = folder.createFile(fileName, payload.geojsonString, MimeType.PLAIN_TEXT);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      driveFileId = file.getId();
    }

    for (let r = 1; r < rows.length; r++) {
      if (String(rows[r][0]) === String(payload.layerId)) {
        sheet.getRange(r + 1, 2).setValue(String(payload.layerName || rows[r][1]));
        sheet.getRange(r + 1, 3).setValue(String(payload.colorHex || '#1e3a8a'));
        sheet.getRange(r + 1, 4).setValue(Number(payload.lineWidth || 4));
        if (driveFileId) {
          sheet.getRange(r + 1, 5).setValue(driveFileId);
        }
        sheet.getRange(r + 1, 6).setValue(Boolean(payload.isVisible));
        break;
      }
    }

    return { success: true, driveFileId: driveFileId, systemData: getSystemData() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 11. ดึงข้อมูลเส้นโครงข่ายทางหลวง (GeoJSON) จาก Google Drive
 */
function getLayerGeoJsonFromDrive(fileId) {
  if (!fileId) return null;
  try {
    const file = DriveApp.getFileById(String(fileId).trim());
    return file.getBlob().getDataAsString('UTF-8');
  } catch (err) {
    return null;
  }
}

/* ============================================================================
 * INTERNAL HELPER FUNCTIONS (ป้องกันปัญหา getActiveSpreadsheet() เป็น null)
 * ============================================================================ */

function getOrCreateDatabaseSpreadsheet_() {
  // 1. ลองดึงจาก Active Spreadsheet (กรณีสร้างสคริปต์จากเมนู Extensions > Apps Script ใน Sheet)
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  // 2. ลองดึงจาก ScriptProperties (กรณีรันแบบ Standalone Script)
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty(CONFIG.PROP_SPREADSHEET_ID);
  if (savedId) {
    try {
      const opened = SpreadsheetApp.openById(savedId);
      if (opened) return opened;
    } catch (e) {}
  }

  // 3. หากยังไม่มีเลย ให้สร้างไฟล์ Google Sheets ใหม่ใน Google Drive อัตโนมัติ
  const created = SpreadsheetApp.create(CONFIG.DB_FILE_NAME);
  props.setProperty(CONFIG.PROP_SPREADSHEET_ID, created.getId());
  return created;
}

function getOrCreateSystemFolder_() {
  const folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  const folder = DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

function uploadBase64ImageToDrive_(base64DataUrl, fileName) {
  const folder = getOrCreateSystemFolder_();
  const cleanBase64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
  const decoded = Utilities.base64Decode(cleanBase64);
  const blob = Utilities.newBlob(decoded, 'image/jpeg', fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200';
}

function upsertRowById_(sheet, idColumnName, idValue, rowValues) {
  const data = sheet.getDataRange().getValues();
  if (data.length > 1) {
    const idIdx = data[0].indexOf(idColumnName);
    if (idIdx > -1) {
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][idIdx]) === String(idValue)) {
          sheet.getRange(r + 1, 1, 1, rowValues.length).setValues([rowValues]);
          return true;
        }
      }
    }
  }
  sheet.appendRow(rowValues);
  return false;
}

function deleteRowById_(sheet, idColumnName, idValue) {
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return false;
  const idIdx = data[0].indexOf(idColumnName);
  if (idIdx === -1) return false;

  for (let r = data.length - 1; r >= 1; r--) {
    if (String(data[r][idIdx]) === String(idValue)) {
      sheet.deleteRow(r + 1);
      return true;
    }
  }
  return false;
}

function readSheetAsObjects_(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  const list = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(c => c === '' || c === null)) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const val = row[c];
      obj[headers[c]] = (val instanceof Date) ? val.toISOString() : val;
    }
    list.push(obj);
  }
  return list;
}

function ensureDatabaseInitialized_() {
  const ss = getOrCreateDatabaseSpreadsheet_();

  // 1. ตาราง Flood_Routes
  let floodSheet = ss.getSheetByName(CONFIG.SHEETS.FLOOD_ROUTES);
  if (!floodSheet) {
    floodSheet = ss.insertSheet(CONFIG.SHEETS.FLOOD_ROUTES);
    floodSheet.appendRow([
      'ID', 'Route_No', 'Section_Name', 'KM_Start', 'KM_End',
      'Lat_Start', 'Lon_Start', 'Lat_End', 'Lon_End',
      'Coordinates_JSON', 'Water_Level_cm', 'Traffic_Status',
      'Latest_Photo_URL', 'Is_Active', 'Updated_At'
    ]);
    floodSheet.appendRow([
      'F-001', '43', 'บ่อทอง - ดอนยาง (อ.หนองจิก)', '52+100', '54+800',
      6.7845, 101.1780, 6.7790, 101.2050,
      JSON.stringify([[101.1780, 6.7845], [101.1865, 6.7825], [101.1950, 6.7808], [101.2050, 6.7790]]),
      48, 'CLOSED',
      'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80',
      true, new Date().toISOString()
    ]);
    floodSheet.appendRow([
      'F-002', '418', 'ทางเลี่ยงเมืองปัตตานี - ยะหริ่ง', '14+200', '16+000',
      6.8420, 101.2420, 6.8485, 101.2680,
      JSON.stringify([[101.2420, 6.8420], [101.2510, 6.8442], [101.2600, 6.8468], [101.2680, 6.8485]]),
      25, 'WARNING',
      'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=900&q=80',
      true, new Date().toISOString()
    ]);
    floodSheet.appendRow([
      'F-003', '410', 'ปัตตานี - เมาะมาวี (อ.ยะรัง)', '18+400', '19+900',
      6.7520, 101.2850, 6.7360, 101.2890,
      JSON.stringify([[101.2850, 6.7520], [101.2868, 6.7440], [101.2890, 6.7360]]),
      32, 'WARNING',
      'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=900&q=80',
      true, new Date().toISOString()
    ]);
  }

  // 2. ตาราง Detour_Routes
  let detourSheet = ss.getSheetByName(CONFIG.SHEETS.DETOUR_ROUTES);
  if (!detourSheet) {
    detourSheet = ss.insertSheet(CONFIG.SHEETS.DETOUR_ROUTES);
    detourSheet.appendRow([
      'ID', 'Flood_ID_Ref', 'Route_Name',
      'Lat_Start', 'Lon_Start', 'Lat_End', 'Lon_End',
      'Coordinates_JSON', 'Description', 'Is_Active', 'Updated_At'
    ]);
    detourSheet.appendRow([
      'D-001', 'F-001', 'ทางเลี่ยง ทล.42 -> ทล.4092 (สายหนองจิก - โคกโพธิ์)',
      6.7845, 101.1780, 6.7790, 101.2050,
      JSON.stringify([[101.1780, 6.7845], [101.1810, 6.8020], [101.1980, 6.8040], [101.2050, 6.7790]]),
      'เลี้ยวซ้ายแยกดอนยาง เข้าสู่ตัวเมืองปัตตานีผ่านสาย 42 เดิม รถทุกชนิดผ่านได้สะดวก',
      true, new Date().toISOString()
    ]);
    detourSheet.appendRow([
      'D-002', 'F-002', 'ทางเลี่ยงเข้า ทล.42 (สายปัตตานี - ยะหริ่ง สายเก่า)',
      6.8420, 101.2420, 6.8485, 101.2680,
      JSON.stringify([[101.2420, 6.8420], [101.2460, 6.8630], [101.2650, 6.8620], [101.2680, 6.8485]]),
      'รถเล็กแนะนำใช้ ทล.42 ผ่านหน้า ม.อ.ปัตตานี มุ่งหน้าแยกคลองขุด',
      true, new Date().toISOString()
    ]);
  }

  // 3. ตาราง Timeline_Updates
  let timelineSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);
  if (!timelineSheet) {
    timelineSheet = ss.insertSheet(CONFIG.SHEETS.TIMELINE);
    timelineSheet.appendRow([
      'ID', 'Flood_ID_Ref', 'Reported_At', 'Water_Level_cm',
      'Traffic_Status', 'Latitude', 'Longitude', 'Photo_URL',
      'Reporter_Name', 'Remark'
    ]);
    const now = Date.now();
    timelineSheet.appendRow(['TL-101', 'F-001', new Date(now - 3600000 * 6).toISOString(), 28, 'WARNING', 6.7825, 101.1865, '', 'หมวดทางหลวงหนองจิก', 'น้ำเริ่มเอ่อล้นตลิ่งคลองตุยง']);
    timelineSheet.appendRow(['TL-102', 'F-001', new Date(now - 3600000 * 3).toISOString(), 38, 'WARNING', 6.7825, 101.1865, '', 'หมวดทางหลวงหนองจิก', 'ฝนตกหนักต่อเนื่อง ปิดช่องทางซ้าย']);
    timelineSheet.appendRow(['TL-103', 'F-001', new Date(now - 3600000 * 1).toISOString(), 48, 'CLOSED', 6.7825, 101.1865, 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=900&q=80', 'หมวดทางหลวงหนองจิก', 'งดการจราจรรถเล็ก ติดตั้งป้ายไฟแนะนำทางเลี่ยง']);
    timelineSheet.appendRow(['TL-104', 'F-002', new Date(now - 3600000 * 4).toISOString(), 18, 'PASSABLE', 6.8442, 101.2510, '', 'หมวดทางหลวงปัตตานี', 'น้ำท่วมผิวจราจรไหล่ทาง']);
    timelineSheet.appendRow(['TL-105', 'F-002', new Date(now - 3600000 * 1).toISOString(), 25, 'WARNING', 6.8442, 101.2510, 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=900&q=80', 'หมวดทางหลวงปัตตานี', 'รถเก๋งควรใช้ความระมัดระวัง']);
  }

  // 4. ตาราง Mitigation_Projects
  let projSheet = ss.getSheetByName(CONFIG.SHEETS.PROJECTS);
  if (!projSheet) {
    projSheet = ss.insertSheet(CONFIG.SHEETS.PROJECTS);
    projSheet.appendRow([
      'Project_ID', 'Route_No', 'Location_Name', 'KM_Range',
      'Status_Group', 'Solution_Detail', 'Budget_MB',
      'Before_Image_URL', 'After_Image_URL'
    ]);
    projSheet.appendRow(['P-01', '42', 'ตอน คลองแงะ - นาประดู่ (จุดที่ 1)', 'กม.28+400 - 29+100', 'COMPLETED', 'ก่อสร้างท่อลอดเหลี่ยม Box Culvert 2.40x2.40 ม. 3 ช่อง และยกระดับคันทาง', 28.5, 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80']);
    projSheet.appendRow(['P-02', '42', 'ตอน ดอนยาง - บานา', 'กม.98+200 - 99+500', 'COMPLETED', 'ขยายช่องทางระบายน้ำข้างทางและเสริมผิวแอสฟัลต์คอนกรีต', 32.0, 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80']);
    projSheet.appendRow(['P-03', '418', 'ตอน ทางเลี่ยงเมืองปัตตานี (แยกมะพร้าวต้นเดียว)', 'กม.11+000 - 12+200', 'COMPLETED', 'ขุดลอกร่องน้ำและวางท่อระบายน้ำ คสล. แถวคู่', 19.8, 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=600&q=80']);
    projSheet.appendRow(['P-04', '410', 'ตอน ปัตตานี - เมาะมาวี (บ้านปาลัส)', 'กม.15+100 - 15+800', 'COMPLETED', 'ยกระดับชั้นทางและปรับปรุงระบบระบายน้ำ 2 ฝั่ง', 24.0, 'https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80']);
    projSheet.appendRow(['P-05', '409', 'ตอน นาเกตุ - ยะลา (เขตปัตตานี)', 'กม.8+300 - 9+100', 'COMPLETED', 'ก่อสร้างกำแพงกันน้ำกัดเซาะและขยายสะพาน', 35.0, 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=600&q=80']);
    projSheet.appendRow(['P-06', '42', 'ตอน บานา - ปะนาเระ (บ้านลางา)', 'กม.112+500 - 113+200', 'COMPLETED', 'วาง Box Culvert ระบายน้ำออกสู่ทะเลโดยตรง', 27.5, 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80', 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=600&q=80']);

    projSheet.appendRow(['P-07', '43', 'ตอน บ่อทอง - ดอนยาง (จุดวิกฤตคลองตุยง)', 'กม.52+100 - 54+800', 'PENDING_BUDGET', 'ยกระดับคันทางสูง 0.80 ม. พร้อมก่อสร้าง Box Culvert 4 ช่อง', 55.0, '', '']);
    projSheet.appendRow(['P-08', '418', 'ตอน ทางเลี่ยงเมืองปัตตานี - ยะหริ่ง', 'กม.14+200 - 16+000', 'PENDING_BUDGET', 'เพิ่มอาคารระบายน้ำลอดทางหลวงและปรับปรุงผิวจราจร', 38.0, '', '']);
    projSheet.appendRow(['P-09', '410', 'ตอน เมาะมาวี - เขาตูม', 'กม.18+400 - 19+900', 'PENDING_BUDGET', 'ยกระดับผิวจราจรคอนกรีตเสริมเหล็กและขยายท่อลอด', 30.0, '', '']);
    projSheet.appendRow(['P-10', '4061', 'ตอน ยะหริ่ง - มายอ', 'กม.10+200 - 11+500', 'PENDING_BUDGET', 'ก่อสร้างรางระบายน้ำ คสล. และปรับปรุงโครงสร้างชั้นทาง', 22.0, '', '']);
  }

  // 5. ตาราง Highway_Layers
  let layerSheet = ss.getSheetByName(CONFIG.SHEETS.LAYERS);
  if (!layerSheet) {
    layerSheet = ss.insertSheet(CONFIG.SHEETS.LAYERS);
    layerSheet.appendRow(['Layer_ID', 'Layer_Name', 'Color_Hex', 'Line_Width', 'Drive_File_ID', 'Is_Visible']);
    layerSheet.appendRow(['MAIN_HIGHWAY', 'ทางหลวงแผ่นดินสายหลัก (ทล.42, 43, 418, 410)', '#1e3a8a', 5, '', true]);
    layerSheet.appendRow(['SECOND_HIGHWAY', 'ทางหลวงแผ่นดินสายรอง (ทล.409, 4061, 4074, 4092)', '#0284c7', 3, '', true]);
  }

  return ss;
}