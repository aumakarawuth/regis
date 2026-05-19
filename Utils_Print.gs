// ============================================================
// Utils_Print.gs — HTML Print Templates (Fixed v2)
// ใบสมัคร ปวช. และ ปวส. วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์
//
// BUG FIXES:
// 1. page-break ใช้ทั้ง screen+print ได้ถูกต้อง
// 2. top-meta layout ไม่ใช้ flex (ป้องกัน wrap ผิด)
// 3. ที่อยู่แสดงชื่อจริงผ่าน _resolvePrintAddress แทน ID
// 4. checklist ข้อ 1 ไม่ติ๊ก true อัตโนมัติ (รูปถ่ายยังไม่ upload)
// 5. template literals ใน GAS ใช้ไม่ได้บางกรณี → เปลี่ยนเป็น concat
// 6. _resolveAddress ชนชื่อกับ Utils.gs → rename เป็น _resolvePrintAddress
// 7. _cb checked ใช้ ✓ แทน / ให้อ่านง่ายขึ้น
// 8. idBoxes ไม่ wrap กลางบรรทัด
// 9. ปวช. ข้อ 2 สาขา แยก 2 แถวให้ตรงแบบฟอร์มจริง
// ============================================================

// ============================================================
// printApplication — entry point จาก doGet
// ?action=printApplication&token=xxx&studentId=yyy
// ============================================================
function printApplication(params) {
  _checkAdmin(params.token);
  var studentId = params.studentId;

  var students     = sheetToObjects(getSheet(SHEETS.STUDENTS));
  var s            = null;
  for (var si = 0; si < students.length; si++) {
    if (students[si].id === studentId) { s = students[si]; break; }
  }
  if (!s) return _json({ success: false, message: 'Student not found' });

  var enrollments  = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  var programs     = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  var addresses    = sheetToObjects(getSheet(SHEETS.ADDRESSES));
  var parents      = sheetToObjects(getSheet(SHEETS.PARENTS));
  var guardianList = sheetToObjects(getSheet(SHEETS.GUARDIANS));
  var documents    = sheetToObjects(getSheet(SHEETS.DOCUMENTS));

  var enroll = {};
  for (var ei = 0; ei < enrollments.length; ei++) {
    if (enrollments[ei].studentId === s.id) { enroll = enrollments[ei]; break; }
  }

  var prog = {};
  for (var pi = 0; pi < programs.length; pi++) {
    if (programs[pi].branchId === enroll.branchId) { prog = programs[pi]; break; }
  }
  if (!prog.id) {
    for (var pi2 = 0; pi2 < programs.length; pi2++) {
      if (programs[pi2].id === enroll.programId) { prog = programs[pi2]; break; }
    }
  }

  var rawAddr = {};
  for (var ai = 0; ai < addresses.length; ai++) {
    if (addresses[ai].studentId === studentId) { rawAddr = addresses[ai]; break; }
  }
  var addr = _resolvePrintAddress(rawAddr);

  var parentList = [];
  for (var ri = 0; ri < parents.length; ri++) {
    if (parents[ri].studentId === studentId) parentList.push(parents[ri]);
  }

  var guardian = {};
  for (var gi = 0; gi < guardianList.length; gi++) {
    if (guardianList[gi].studentId === studentId) { guardian = guardianList[gi]; break; }
  }

  var studentDocs = [];
  for (var di = 0; di < documents.length; di++) {
    if (documents[di].studentId === studentId) studentDocs.push(documents[di]);
  }

  var levelName = (prog.level || enroll.levelId || s.levelName || '');
  var isPvs = levelName.indexOf('ปวส') !== -1;

  var html = isPvs
    ? _buildPvsForm(s, enroll, prog, addr, parentList, guardian, studentDocs)
    : _buildPvchForm(s, enroll, prog, addr, parentList, guardian, studentDocs);

  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}

// ============================================================
// _resolvePrintAddress — แปลง province/district/subDistrict ID → ชื่อ
// ชื่อต่างจาก _resolveAddress ใน Utils.gs เพื่อป้องกันชนกัน
// ============================================================
function _resolvePrintAddress(addr) {
  if (!addr) return { detail:'', subDistrict:'', district:'', province:'', zipcode:'' };
  return {
    detail:      String(addr.detail      || ''),
    subDistrict: _getSubDistrictName(String(addr.subDistrict || '')),
    district:    _getDistrictName(String(addr.district    || '')),
    province:    _getProvinceName(String(addr.province    || '')),
    zipcode:     String(addr.zipcode     || ''),
  };
}

// ============================================================
// CSS — ใช้ร่วมกัน ปวช.+ปวส.
// ============================================================
function _printCSS() {
  return [
    '@page { size: A4 portrait; margin: 8mm 10mm; }',
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    'html { font-size: 13px; }',
    'body { font-family: "Sarabun", sans-serif; color: #000; background: #fff; line-height: 1.6; }',

    // Layout: ทำงานทั้ง screen และ print
    '.page {',
    '  max-width: 190mm; margin: 0 auto;',
    '  padding: 6mm 0 4mm;',
    '  page-break-after: always;',  // ทุก browser
    '  break-after: page;',         // modern
    '}',
    '.page:last-child { page-break-after: avoid; break-after: avoid; }',

    // Screen: เส้นคั่นหน้า
    '@media screen {',
    '  body { padding: 16px; background: #ddd; }',
    '  .page { background: #fff; padding: 12px 16px; border-bottom: 3px dashed #aaa; margin-bottom: 20px; }',
    '  .page:last-child { border-bottom: none; }',
    '}',
    '@media print {',
    '  body { padding: 0; background: #fff; }',
    '  .page { max-width: 100%; padding: 0; margin: 0; }',
    '  .no-print { display: none !important; }',
    '}',

    // ID Card boxes
    '.idcard-wrap { display: inline-block; white-space: nowrap; vertical-align: middle; }',
    '.idbox {',
    '  display: inline-block;',
    '  width: 18px; height: 18px;',
    '  border: 1.5px solid #000;',
    '  text-align: center; line-height: 17px;',
    '  font-size: 11px; font-weight: 700;',
    '  vertical-align: middle; margin: 0 1px;',
    '}',

    // Checkbox
    '.cb {',
    '  display: inline-block;',
    '  width: 13px; height: 13px;',
    '  border: 1.5px solid #000;',
    '  text-align: center; line-height: 12px;',
    '  font-size: 10px; font-weight: 700;',
    '  vertical-align: middle; margin: 0 1px;',
    '}',
    '.cb.checked::after { content: "\u2713"; }',   // ✓

    // Underline fields
    '.f  { display: inline-block; border-bottom: 1px solid #000; padding: 0 4px; vertical-align: bottom; min-width: 80px; }',
    '.fsm { min-width: 50px; }',
    '.fmd { min-width: 130px; }',
    '.flg { min-width: 190px; }',
    '.fxl { min-width: 280px; }',

    // Rows
    '.row { margin: 5px 0; line-height: 1.9; }',
    '.indent  { padding-left: 18px; }',
    '.indent2 { padding-left: 10px; }',

    // Section header
    '.section-hd { font-weight: 700; font-size: 13.5px; margin: 10px 0 4px; border-bottom: 1.5px solid #000; padding-bottom: 2px; }',

    // Cover
    '.cover-hd { display: flex; align-items: flex-start; gap: 12px; margin: 8px 0; }',
    '.cover-center { flex: 1; text-align: center; }',
    '.cover-center h1 { font-size: 20px; font-weight: 700; margin: 6px 0 4px; line-height: 1.35; }',
    '.cover-center p  { font-size: 11px; color: #333; margin: 2px 0; line-height: 1.5; }',
    '.cover-icon { font-size: 52px; line-height: 1; margin-bottom: 4px; }',

    // Photo box
    '.photo-box { width: 90px; height: 110px; flex-shrink: 0; border: 1.5px solid #000;',
    '  display: flex; align-items: center; justify-content: center;',
    '  font-size: 10px; color: #888; text-align: center; line-height: 1.4; }',

    // Checklist grid
    '.chk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; font-size: 12px; margin-top: 6px; }',

    // Signature
    '.sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-top: 20px; }',
    '.sig-box  { text-align: center; font-size: 12px; }',
    '.sig-line { border-bottom: 1px solid #000; margin: 38px 12px 4px; }',

    // Finance lines
    '.fin-line { border-bottom: 1px solid #aaa; margin: 4px 0; height: 18px; }',

    // Document pages
    '.doc-page { text-align: center; padding: 14px 0; }',
    '.doc-page h3 { font-size: 15px; font-weight: 700; margin-bottom: 12px; }',
    '.doc-img { max-width: 88%; max-height: 190mm; border: 1px solid #ccc; display: block; margin: 0 auto; }',
    '.doc-placeholder { width: 88%; height: 110mm; margin: 0 auto; border: 1px dashed #bbb;',
    '  display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 13px; }',
    '.stamp { display: inline-block; border: 3px solid #cc0000; border-radius: 8px;',
    '  padding: 5px 18px; color: #cc0000; font-weight: 700; font-size: 14px; margin-top: 12px; }',
    '.sig-name-line { border-bottom: 1px solid #000; width: 260px; margin: 38px auto 5px; }',

    // Print button
    '.print-btn { position: fixed; top: 10px; right: 10px; background: #009900; color: #fff;',
    '  border: none; border-radius: 6px; padding: 8px 18px;',
    '  font-family: "Sarabun", sans-serif; font-size: 13px; font-weight: 700;',
    '  cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 9999; }',
    '@media print { .print-btn { display: none; } }',
  ].join('\n');
}

// ============================================================
// HELPERS
// ============================================================

// ID Card 13 กล่อง — inline ไม่ wrap
function _pIdBoxes(idCard) {
  var digits = String(idCard || '').replace(/\D/g, '');
  var html = '<span class="idcard-wrap">';
  for (var i = 0; i < 13; i++) {
    html += '<span class="idbox">' + (digits[i] || '') + '</span>';
  }
  return html + '</span>';
}

// Checkbox
function _pCb(checked) {
  return '<span class="cb' + (checked ? ' checked' : '') + '"></span>';
}

// Thai date
function _pThDate(d) {
  if (!d) return '........./........./..........';
  try {
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    var months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + (dt.getFullYear() + 543);
  } catch(e) { return String(d); }
}

// หน้าเอกสารแนบ
function _pDocPages(docs, studentName) {
  var labels = {
    'id_card_front':  'สำเนาบัตรประจำตัวประชาชน (ด้านหน้า)',
    'id_card_back':   'สำเนาบัตรประจำตัวประชาชน (ด้านหลัง)',
    'house_reg':      'สำเนาทะเบียนบ้าน',
    'edu_cert_front': 'สำเนาวุฒิการศึกษา (ด้านหน้า)',
    'edu_cert_back':  'สำเนาวุฒิการศึกษา (ด้านหลัง)',
    'edu_cert':       'สำเนาวุฒิการศึกษา',
    'payment_slip':   'หลักฐานการชำระเงิน',
  };
  if (!docs || !docs.length) return '';
  var pages = '';
  for (var i = 0; i < docs.length; i++) {
    var doc   = docs[i];
    var label = labels[doc.type] || doc.type;
    var img   = doc.driveUrl
      ? '<img src="' + doc.driveUrl + '" class="doc-img" alt="' + label + '">'
      : '<div class="doc-placeholder">(ไม่มีรูปเอกสาร)</div>';
    pages += '<div class="page doc-page">'
      + '<h3>' + label + '</h3>'
      + img
      + '<br><div class="stamp">สำเนาถูกต้อง</div>'
      + '<div style="margin-top:8px">'
      + '<div class="sig-name-line"></div>'
      + '<div>(' + studentName + ')</div>'
      + '<div style="font-size:11px;color:#666">ผู้สมัคร</div>'
      + '</div>'
      + '</div>\n';
  }
  return pages;
}

// HTML wrapper
function _pHtmlWrap(title, css, body) {
  return '<!DOCTYPE html>\n'
    + '<html lang="th">\n'
    + '<head>\n'
    + '<meta charset="UTF-8">\n'
    + '<title>' + title + '</title>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">\n'
    + '<style>' + css + '</style>\n'
    + '</head>\n'
    + '<body>\n'
    + '<button class="print-btn no-print" onclick="window.print()">&#128438; พิมพ์ / บันทึก PDF</button>\n'
    + body
    + '</body>\n</html>';
}

// ============================================================
// ██████ ปวช. ██████
// ============================================================
function _buildPvchForm(s, enroll, prog, addr, parents, guardian, docs) {
  var father = {}, mother = {};
  for (var i = 0; i < parents.length; i++) {
    if (parents[i].type === 'father') father = parents[i];
    if (parents[i].type === 'mother') mother = parents[i];
  }

  var fullName   = String(s.prefix||'') + String(s.firstName||'') + ' ' + String(s.lastName||'');
  var studyRound = String(enroll.studyRound || s.studyRound || '');
  var roundTh    = ({ morning:'เช้า', afternoon:'บ่าย', dual:'ทวิภาคี' })[studyRound] || '';
  var branchName = String(prog.branch || enroll.branchName || '');
  var edu        = String(s.education || '');

  var hasDoc = function(t) {
    for (var j = 0; j < docs.length; j++) if (docs[j].type === t) return true;
    return false;
  };
  var br = function(key) { return _pCb(branchName.indexOf(key) !== -1); };

  // ── หน้า 1: ปก ──
  var page1 = '<div class="page">\n'

    // top-meta: ใช้ text-align:right ทั้งหมด ไม่ใช้ flex
    + '  <div style="text-align:right;font-size:12px;line-height:1.8">\n'
    + '    นาย/น.ส./นาง <span class="f flg">' + fullName + '</span>\n'
    + '    &nbsp;&nbsp;ห้อง <span class="f fsm"></span>\n'
    + '    &nbsp;&nbsp;รอบ <span class="f fsm">' + roundTh + '</span><br>\n'
    + '    รหัสประจำตัว ' + _pIdBoxes(s.idCard) + '<br>\n'
    + '    ' + _pCb(false) + ' บันทึก DATA &nbsp;\n'
    + '    ' + _pCb(false) + ' บันทึก SISA &nbsp;\n'
    + '    ' + _pCb(false) + ' กรอกประวัติ\n'
    + '  </div>\n'

    // โลโก้กลาง + รูปถ่ายขวา
    + '  <div class="cover-hd">\n'
    + '    <div class="cover-center">\n'
    + '      <div class="cover-icon">&#127979;</div>\n'
    + '      <h1>ใบสมัคร ปวช.<br>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h1>\n'
    + '      <p>Charansanitwong Technological College</p>\n'
    + '      <p>18 ก.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700</p>\n'
    + '      <p>โทร. 0-2434-6155-7 &nbsp;โทรสาร. 0-2433-3647</p>\n'
    + '    </div>\n'
    + '    <div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>\n'
    + '  </div>\n'
    + '  <hr style="margin:6px 0;border:none;border-top:1.5px solid #000">\n'

    // หลักฐาน
    + '  <div style="font-size:12px;font-weight:700;margin-bottom:4px">หลักฐานการสมัครเรียน (เรียงตามหมายเลข)</div>\n'
    + '  <div class="chk-grid">\n'
    + '    <div>' + _pCb(false)                                       + ' 1. รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ</div>\n'
    + '    <div>' + _pCb(hasDoc('id_card_back'))                      + ' 6. สำเนาบัตร ปชช. ของมารดา 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(hasDoc('edu_cert_front')||hasDoc('edu_cert'))+ ' 2. วุฒิการศึกษาฉบับจริง</div>\n'
    + '    <div>' + _pCb(hasDoc('id_card_front'))                     + ' 7. สำเนาบัตร ปชช. ของผู้ปกครอง 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(hasDoc('edu_cert_front')||hasDoc('edu_cert'))+ ' 3. สำเนาวุฒิการศึกษา 2 ฉบับ</div>\n'
    + '    <div>' + _pCb(hasDoc('house_reg'))                         + ' 8. สำเนาทะเบียนบ้านของตนเอง 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(hasDoc('id_card_front'))                     + ' 4. สำเนาบัตร ปชช. ของตนเอง 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(false)                                       + ' 9. สำเนาสูติบัตร 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(hasDoc('id_card_front'))                     + ' 5. สำเนาบัตร ปชช. ของบิดา 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(false)                                       + ' 10. กรณี โอนหน่วยกิต</div>\n'
    + '  </div>\n'
    + '</div>\n';

  // ── หน้า 2: ฟอร์มกรอก ──
  var page2 = '<div class="page">\n'
    + '  <div style="text-align:center;font-size:14px;font-weight:700;margin-bottom:8px">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>\n'

    + '  <div class="row">\n'
    + '    <b>วันที่สมัคร</b> <span class="f fmd">' + _pThDate(s.applyDate) + '</span>\n'
    + '    &nbsp;&nbsp;<b>ระดับที่สมัคร ปวช.</b> &#8211; รอบ\n'
    + '    &nbsp;' + _pCb(studyRound==='morning')   + ' เช้า\n'
    + '    &nbsp;' + _pCb(studyRound==='afternoon') + ' บ่าย\n'
    + '    &nbsp;' + _pCb(studyRound==='dual')      + ' ทวิภาคี\n'
    + '  </div>\n'

    + '  <div class="row">\n'
    + '    <b>1.</b> นาย/นางสาว/นาง <span class="f flg">' + String(s.firstName||'') + '</span>\n'
    + '    &nbsp;นามสกุล <span class="f flg">' + String(s.lastName||'') + '</span>\n'
    + '    &nbsp;วัน/เดือน/ปีเกิด <span class="f fmd">' + _pThDate(s.birthDate) + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    Mr./Miss./Mrs. <span class="f fxl"></span>\n'
    + '    &nbsp;เลขประจำตัวประชาชน ' + _pIdBoxes(s.idCard) + '\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    สัญชาติ <span class="f fsm">' + String(s.nationality||'ไทย')  + '</span>&nbsp;\n'
    + '    เชื้อชาติ <span class="f fsm">' + String(s.ethnicity||'ไทย') + '</span>&nbsp;\n'
    + '    ศาสนา <span class="f fsm">' + String(s.religion||'พุทธ')      + '</span>&nbsp;\n'
    + '    น้ำหนัก <span class="f fsm">' + String(s.weight||'')          + '</span> กก.&nbsp;\n'
    + '    ส่วนสูง <span class="f fsm">' + String(s.height||'')          + '</span> ซม.&nbsp;\n'
    + '    หมู่โลหิต <span class="f fsm">' + String(s.bloodType||'')     + '</span>\n'
    + '  </div>\n'

    // สาขา แถว 1
    + '  <div class="row">\n'
    + '    <b>2.</b> สาขาวิชาที่สมัคร\n'
    + '    &nbsp;' + br('การบัญชี')                 + ' การบัญชี\n'
    + '    &nbsp;' + br('การตลาด')                  + ' การตลาด\n'
    + '    &nbsp;' + br('เทคโนโลยีธุรกิจดิจิทัล') + ' เทคโนโลยีธุรกิจดิจิทัล\n'
    + '    &nbsp;' + br('เทคโนโลยีสารสนเทศ')        + ' เทคโนโลยีสารสนเทศ\n'
    + '    &nbsp;' + br('ดิจิทัลกราฟิก')           + ' ดิจิทัลกราฟิก\n'
    + '  </div>\n'
    // สาขา แถว 2
    + '  <div class="row indent">\n'
    + '    ' + br('ธุรกิจค้าปลีก')        + ' ธุรกิจค้าปลีก\n'
    + '    &nbsp;' + br('ภาษาต่างประเทศ') + ' ภาษาต่างประเทศธุรกิจบริการ\n'
    + '    &nbsp;' + br('การท่องเที่ยว') + ' การท่องเที่ยว\n'
    + '  </div>\n'

    // จบการศึกษา
    + '  <div class="row">\n'
    + '    <b>3.</b> จบการศึกษา\n'
    + '    ' + _pCb(edu.indexOf('ม.3') !== -1)  + ' ม.3\n'
    + '    &nbsp;โรงเรียน <span class="f fxl">' + String(s.oldSchool||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ตำบล/แขวง <span class="f fmd">' + addr.subDistrict + '</span>&nbsp;\n'
    + '    อำเภอ/เขต <span class="f fmd">' + addr.district    + '</span>&nbsp;\n'
    + '    จังหวัด <span class="f fmd">'   + addr.province    + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    &#8211; กรณีโอนมา จากวิทยาลัย <span class="f flg"></span> &nbsp;สาขาวิชา <span class="f flg"></span>\n'
    + '  </div>\n'

    // ที่อยู่ปัจจุบัน
    + '  <div class="row">\n'
    + '    <b>4.</b> ที่อยู่ปัจจุบัน <span class="f fxl">' + String(addr.detail||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ตำบล/แขวง <span class="f fmd">' + addr.subDistrict + '</span>&nbsp;\n'
    + '    อำเภอ/เขต <span class="f fmd">' + addr.district    + '</span>&nbsp;\n'
    + '    จังหวัด <span class="f fmd">'   + addr.province    + '</span>&nbsp;\n'
    + '    รหัสไปรษณีย์ <span class="f fsm">' + String(addr.zipcode||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">โทรศัพท์ <span class="f fmd">' + String(s.phone||'') + '</span></div>\n'

    // ส่วนที่ 2
    + '  <div class="section-hd">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>\n'

    + '  <div class="row">\n'
    + '    &#8211; ชื่อบิดา นาย <span class="f flg">' + String(father.firstName||'') + '</span>\n'
    + '    &nbsp;นามสกุล <span class="f flg">' + String(father.lastName||'') + '</span>\n'
    + '    &nbsp;อาชีพ <span class="f fmd">' + String(father.occupation||'') + '</span>\n'
    + '    &nbsp;โทรศัพท์ <span class="f fmd">' + String(father.phone||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ชื่อบิดา (อังกฤษ) Mr. <span class="f fxl"></span>\n'
    + '    &nbsp;เลขประจำตัวประชาชน ' + _pIdBoxes(father.idCard) + '\n'
    + '  </div>\n'

    + '  <div class="row">\n'
    + '    &#8211; ชื่อมารดา น.ส./นาง <span class="f flg">' + String(mother.firstName||'') + '</span>\n'
    + '    &nbsp;นามสกุล <span class="f flg">' + String(mother.lastName||'') + '</span>\n'
    + '    &nbsp;อาชีพ <span class="f fmd">' + String(mother.occupation||'') + '</span>\n'
    + '    &nbsp;โทรศัพท์ <span class="f fmd">' + String(mother.phone||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ชื่อมารดา (อังกฤษ) Miss./Mrs. <span class="f fxl"></span>\n'
    + '    &nbsp;เลขประจำตัวประชาชน ' + _pIdBoxes(mother.idCard) + '\n'
    + '  </div>\n'

    + '  <div class="row">\n'
    + '    &#8211; ชื่อผู้ปกครอง (กรณีที่ไม่ได้อยู่กับบิดา มารดา)\n'
    + '    &nbsp;นาย/นางสาว/นาง <span class="f fxl">'
    +        String(guardian.prefix||'') + String(guardian.firstName||'') + ' ' + String(guardian.lastName||'')
    + '    </span>\n'
    + '    &nbsp;อาชีพ <span class="f fmd">' + String(guardian.occupation||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    เกี่ยวข้องเป็น <span class="f fsm">' + String(guardian.relation||'') + '</span>\n'
    + '    &nbsp;โทรศัพท์ <span class="f fmd">' + String(guardian.phone||'') + '</span>\n'
    + '    &nbsp;ที่อยู่ <span class="f fxl"></span>\n'
    + '  </div>\n'

    + '  <div class="row" style="font-size:12px;margin-top:6px">\n'
    + '    &emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ\n'
    + '    และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์\n'
    + '  </div>\n'

    + '  <div class="sig-grid">\n'
    + '    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ..........................ผู้สมัคร</div>'
    +        '<div>(' + fullName + ')</div><div>......./......./.........</div></div>\n'
    + '    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ..........................ผู้ปกครอง</div>'
    +        '<div>(' + String(guardian.prefix||'') + String(guardian.firstName||'') + ' ' + String(guardian.lastName||'') + ')</div>'
    +        '<div>......./......./.........</div></div>\n'
    + '    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ..........................ผู้รับสมัคร</div>'
    +        '<div>(................................)</div><div>......./......./.........</div></div>\n'
    + '    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ..........................ฝ่ายการเงิน</div>'
    +        '<div>(................................)</div><div>......./......./.........</div></div>\n'
    + '  </div>\n'

    + '  <div style="margin-top:10px;font-size:12px;font-weight:700">บันทึกฝ่ายการเงิน</div>\n'
    + '  <div class="fin-line"></div><div class="fin-line"></div><div class="fin-line"></div>\n'
    + '</div>\n';

  return _pHtmlWrap('ใบสมัคร ปวช. — ' + String(s.applicationNo||''), _printCSS(), page1 + page2 + _pDocPages(docs, fullName));
}


// ============================================================
// ██████ ปวส. ██████
// ============================================================
function _buildPvsForm(s, enroll, prog, addr, parents, guardian, docs) {
  var father = {}, mother = {};
  for (var i = 0; i < parents.length; i++) {
    if (parents[i].type === 'father') father = parents[i];
    if (parents[i].type === 'mother') mother = parents[i];
  }

  var fullName   = String(s.prefix||'') + String(s.firstName||'') + ' ' + String(s.lastName||'');
  var studyRound = String(enroll.studyRound || s.studyRound || '');
  var roundTh    = ({ morning:'เช้า', afternoon:'บ่าย', dual:'ทวิภาคี' })[studyRound] || '';
  var branchName = String(prog.branch || enroll.branchName || '');
  var edu        = String(s.education || '');

  var hasDoc = function(t) {
    for (var j = 0; j < docs.length; j++) if (docs[j].type === t) return true;
    return false;
  };
  var br = function(key) { return _pCb(branchName.indexOf(key) !== -1); };

  // ── หน้า 1: ปก ปวส. ──
  var page1 = '<div class="page">\n'
    + '  <div style="text-align:right;font-size:12px;line-height:1.8">\n'
    + '    นาย/น.ส./นาง <span class="f flg">' + fullName + '</span>\n'
    + '    &nbsp;&nbsp;ห้อง <span class="f fsm"></span>\n'
    + '    &nbsp;&nbsp;รอบ <span class="f fsm">' + roundTh + '</span><br>\n'
    + '    ' + _pCb(false) + ' กู้ยศ. &nbsp;' + _pCb(false) + ' อื่นๆ.................&nbsp;\n'
    + '    รหัสประจำตัว ' + _pIdBoxes(s.idCard) + '<br>\n'
    + '    ' + _pCb(false) + ' บันทึก DATA &nbsp;\n'
    + '    ' + _pCb(false) + ' บันทึก SISA &nbsp;\n'
    + '    ' + _pCb(false) + ' กรอกประวัติ\n'
    + '  </div>\n'

    + '  <div class="cover-hd">\n'
    + '    <div class="cover-center">\n'
    + '      <div class="cover-icon">&#127979;</div>\n'
    + '      <h1>ใบสมัคร ปวส.<br>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h1>\n'
    + '      <p>Charansanitwong Technological College</p>\n'
    + '      <p>18 ก.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700</p>\n'
    + '      <p>โทร. 0-2434-6155-7 &nbsp;โทรสาร. 0-2433-3647</p>\n'
    + '    </div>\n'
    + '    <div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>\n'
    + '  </div>\n'
    + '  <hr style="margin:6px 0;border:none;border-top:1.5px solid #000">\n'

    + '  <div style="font-size:12px;font-weight:700;margin-bottom:4px">หลักฐานการสมัครเรียน (เรียงตามหมายเลข)</div>\n'
    + '  <div class="chk-grid">\n'
    + '    <div>' + _pCb(false)                                        + ' 1. รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ</div>\n'
    + '    <div>' + _pCb(hasDoc('id_card_back'))                       + ' 6. สำเนาบัตร ปชช. ของมารดา</div>\n'
    + '    <div>' + _pCb(hasDoc('edu_cert_front')||hasDoc('edu_cert')) + ' 2. วุฒิการศึกษาฉบับจริง</div>\n'
    + '    <div>' + _pCb(hasDoc('id_card_front'))                      + ' 7. สำเนาบัตร ปชช. ของผู้ปกครอง 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(hasDoc('edu_cert_front')||hasDoc('edu_cert')) + ' 3. สำเนาวุฒิการศึกษา 2 ฉบับ</div>\n'
    + '    <div>' + _pCb(hasDoc('house_reg'))                          + ' 8. สำเนาทะเบียนบ้านของตนเอง 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(hasDoc('id_card_front'))                      + ' 4. สำเนาบัตร ปชช. ของตนเอง 1 ฉบับ</div>\n'
    + '    <div>' + _pCb(false)                                        + ' 9. กรณี โอนหน่วยกิต (วุฒิม.3 และรบ.โอน)</div>\n'
    + '    <div>' + _pCb(hasDoc('id_card_front'))                      + ' 5. สำเนาบัตร ปชช. ของบิดา</div>\n'
    + '    <div></div>\n'
    + '  </div>\n'
    + '</div>\n';

  // ── หน้า 2: ฟอร์มกรอก ปวส. ──
  var page2 = '<div class="page">\n'
    + '  <div style="text-align:center;font-size:14px;font-weight:700;margin-bottom:8px">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>\n'

    + '  <div class="row">\n'
    + '    <b>วันที่สมัคร</b> <span class="f fmd">' + _pThDate(s.applyDate) + '</span>\n'
    + '    &nbsp;&nbsp;<b>ระดับที่สมัคร <u>ปวส.</u></b> &#8211; รอบ\n'
    + '    &nbsp;' + _pCb(studyRound==='morning')   + ' เช้า\n'
    + '    &nbsp;' + _pCb(studyRound==='afternoon') + ' บ่าย\n'
    + '    &nbsp;' + _pCb(studyRound==='dual')      + ' ทวิภาคี\n'
    + '  </div>\n'

    + '  <div class="row">\n'
    + '    <b>1.</b> นาย/นางสาว/นาง <span class="f flg">' + String(s.firstName||'') + '</span>\n'
    + '    &nbsp;นามสกุล <span class="f flg">' + String(s.lastName||'') + '</span>\n'
    + '    &nbsp;วัน/เดือน/ปีเกิด <span class="f fmd">' + _pThDate(s.birthDate) + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    Mr./Miss./Mrs. <span class="f fxl"></span>\n'
    + '    &nbsp;เลขประจำตัวประชาชน ' + _pIdBoxes(s.idCard) + '\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    สัญชาติ <span class="f fsm">' + String(s.nationality||'ไทย') + '</span>&nbsp;\n'
    + '    เชื้อชาติ <span class="f fsm">' + String(s.ethnicity||'ไทย') + '</span>&nbsp;\n'
    + '    ศาสนา <span class="f fsm">' + String(s.religion||'พุทธ') + '</span>&nbsp;\n'
    + '    น้ำหนัก <span class="f fsm">' + String(s.weight||'') + '</span> กก.&nbsp;\n'
    + '    ส่วนสูง <span class="f fsm">' + String(s.height||'') + '</span> ซม.\n'
    + '  </div>\n'

    // สาขา ปวส.
    + '  <div class="row">\n'
    + '    <b>2.</b> สาขาวิชาที่สมัคร\n'
    + '    ' + br('การบัญชี')          + ' การบัญชี\n'
    + '    &nbsp;' + br('การตลาด')     + ' การตลาด\n'
    + '    &nbsp;' + br('ภาษาต่างประเทศ') + ' ภาษาต่างประเทศธุรกิจบริการ\n'
    + '    &nbsp;' + br('ธุรกิจค้าปลีก') + ' ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ' + br('เทคโนโลยีธุรกิจดิจิทัล') + ' เทคโนโลยีธุรกิจดิจิทัล\n'
    + '    &nbsp;' + br('เทคโนโลยีสารสนเทศ')  + ' เทคโนโลยีสารสนเทศ\n'
    + '    &nbsp;' + br('ดิจิทัลกราฟิก')      + ' ดิจิทัลกราฟิก\n'
    + '    &nbsp;' + br('การท่องเที่ยว')      + ' การท่องเที่ยว\n'
    + '  </div>\n'

    // จบการศึกษา ปวส.
    + '  <div class="row">\n'
    + '    <b>3.</b> จบการศึกษา\n'
    + '    ' + _pCb(edu.indexOf('ม.6') !== -1)   + ' ม.6\n'
    + '    &nbsp;' + _pCb(edu.indexOf('ปวช') !== -1) + ' ปวช. สาขา (ระบุ) <span class="f fmd">'
    +      (edu.indexOf('ปวช') !== -1 ? edu : '') + '</span>\n'
    + '    &nbsp;โรงเรียน <span class="f flg">' + String(s.oldSchool||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ตำบล/แขวง <span class="f fmd">' + addr.subDistrict + '</span>&nbsp;\n'
    + '    อำเภอ/เขต <span class="f fmd">' + addr.district    + '</span>&nbsp;\n'
    + '    จังหวัด <span class="f fmd">'   + addr.province    + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    &#8211; กรณีโอนมา จากวิทยาลัย <span class="f flg"></span> &nbsp;สาขาวิชา <span class="f flg"></span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    &#8211; เข้าศึกษา ' + _pCb(false) + ' ปวส.2 &nbsp;' + _pCb(false) + ' ปวส.3\n'
    + '    ห้อง/รอบ <span class="f fmd"></span>\n'
    + '    &nbsp;สาขาวิชา <span class="f flg"></span>\n'
    + '  </div>\n'

    // ที่อยู่
    + '  <div class="row">\n'
    + '    <b>4.</b> ที่อยู่ปัจจุบัน <span class="f fxl">' + String(addr.detail||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ตำบล/แขวง <span class="f fmd">' + addr.subDistrict + '</span>&nbsp;\n'
    + '    อำเภอ/เขต <span class="f fmd">' + addr.district    + '</span>&nbsp;\n'
    + '    จังหวัด <span class="f fmd">'   + addr.province    + '</span>&nbsp;\n'
    + '    รหัสไปรษณีย์ <span class="f fsm">' + String(addr.zipcode||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">โทรศัพท์ <span class="f fmd">' + String(s.phone||'') + '</span></div>\n'

    + '  <div class="section-hd">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>\n'

    + '  <div class="row">\n'
    + '    &#8211; ชื่อบิดา นาย <span class="f flg">' + String(father.firstName||'') + '</span>\n'
    + '    &nbsp;นามสกุล <span class="f flg">' + String(father.lastName||'') + '</span>\n'
    + '    &nbsp;อาชีพ <span class="f fmd">' + String(father.occupation||'') + '</span>\n'
    + '    &nbsp;โทรศัพท์ <span class="f fmd">' + String(father.phone||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ชื่อบิดา (อังกฤษ) Mr. <span class="f fxl"></span>\n'
    + '    &nbsp;เลขประจำตัวประชาชน ' + _pIdBoxes(father.idCard) + '\n'
    + '  </div>\n'

    + '  <div class="row">\n'
    + '    &#8211; ชื่อมารดา น.ส./นาง <span class="f flg">' + String(mother.firstName||'') + '</span>\n'
    + '    &nbsp;นามสกุล <span class="f flg">' + String(mother.lastName||'') + '</span>\n'
    + '    &nbsp;อาชีพ <span class="f fmd">' + String(mother.occupation||'') + '</span>\n'
    + '    &nbsp;โทรศัพท์ <span class="f fmd">' + String(mother.phone||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    ชื่อมารดา (อังกฤษ) Miss./Mrs. <span class="f fxl"></span>\n'
    + '    &nbsp;เลขประจำตัวประชาชน ' + _pIdBoxes(mother.idCard) + '\n'
    + '  </div>\n'

    + '  <div class="row">\n'
    + '    &#8211; ชื่อผู้ปกครอง (กรณีที่ไม่ได้อยู่กับบิดา มารดา)\n'
    + '    &nbsp;นาย/นางสาว/นาง <span class="f fxl">'
    +      String(guardian.prefix||'') + String(guardian.firstName||'') + ' ' + String(guardian.lastName||'')
    + '    </span>\n'
    + '    &nbsp;อาชีพ <span class="f fmd">' + String(guardian.occupation||'') + '</span>\n'
    + '  </div>\n'
    + '  <div class="row indent">\n'
    + '    เกี่ยวข้องเป็น <span class="f fsm">' + String(guardian.relation||'') + '</span>\n'
    + '    &nbsp;โทรศัพท์ <span class="f fmd">' + String(guardian.phone||'') + '</span>\n'
    + '    &nbsp;ที่อยู่ <span class="f fxl"></span>\n'
    + '  </div>\n'

    + '  <div class="row" style="font-size:12px;margin-top:6px">\n'
    + '    &emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ\n'
    + '    และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์\n'
    + '  </div>\n'

    + '  <div class="sig-grid">\n'
    + '    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ..........................ผู้สมัคร</div>'
    +      '<div>(' + fullName + ')</div><div>......./......./.........</div></div>\n'
    + '    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ..........................ผู้ปกครอง</div>'
    +      '<div>(' + String(guardian.prefix||'') + String(guardian.firstName||'') + ' ' + String(guardian.lastName||'') + ')</div>'
    +      '<div>......./......./.........</div></div>\n'
    + '    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ..........................ผู้รับสมัคร</div>'
    +      '<div>(................................)</div><div>......./......./.........</div></div>\n'
    + '    <div class="sig-box"><div class="sig-line"></div><div>ลงชื่อ..........................ฝ่ายการเงิน</div>'
    +      '<div>(................................)</div><div>......./......./.........</div></div>\n'
    + '  </div>\n'

    + '  <div style="margin-top:10px;font-size:12px;font-weight:700">บันทึกฝ่ายการเงิน</div>\n'
    + '  <div class="fin-line"></div><div class="fin-line"></div><div class="fin-line"></div>\n'
    + '</div>\n';

  return _pHtmlWrap('ใบสมัคร ปวส. — ' + String(s.applicationNo||''), _printCSS(), page1 + page2 + _pDocPages(docs, fullName));
}
