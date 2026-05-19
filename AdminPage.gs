// ============================================
// AdminPage.gs — Serve Admin Dashboard จาก GAS
// โหลดเร็วกว่า GitHub เพราะ:
//   1. ข้อมูล stats+students embed ใน HTML ตั้งแต่ต้น (ไม่ต้อง fetch รอบแรก)
//   2. ไม่มี CORS
//   3. เรียก Sheet โดยตรงใน server-side
// ============================================

/**
 * รันจาก doGet เมื่อ action=admin หรือ action=adminPage
 * https://script.google.com/macros/s/AKfycbyaeKOOtAxBLnbS2i1mKCFB-8sAExUWLy4sqM8uZvAFPRkNQ-gB6ISLF6EskaJlcf-dww/exec?action=admin
 * เพิ่มใน Code.gs:
 *   if (action === 'admin' || action === 'adminPage') return serveAdminPage(e);
 */
function serveAdminPage(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var token = p.token || '';
  var isValid = _isValidAdminToken(token);
  var schoolName = PropertiesService.getScriptProperties().getProperty('SCHOOL_NAME') 
                   || 'วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์';

  // ส่ง HTML ทันที ไม่รอดึงข้อมูล
  var html = _getAdminHtml()
    .replace('<?= isValid ? \'hidden\' : \'\' ?>', isValid ? 'hidden' : '')
    .replace('<?= !isValid ? \'hidden\' : \'\' ?>', !isValid ? 'hidden' : '')
    .replace('<?= initialData ?>', '{}')        // ส่ง empty — JS จะ fetch เอง
    .replace('<?= token ?>', token.replace(/"/g, '\\"'))
    .replace('<?= schoolName ?>', schoolName.replace(/"/g, '\\"'));

  return HtmlService.createHtmlOutput(html)
    .setTitle('Admin Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function _isValidAdminToken(token) {
  if (!token) return false;
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKENS');
  var valid = stored ? stored.split(',') : ['admin1234'];
  return valid.indexOf(String(token)) !== -1;
}

// ---- Server-side functions เรียกจาก google.script.run ----

/**
 * เรียกจาก client: google.script.run.gsAdminGetStats(token)
 */
function gsAdminGetStats(token) {
  try {
    _checkAdmin(token);
    return adminGetStats(token);
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * เรียกจาก client: google.script.run.gsAdminGetStudents(token, status, search)
 */
function gsAdminGetStudents(token, status, search) {
  try {
    _checkAdmin(token);
    return adminGetStudents({ token: token, status: status || '', search: search || '' });
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * เรียกจาก client: google.script.run.gsAdminVerifyDoc(token, docId, verified)
 */
function gsAdminVerifyDoc(token, docId, verified) {
  try {
    return adminVerifyDoc({ token: token, docId: docId, verified: verified });
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * เรียกจาก client: google.script.run.gsAdminUpdateStatus(token, studentId, status)
 */
function gsAdminUpdateStatus(token, studentId, status) {
  try {
    return adminUpdateStatus({ token: token, studentId: studentId, status: status });
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * เรียกจาก client เพื่อ export CSV URL
 */
function gsGetExportUrl(token) {
  try {
    _checkAdmin(token);
    var url = ScriptApp.getService().getUrl();
    return { success: true, url: url + '?action=exportCSV&token=' + token };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * เรียกจาก client เพื่อ print ใบสมัคร
 */
function gsGetPrintUrl(token, studentId) {
  try {
    _checkAdmin(token);
    var url = ScriptApp.getService().getUrl();
    return { success: true, url: url + '?action=printApplication&token=' + token + '&studentId=' + studentId };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}


// ---- HTML Template ----
function _getAdminHtml() {
  // ใช้ template literal ที่ GAS รองรับผ่าน concatenation
  // <?= ?> คือ output scriptlet ของ HtmlService
  return '<!DOCTYPE html>\n' +
'<html lang="th">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>Admin Dashboard</title>\n' +
'<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">\n' +
'<style>\n' +
_getAdminCss() +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div id="toast-container"></div>\n' +
'<div id="loading-overlay" class="hidden"><div class="spinner"></div><p>กำลังโหลด...</p></div>\n' +
'\n' +
'<!-- LOGIN (แสดงเมื่อ token ไม่ถูก) -->\n' +
'<div id="admin-login" class="<?= isValid ? \'hidden\' : \'\' ?> login-wrap">\n' +
'  <div class="login-box">\n' +
'    <div class="login-logo">🔐</div>\n' +
'    <h2>Admin Dashboard</h2>\n' +
'    <p>ระบบจัดการการรับสมัครนักเรียน</p>\n' +
'    <div class="form-group">\n' +
'      <label class="form-label">รหัสผ่าน</label>\n' +
'      <input class="form-control" id="admin-password" type="password" placeholder="กรอกรหัสผ่าน" autofocus>\n' +
'    </div>\n' +
'    <button id="btn-admin-login" class="btn btn-primary btn-full">เข้าสู่ระบบ</button>\n' +
'  </div>\n' +
'</div>\n' +
'\n' +
'<!-- DASHBOARD -->\n' +
'<div id="admin-dashboard" class="admin-layout <?= !isValid ? \'hidden\' : \'\' ?>">\n' +
_getAdminDashboardHtml() +
'</div>\n' +
'\n' +
'<!-- DETAIL PANEL -->\n' +
_getDetailPanelHtml() +
'\n' +
'<script>\n' +
'// ---- Initial Data จาก server (ไม่ต้อง fetch รอบแรก) ----\n' +
'var INITIAL_DATA = <?= initialData ?>;\n' +
'var ADMIN_TOKEN_SAVED = "<?= token ?>";\n' +
'var SCHOOL_NAME = "<?= schoolName ?>";\n' +
'\n' +
_getAdminJs() +
'<\/script>\n' +
'</body>\n' +
'</html>';
}


function _getAdminCss() {
  return '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n' +
':root {\n' +
'  --primary: #00B900; --primary-dark: #008f00; --primary-light: #e8f9e8;\n' +
'  --accent: #FF6B35; --danger: #EF4444; --warning: #F59E0B;\n' +
'  --success: #10B981; --info: #3B82F6;\n' +
'  --bg: #F1F5F9; --surface: #fff; --border: #E2E8F0; --text: #1E293B; --muted: #64748B;\n' +
'  --sidebar-w: 240px;\n' +
'}\n' +
'body { font-family: \'Sarabun\', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }\n' +
'input, select, button { font-family: inherit; font-size: inherit; }\n' +
'.hidden { display: none !important; }\n' +
/* Login */
'.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); }\n' +
'.login-box { background: #fff; border-radius: 16px; padding: 40px 36px; width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }\n' +
'.login-logo { font-size: 2.5rem; text-align: center; margin-bottom: 8px; }\n' +
'.login-box h2 { font-size: 1.375rem; font-weight: 700; text-align: center; margin-bottom: 4px; }\n' +
'.login-box p { font-size: 0.875rem; color: var(--muted); text-align: center; margin-bottom: 28px; }\n' +
'.form-group { margin-bottom: 16px; }\n' +
'.form-label { display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 6px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }\n' +
'.form-control { width: 100%; padding: 11px 14px; border: 1.5px solid var(--border); border-radius: 8px; font-size: 0.9375rem; transition: border-color 0.2s; background: #F8FAFC; }\n' +
'.form-control:focus { outline: none; border-color: var(--primary); background: #fff; }\n' +
/* Buttons */
'.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 18px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; font-size: 0.9rem; transition: all 0.15s; white-space: nowrap; }\n' +
'.btn-primary { background: var(--primary); color: #fff; } .btn-primary:hover { background: var(--primary-dark); }\n' +
'.btn-full { width: 100%; padding: 13px; font-size: 1rem; }\n' +
'.btn-sm { padding: 6px 12px; font-size: 0.8125rem; }\n' +
'.btn-outline { background: transparent; border: 1.5px solid var(--border); color: var(--text); } .btn-outline:hover { border-color: var(--primary); color: var(--primary); }\n' +
'.btn-danger { background: var(--danger); color: #fff; }\n' +
'.btn-success { background: var(--success); color: #fff; }\n' +
'.btn-ghost { background: transparent; color: var(--muted); } .btn-ghost:hover { background: var(--bg); }\n' +
/* Layout */
'.admin-layout { display: flex; min-height: 100vh; }\n' +
'.sidebar { width: var(--sidebar-w); background: #1E293B; color: #CBD5E1; display: flex; flex-direction: column; flex-shrink: 0; position: fixed; top: 0; left: 0; bottom: 0; z-index: 100; overflow-y: auto; }\n' +
'.sidebar-brand { padding: 20px 20px 16px; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 10px; }\n' +
'.brand-name { font-size: 0.9375rem; font-weight: 700; color: #fff; line-height: 1.3; }\n' +
'.brand-sub { font-size: 0.7rem; color: #94A3B8; }\n' +
'.sidebar-nav { padding: 12px 0; flex: 1; }\n' +
'.nav-section { padding: 16px 16px 4px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #475569; }\n' +
'.nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; font-size: 0.875rem; font-weight: 500; cursor: pointer; border-radius: 8px; margin: 1px 8px; transition: all 0.15s; color: #94A3B8; }\n' +
'.nav-item:hover { background: #334155; color: #fff; }\n' +
'.nav-item.active { background: var(--primary); color: #fff; }\n' +
'.nav-badge { margin-left: auto; background: var(--accent); color: #fff; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 10px; }\n' +
'.sidebar-footer { padding: 16px; border-top: 1px solid #334155; }\n' +
'.sidebar-user { display: flex; align-items: center; gap: 10px; }\n' +
'.user-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); flex-shrink: 0; }\n' +
'.main-content { margin-left: var(--sidebar-w); flex: 1; display: flex; flex-direction: column; }\n' +
'.topbar { background: #fff; border-bottom: 1px solid var(--border); padding: 0 24px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }\n' +
'.topbar-title { font-size: 1.0625rem; font-weight: 700; }\n' +
'.page-content { padding: 24px; flex: 1; }\n' +
/* Stats */
'.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }\n' +
'.stat-card { background: #fff; border-radius: 12px; padding: 20px 22px; border: 1px solid var(--border); display: flex; align-items: center; gap: 16px; }\n' +
'.stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.375rem; flex-shrink: 0; }\n' +
'.stat-icon.green { background: #D1FAE5; } .stat-icon.yellow { background: #FEF3C7; } .stat-icon.blue { background: #DBEAFE; }\n' +
'.stat-value { font-size: 1.75rem; font-weight: 800; line-height: 1; }\n' +
'.stat-label { font-size: 0.8125rem; color: var(--muted); margin-top: 4px; }\n' +
/* Card */
'.card { background: #fff; border-radius: 12px; border: 1px solid var(--border); }\n' +
'.card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }\n' +
'.card-header h3 { font-size: 0.9375rem; font-weight: 700; }\n' +
'.card-body { padding: 20px; }\n' +
/* Table */
'.toolbar { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }\n' +
'.tab-row { display: flex; border-bottom: 1px solid var(--border); padding: 0 20px; }\n' +
'.tab-btn { padding: 12px 16px; font-size: 0.875rem; font-weight: 600; color: var(--muted); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; transition: all 0.15s; }\n' +
'.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }\n' +
'table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }\n' +
'thead th { background: #F8FAFC; padding: 10px 14px; text-align: left; font-size: 0.75rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--border); }\n' +
'tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; cursor: pointer; }\n' +
'tbody tr:hover { background: #F8FAFC; }\n' +
'tbody td { padding: 12px 14px; vertical-align: middle; }\n' +
'.td-name { font-weight: 600; }\n' +
'.td-sub { font-size: 0.75rem; color: var(--muted); }\n' +
'.td-appno { font-size: 0.8125rem; font-weight: 700; color: var(--primary); font-family: monospace; }\n' +
/* Badge */
'.badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; }\n' +
'.badge-success { background: #D1FAE5; color: #065F46; }\n' +
'.badge-warning { background: #FEF3C7; color: #92400E; }\n' +
'.badge-danger { background: #FEE2E2; color: #991B1B; }\n' +
'.badge-gray { background: #F1F5F9; color: #475569; }\n' +
/* Pagination */
'.pagination { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-top: 1px solid var(--border); font-size: 0.8125rem; color: var(--muted); }\n' +
'.page-btns { display: flex; gap: 4px; }\n' +
'.page-btn { min-width: 32px; height: 32px; border-radius: 6px; border: 1px solid var(--border); background: #fff; cursor: pointer; font-size: 0.8125rem; font-weight: 600; display: flex; align-items: center; justify-content: center; padding: 0 6px; }\n' +
'.page-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }\n' +
'.page-btn:hover:not(.active):not(:disabled) { background: var(--bg); }\n' +
'.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }\n' +
/* Detail Panel */
'.detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.2s; }\n' +
'.detail-overlay.open { opacity: 1; pointer-events: all; }\n' +
'.detail-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 520px; max-width: 100vw; background: #fff; z-index: 201; box-shadow: -8px 0 40px rgba(0,0,0,0.15); transform: translateX(100%); transition: transform 0.25s ease; display: flex; flex-direction: column; }\n' +
'.detail-panel.open { transform: translateX(0); }\n' +
'.detail-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: flex-start; justify-content: space-between; flex-shrink: 0; }\n' +
'.detail-header h3 { font-size: 1.0625rem; font-weight: 700; }\n' +
'.detail-header p { font-size: 0.8125rem; color: var(--muted); margin-top: 2px; }\n' +
'.detail-body { flex: 1; overflow-y: auto; padding: 20px 24px; }\n' +
'.detail-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; gap: 10px; flex-shrink: 0; }\n' +
'.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }\n' +
'.info-label { font-size: 0.7rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }\n' +
'.info-value { font-size: 0.9rem; font-weight: 600; }\n' +
'.section-label { font-size: 0.7rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }\n' +
'.doc-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }\n' +
'.doc-row:last-child { border: none; }\n' +
'.doc-thumb { width: 72px; height: 52px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; overflow: hidden; flex-shrink: 0; }\n' +
'.doc-thumb img { width: 100%; height: 100%; object-fit: cover; }\n' +
'.doc-name { font-size: 0.875rem; font-weight: 600; }\n' +
'.doc-date { font-size: 0.75rem; color: var(--muted); }\n' +
/* Branch bar */
'.branch-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; font-size: 0.875rem; }\n' +
'.branch-bar-wrap { flex: 1; height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }\n' +
'.branch-bar { height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.6s ease; }\n' +
/* Toast */
'#toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }\n' +
'.toast { padding: 12px 18px; border-radius: 10px; font-size: 0.875rem; font-weight: 600; color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,0.15); animation: toast-in 0.3s ease; }\n' +
'.toast.success { background: var(--success); } .toast.error { background: var(--danger); } .toast.warning { background: var(--warning); } .toast.info { background: var(--info); }\n' +
'@keyframes toast-in { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: translateX(0); } }\n' +
/* Loading */
'#loading-overlay { position: fixed; inset: 0; background: rgba(255,255,255,0.88); z-index: 9000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }\n' +
'#loading-overlay.hidden { display: none !important; }\n' +
'.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.7s linear infinite; }\n' +
'@keyframes spin { to { transform: rotate(360deg); } }\n' +

// skeleton loader
'@keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }\n' +
'.skeleton { background: linear-gradient(90deg,var(--border) 25%,var(--bg) 50%,var(--border) 75%); background-size: 400px 100%; animation: shimmer 1.2s infinite; border-radius: 4px; }\n';
}

function _getAdminDashboardHtml() {
  return '  <aside class="sidebar">\n' +
'    <div class="sidebar-brand">\n' +
'      <span style="font-size:1.5rem">🏫</span>\n' +
'      <div><div class="brand-name" id="sb-school"></div><div class="brand-sub">ปีการศึกษา 2568</div></div>\n' +
'    </div>\n' +
'    <nav class="sidebar-nav">\n' +
'      <div class="nav-section">เมนูหลัก</div>\n' +
'      <div class="nav-item active" data-page="overview"><span>📊</span> ภาพรวม</div>\n' +
'      <div class="nav-item" data-page="students"><span>👥</span> ผู้สมัคร <span class="nav-badge" id="nav-pending-badge">0</span></div>\n' +
'      <div class="nav-section">เครื่องมือ</div>\n' +
'      <div class="nav-item" id="nav-export"><span>📥</span> Export CSV</div>\n' +
'      <div class="nav-item" id="nav-refresh"><span>🔄</span> รีเฟรชข้อมูล</div>\n' +
'    </nav>\n' +
'    <div class="sidebar-footer">\n' +
'      <div class="sidebar-user">\n' +
'        <div class="user-dot"></div>\n' +
'        <span id="sb-admin-label">Admin</span>\n' +
'        <span style="margin-left:auto;cursor:pointer;font-size:0.75rem;color:#64748B" id="btn-logout">ออก</span>\n' +
'      </div>\n' +
'    </div>\n' +
'  </aside>\n' +
'  <div class="main-content">\n' +
'    <header class="topbar">\n' +
'      <div class="topbar-title" id="topbar-title">ภาพรวม</div>\n' +
'      <span id="topbar-date" style="font-size:0.8125rem;color:var(--muted)"></span>\n' +
'    </header>\n' +
'    <div class="page-content">\n' +
'      <!-- Overview Page -->\n' +
'      <div id="page-overview">\n' +
'        <div class="stats-row">\n' +
'          <div class="stat-card"><div class="stat-icon green">📋</div><div><div class="stat-value" id="stat-total">—</div><div class="stat-label">ยอดสมัครทั้งหมด</div></div></div>\n' +
'          <div class="stat-card"><div class="stat-icon blue">📅</div><div><div class="stat-value" id="stat-today">—</div><div class="stat-label">สมัครวันนี้</div></div></div>\n' +
'          <div class="stat-card"><div class="stat-icon yellow">⏳</div><div><div class="stat-value" id="stat-pending">—</div><div class="stat-label">รอตรวจสอบ</div></div></div>\n' +
'          <div class="stat-card"><div class="stat-icon green">✅</div><div><div class="stat-value" id="stat-verified">—</div><div class="stat-label">ผ่านการตรวจ</div></div></div>\n' +
'        </div>\n' +
'        <div class="card">\n' +
'          <div class="card-header"><h3>ยอดสมัครแยกตามสาขา</h3></div>\n' +
'          <div class="card-body" id="branch-stats"><div style="text-align:center;padding:16px;color:var(--muted)">กำลังโหลด...</div></div>\n' +
'        </div>\n' +
'      </div>\n' +
'      <!-- Students Page -->\n' +
'      <div id="page-students" class="hidden">\n' +
'        <div class="card" style="overflow:hidden">\n' +
'          <div class="tab-row" id="tab-row">\n' +
'            <button class="tab-btn active" data-tab="all">ทั้งหมด</button>\n' +
'            <button class="tab-btn" data-tab="pending">รอตรวจ</button>\n' +
'            <button class="tab-btn" data-tab="verified">ผ่านแล้ว</button>\n' +
'            <button class="tab-btn" data-tab="rejected">ปฏิเสธ</button>\n' +
'          </div>\n' +
'          <div class="toolbar">\n' +
'            <div style="position:relative;flex:1;min-width:200px;max-width:320px">\n' +
'              <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted)">🔍</span>\n' +
'              <input class="form-control" id="search-input" type="search" placeholder="ค้นหาชื่อ / เลขบัตร / เลขสมัคร" style="padding-left:34px">\n' +
'            </div>\n' +
'            <select class="form-control" id="filter-branch" style="width:180px"><option value="">ทุกสาขา</option></select>\n' +
'            <button class="btn btn-outline btn-sm" id="btn-export-csv">📥 Export</button>\n' +
'            <button class="btn btn-ghost btn-sm" id="btn-refresh-list">🔄</button>\n' +
'          </div>\n' +
'          <div style="overflow-x:auto">\n' +
'            <table>\n' +
'              <thead><tr>\n' +
'                <th>เลขสมัคร</th><th>ชื่อ-นามสกุล</th><th>สาขา / รอบ</th>\n' +
'                <th>เบอร์โทร</th><th>วันที่สมัคร</th><th>สถานะ</th><th>เอกสาร</th><th></th>\n' +
'              </tr></thead>\n' +
'              <tbody id="student-tbody">' +
  [1,2,3,4,5].map(function() {
    return '<tr>' +
      '<td><div class="skeleton" style="height:14px;width:90px"></div></td>' +
      '<td><div class="skeleton" style="height:14px;width:140px;margin-bottom:6px"></div>' +
          '<div class="skeleton" style="height:10px;width:100px"></div></td>' +
      '<td><div class="skeleton" style="height:14px;width:120px"></div></td>' +
      '<td><div class="skeleton" style="height:14px;width:80px"></div></td>' +
      '<td><div class="skeleton" style="height:14px;width:70px"></div></td>' +
      '<td><div class="skeleton" style="height:20px;width:60px;border-radius:20px"></div></td>' +
      '<td><div class="skeleton" style="height:20px;width:40px;border-radius:20px"></div></td>' +
      '<td><div class="skeleton" style="height:28px;width:80px;border-radius:8px"></div></td>' +
    '</tr>';
  }).join('') +
'</tbody>\n' +
'            </table>\n' +
'          </div>\n' +
'          <div class="pagination"><span id="page-info">— รายการ</span><div class="page-btns" id="page-btns"></div></div>\n' +
'        </div>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n';
}

function _getDetailPanelHtml() {
  return '<div class="detail-overlay" id="detail-overlay"></div>\n' +
'<div class="detail-panel" id="detail-panel">\n' +
'  <div class="detail-header">\n' +
'    <div><h3 id="dp-name">—</h3><p id="dp-appno">—</p></div>\n' +
'    <button class="btn btn-ghost" id="btn-close-detail" style="font-size:1.25rem;padding:4px 8px">✕</button>\n' +
'  </div>\n' +
'  <div class="detail-body" id="dp-body"></div>\n' +
'  <div class="detail-footer">\n' +
'    <button class="btn btn-success btn-sm" id="dp-btn-approve">✅ อนุมัติ</button>\n' +
'    <button class="btn btn-danger btn-sm" id="dp-btn-reject">❌ ปฏิเสธ</button>\n' +
'    <button class="btn btn-outline btn-sm" id="dp-btn-pending">🔄 รอดำเนินการ</button>\n' +
'    <button class="btn btn-outline btn-sm" id="dp-btn-print" style="margin-left:auto">🖨️ พิมพ์</button>\n' +
'  </div>\n' +
'</div>\n';
}

function _getAdminJs() {
  return '// ============================================================\n' +
'// Admin JS — ใช้ google.script.run แทน fetch (เร็วกว่า 3-5x)\n' +
'// ============================================================\n' +
'var Admin = {\n' +
'  token: ADMIN_TOKEN_SAVED || "",\n' +
'  students: [],\n' +
'  filtered: [],\n' +
'  currentTab: "all",\n' +
'  currentStudent: null,\n' +
'  page: 1,\n' +
'  pageSize: 15,\n' +
'  searchTimeout: null,\n' +
'\n' +
'  init: function() {\n' +
'    document.getElementById("topbar-date").textContent =\n' +
'      new Date().toLocaleDateString("th-TH", {year:"numeric",month:"long",day:"numeric",weekday:"long"});\n' +
'    document.getElementById("sb-school").textContent = SCHOOL_NAME;\n' +
'\n' +
'    if (this.token) {\n' +
'      this._showDashboard();\n' +
'      this._loadAll();\n' +
'    } else {\n' +
'      document.getElementById("admin-login").classList.remove("hidden");\n' +
'    }\n' +
'\n' +
'    document.getElementById("btn-admin-login").onclick = function() { Admin._login(); };\n' +
'    document.getElementById("admin-password").addEventListener("keydown", function(e) {\n' +
'      if (e.key === "Enter") Admin._login();\n' +
'    });\n' +
'  },\n' +
'\n' +
'  _loadAll: function() {\n' +
'    var self = this;\n' +
'    google.script.run\n' +
'      .withSuccessHandler(function(res) {\n' +
'        if (res && res.success) self._renderStats(res.data);\n' +
'      })\n' +
'      .withFailureHandler(function() { showToast("โหลด stats ล้มเหลว","warning"); })\n' +
'      .gsAdminGetStats(self.token);\n' +
'    google.script.run\n' +
'      .withSuccessHandler(function(res) {\n' +
'        if (res && res.success) {\n' +
'          self.students = res.data || [];\n' +
'          self.filtered = self.students.slice();\n' +
'          self._populateBranchFilter();\n' +
'          self._renderTable();\n' +
'        } else {\n' +
'          showToast("โหลดรายชื่อล้มเหลว","error");\n' +
'        }\n' +
'      })\n' +
'      .withFailureHandler(function() { showToast("โหลดข้อมูลล้มเหลว","error"); })\n' +
'      .gsAdminGetStudents(self.token, "", "");\n' +
'  },\n' +
'\n' +
'  _login: function() {\n' +
'    var pw = document.getElementById("admin-password").value.trim();\n' +
'    if (!pw) { showToast("กรุณากรอกรหัสผ่าน", "error"); return; }\n' +
'    showLoading("กำลังตรวจสอบ...");\n' +
'    // ตรวจสอบผ่าน server\n' +
'    google.script.run\n' +
'      .withSuccessHandler(function(res) {\n' +
'        hideLoading();\n' +
'        if (res && res.success) {\n' +
'          Admin.token = pw;\n' +
'          Admin._showDashboard();\n' +
'          Admin._renderStats(res.data);\n' +
'          showLoading("กำลังโหลดข้อมูล...");\n' +
'          google.script.run\n' +
'          .withSuccessHandler(function(r2) {\n' +
'          hideLoading();\n' +
'          if (r2 && r2.success) {\n' +
'          Admin.students = r2.data || [];\n' +
'          Admin.filtered = Admin.students.slice();\n' +
'          Admin._populateBranchFilter();\n' +
'          Admin._renderTable();\n' +
'  }\n' +
'  })\n' +
'          .withFailureHandler(function() { hideLoading(); })\n' +
'          .gsAdminGetStudents(pw, "", "");\n' +
'          } else {\n' +
'          showToast("รหัสผ่านไม่ถูกต้อง", "error");\n' +
'  }\n' +
'  })\n' +
'          .withFailureHandler(function(err) { \n' +
'          hideLoading(); \n' +
'           showToast("เกิดข้อผิดพลาด: " + err, "error"); \n' +
'  })\n' +
'      .gsAdminGetStats(pw);\n' +
'  },\n' +
'\n' +
'  _showDashboard: function() {\n' +
'    document.getElementById("admin-login").classList.add("hidden");\n' +
'    document.getElementById("admin-dashboard").classList.remove("hidden");\n' +
'    this._bindEvents();\n' +
'  },\n' +
'\n' +
'  _refreshAll: function() {\n' +
'    var self = this;\n' +
'    showToast("กำลังรีเฟรช...", "info", 1500);\n' +
'    this._loadAll();\n' +
'  },\n' +
'\n' +
'  _renderStats: function(s) {\n' +
'    if (!s) return;\n' +
'    document.getElementById("stat-total").textContent = s.total !== undefined ? s.total : "—";\n' +
'    document.getElementById("stat-today").textContent = s.today !== undefined ? s.today : "—";\n' +
'    document.getElementById("stat-pending").textContent = s.pending !== undefined ? s.pending : "—";\n' +
'    document.getElementById("stat-verified").textContent = s.verified !== undefined ? s.verified : "—";\n' +
'    document.getElementById("nav-pending-badge").textContent = s.pending || "0";\n' +
'\n' +
'    var branchEl = document.getElementById("branch-stats");\n' +
'    if (s.byBranch && s.byBranch.length) {\n' +
'      var max = Math.max.apply(null, s.byBranch.map(function(b){return b.count;}));\n' +
'      branchEl.innerHTML = s.byBranch.map(function(b) {\n' +
'        return \'<div class="branch-row"><div style="width:160px;flex-shrink:0">\' + b.name + \'</div>\' +\n' +
'          \'<div class="branch-bar-wrap"><div class="branch-bar" style="width:\' + Math.round(b.count/max*100) + \'%"></div></div>\' +\n' +
'          \'<div style="width:32px;text-align:right;font-weight:700;color:var(--primary)">\' + b.count + \'</div></div>\';\n' +
'      }).join("");\n' +
'    } else {\n' +
'      branchEl.innerHTML = \'<p style="color:var(--muted);text-align:center;padding:8px">ยังไม่มีข้อมูล</p>\';\n' +
'    }\n' +
'  },\n' +
'\n' +
'  _populateBranchFilter: function() {\n' +
'    var sel = document.getElementById("filter-branch");\n' +
'    var current = sel.value;\n' +
'    var branches = [];\n' +
'    this.students.forEach(function(s) { if (s.branchName && branches.indexOf(s.branchName) === -1) branches.push(s.branchName); });\n' +
'    sel.innerHTML = \'<option value="">ทุกสาขา</option>\' + branches.map(function(b){ return \'<option value="\'+b+\'">\'+b+\'</option>\'; }).join("");\n' +
'    sel.value = current;\n' +
'  },\n' +
'\n' +
'  _applyFilter: function() {\n' +
'    var search = (document.getElementById("search-input").value || "").toLowerCase().trim();\n' +
'    var branch = document.getElementById("filter-branch").value;\n' +
'    var tab = this.currentTab;\n' +
'    this.filtered = this.students.filter(function(s) {\n' +
'      var matchTab = tab === "all" || s.status === tab;\n' +
'      var matchBranch = !branch || s.branchName === branch;\n' +
'      var matchSearch = !search || [s.firstName, s.lastName, s.idCard, s.applicationNo, s.phone].some(function(v){ return v && String(v).toLowerCase().indexOf(search) !== -1; });\n' +
'      return matchTab && matchBranch && matchSearch;\n' +
'    });\n' +
'    this._populateBranchFilter();\n' +
'    this.page = 1;\n' +
'    this._renderTable();\n' +
'  },\n' +
'\n' +
'  _renderTable: function() {\n' +
'    var self = this;\n' +
'    var tbody = document.getElementById("student-tbody");\n' +
'    var start = (this.page - 1) * this.pageSize;\n' +
'    var items = this.filtered.slice(start, start + this.pageSize);\n' +
'    var total = this.filtered.length;\n' +
'\n' +
'    document.getElementById("page-info").textContent =\n' +
'      "แสดง " + (total ? start+1 : 0) + "–" + Math.min(start + items.length, total) + " จาก " + total + " รายการ";\n' +
'\n' +
'    if (!items.length) {\n' +
'      tbody.innerHTML = \'<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">ไม่พบข้อมูล</td></tr>\';\n' +
'      document.getElementById("page-btns").innerHTML = "";\n' +
'      return;\n' +
'    }\n' +
'\n' +
'    tbody.innerHTML = items.map(function(s) {\n' +
'      return \'<tr data-id="\' + s.id + \'">\' +\n' +
'        \'<td class="td-appno">\' + (s.applicationNo || "—") + \'</td>\' +\n' +
'        \'<td><div class="td-name">\' + (s.prefix||"") + (s.firstName||"") + " " + (s.lastName||"") + \'</div>\' +\n' +
'        \'<div class="td-sub">\' + (s.idCard||"") + \'</div></td>\' +\n' +
'        \'<td><div>\' + (s.branchName||"—") + \'</div><div class="td-sub">\' + (s.roundName||"") + \'</div></td>\' +\n' +
'        \'<td>\' + (s.phone||"—") + \'</td>\' +\n' +
'        \'<td style="white-space:nowrap">\' + _thDate(s.applyDate) + \'</td>\' +\n' +
'        \'<td><span class="badge \' + _statusBadge(s.status) + \'">\' + _statusLabel(s.status) + \'</span></td>\' +\n' +
'        \'<td>\' + (s.docsComplete ? \'<span class="badge badge-success">ครบ</span>\' : \'<span class="badge badge-warning">ไม่ครบ</span>\') + \'</td>\' +\n' +
'        \'<td><button class="btn btn-outline btn-sm" onclick="Admin._openDetail(\\\'\' + s.id + \'\\\');event.stopPropagation()">ดูรายละเอียด</button></td>\' +\n' +
'        \'</tr>\';\n' +
'    }).join("");\n' +
'\n' +
'    tbody.querySelectorAll("tr").forEach(function(row) {\n' +
'      row.onclick = function() { Admin._openDetail(row.dataset.id); };\n' +
'    });\n' +
'\n' +
'    // Pagination\n' +
'    var totalPages = Math.ceil(total / self.pageSize);\n' +
'    var btns = \'<button class="page-btn" onclick="Admin._goPage(\' + (self.page-1) + \')" \' + (self.page<=1?"disabled":"") + \'>‹</button>\';\n' +
'    for (var i = 1; i <= totalPages; i++) {\n' +
'      if (i === 1 || i === totalPages || Math.abs(i - self.page) <= 2) {\n' +
'        btns += \'<button class="page-btn \' + (i===self.page?"active":"") + \'" onclick="Admin._goPage(\' + i + \')\">\' + i + \'</button>\';\n' +
'      } else if (Math.abs(i - self.page) === 3) {\n' +
'        btns += \'<span style="padding:0 4px;color:var(--muted)">…</span>\';\n' +
'      }\n' +
'    }\n' +
'    btns += \'<button class="page-btn" onclick="Admin._goPage(\' + (self.page+1) + \')" \' + (self.page>=totalPages?"disabled":"") + \'>›</button>\';\n' +
'    document.getElementById("page-btns").innerHTML = btns;\n' +
'  },\n' +
'\n' +
'  _goPage: function(n) {\n' +
'    var total = Math.ceil(this.filtered.length / this.pageSize);\n' +
'    if (n < 1 || n > total) return;\n' +
'    this.page = n;\n' +
'    this._renderTable();\n' +
'  },\n' +
'\n' +
'  _openDetail: function(id) {\n' +
'    var s = null;\n' +
'    for (var i = 0; i < this.students.length; i++) { if (this.students[i].id === id) { s = this.students[i]; break; } }\n' +
'    if (!s) return;\n' +
'    this.currentStudent = s;\n' +
'\n' +
'    document.getElementById("dp-name").textContent = (s.prefix||"") + (s.firstName||"") + " " + (s.lastName||"");\n' +
'    document.getElementById("dp-appno").textContent = s.applicationNo || "—";\n' +
'\n' +
'    var docs = s.documents || [];\n' +
'    var docsHtml = docs.length ? docs.map(function(d) {\n' +
'      return \'<div class="doc-row">\' +\n' +
'        \'<div class="doc-thumb">\' + (d.driveUrl ? \'<img src="\'+d.driveUrl+\'" onclick="window.open(\\"\'+d.driveUrl+\'\\")">\' : "📄") + \'</div>\' +\n' +
'        \'<div style="flex:1"><div class="doc-name">\' + _docLabel(d.type) + \'</div><div class="doc-date">\' + _thDate(d.uploadedAt) + \'</div></div>\' +\n' +
'        \'<button class="btn btn-sm \' + (d.isVerified?"btn-outline":"btn-primary") + \'" onclick="Admin._verifyDoc(\\"\'+d.id+\'\\",\' + !d.isVerified + \',this)">\' + (d.isVerified?"✓ ผ่านแล้ว":"ตรวจสอบ") + \'</button>\' +\n' +
'        \'</div>\';\n' +
'    }).join("") : \'<p style="color:var(--muted);font-size:0.875rem">ยังไม่มีเอกสาร</p>\';\n' +
'\n' +
'    document.getElementById("dp-body").innerHTML =\n' +
'      \'<div class="section-label">ข้อมูลการสมัคร</div>\' +\n' +
'      \'<div class="info-grid" style="margin-bottom:20px">\' +\n' +
'      _infoItem("สาขา", s.branchName) + _infoItem("รอบ", s.roundName) +\n' +
'      _infoItem("เลขบัตร", s.idCard) + _infoItem("เบอร์โทร", s.phone) +\n' +
'      _infoItem("วันที่สมัคร", _thDate(s.applyDate)) +\n' +
'      \'<div><div class="info-label">สถานะ</div><div class="info-value"><span class="badge \' + _statusBadge(s.status) + \'">\' + _statusLabel(s.status) + \'</span></div></div>\' +\n' +
'      \'</div>\' +\n' +
'      \'<div class="section-label">เอกสารแนบ</div>\' + docsHtml;\n' +
'\n' +
'    document.getElementById("detail-overlay").classList.add("open");\n' +
'    document.getElementById("detail-panel").classList.add("open");\n' +
'  },\n' +
'\n' +
'  _closeDetail: function() {\n' +
'    document.getElementById("detail-overlay").classList.remove("open");\n' +
'    document.getElementById("detail-panel").classList.remove("open");\n' +
'    this.currentStudent = null;\n' +
'  },\n' +
'\n' +
'  _verifyDoc: function(docId, verified, btn) {\n' +
'    google.script.run\n' +
'      .withSuccessHandler(function(res) {\n' +
'        if (res && res.success) {\n' +
'          btn.textContent = verified ? "✓ ผ่านแล้ว" : "ตรวจสอบ";\n' +
'          btn.className = "btn btn-sm " + (verified ? "btn-outline" : "btn-primary");\n' +
'          showToast(verified ? "ยืนยันเอกสารแล้ว" : "ยกเลิกการยืนยัน", "success");\n' +
'        }\n' +
'      })\n' +
'      .withFailureHandler(function() { showToast("เกิดข้อผิดพลาด", "error"); })\n' +
'      .gsAdminVerifyDoc(Admin.token, docId, verified);\n' +
'  },\n' +
'\n' +
'  _updateStatus: function(status) {\n' +
'    if (!this.currentStudent) return;\n' +
'    var self = this;\n' +
'    showLoading("กำลังบันทึก...");\n' +
'    google.script.run\n' +
'      .withSuccessHandler(function(res) {\n' +
'        hideLoading();\n' +
'        if (res && res.success) {\n' +
'          showToast("อัปเดตสถานะแล้ว", "success");\n' +
'          self._closeDetail();\n' +
'          self._refreshAll();\n' +
'        } else {\n' +
'          showToast("เกิดข้อผิดพลาด", "error");\n' +
'        }\n' +
'      })\n' +
'      .withFailureHandler(function() { hideLoading(); showToast("เกิดข้อผิดพลาด", "error"); })\n' +
'      .gsAdminUpdateStatus(self.token, self.currentStudent.id, status);\n' +
'  },\n' +
'\n' +
'  _bindEvents: function() {\n' +
'    var self = this;\n' +
'    // Nav\n' +
'    document.querySelectorAll(".nav-item[data-page]").forEach(function(item) {\n' +
'      item.onclick = function() {\n' +
'        document.querySelectorAll(".nav-item").forEach(function(n){n.classList.remove("active");});\n' +
'        item.classList.add("active");\n' +
'        var page = item.dataset.page;\n' +
'        document.getElementById("page-overview").classList.toggle("hidden", page !== "overview");\n' +
'        document.getElementById("page-students").classList.toggle("hidden", page !== "students");\n' +
'        document.getElementById("topbar-title").textContent = page === "overview" ? "ภาพรวม" : "รายชื่อผู้สมัคร";\n' +
'      };\n' +
'    });\n' +
'    // Tabs\n' +
'    document.querySelectorAll(".tab-btn").forEach(function(btn) {\n' +
'      btn.onclick = function() {\n' +
'        document.querySelectorAll(".tab-btn").forEach(function(b){b.classList.remove("active");});\n' +
'        btn.classList.add("active");\n' +
'        self.currentTab = btn.dataset.tab;\n' +
'        self._applyFilter();\n' +
'      };\n' +
'    });\n' +
'    // Search\n' +
'    document.getElementById("search-input").addEventListener("input", function(e) {\n' +
'      clearTimeout(self.searchTimeout);\n' +
'      self.searchTimeout = setTimeout(function(){self._applyFilter();}, 300);\n' +
'    });\n' +
'    document.getElementById("filter-branch").addEventListener("change", function(){self._applyFilter();});\n' +
'    // Buttons\n' +
'    document.getElementById("btn-export-csv").onclick = function() {\n' +
'      google.script.run.withSuccessHandler(function(r){ if(r&&r.url) window.open(r.url,"_blank"); }).gsGetExportUrl(self.token);\n' +
'    };\n' +
'    document.getElementById("btn-refresh-list").onclick = function(){self._refreshAll();};\n' +
'    document.getElementById("nav-export").onclick = function() {\n' +
'      google.script.run.withSuccessHandler(function(r){ if(r&&r.url) window.open(r.url,"_blank"); }).gsGetExportUrl(self.token);\n' +
'    };\n' +
'    document.getElementById("nav-refresh").onclick = function(){self._refreshAll();};\n' +
'    document.getElementById("btn-logout").onclick = function() { window.location.href = window.location.href.split("?")[0] + "?action=adminPage"; };\n' +
'    // Detail\n' +
'    document.getElementById("btn-close-detail").onclick = function(){self._closeDetail();};\n' +
'    document.getElementById("detail-overlay").onclick = function(){self._closeDetail();};\n' +
'    document.getElementById("dp-btn-approve").onclick = function(){self._updateStatus("verified");};\n' +
'    document.getElementById("dp-btn-reject").onclick = function(){self._updateStatus("rejected");};\n' +
'    document.getElementById("dp-btn-pending").onclick = function(){self._updateStatus("pending");};\n' +
'    document.getElementById("dp-btn-print").onclick = function() {\n' +
'      if (!self.currentStudent) return;\n' +
'      google.script.run.withSuccessHandler(function(r){ if(r&&r.url) window.open(r.url,"_blank"); }).gsGetPrintUrl(self.token, self.currentStudent.id);\n' +
'    };\n' +
'  },\n' +
'};\n' +
'\n' +
'// Helpers\n' +
'function _statusBadge(s){return{pending:"badge-warning",verified:"badge-success",rejected:"badge-danger"}[s]||"badge-gray";}\n' +
'function _statusLabel(s){return{pending:"รอตรวจ",verified:"ผ่านแล้ว",rejected:"ปฏิเสธ"}[s]||s||"—";}\n' +
'function _docLabel(t){return{id_card_front:"บัตร ปชช. หน้า",id_card_back:"บัตร ปชช. หลัง",house_reg:"ทะเบียนบ้าน",edu_cert:"วุฒิการศึกษา",edu_cert_front:"วุฒิ ด้านหน้า",edu_cert_back:"วุฒิ ด้านหลัง",payment_slip:"สลิปชำระ"}[t]||t;}\n' +
'function _thDate(iso){if(!iso)return"—";try{return new Date(iso).toLocaleDateString("th-TH",{year:"numeric",month:"short",day:"numeric"});}catch(e){return iso;}}\n' +
'function _infoItem(label, val){return\'<div><div class="info-label">\'+label+\'</div><div class="info-value">\'+( val||"—")+\'</div></div>\';}\n' +
'function showToast(msg,type,ms){type=type||"info";ms=ms||3500;var c=document.getElementById("toast-container");var t=document.createElement("div");t.className="toast "+type;t.textContent=msg;c.appendChild(t);setTimeout(function(){t.style.opacity="0";t.style.transition="opacity 0.3s";setTimeout(function(){t.remove();},300);},ms);}\n' +
'function showLoading(){document.getElementById("loading-overlay").classList.remove("hidden");}\n' +
'function hideLoading(){document.getElementById("loading-overlay").classList.add("hidden");}\n' +
'\n' +
'document.addEventListener("DOMContentLoaded", function(){ Admin.init(); });\n';
}
