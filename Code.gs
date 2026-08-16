// ============================================
// Code.gs — Main Entry Point (อัปเดต: เพิ่ม admin route)
// ============================================

const SHEET_ID = '1Jji1XE5-pRezwFAf2z18AUXGDAwEGsALO6u84iDi_2E';
const DRIVE_FOLDER_ROOT = '1njmYVDNAI-IQZ4dGN_PqV_eb0Ut8p2m-';

var SHEETS = {
  STUDENTS:     'students',
  ADDRESSES:    'addresses',
  PARENTS:      'parents',
  GUARDIANS:    'guardians',
  PROGRAMS:     'programs',
  ENROLLMENTS:  'enrollments',
  DOCUMENTS:    'documents',
  PAYMENTS:     'payments',
  PROVINCES:    'provinces',
  DISTRICTS:    'districts',
  SUBDISTRICTS: 'subdistricts'
};

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var action = p.action || '';

  try {
    // ---- Admin Page (HtmlService) ----
    // เข้าถึงได้ที่: [GAS_URL]?action=adminPage
    // หรือ: [GAS_URL]?action=adminPage&token=admin1234  (embed data ทันที)
    if (action === 'admin' || action === 'adminPage') {
      return serveAdminPage(e);
    }

    // ---- JSON API ----
    if (action === 'ping')                 return _json({ success: true, message: 'pong', time: new Date().toISOString() });
    if (action === 'getPrograms')          return _json(getPrograms());
    if (action === 'getProvinces')         return _json(getProvinces());
    if (action === 'getDistricts')         return _json(getDistricts(p.provinceId));
    if (action === 'getSubDistricts')      return _json(getSubDistricts(p.districtId));
    if (action === 'getApplicationStatus') return _json(getApplicationStatus(p.lineUserId));
    if (action === 'adminGetStats')        return _json(adminGetStats(p.token));
    if (action === 'adminGetStudents')     return _json(adminGetStudents(p));
    if (action === 'printApplication')     return printApplication(p);
    if (action === 'generatePDF')          return generateStudentPDF(p);
    if (action === 'exportCSV')            return exportCSV(p.token);

    return _json({ success: false, message: 'Unknown action: ' + action });
  } catch (err) {
    Logger.log('doGet error [' + action + ']: ' + err.toString());
    // ถ้า admin page error → ส่ง JSON แทน (ไม่ให้หน้าขาว)
    if (action === 'admin' || action === 'adminPage') {
      return _json({ success: false, message: 'Admin page error: ' + err.toString() });
    }
    return _json({ success: false, message: err.toString() });
  }
}

function doPost(e) {
  var body = {}, action = '';
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    body = JSON.parse(raw);
    action = body.action || ((e && e.parameter) ? (e.parameter.action || '') : '');
  } catch (pe) {
    return _json({ success: false, message: 'JSON parse error: ' + pe.toString() });
  }
  try {
    if (action === 'submitApplication') return _json(submitApplication(body));
    if (action === 'uploadDocument')    return _json(uploadDocument(body));
    if (action === 'adminVerifyDoc')    return _json(adminVerifyDoc(body));
    if (action === 'adminUpdateStatus') return _json(adminUpdateStatus(body));
    return _json({ success: false, message: 'Unknown POST action: ' + action });
  } catch (err) {
    Logger.log('doPost error [' + action + ']: ' + err.toString());
    return _json({ success: false, message: err.toString() });
  }
}

// ---- Sheet Helpers ----

function getSheet(name) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = data[i][j];
    }
    result.push(obj);
  }
  return result;
}

function appendRow(sheet, obj, headers) {
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    row.push(obj[headers[i]] !== undefined ? obj[headers[i]] : '');
  }
  sheet.appendRow(row);
}

function updateRowById(sheet, id, updates) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  var headers = data[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      var keys = Object.keys(updates);
      for (var k = 0; k < keys.length; k++) {
        var col = headers.indexOf(keys[k]);
        if (col !== -1) sheet.getRange(i + 1, col + 1).setValue(updates[keys[k]]);
      }
      return true;
    }
  }
  return false;
}

function generateId() {
  return Utilities.getUuid().split('-')[0].toUpperCase();
}

function generateApplicationNo() {
  var year = new Date().getFullYear() + 543;
  var count = Math.max(0, getSheet(SHEETS.ENROLLMENTS).getLastRow() - 1) + 1;
  return 'APP-' + year + '-' + ('000' + count).slice(-4);
}

function _checkAdmin(token) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKENS');
  var valid = stored ? stored.split(',') : ['admin1234'];
  if (valid.indexOf(String(token)) === -1) throw new Error('Unauthorized');
}

function setup() {
  setupAllSheets();
  Logger.log('Setup complete!');
}
