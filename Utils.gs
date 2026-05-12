// ============================================
// Utils.gs — PDF / Print / LINE Notify
// ============================================

// ---- สร้างใบสมัคร PDF ----
function printApplication(params) {
  _checkAdmin(params.token);
  const studentId = params.studentId;

  const students = sheetToObjects(getSheet(SHEETS.STUDENTS));
  const s = students.find(st => st.id === studentId);
  if (!s) return _json({ success: false, message: 'Student not found' });

  const enrollments = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  const programs = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  const addresses = sheetToObjects(getSheet(SHEETS.ADDRESSES));
  const parents = sheetToObjects(getSheet(SHEETS.PARENTS));
  const guardian = sheetToObjects(getSheet(SHEETS.GUARDIANS)).find(g => g.studentId === studentId) || {};

  const enroll = enrollments.find(e => e.studentId === studentId) || {};
  const prog = programs.find(p => p.id === enroll.programId) || {};
  const addr = addresses.find(a => a.studentId === studentId) || {};
  const parentList = parents.filter(p => p.studentId === studentId);

  const html = _buildApplicationHTML(s, enroll, prog, addr, parentList, guardian);
  const blob = HtmlService.createHtmlOutput(html).getContent();

  // ส่งเป็น HTML ให้ browser print
  return ContentService
    .createTextOutput(html)
    .setMimeType(ContentService.MimeType.HTML);
}

function _buildApplicationHTML(s, enroll, prog, addr, parents, guardian) {
  const thDate = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return iso; }
  };

  const parentRows = parents.map(p => `
    <tr>
      <td>${p.type === 'father' ? 'บิดา' : 'มารดา'}</td>
      <td>${p.prefix}${p.firstName} ${p.lastName}</td>
      <td>${p.phone || '—'}</td>
      <td>${p.occupation || '—'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบสมัคร ${s.applicationNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', sans-serif; font-size: 14px; color: #000; padding: 20mm; }
  h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 14px; text-align: center; color: #555; margin-bottom: 16px; }
  .app-no { font-size: 20px; font-weight: 700; text-align: center; color: #009900;
    border: 2px solid #009900; padding: 6px 16px; display: inline-block; margin: 0 auto 16px;
    border-radius: 6px; }
  .center { text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; }
  th { background: #f0f0f0; font-weight: 700; text-align: left; }
  .section-title { font-size: 13px; font-weight: 700; background: #1A1D23; color: #fff;
    padding: 4px 10px; margin: 12px 0 0; }
  .signature-row { display: flex; justify-content: space-around; margin-top: 32px; }
  .sig-box { text-align: center; }
  .sig-line { width: 150px; border-bottom: 1px solid #000; margin: 40px auto 4px; }
  @media print {
    body { padding: 10mm; }
    button { display: none; }
  }
</style>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>

<button onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:8px 16px;background:#009900;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">
  🖨️ พิมพ์
</button>

<h1>วิทยาลัยเทคนิคตัวอย่าง</h1>
<h2>ใบสมัครเข้าเรียน ปีการศึกษา 2568</h2>
<div class="center"><div class="app-no">${s.applicationNo}</div></div>

<div class="section-title">1. ข้อมูลหลักสูตร</div>
<table>
  <tr><th width="30%">ระดับการศึกษา</th><td>${prog.level || '—'}</td>
      <th width="20%">สาขา</th><td>${prog.branch || '—'}</td></tr>
  <tr><th>รอบที่สมัคร</th><td>${prog.round || '—'}</td>
      <th>วันที่สมัคร</th><td>${thDate(s.applyDate)}</td></tr>
</table>

<div class="section-title">2. ข้อมูลส่วนตัว</div>
<table>
  <tr><th width="30%">ชื่อ-นามสกุล</th><td colspan="3">${s.prefix}${s.firstName} ${s.lastName}</td></tr>
  <tr><th>เลขบัตรประชาชน</th><td>${s.idCard}</td>
      <th>วันเกิด</th><td>${thDate(s.birthDate)}</td></tr>
  <tr><th>เบอร์โทรศัพท์</th><td>${s.phone}</td>
      <th>วุฒิการศึกษา</th><td>${s.education}</td></tr>
  <tr><th>โรงเรียนเดิม</th><td colspan="3">${s.oldSchool}</td></tr>
</table>

<div class="section-title">3. ที่อยู่ปัจจุบัน</div>
<table>
  <tr><th>รายละเอียด</th><td colspan="3">${addr.detail || '—'}</td></tr>
  <tr><th>ตำบล/แขวง</th><td>${addr.subDistrict || '—'}</td>
      <th>อำเภอ/เขต</th><td>${addr.district || '—'}</td></tr>
  <tr><th>จังหวัด</th><td>${addr.province || '—'}</td>
      <th>รหัสไปรษณีย์</th><td>${addr.zipcode || '—'}</td></tr>
</table>

${parents.length ? `
<div class="section-title">4. ข้อมูลบิดา/มารดา</div>
<table>
  <tr><th>ประเภท</th><th>ชื่อ-นามสกุล</th><th>เบอร์โทร</th><th>อาชีพ</th></tr>
  ${parentRows}
</table>` : ''}

<div class="section-title">5. ผู้ปกครอง</div>
<table>
  <tr><th width="30%">ชื่อ-นามสกุล</th><td>${guardian.prefix || ''}${guardian.firstName || '—'} ${guardian.lastName || ''}</td>
      <th>ความสัมพันธ์</th><td>${guardian.relation || '—'}</td></tr>
  <tr><th>เบอร์โทรศัพท์</th><td>${guardian.phone || '—'}</td>
      <th>เลขบัตร</th><td>${guardian.idCard || '—'}</td></tr>
</table>

<div class="signature-row">
  <div class="sig-box">
    <div class="sig-line"></div>
    <div>ลายมือชื่อผู้สมัคร</div>
    <div style="font-size:12px;color:#555">(${s.prefix}${s.firstName} ${s.lastName})</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div>ลายมือชื่อผู้ปกครอง</div>
    <div style="font-size:12px;color:#555">(${guardian.prefix || ''}${guardian.firstName || '..........'})</div>
  </div>
  <div class="sig-box">
    <div class="sig-line"></div>
    <div>เจ้าหน้าที่รับสมัคร</div>
    <div style="font-size:12px;color:#555">วันที่รับ ........................</div>
  </div>
</div>

<p style="margin-top:24px;font-size:11px;color:#888;text-align:center">
  สอบถามข้อมูลเพิ่มเติม: โทร. 02-123-4567 | LINE OA: @school_oa
</p>

</body>
</html>`;
}

// ---- LINE Notify (optional) ----
function _notifyLine(userId, appNo) {
  // ต้องตั้งค่า LINE Messaging API Channel Access Token ใน PropertiesService
  try {
    const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN');
    if (!token) return;

    const payload = {
      to: userId,
      messages: [{
        type: 'text',
        text: `✅ ส่งใบสมัครเรียบร้อย!\n\nเลขที่ใบสมัคร: ${appNo}\n\nทางโรงเรียนจะตรวจสอบเอกสารและแจ้งผลให้ทราบภายใน 3-5 วันทำการ`,
      }],
    };

    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      payload: JSON.stringify(payload),
    });
  } catch (err) {
    Logger.log('LINE notify error: ' + err);
  }
}
