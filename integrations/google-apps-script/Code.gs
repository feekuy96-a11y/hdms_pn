const HDMS_HEADERS = [
  "idempotency_key",
  "record_id",
  "record_type",
  "route_no",
  "section_name",
  "status",
  "is_active",
  "updated_at",
  "payload_json",
];

const HDMS_FOLDER_NAME = "HDMS_PN_Evidence";
const HDMS_SPREADSHEET_NAME = "HDMS_PN_Reports";
const HDMS_REPORT_SHEET_NAME = "HDMS_Reports";
const HDMS_MAX_IMAGE_BYTES = 500 * 1024;

/**
 * Run this once from the Apps Script editor, then approve the requested
 * Drive and Sheets permissions. It creates and remembers every resource the
 * Web App needs and returns the generated configuration in the execution log.
 */
function setupHdmsIntegration() {
  const properties = PropertiesService.getScriptProperties();
  let folder = null;
  const savedFolderId = properties.getProperty("GOOGLE_DRIVE_FOLDER_ID");
  if (savedFolderId) {
    try { folder = DriveApp.getFolderById(savedFolderId); } catch (error) { console.warn(error); }
  }
  if (!folder) {
    const folders = DriveApp.getFoldersByName(HDMS_FOLDER_NAME);
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(HDMS_FOLDER_NAME);
    properties.setProperty("GOOGLE_DRIVE_FOLDER_ID", folder.getId());
  }

  let book = null;
  const savedSpreadsheetId = properties.getProperty("SPREADSHEET_ID");
  if (savedSpreadsheetId) {
    try { book = SpreadsheetApp.openById(savedSpreadsheetId); } catch (error) { console.warn(error); }
  }
  if (!book) {
    book = SpreadsheetApp.create(HDMS_SPREADSHEET_NAME);
    properties.setProperty("SPREADSHEET_ID", book.getId());
  }
  const sheet = book.getSheetByName(HDMS_REPORT_SHEET_NAME) || book.insertSheet(HDMS_REPORT_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HDMS_HEADERS);
  sheet.setFrozenRows(1);

  let secret = properties.getProperty("APPS_SCRIPT_API_SECRET");
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    properties.setProperty("APPS_SCRIPT_API_SECRET", secret);
  }

  const result = {
    ok: true,
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    spreadsheetId: book.getId(),
    spreadsheetUrl: book.getUrl(),
    webAppUrl: ScriptApp.getService().getUrl() || "Deploy as Web app to obtain URL",
    apiSecret: secret,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function doGet() {
  const properties = PropertiesService.getScriptProperties();
  return jsonResponse({
    ok: true,
    service: "HDMS_PN Google integration",
    configured: Boolean(properties.getProperty("GOOGLE_DRIVE_FOLDER_ID") && properties.getProperty("SPREADSHEET_ID")),
  });
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) return jsonResponse({ ok: false, error: "busy" });
    const body = JSON.parse((event && event.postData && event.postData.contents) || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("APPS_SCRIPT_API_SECRET") || "";
    if (!expectedSecret || !constantTimeEqual(String(body.secret || ""), expectedSecret)) {
      return jsonResponse({ ok: false, error: "unauthorized" });
    }
    const action = safeText(body.action || "syncReportingRow", 80);
    if (action === "uploadMedia") return jsonResponse(uploadMedia(body));
    if (action === "deleteMedia") return jsonResponse(deleteMedia(body));
    if (action === "syncReportingRow") return jsonResponse(syncReportingRow(body));
    return jsonResponse({ ok: false, error: "unknown-action" });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: "internal-error" });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function uploadMedia(body) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(String(body.dataUrl || ""));
  if (!match) return { ok: false, error: "unsupported-image" };
  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length || bytes.length > HDMS_MAX_IMAGE_BYTES) return { ok: false, error: "image-size" };
  const folderId = PropertiesService.getScriptProperties().getProperty("GOOGLE_DRIVE_FOLDER_ID");
  if (!folderId) return { ok: false, error: "drive-not-configured" };
  const mimeType = match[1].toLowerCase();
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const requestedName = safeText(body.fileName, 120);
  const fileName = /^[\p{L}\p{N} _.-]{1,120}$/u.test(requestedName)
    ? requestedName
    : "hdms-" + Utilities.getUuid() + "." + extension;
  const file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, mimeType, fileName));
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    file.setTrashed(true);
    console.error(error);
    return { ok: false, error: "public-sharing-failed" };
  }
  file.setDescription(JSON.stringify({ ownerType: safeText(body.ownerType, 40), ownerId: safeText(body.ownerId, 120) }));
  return {
    ok: true,
    mediaId: file.getId(),
    url: "https://drive.google.com/uc?export=view&id=" + encodeURIComponent(file.getId()),
    mimeType: mimeType,
    sizeBytes: bytes.length,
    provider: "google-drive",
  };
}

function deleteMedia(body) {
  const mediaId = safeText(body.mediaId, 200);
  const folderId = PropertiesService.getScriptProperties().getProperty("GOOGLE_DRIVE_FOLDER_ID");
  if (!mediaId || !folderId) return { ok: false, error: "invalid-payload" };
  const file = DriveApp.getFileById(mediaId);
  const parents = file.getParents();
  let belongsToFolder = false;
  while (parents.hasNext()) if (parents.next().getId() === folderId) belongsToFolder = true;
  if (!belongsToFolder) return { ok: false, error: "file-outside-hdms-folder" };
  file.setTrashed(true);
  return { ok: true, success: true };
}

function syncReportingRow(body) {
  const key = safeText(body.idempotencyKey, 160);
  const record = body.record && typeof body.record === "object" ? body.record : {};
  if (!key || !record.recordId || !record.recordType) return { ok: false, error: "invalid-payload" };
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) return { ok: false, error: "spreadsheet-not-configured" };
  const book = SpreadsheetApp.openById(spreadsheetId);
  const sheet = book.getSheetByName(HDMS_REPORT_SHEET_NAME) || book.insertSheet(HDMS_REPORT_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HDMS_HEADERS);
  const row = [key, safeCell(record.recordId), safeCell(record.recordType), safeCell(record.routeNo), safeCell(record.sectionName), safeCell(record.status), record.isActive === true, safeCell(record.updatedAt), safeCell(JSON.stringify(record))];
  const existing = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).findNext()
    : null;
  if (existing) sheet.getRange(existing.getRow(), 1, 1, HDMS_HEADERS.length).setValues([row]);
  else sheet.appendRow(row);
  return { ok: true, operation: existing ? "updated" : "inserted" };
}

function safeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeCell(value) {
  const text = value == null ? "" : String(value).slice(0, 45000);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function constantTimeEqual(left, right) {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
