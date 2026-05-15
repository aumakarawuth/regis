// ============================================
// Utils.gs — PDF / Print / LINE Notify
// ============================================

// ---- URL ของ Python PDF Server (ตั้งค่าใน Script Properties) ----
// PropertiesService.getScriptProperties().setProperty('PDF_SERVER_URL', 'http://your-server:5000')
function _getPdfServerUrl() {
  return PropertiesService.getScriptProperties().getProperty('PDF_SERVER_URL') || '';
}

// ---- Address lookup helpers ----
function _getProvinceName(id) {
  if (!id) return '';
  if (isNaN(Number(id))) return String(id);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('provinces');
  if (!sheet) return String(id);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return String(data[i][1]);
  }
  return String(id);
}

function _getDistrictName(id) {
  if (!id) return '';
  if (isNaN(Number(id))) return String(id);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('districts');
  if (!sheet) return String(id);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return String(data[i][1]);
  }
  return String(id);
}

function _getSubDistrictName(id) {
  if (!id) return '';
  if (isNaN(Number(id))) return String(id);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('subdistricts');
  if (!sheet) return String(id);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return String(data[i][1]);
  }
  return String(id);
}

function _resolveAddress(addr) {
  return {
    detail:      addr.detail      || '',
    subDistrict: _getSubDistrictName(addr.subDistrict),
    district:    _getDistrictName(addr.district),
    province:    _getProvinceName(addr.province),
    zipcode:     addr.zipcode     || '',
  };
}

// ============================================================
// printApplication — HTML print (ไม่ต้องพึ่ง Python)
// เรียกผ่าน: ?action=printApplication&token=xxx&studentId=yyy
// ============================================================
function printApplication(params) {
  _checkAdmin(params.token);
  const studentId = params.studentId;

  const students    = sheetToObjects(getSheet(SHEETS.STUDENTS));
  const s           = students.find(st => st.id === studentId);
  if (!s) return _json({ success: false, message: 'Student not found' });

  const enrollments = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  const programs    = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  const addresses   = sheetToObjects(getSheet(SHEETS.ADDRESSES));
  const parents     = sheetToObjects(getSheet(SHEETS.PARENTS));
  const guardianList= sheetToObjects(getSheet(SHEETS.GUARDIANS));
  const documents   = sheetToObjects(getSheet(SHEETS.DOCUMENTS));

  const enroll = enrollments.find(e => e.studentId === s.id) || {};
  // FIX: หาจาก branchId ก่อน
  let prog = programs.find(p => p.branchId === enroll.branchId);
  if (!prog) prog = programs.find(p => p.id === enroll.programId);
  prog = prog || {};

  const rawAddr = addresses.find(a => a.studentId === studentId) || {};
  const addr    = _resolveAddress(rawAddr);

  const parentList = parents.filter(p => p.studentId === studentId);
  const guardian   = guardianList.find(g => g.studentId === studentId) || {};
  const studentDocs= documents.filter(d => d.studentId === studentId);

  const isPvs = (prog.level || s.education || '').includes('ปวส');
  const html  = isPvs
    ? _buildPvsPDF(s, enroll, prog, addr, parentList, guardian, studentDocs)
    : _buildPvchPDF(s, enroll, prog, addr, parentList, guardian, studentDocs);

  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}

// ============================================================
// generateStudentPDF — เรียก Python server แล้ว upload ไป Drive
// เรียกผ่าน: ?action=generatePDF&token=xxx&studentId=yyy
// ============================================================
function generateStudentPDF(params) {
  _checkAdmin(params.token);
  const studentId = params.studentId;

  const pdfServerUrl = _getPdfServerUrl();
  if (!pdfServerUrl) {
    return _json({ success: false, message: 'PDF_SERVER_URL ยังไม่ได้ตั้งค่าใน Script Properties' });
  }

  // ดึงข้อมูลทั้งหมด
  const res = adminGetStudent(studentId, params.token);
  if (!res.success) return _json(res);
  const payload = res.data;

  try {
    // เรียก Python server
    const response = UrlFetchApp.fetch(pdfServerUrl + '/generate_pdf_base64', {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      return _json({ success: false, message: `PDF server error: HTTP ${statusCode}` });
    }

    const result = JSON.parse(response.getContentText());
    if (result.error) {
      return _json({ success: false, message: result.error });
    }

    // บันทึก PDF ไป Drive
    const pdfBytes = Utilities.base64Decode(result.pdf_base64);
    const blob = Utilities.newBlob(pdfBytes, 'application/pdf', result.filename);

    const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ROOT);
    let studentFolder;
    const folders = rootFolder.getFoldersByName(studentId);
    if (folders.hasNext()) {
      studentFolder = folders.next();
    } else {
      studentFolder = rootFolder.createFolder(studentId);
    }

    // ลบไฟล์เก่าถ้ามี
    const existingFiles = studentFolder.getFilesByName(result.filename);
    while (existingFiles.hasNext()) existingFiles.next().setTrashed(true);

    const file = studentFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return _json({
      success: true,
      pdfUrl: file.getUrl(),
      downloadUrl: `https://drive.google.com/uc?export=download&id=${file.getId()}`,
      filename: result.filename,
      size_kb: result.size_kb,
    });

  } catch (err) {
    Logger.log('generateStudentPDF error: ' + err.toString());
    return _json({ success: false, message: err.toString() });
  }
}

// ============================================================
// HTML Template — ปวช.
// ============================================================
function _buildPvchPDF(s, enroll, prog, addr, parents, guardian, docs) {
  const father = parents.find(p => p.type === 'father') || {};
  const mother = parents.find(p => p.type === 'mother') || {};

  const thDate = (d) => {
    if (!d) return '........./........./..........';
    try {
      const dt = new Date(d);
      if (isNaN(dt)) return String(d);
      const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                      'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()+543}`;
    } catch(e) { return String(d); }
  };

  const studyRound = enroll.studyRound || s.studyRound || '';
  const fullName   = `${s.prefix||''}${s.firstName||''} ${s.lastName||''}`;
  const idDigits   = (s.idCard||'').replace(/\D/g,'');
  const idBoxes    = Array.from({length:13},(_,i)=>`<span class="idbox">${idDigits[i]||''}</span>`).join('');
  const fidBoxes   = Array.from({length:13},(_,i)=>`<span class="idbox">${(father.idCard||'').replace(/\D/g,'')[i]||''}</span>`).join('');
  const midBoxes   = Array.from({length:13},(_,i)=>`<span class="idbox">${(mother.idCard||'').replace(/\D/g,'')[i]||''}</span>`).join('');

  const branchChecks = _branchCheckboxesPvch(prog.branch || '');
  const docsHtml     = _buildDocsSection(docs, fullName);
  const hasDoc = (t) => docs.some(d => d.type === t);

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบสมัคร ปวช. — ${s.applicationNo||''}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #000; margin: 0; background: #fff; }
  .page { page-break-after: always; padding: 0; }
  .page:last-child { page-break-after: avoid; }
  .header-meta { display: flex; justify-content: flex-end; font-size: 12px; margin-bottom: 3px; flex-wrap: wrap; gap: 6px; }
  .header-meta .item { white-space: nowrap; }
  .idbox { display: inline-block; width: 18px; height: 18px; border: 1px solid #000;
           text-align: center; line-height: 17px; font-size: 12px; font-weight: 700; margin: 0 1px; }
  .cb { display: inline-block; width: 14px; height: 14px; border: 1px solid #000;
        text-align: center; line-height: 13px; font-size: 11px; vertical-align: middle; }
  .cb.checked::after { content: '✓'; font-weight: 700; }
  .cover { text-align: center; padding: 8px 0; }
  .cover h1 { font-size: 26px; font-weight: 700; margin: 8px 0 4px; line-height: 1.3; }
  .cover h2 { font-size: 14px; color: #444; margin: 0 0 6px; }
  .photo-box { width: 100px; height: 120px; border: 1px solid #000; margin: 0 0 0 auto;
               display: flex; align-items: center; justify-content: center; font-size: 11px;
               color: #888; text-align: center; }
  .form-title { text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 8px; }
  .row { margin: 5px 0; line-height: 1.8; }
  .ul { display: inline-block; border-bottom: 1px solid #000; min-width: 100px; padding: 0 3px; vertical-align: bottom; }
  .ul-sm{min-width:55px} .ul-md{min-width:140px} .ul-lg{min-width:220px} .ul-xl{min-width:320px}
  .indent { padding-left: 20px; }
  .section-header { font-weight: 700; font-size: 13px; margin: 10px 0 4px; border-bottom: 1px solid #000; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
  .sig-box { text-align: center; font-size: 12px; }
  .sig-line { border-bottom: 1px solid #000; margin: 44px 16px 4px; }
  .checklist { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-size: 12px; text-align: left; margin-top: 8px; }
  .doc-page { text-align: center; padding: 16px 0; }
  .doc-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
  .doc-img { max-width: 88%; max-height: 185mm; border: 1px solid #ccc; display: block; margin: 0 auto; }
  .stamp { border: 3px solid #cc0000; border-radius: 8px; padding: 6px 20px;
           color: #cc0000; font-weight: 700; font-size: 15px; display: inline-block; margin-top: 14px; }
  .sig-name-box { margin: 12px auto 0; width: 280px; text-align: center; }
  .sig-name-line { border-bottom: 1px solid #000; margin-bottom: 5px; height: 44px; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>

<button class="no-print" onclick="window.print()"
  style="position:fixed;top:12px;right:12px;padding:9px 20px;background:#009900;color:#fff;
  border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3)">
  🖨️ พิมพ์ / บันทึก PDF
</button>

<!-- หน้า 1: ปก -->
<div class="page" style="padding:6px 0">
  <div class="header-meta">
    <div class="item">นาย/น.ส./นาง <span class="ul ul-lg">${fullName}</span></div>
    <div class="item">ห้อง <span class="ul ul-sm"></span></div>
    <div class="item">รอบ <span class="ul ul-sm">${_roundThai(studyRound)}</span></div>
  </div>
  <div style="text-align:right;font-size:12px;margin-bottom:8px">
    รหัสประจำตัว ${idBoxes}
  </div>

  <div style="display:flex;align-items:flex-start;justify-content:center;gap:16px">
    <div class="cover" style="flex:1">
      <div style="font-size:60px;margin-bottom:4px">🏫</div>
      <h1>ใบสมัคร ปวช.<br>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h1>
      <div style="font-size:12px;color:#555;margin-bottom:8px">
        Charansanitwong Technological College<br>
        18 ก.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700<br>
        โทร. 0-2434-6155-7 โทรสาร. 0-2433-3647 www.charansanitwong.ac.th
      </div>
    </div>
    <div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>
  </div>

  <hr style="margin:8px 0">

  <div style="font-size:12px;font-weight:700;margin-bottom:4px">หลักฐานการสมัครเรียน (เรียงตามหมายเลข)</div>
  <div class="checklist">
    <div><span class="cb"></span> 1. รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ</div>
    <div><span class="cb ${hasDoc('id_card_back')?'checked':''}"></span> 6. สำเนาบัตร ปชช. ของมารดา 1 ฉบับ</div>
    <div><span class="cb ${hasDoc('edu_cert_front')?'checked':''}"></span> 2. วุฒิการศึกษาฉบับจริง</div>
    <div><span class="cb ${hasDoc('id_card_front')?'checked':''}"></span> 7. สำเนาบัตร ปชช. ของผู้ปกครอง 1 ฉบับ</div>
    <div><span class="cb ${hasDoc('edu_cert_front')?'checked':''}"></span> 3. สำเนาวุฒิการศึกษา 2 ฉบับ</div>
    <div><span class="cb ${hasDoc('house_reg')?'checked':''}"></span> 8. สำเนาทะเบียนบ้านของตนเอง 1 ฉบับ</div>
    <div><span class="cb ${hasDoc('id_card_front')?'checked':''}"></span> 4. สำเนาบัตร ปชช. ของตนเอง 1 ฉบับ</div>
    <div><span class="cb"></span> 9. สำเนาสูติบัตร 1 ฉบับ</div>
    <div><span class="cb ${hasDoc('id_card_front')?'checked':''}"></span> 5. สำเนาบัตร ปชช. ของบิดา 1 ฉบับ</div>
    <div><span class="cb"></span> 10. กรณี โอนหน่วยกิต</div>
  </div>
</div>

<!-- หน้า 2: ฟอร์มกรอก -->
<div class="page" style="padding:4px 0">
  <div class="form-title">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>

  <div class="row">
    <b>วันที่สมัคร</b> <span class="ul ul-md">${thDate(s.applyDate)}</span>
    &emsp;<b>ระดับที่สมัคร ปวช.</b> – รอบ
    <span class="cb ${studyRound==='morning'?'checked':''}"></span> เช้า&nbsp;
    <span class="cb ${studyRound==='afternoon'?'checked':''}"></span> บ่าย&nbsp;
    <span class="cb ${studyRound==='dual'?'checked':''}"></span> ทวิภาคี
  </div>

  <div class="row">
    <b>1.</b> นาย/นางสาว/นาง
    <span class="ul ul-lg">${s.firstName||''}</span>
    นามสกุล <span class="ul ul-lg">${s.lastName||''}</span>
    วัน/เดือน/ปีเกิด <span class="ul ul-md">${thDate(s.birthDate)}</span>
  </div>
  <div class="row indent">
    เลขประจำตัวประชาชน ${idBoxes}
  </div>
  <div class="row indent">
    สัญชาติ <span class="ul ul-sm">${s.nationality||'ไทย'}</span>&nbsp;
    เชื้อชาติ <span class="ul ul-sm">${s.ethnicity||'ไทย'}</span>&nbsp;
    ศาสนา <span class="ul ul-sm">${s.religion||'พุทธ'}</span>&nbsp;
    น้ำหนัก <span class="ul ul-sm">${s.weight||''}</span> กก.&nbsp;
    ส่วนสูง <span class="ul ul-sm">${s.height||''}</span> ซม.
  </div>

  <div class="row">
    <b>2.</b> สาขาวิชาที่สมัคร ${branchChecks}
  </div>

  <div class="row">
    <b>3.</b> จบการศึกษา
    <span class="cb ${(s.education||'').includes('ม.3')?'checked':''}"></span> ม.3
    โรงเรียน <span class="ul ul-xl">${s.oldSchool||''}</span>
  </div>
  <div class="row indent">
    ตำบล/แขวง <span class="ul ul-md">${addr.subDistrict}</span>&nbsp;
    อำเภอ/เขต <span class="ul ul-md">${addr.district}</span>&nbsp;
    จังหวัด <span class="ul ul-md">${addr.province}</span>
  </div>

  <div class="row">
    <b>4.</b> ที่อยู่ปัจจุบัน
    <span class="ul ul-xl">${addr.detail||''}</span>
  </div>
  <div class="row indent">
    ตำบล/แขวง <span class="ul ul-md">${addr.subDistrict}</span>&nbsp;
    อำเภอ/เขต <span class="ul ul-md">${addr.district}</span>&nbsp;
    จังหวัด <span class="ul ul-md">${addr.province}</span>&nbsp;
    รหัสไปรษณีย์ <span class="ul ul-sm">${addr.zipcode}</span>
  </div>
  <div class="row indent">
    โทรศัพท์ <span class="ul ul-md">${s.phone||''}</span>
  </div>

  <div class="section-header">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>
  <div class="row">
    – ชื่อบิดา นาย <span class="ul ul-lg">${father.firstName||''}</span>
    นามสกุล <span class="ul ul-lg">${father.lastName||''}</span>
    อาชีพ <span class="ul ul-md">${father.occupation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${father.phone||''}</span>
  </div>
  <div class="row indent">เลขประจำตัวประชาชน ${fidBoxes}</div>
  <div class="row">
    – ชื่อมารดา น.ส./นาง <span class="ul ul-lg">${mother.firstName||''}</span>
    นามสกุล <span class="ul ul-lg">${mother.lastName||''}</span>
    อาชีพ <span class="ul ul-md">${mother.occupation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${mother.phone||''}</span>
  </div>
  <div class="row indent">เลขประจำตัวประชาชน ${midBoxes}</div>
  <div class="row">
    – ชื่อผู้ปกครอง นาย/นางสาว/นาง
    <span class="ul ul-xl">${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''}</span>
    เกี่ยวข้องเป็น <span class="ul ul-sm">${guardian.relation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${guardian.phone||''}</span>
  </div>

  <div class="sig-grid">
    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ............................................ผู้สมัคร</div><div>(${fullName})</div><div>........../.........../.............</div></div>
    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ............................................ผู้ปกครอง</div><div>(${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''})</div><div>........../.........../.............</div></div>
    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ............................................ผู้รับสมัคร</div><div>(............................................)</div><div>........../.........../.............</div></div>
    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ............................................ฝ่ายการเงิน</div><div>(............................................)</div><div>........../.........../.............</div></div>
  </div>
</div>

${docsHtml}

</body>
</html>`;
}

// ============================================================
// HTML Template — ปวส. (ย่อ — structure เหมือน ปวช.)
// ============================================================
function _buildPvsPDF(s, enroll, prog, addr, parents, guardian, docs) {
  // ใช้ template เดิมแต่เปลี่ยน header
  const html = _buildPvchPDF(s, enroll, prog, addr, parents, guardian, docs);
  return html.replace('ใบสมัคร ปวช.', 'ใบสมัคร ปวส.');
}

// ---- Branch checkboxes ปวช. ----
function _branchCheckboxesPvch(branch) {
  const opts = ['การบัญชี','การตลาด','เทคโนโลยีธุรกิจดิจิทัล','เทคโนโลยีสารสนเทศ','ดิจิทัลกราฟิก'];
  return opts.map(o => {
    const checked = branch.includes(o) ? ' checked' : '';
    return `<span class="cb${checked}"></span> ${o}&nbsp;`;
  }).join('');
}

function _branchCheckboxesPvs(branch) {
  const opts = ['การบัญชี','การตลาด','เทคโนโลยีธุรกิจดิจิทัล','เทคโนโลยีสารสนเทศ',
                'ดิจิทัลกราฟิก','ภาษาและการจัดการธุรกิจระหว่างประเทศ',
                'การท่องเที่ยว','การจัดการดูแลผู้สูงอายุ'];
  return opts.map(o => {
    const checked = branch.includes(o) ? ' checked' : '';
    return `<span class="cb${checked}"></span> ${o}&nbsp;`;
  }).join('');
}

function _roundThai(r) {
  return { morning:'เช้า', afternoon:'บ่าย', dual:'ทวิภาคี' }[r] || r || '';
}

// ---- หน้าเอกสารแนบ ----
function _buildDocsSection(docs, studentName) {
  if (!docs || !docs.length) return '';

  const labels = {
    'id_card_front': 'สำเนาบัตรประจำตัวประชาชน (ด้านหน้า)',
    'id_card_back':  'สำเนาบัตรประจำตัวประชาชน (ด้านหลัง)',
    'house_reg':     'สำเนาทะเบียนบ้าน',
    'edu_cert_front':'สำเนาวุฒิการศึกษา (ด้านหน้า)',
    'edu_cert_back': 'สำเนาวุฒิการศึกษา (ด้านหลัง)',
    'edu_cert':      'สำเนาวุฒิการศึกษา',
    'payment_slip':  'หลักฐานการชำระเงิน',
  };

  return docs.map(doc => {
    const label  = labels[doc.type] || doc.type;
    const imgUrl = doc.driveUrl || '';

    return `
<div class="page doc-page">
  <div class="doc-title">${label}</div>
  ${imgUrl
    ? `<img src="${imgUrl}" class="doc-img" alt="${label}">`
    : `<div style="width:80%;height:140mm;margin:0 auto;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:16px">(ไม่มีรูปเอกสาร)</div>`}
  <div class="stamp">สำเนาถูกต้อง</div>
  <div class="sig-name-box">
    <div class="sig-name-line"></div>
    <div style="font-size:13px">(${studentName})</div>
    <div style="font-size:12px;color:#555">ผู้สมัคร</div>
  </div>
</div>`;
  }).join('\n');
}

// ---- LINE Notify (optional) ----
function _notifyLine(userId, appNo) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN');
    if (!token) return;
    const payload = {
      to: userId,
      messages: [{
        type: 'text',
        text: `✅ ส่งใบสมัครเรียบร้อย!\n\nเลขที่ใบสมัคร: ${appNo}\n\nทางวิทยาลัยจะตรวจสอบเอกสารและแจ้งผลให้ทราบภายใน 3-5 วันทำการ`,
      }],
    };
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      payload: JSON.stringify(payload),
    });
  } catch (err) {
    Logger.log('LINE notify error: ' + err);
  }
}
