// ============================================
// Documents.gs — Drive Upload + Address Data
// ============================================

// ---- อัปโหลด Base64 → Google Drive ----
function _uploadBase64Todrive(base64Data, fileName, mimeType, studentId, subFolder = 'documents') {
  const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ROOT);

  // สร้าง subfolder ตามนักเรียน
  let studentFolder;
  const folders = rootFolder.getFoldersByName(studentId);
  if (folders.hasNext()) {
    studentFolder = folders.next();
  } else {
    studentFolder = rootFolder.createFolder(studentId);
  }

  // สร้าง subFolder ถ้าไม่มี
  let targetFolder;
  const subFolders = studentFolder.getFoldersByName(subFolder);
  if (subFolders.hasNext()) {
    targetFolder = subFolders.next();
  } else {
    targetFolder = studentFolder.createFolder(subFolder);
  }

  // Decode base64
  const decoded = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decoded, mimeType, fileName);

  // Upload
  const file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    fileId: file.getId(),
    url: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400`,
    directUrl: file.getUrl(),
  };
}

// ---- uploadDocument (standalone — เรียกแยกได้) ----
function uploadDocument(body) {
  // body = { studentId, docType, fileName, base64Data, mimeType }
  if (!body.studentId || !body.base64Data) {
    return { success: false, message: 'Missing required fields' };
  }

  const result = _uploadBase64Todrive(
    body.base64Data, body.fileName, body.mimeType || 'image/jpeg', body.studentId
  );

  const docSheet = getSheet(SHEETS.DOCUMENTS);
  appendRow(docSheet, {
    id: generateId(),
    studentId: body.studentId,
    type: body.docType,
    driveFileId: result.fileId,
    driveUrl: result.url,
    uploadedAt: new Date().toISOString(),
    isVerified: false,
  }, ['id','studentId','type','driveFileId','driveUrl','uploadedAt','isVerified']);

  return { success: true, fileId: result.fileId, url: result.url };
}

// ---- Address Data ----
function getProvinces() {
  const sheet = getSheet(SHEETS.PROVINCES);
  const rows = sheetToObjects(sheet);
  if (rows.length > 0) {
    return { success: true, data: rows.map(r => ({ id: r.id, name: r.name })) };
  }
  // Fallback: ส่ง empty ให้ frontend ใช้ built-in
  return { success: true, data: [] };
}

function getDistricts(provinceId) {
  const sheet = getSheet(SHEETS.DISTRICTS);
  const rows = sheetToObjects(sheet);
  const filtered = rows
    .filter(r => String(r.provinceId) === String(provinceId))
    .map(r => ({ id: r.id, name: r.name, provinceId: r.provinceId }));
  return { success: true, data: filtered };
}

function getSubDistricts(districtId) {
  const sheet = getSheet(SHEETS.SUBDISTRICTS);
  const rows = sheetToObjects(sheet);
  const filtered = rows
    .filter(r => String(r.districtId) === String(districtId))
    .map(r => ({ id: r.id, name: r.name, districtId: r.districtId, zipcode: r.zipcode }));
  return { success: true, data: filtered };
}

// ---- Setup Address Sheets (import ข้อมูลจาก CSV ภายนอก) ----
function setupAddressSheets() {
  _ensureHeaders(SHEETS.PROVINCES, ['id','name']);
  _ensureHeaders(SHEETS.DISTRICTS, ['id','name','provinceId']);
  _ensureHeaders(SHEETS.SUBDISTRICTS, ['id','name','districtId','zipcode']);
  Logger.log('Address sheets ready. Please import province/district/subdistrict data.');
  // ข้อมูลจาก: https://github.com/earthchie/jquery.Thailand.js/tree/master/jquery.Thailand.js/database
}
