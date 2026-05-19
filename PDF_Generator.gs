// ============================================
// PDF_Generator.gs — สร้าง HTML ใบสมัครสำหรับพิมพ์
// ============================================

/**
 * doGet action: generatePDF / printApplication
 * GET: ?action=printApplication&token=xxx&studentId=yyy
 * GET: ?action=generatePDF&token=xxx&studentId=yyy   (alias)
 */
function generateStudentPDF(params) {
  return printApplication(params);
}

function printApplication(params) {
  _checkAdmin(params.token);

  var studentId = params.studentId;
  if (!studentId) return _json({ success: false, message: 'Missing studentId' });

  var students     = sheetToObjects(getSheet(SHEETS.STUDENTS));
  var s            = students.find(function(st){ return st.id === studentId; });
  if (!s) return ContentService.createTextOutput('Student not found').setMimeType(ContentService.MimeType.TEXT);

  var enrollments  = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  var programs     = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  var addresses    = sheetToObjects(getSheet(SHEETS.ADDRESSES));
  var parents      = sheetToObjects(getSheet(SHEETS.PARENTS));
  var guardians    = sheetToObjects(getSheet(SHEETS.GUARDIANS));
  var documents    = sheetToObjects(getSheet(SHEETS.DOCUMENTS));

  var enroll = enrollments.find(function(e){ return e.studentId === studentId; }) || {};

  // ---- FIX: lookup program โดย branchId ก่อน แล้วค่อย programId ----
  var prog = programs.find(function(p){ return p.branchId === enroll.branchId; });
  if (!prog) prog = programs.find(function(p){ return p.id === enroll.programId; });
  if (!prog) prog = programs.find(function(p){ return p.id === enroll.roundId; });
  prog = prog || {};

  var rawAddr    = addresses.find(function(a){ return a.studentId === studentId; }) || {};
  // ---- FIX: resolve address ID → ชื่อ ----
  var addr = _resolveAddr(rawAddr);

  var parentList = parents.filter(function(p){ return p.studentId === studentId; });
  var guardian   = guardians.find(function(g){ return g.studentId === studentId; }) || {};
  var docs       = documents.filter(function(d){ return d.studentId === studentId; });

  // ---- FIX: studyRound อาจอยู่ใน enroll หรือ s ----
  var studyRound = enroll.studyRound || s.studyRound || '';

  var isPvs = (prog.level || s.education || '').indexOf('ปวส') !== -1;
  var html  = isPvs
    ? _buildPvsPDF(s, enroll, prog, addr, parentList, guardian, docs, studyRound)
    : _buildPvchPDF(s, enroll, prog, addr, parentList, guardian, docs, studyRound);

  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}

// ============================================================
// Address resolver — ID → ชื่อ
// ถ้าเก็บเป็นชื่อแล้ว (ไม่ใช่ตัวเลขล้วน) → คืนเดิม
// ============================================================
function _resolveAddr(addr) {
  return {
    detail:      addr.detail      || '',
    subDistrict: _lookupName('subdistricts', addr.subDistrict),
    district:    _lookupName('districts',    addr.district),
    province:    _lookupName('provinces',    addr.province),
    zipcode:     addr.zipcode || '',
  };
}

function _lookupName(sheetName, val) {
  if (!val) return '';
  var s = String(val).trim();
  if (!s || s === '0') return '';
  // ถ้าไม่ใช่ตัวเลขล้วน = ชื่อจริงอยู่แล้ว
  if (!/^\d+$/.test(s)) return s;
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
    if (sheet && sheet.getLastRow() > 1) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === s) return String(data[i][1]);
      }
    }
  } catch(e) {}
  return s; // fallback: แสดง ID
}

// ============================================================
// HTML Template — ปวช.
// ============================================================
function _buildPvchPDF(s, enroll, prog, addr, parents, guardian, docs, studyRound) {
  var father = null, mother = null;
  for (var i = 0; i < parents.length; i++) {
    if (parents[i].type === 'father') father = parents[i];
    if (parents[i].type === 'mother') mother = parents[i];
  }
  father = father || {};
  mother = mother || {};

  var fullName   = (s.prefix||'') + (s.firstName||'') + ' ' + (s.lastName||'');
  var branchName = prog.branch || enroll.branchId || '';

  // วันที่ไทย
  function thDate(d) {
    if (!d) return '........./........./..........';
    try {
      var dt = new Date(d);
      if (isNaN(dt)) return String(d);
      var months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                    'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + (dt.getFullYear()+543);
    } catch(e) { return String(d); }
  }

  // กล่องเลขบัตร 13 ช่อง — แสดงตัวเลขแต่ละหลัก
  function idBoxes(idStr) {
    var digits = String(idStr || '').replace(/\D/g,'');
    var html = '';
    for (var i = 0; i < 13; i++) {
      html += '<span class="idbox">' + (digits[i] || '') + '</span>';
    }
    return html;
  }

  // checkbox สาขา
  function cbBranch(name) {
    return branchName.indexOf(name) !== -1
      ? '<span class="cb checked"></span>'
      : '<span class="cb"></span>';
  }

  // checkbox รอบ
  function cbRound(val) {
    return String(studyRound||'').toLowerCase() === val
      ? '<span class="cb checked"></span>'
      : '<span class="cb"></span>';
  }

  function hasDoc(type) {
    return docs.some(function(d){ return d.type === type; });
  }

  // หน้าเอกสารแนบ
  var docLabels = {
    id_card_front: 'สำเนาบัตรประจำตัวประชาชน (ด้านหน้า)',
    id_card_back:  'สำเนาบัตรประจำตัวประชาชน (ด้านหลัง)',
    house_reg:     'สำเนาทะเบียนบ้าน',
    edu_cert_front:'สำเนาวุฒิการศึกษา (ด้านหน้า)',
    edu_cert_back: 'สำเนาวุฒิการศึกษา (ด้านหลัง)',
    edu_cert:      'สำเนาวุฒิการศึกษา',
    payment_slip:  'หลักฐานการชำระเงิน',
  };

  var docsHtml = docs.map(function(doc) {
    var label  = docLabels[doc.type] || doc.type;
    var imgUrl = doc.driveUrl || '';
    return '<div class="page doc-page">' +
      '<h3>' + label + '</h3>' +
      (imgUrl
        ? '<img src="' + imgUrl + '" class="doc-img" alt="' + label + '">'
        : '<div class="doc-placeholder">📄 ไม่มีรูปเอกสาร</div>') +
      '<br><div class="stamp">สำเนาถูกต้อง</div>' +
      '<div class="sig-name">' +
        '<div class="sig-name-line"></div>' +
        '<div>(' + fullName + ')</div>' +
        '<div style="font-size:11px;color:#666">ผู้สมัคร</div>' +
      '</div></div>';
  }).join('\n');

  var gName = (guardian.prefix||'') + ' ' + (guardian.firstName||'') + ' ' + (guardian.lastName||'');

  return '<!DOCTYPE html>\n<html lang="th">\n<head>\n' +
'<meta charset="UTF-8">\n' +
'<title>ใบสมัคร ปวช. — ' + (s.applicationNo||'') + '</title>\n' +
'<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">\n' +
'<style>\n' +
'  @page { size: A4 portrait; margin: 8mm 10mm; }\n' +
'  *, *::before, *::after { box-sizing: border-box; }\n' +
'  body { font-family: \'Sarabun\', sans-serif; font-size: 13px; color: #000; margin: 0; background: #fff; }\n' +
'  .page { width: 100%; page-break-after: always; }\n' +
'  .page:last-child { page-break-after: avoid; }\n' +
  /* กล่องเลขบัตร */
'  .idbox { display: inline-block; width: 19px; height: 19px; border: 1.5px solid #000;\n' +
'    text-align: center; line-height: 17px; font-size: 11px; font-weight: 700; margin: 0 1px; vertical-align: middle; }\n' +
  /* checkbox */
'  .cb { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #000;\n' +
'    text-align: center; line-height: 12px; font-size: 10px; font-weight: 700; vertical-align: middle; margin: 0 1px; }\n' +
'  .cb.checked::after { content: "✓"; }\n' +
  /* field underline */
'  .f  { display: inline-block; border-bottom: 1px solid #000; padding: 0 4px; vertical-align: bottom; min-width: 80px; }\n' +
'  .fsm { min-width: 50px; } .fmd { min-width: 130px; } .flg { min-width: 190px; } .fxl { min-width: 280px; }\n' +
'  .row { margin: 5px 0; line-height: 1.9; }\n' +
'  .indent { padding-left: 18px; }\n' +
'  .section-hd { font-weight: 700; font-size: 13.5px; margin: 10px 0 4px; border-bottom: 1.5px solid #000; padding-bottom: 2px; }\n' +
'  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-top: 24px; }\n' +
'  .sig-box { text-align: center; font-size: 12px; }\n' +
'  .sig-line { border-bottom: 1px solid #000; margin: 40px 12px 4px; }\n' +
'  .chk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; font-size: 12px; margin-top: 6px; }\n' +
'  .cover-hd { display: flex; align-items: flex-start; gap: 12px; margin: 10px 0 8px; }\n' +
'  .cover-center { flex: 1; text-align: center; }\n' +
'  .cover-center h1 { font-size: 21px; font-weight: 700; margin: 6px 0 4px; line-height: 1.35; }\n' +
'  .cover-center p { font-size: 11px; color: #444; margin: 0; }\n' +
'  .photo-box { width: 90px; height: 110px; flex-shrink: 0; border: 1.5px solid #000;\n' +
'    display: flex; align-items: center; justify-content: center; font-size: 10px; color: #888; text-align: center; line-height: 1.4; }\n' +
'  .doc-page { text-align: center; padding: 16px 0; }\n' +
'  .doc-page h3 { font-size: 15px; font-weight: 700; margin-bottom: 12px; }\n' +
'  .doc-img { max-width: 88%; max-height: 190mm; border: 1px solid #ccc; display: block; margin: 0 auto; }\n' +
'  .doc-placeholder { width: 88%; height: 110mm; margin: 0 auto; border: 1px dashed #bbb;\n' +
'    display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 13px; }\n' +
'  .stamp { display: inline-block; border: 3px solid #cc0000; border-radius: 8px;\n' +
'    padding: 5px 18px; color: #cc0000; font-weight: 700; font-size: 14px; margin-top: 12px; }\n' +
'  .sig-name { margin-top: 8px; }\n' +
'  .sig-name-line { border-bottom: 1px solid #000; width: 260px; margin: 40px auto 5px; }\n' +
'  @media print { .no-print { display: none !important; } }\n' +
'</style>\n</head>\n<body>\n\n' +

'<button class="no-print" onclick="window.print()"\n' +
'  style="position:fixed;top:10px;right:10px;padding:8px 18px;background:#009900;color:#fff;\n' +
'  border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;z-index:9999;\n' +
'  box-shadow:0 2px 8px rgba(0,0,0,0.3)">🖨️ พิมพ์ / บันทึก PDF</button>\n\n' +

// ---- หน้า 1: ปก ----
'<div class="page" style="padding:6px 0">\n' +
'  <div style="text-align:right;font-size:12px;line-height:1.8">\n' +
'    นาย/น.ส./นาง <span class="f flg">' + fullName + '</span>\n' +
'    &nbsp;&nbsp;ห้อง <span class="f fsm"></span>\n' +
'    &nbsp;&nbsp;รอบ <span class="f fsm">' + (prog.round||'') + '</span><br>\n' +
'    รหัสประจำตัว ' + idBoxes(s.idCard) + '<br>\n' +
'    <span class="cb"></span> บันทึก DATA &nbsp;\n' +
'    <span class="cb"></span> บันทึก SISA &nbsp;\n' +
'    <span class="cb"></span> กรอกประวัติ\n' +
'  </div>\n' +

'  <div class="cover-hd">\n' +
'    <div class="cover-center">\n' +
'      <div style="font-size:48px;line-height:1;margin-bottom:4px">🏫</div>\n' +
'      <h1>ใบสมัคร ปวช.<br>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h1>\n' +
'      <p>Charansanitwong Technological College<br>\n' +
'      18 ก.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700<br>\n' +
'      โทร. 0-2434-6155-7 &nbsp;โทรสาร. 0-2433-3647</p>\n' +
'    </div>\n' +
'    <div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>\n' +
'  </div>\n' +
'  <hr style="margin:6px 0;border:none;border-top:1.5px solid #000">\n' +

'  <div style="font-size:12px;font-weight:700;margin-bottom:4px">หลักฐานการสมัครเรียน</div>\n' +
'  <div class="chk-grid">\n' +
'    <div><span class="cb"></span> 1. รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ</div>\n' +
'    <div><span class="cb ' + (hasDoc('id_card_back')?'checked':'') + '"></span> 6. สำเนาบัตร ปชช. ของมารดา 1 ฉบับ</div>\n' +
'    <div><span class="cb ' + (hasDoc('edu_cert_front')?'checked':'') + '"></span> 2. วุฒิการศึกษาฉบับจริง</div>\n' +
'    <div><span class="cb ' + (hasDoc('id_card_front')?'checked':'') + '"></span> 7. สำเนาบัตร ปชช. ของผู้ปกครอง 1 ฉบับ</div>\n' +
'    <div><span class="cb ' + (hasDoc('edu_cert_front')?'checked':'') + '"></span> 3. สำเนาวุฒิการศึกษา 2 ฉบับ</div>\n' +
'    <div><span class="cb ' + (hasDoc('house_reg')?'checked':'') + '"></span> 8. สำเนาทะเบียนบ้านของตนเอง 1 ฉบับ</div>\n' +
'    <div><span class="cb ' + (hasDoc('id_card_front')?'checked':'') + '"></span> 4. สำเนาบัตร ปชช. ของตนเอง 1 ฉบับ</div>\n' +
'    <div><span class="cb"></span> 9. สำเนาสูติบัตร 1 ฉบับ</div>\n' +
'    <div><span class="cb ' + (hasDoc('id_card_front')?'checked':'') + '"></span> 5. สำเนาบัตร ปชช. ของบิดา 1 ฉบับ</div>\n' +
'    <div><span class="cb"></span> 10. กรณี โอนหน่วยกิต</div>\n' +
'  </div>\n' +
'</div>\n\n' +

// ---- หน้า 2: ฟอร์มกรอก ----
'<div class="page" style="padding:4px 0">\n' +
'  <div style="text-align:center;font-size:14px;font-weight:700;margin-bottom:8px">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>\n' +

'  <div class="row">\n' +
'    <b>วันที่สมัคร</b> <span class="f fmd">' + thDate(s.applyDate) + '</span>\n' +
'    &nbsp;&nbsp;<b>ระดับที่สมัคร ปวช.</b> – รอบ\n' +
'    &nbsp;' + cbRound('morning') + ' เช้า\n' +
'    &nbsp;' + cbRound('afternoon') + ' บ่าย\n' +
'    &nbsp;' + cbRound('dual') + ' ทวิภาคี\n' +
'  </div>\n' +

'  <div class="row">\n' +
'    <b>1.</b> นาย/นางสาว/นาง <span class="f flg">' + (s.firstName||'') + '</span>\n' +
'    &nbsp;นามสกุล <span class="f flg">' + (s.lastName||'') + '</span>\n' +
'    &nbsp;วัน/เดือน/ปีเกิด <span class="f fmd">' + thDate(s.birthDate) + '</span>\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    Mr./Miss./Mrs. <span class="f fxl"></span>\n' +
'    &nbsp;เลขประจำตัวประชาชน ' + idBoxes(s.idCard) + '\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    สัญชาติ <span class="f fsm">' + (s.nationality||'ไทย') + '</span>&nbsp;\n' +
'    เชื้อชาติ <span class="f fsm">' + (s.ethnicity||'ไทย') + '</span>&nbsp;\n' +
'    ศาสนา <span class="f fsm">' + (s.religion||'พุทธ') + '</span>&nbsp;\n' +
'    น้ำหนัก <span class="f fsm">' + (s.weight||'') + '</span> กก.&nbsp;\n' +
'    ส่วนสูง <span class="f fsm">' + (s.height||'') + '</span> ซม.&nbsp;\n' +
'    หมู่โลหิต <span class="f fsm">' + (s.bloodType||'') + '</span>\n' +
'  </div>\n' +

'  <div class="row">\n' +
'    <b>2.</b> สาขาวิชาที่สมัคร\n' +
'    &nbsp;' + cbBranch('การบัญชี') + ' การบัญชี\n' +
'    &nbsp;' + cbBranch('การตลาด') + ' การตลาด\n' +
'    &nbsp;' + cbBranch('เทคโนโลยีธุรกิจดิจิทัล') + ' เทคโนโลยีธุรกิจดิจิทัล\n' +
'    &nbsp;' + cbBranch('เทคโนโลยีสารสนเทศ') + ' เทคโนโลยีสารสนเทศ\n' +
'    &nbsp;' + cbBranch('ดิจิทัลกราฟิก') + ' ดิจิทัลกราฟิก\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    ' + cbBranch('ธุรกิจค้าปลีก') + ' ธุรกิจค้าปลีก\n' +
'    &nbsp;' + cbBranch('ภาษาต่างประเทศ') + ' ภาษาต่างประเทศธุรกิจบริการ\n' +
'    &nbsp;' + cbBranch('การท่องเที่ยว') + ' การท่องเที่ยว\n' +
'  </div>\n' +

'  <div class="row">\n' +
'    <b>3.</b> จบการศึกษา\n' +
'    <span class="cb ' + ((s.education||'').indexOf('ม.3')!==-1?'checked':'') + '"></span> ม.3\n' +
'    &nbsp;โรงเรียน <span class="f fxl">' + (s.oldSchool||'') + '</span>\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    ตำบล/แขวง <span class="f fmd">' + addr.subDistrict + '</span>&nbsp;\n' +
'    อำเภอ/เขต <span class="f fmd">' + addr.district + '</span>&nbsp;\n' +
'    จังหวัด <span class="f fmd">' + addr.province + '</span>\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    – กรณีโอนมา จากวิทยาลัย <span class="f flg"></span> &nbsp;สาขาวิชา <span class="f flg"></span>\n' +
'  </div>\n' +

'  <div class="row">\n' +
'    <b>4.</b> ที่อยู่ปัจจุบัน <span class="f fxl">' + (addr.detail||'') + '</span>\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    ตำบล/แขวง <span class="f fmd">' + addr.subDistrict + '</span>&nbsp;\n' +
'    อำเภอ/เขต <span class="f fmd">' + addr.district + '</span>&nbsp;\n' +
'    จังหวัด <span class="f fmd">' + addr.province + '</span>&nbsp;\n' +
'    รหัสไปรษณีย์ <span class="f fsm">' + addr.zipcode + '</span>\n' +
'  </div>\n' +
'  <div class="row indent">โทรศัพท์ <span class="f fmd">' + (s.phone||'') + '</span></div>\n' +

'  <div class="section-hd">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>\n' +

'  <div class="row">\n' +
'    – ชื่อบิดา นาย <span class="f flg">' + (father.firstName||'') + '</span>\n' +
'    &nbsp;นามสกุล <span class="f flg">' + (father.lastName||'') + '</span>\n' +
'    &nbsp;อาชีพ <span class="f fmd">' + (father.occupation||'') + '</span>\n' +
'    &nbsp;โทรศัพท์ <span class="f fmd">' + (father.phone||'') + '</span>\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    ชื่อบิดา (อังกฤษ) Mr. <span class="f fxl"></span>\n' +
'    &nbsp;เลขประจำตัวประชาชน ' + idBoxes(father.idCard) + '\n' +
'  </div>\n' +

'  <div class="row">\n' +
'    – ชื่อมารดา น.ส./นาง <span class="f flg">' + (mother.firstName||'') + '</span>\n' +
'    &nbsp;นามสกุล <span class="f flg">' + (mother.lastName||'') + '</span>\n' +
'    &nbsp;อาชีพ <span class="f fmd">' + (mother.occupation||'') + '</span>\n' +
'    &nbsp;โทรศัพท์ <span class="f fmd">' + (mother.phone||'') + '</span>\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    ชื่อมารดา (อังกฤษ) Miss./Mrs. <span class="f fxl"></span>\n' +
'    &nbsp;เลขประจำตัวประชาชน ' + idBoxes(mother.idCard) + '\n' +
'  </div>\n' +

'  <div class="row">\n' +
'    – ชื่อผู้ปกครอง (กรณีที่ไม่ได้อยู่กับบิดา มารดา)\n' +
'    &nbsp;นาย/นางสาว/นาง <span class="f fxl">' + gName + '</span>\n' +
'    &nbsp;อาชีพ <span class="f fmd">' + (guardian.occupation||'') + '</span>\n' +
'  </div>\n' +
'  <div class="row indent">\n' +
'    เกี่ยวข้องเป็น <span class="f fsm">' + (guardian.relation||'') + '</span>\n' +
'    &nbsp;โทรศัพท์ <span class="f fmd">' + (guardian.phone||'') + '</span>\n' +
'    &nbsp;ที่อยู่ <span class="f fxl">' + (guardian.address||'') + '</span>\n' +
'  </div>\n' +
'  <div class="row" style="font-size:12px;margin-top:6px">\n' +
'    &emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ\n' +
'    และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์\n' +
'  </div>\n' +

'  <div class="sig-grid">\n' +
'    <div class="sig-box"><div class="sig-line"></div>\n' +
'      <div>ลงชื่อ..........................ผู้สมัคร</div>\n' +
'      <div>(' + fullName + ')</div>\n' +
'      <div>......./......./.........</div></div>\n' +
'    <div class="sig-box"><div class="sig-line"></div>\n' +
'      <div>ลงชื่อ..........................ผู้ปกครอง</div>\n' +
'      <div>(' + gName + ')</div>\n' +
'      <div>......./......./.........</div></div>\n' +
'    <div class="sig-box"><div class="sig-line"></div>\n' +
'      <div>ลงชื่อ..........................ผู้รับสมัคร</div>\n' +
'      <div>(................................)</div>\n' +
'      <div>......./......./.........</div></div>\n' +
'    <div class="sig-box"><div class="sig-line"></div>\n' +
'      <div>ลงชื่อ..........................ฝ่ายการเงิน</div>\n' +
'      <div>(................................)</div>\n' +
'      <div>......./......./.........</div></div>\n' +
'  </div>\n' +
'  <div style="margin-top:10px;font-size:12px;font-weight:700">บันทึกฝ่ายการเงิน</div>\n' +
'  <div style="border-bottom:1px solid #999;margin:5px 0 4px;height:20px"></div>\n' +
'  <div style="border-bottom:1px solid #999;margin:4px 0;height:20px"></div>\n' +
'</div>\n\n' +

docsHtml + '\n\n' +
'</body>\n</html>';
}

// ---- ปวส.: ใช้โครงเดียวกัน เปลี่ยนชื่อ ----
function _buildPvsPDF(s, enroll, prog, addr, parents, guardian, docs, studyRound) {
  return _buildPvchPDF(s, enroll, prog, addr, parents, guardian, docs, studyRound)
    .replace(/ใบสมัคร ปวช\./g, 'ใบสมัคร ปวส.')
    .replace('ระดับที่สมัคร ปวช.', 'ระดับที่สมัคร ปวส.');
}

// ---- Branch checkboxes (ใช้ใน AdminPage.gs legacy เผื่อเรียกใช้) ----
function _branchCheckboxesPvch(branch) {
  var opts = ['การบัญชี','การตลาด','ภาษาต่างประเทศธุรกิจบริการ','ธุรกิจค้าปลีก',
              'เทคโนโลยีธุรกิจดิจิทัล','เทคโนโลยีสารสนเทศ','ดิจิทัลกราฟิก','การท่องเที่ยว'];
  return opts.map(function(o){
    return '<span class="cb' + (branch.indexOf(o)!==-1?' checked':'') + '"></span> ' + o + ' ';
  }).join('&nbsp;');
}

function _branchCheckboxesPvs(branch) {
  var opts = ['การบัญชี','การตลาด','เทคโนโลยีธุรกิจดิจิทัล','เทคโนโลยีสารสนเทศ',
              'ดิจิทัลกราฟิก','ภาษาและการจัดการธุรกิจระหว่างประเทศ',
              'การท่องเที่ยว','การจัดการดูแลผู้สูงอายุ'];
  return opts.map(function(o){
    return '<span class="cb' + (branch.indexOf(o)!==-1?' checked':'') + '"></span> ' + o + ' ';
  }).join('&nbsp;');
}

function _roundThai(r) {
  return {morning:'เช้า', afternoon:'บ่าย', dual:'ทวิภาคี'}[r] || r || '';
}
