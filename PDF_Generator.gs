// ============================================================
// PDF_Generator.gs — สร้างใบสมัคร ปวช./ปวส. สำหรับพิมพ์
// เดียวกับแบบฟอร์มกระดาษจริงของวิทยาลัย (checkbox "( )", เส้นประ,
// กล่องเลขบัตร 13 หลักแบ่งกลุ่ม 1-4-5-2-1, ตราวิทยาลัย)
//
// หมายเหตุ: เดิมมีไฟล์ Utils.gs / Utils_Print.gs ประกาศฟังก์ชันชื่อซ้ำ
// (printApplication, _buildPvchForm, _buildPvsForm) ซึ่งใน Apps Script
// ทุกไฟล์ใช้ global scope เดียวกัน ทำให้ไฟล์ที่โหลดทีหลังทับของเดิมแบบ
// เงียบๆ และ Utils_Print.gs เรียกฟังก์ชันที่ไม่มีอยู่จริง (_getSubDistrictName
// ฯลฯ) ทำให้กด "พิมพ์ใบสมัคร" แล้ว error ทุกครั้ง — รวมทุกอย่างมาไว้ที่
// ไฟล์เดียวนี้ไฟล์เดียว ลบสองไฟล์นั้นทิ้งเพื่อไม่ให้ชนกันอีก
// ============================================================

/**
 * doGet action: printApplication / generatePDF (alias)
 * GET: ?action=printApplication&token=xxx&studentId=yyy
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

  // lookup program โดย branchId ก่อน แล้วค่อย programId
  var prog = programs.find(function(p){ return p.branchId === enroll.branchId; });
  if (!prog) prog = programs.find(function(p){ return p.id === enroll.programId; });
  if (!prog) prog = programs.find(function(p){ return p.id === enroll.roundId; });
  prog = prog || {};

  var rawAddr = addresses.find(function(a){ return a.studentId === studentId; }) || {};
  var addr = _resolveAddr(rawAddr);

  var parentList = parents.filter(function(p){ return p.studentId === studentId; });
  var guardian   = guardians.find(function(g){ return g.studentId === studentId; }) || {};
  var docs       = documents.filter(function(d){ return d.studentId === studentId; });

  var studyRound = enroll.studyRound || s.studyRound || '';

  var isPvs = (prog.level || s.education || '').indexOf('ปวส') !== -1;
  var html  = isPvs
    ? _buildPvsPDF(s, enroll, prog, addr, parentList, guardian, docs, studyRound)
    : _buildPvchPDF(s, enroll, prog, addr, parentList, guardian, docs, studyRound);

  // หมายเหตุ: ContentService.MimeType ไม่มีค่า HTML (มีแค่ TEXT/CSV/XML/JSON ฯลฯ)
  // ต้องใช้ HtmlService ถึงจะ serve เป็นหน้าเว็บที่ browser render จริง — ของเดิมใช้
  // ContentService ผิด ทำให้ browser โชว์ source code แทนที่จะ render หน้าเว็บ
  return HtmlService.createHtmlOutput(html)
    .setTitle('ใบสมัคร ' + (isPvs ? 'ปวส.' : 'ปวช.') + ' — ' + (s.applicationNo || ''))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// Address resolver — ID → ชื่อ (ถ้าเก็บเป็นชื่อแล้วคืนเดิม)
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
  return s; // fallback: แสดง ID ถ้าหาชื่อไม่เจอ
}

// ============================================================
// FORM PRIMITIVES — จำลององค์ประกอบของแบบฟอร์มกระดาษจริง
// ============================================================

function _esc(v) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// checkbox วงเล็บ "(  )" / "( / )" — ตรงกับฟอร์มจริง (ไม่ใช่กล่อง CSS)
function _chk(checked) {
  return '<span class="chk">(' + (checked ? '<b>&nbsp;/&nbsp;</b>' : '&nbsp;&nbsp;&nbsp;') + ')</span>';
}

// ช่องกรอกข้อความเส้นประ — แสดงค่าถ้ามี ว่างไว้ให้กรอกถ้าไม่มี
function _fld(value, sizeClass) {
  return '<span class="fld ' + (sizeClass || '') + '">' + _esc(value) + '</span>';
}

// วันที่แบบ 3 ช่อง วัน/เดือน/ปี(พ.ศ.) — ว่างไว้ถ้าไม่มีค่า
function _dateSlots(d) {
  var day = '', month = '', year = '';
  if (d) {
    try {
      var dt = new Date(d);
      if (!isNaN(dt.getTime())) {
        day = String(dt.getDate());
        month = String(dt.getMonth() + 1);
        year = String(dt.getFullYear() + 543);
      }
    } catch (e) {}
  }
  return _fld(day, 'fld-date') + '/' + _fld(month, 'fld-date') + '/' + _fld(year, 'fld-date2');
}

// เลขบัตรประชาชน 13 หลัก แบ่งกลุ่ม 1-4-5-2-1 ตามฟอร์มจริง
function _idCardBoxes(idCard) {
  var digits = String(idCard || '').replace(/\D/g, '');
  var groupLens = [1, 4, 5, 2, 1];
  var pos = 0;
  var html = '<span class="idwrap">';
  for (var gi = 0; gi < groupLens.length; gi++) {
    if (gi > 0) html += '<span class="idgap"></span>';
    for (var i = 0; i < groupLens[gi]; i++) {
      html += '<span class="idbox">' + (digits[pos] || '') + '</span>';
      pos++;
    }
  }
  return html + '</span>';
}

// ============================================================
// ตราวิทยาลัย (SVG จำลอง — ถ้ามีไฟล์โลโก้จริงค่อยเปลี่ยนเป็น <img> ทีหลัง)
// ============================================================
function _collegeSeal() {
  // ตราวิทยาลัยจริง (วงกลม) ตามที่ปรากฏบนแบบฟอร์มจริง — ฝัง base64 ไว้ในไฟล์
  return '<img class="seal" alt="\u0e15\u0e23\u0e32\u0e27\u0e34\u0e17\u0e22\u0e32\u0e25\u0e31\u0e22" src="data:image/png;base64,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">';
}

// ============================================================
// CSS ร่วม
// ============================================================
function _formCSS() {
  return [
    '@page { size: A4 portrait; margin: 10mm 12mm; }',
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
    'html{font-size:11.5px}',
    'body{font-family:"Sarabun","TH Sarabun New",sans-serif;color:#000;background:#fff;line-height:1.5}',
    '.page{width:100%;padding:3mm 1mm;page-break-after:always}',
    '.page:last-child{page-break-after:avoid}',
    '@media print{.no-print{display:none!important}}',
    '@media screen{body{background:#ddd;overflow-x:auto}.page{background:#fff;width:210mm;max-width:210mm;min-width:210mm;margin:0 auto 18px;padding:10mm 12mm;box-shadow:0 2px 12px rgba(0,0,0,.25)}}',

    '.chk{font-weight:700;white-space:nowrap;font-family:monospace}',
    '.fld{display:inline-block;border-bottom:1px dotted #000;min-width:70px;padding:0 3px;text-align:center}',
    '.fld-xs{min-width:34px}.fld-sm{min-width:55px}.fld-md{min-width:110px}.fld-lg{min-width:170px}.fld-xl{min-width:250px}',
    '.fld-date{min-width:22px}.fld-date2{min-width:38px}',

    '.idwrap{display:inline-flex;align-items:center;vertical-align:middle}',
    '.idbox{display:inline-flex;align-items:center;justify-content:center;width:15px;height:18px;border:1px solid #000;font-weight:700;font-size:11px}',
    '.idgap{width:4px}',

    '.row{margin:4px 0}',
    '.indent{padding-left:20px}',
    '.b{font-weight:700}',
    '.center{text-align:center}',
    '.branch-row{}',
    '.branch-item{white-space:nowrap;margin-right:14px;display:inline-block}',

    '.top-row{}',
    '.cover-wrap{margin:8px 0;position:relative}',
    '.photo-box{width:86px;height:104px;border:1px solid #000;position:absolute;top:0;right:0;display:flex;align-items:center;justify-content:center;font-size:0.75rem;text-align:center;color:#555}',
    '.cover-center{text-align:center}',
    '.seal{width:130mm;height:auto;display:block;margin:0 auto}',
    '.cover-center h1{font-size:1.7rem;margin:2px 0 0}',
    '.cover-center h2{font-size:1.15rem;margin:2px 0}',
    '.cover-center .en{font-size:0.85rem}',
    '.cover-center .addr{font-size:0.8rem;color:#222;margin-top:3px;line-height:1.4}',
    '.hr{border:none;border-top:1.5px solid #000;margin:8px 0 6px}',

    '.section-title{font-weight:700;margin:6px 0 4px;font-size:1.08rem}',
    '.checklist{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;margin-top:4px}',
    '.checklist>div{display:flex;gap:4px;align-items:baseline;white-space:nowrap}',

    '.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-top:22px;text-align:center}',
    '.sig-line{border-bottom:1px solid #000;height:34px;margin:0 10px}',
    '.finance-line{border-bottom:1px dotted #888;height:16px;margin:4px 0}',

    '.print-btn{position:fixed;bottom:16px;right:16px;background:#009900;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:999}',

    '.doc-page{text-align:center;padding:10px 0;min-height:273mm;display:flex;flex-direction:column;align-items:center;justify-content:center}',
    '.doc-title{font-weight:700;font-size:1.05rem;margin-bottom:12px}',
    '.doc-img{max-width:94%;max-height:210mm;width:auto;height:auto;border:1px solid #ccc;display:block;margin:0 auto}',
    '.doc-placeholder{width:80%;height:150mm;margin:20px auto;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#aaa}',
    '.idcard-stack{display:flex;flex-direction:column;align-items:center;gap:8mm}',
    '.idcard-item{display:flex;flex-direction:column;align-items:center;gap:2mm}',
    '.idcard-img{width:85.6mm;height:54mm;object-fit:contain;border:1px solid #ccc;display:block;background:#fff}',
    '.idcard-placeholder{width:85.6mm;height:54mm;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.75rem;text-align:center}',
    '.idcard-cap{font-size:0.75rem;color:#555}',
    '.stamp-wrap{text-align:right;padding-right:24px;margin-top:14px}',
    '.stamp{display:inline-block;border:2.5px solid #CC0000;border-radius:8px;padding:5px 18px;color:#CC0000;font-weight:700}',
    '.doc-sig{margin-top:8px}',
  ].join('\n');
}

function _wrapHtml(title, bodyHtml) {
  return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + _esc(title) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<style>' + _formCSS() + '</style>' +
    '</head><body>' +
    '<button class="print-btn no-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>' +
    bodyHtml +
    '</body></html>';
}

// ============================================================
// รายการหลักฐานการสมัคร — ตามแบบฟอร์มจริง
// (เช็คให้อัตโนมัติเฉพาะรายการที่มีเอกสารอัปโหลดตรงกันจริง — ที่เหลือ
//  เว้นว่างให้เจ้าหน้าที่ตรวจสอบเอง เพราะระบบไม่ได้เก็บสำเนาบัตร
//  บิดา/มารดา/ผู้ปกครอง หรือสูติบัตรแยกไว้)
// ============================================================
function _checklistItems(level, hasDoc) {
  var eduDone = hasDoc('edu_cert_front') || hasDoc('edu_cert');
  var idDone  = hasDoc('id_card_front') && hasDoc('id_card_back');
  if (level === 'pvs') {
    return [
      { n: 1, label: 'รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ', checked: false },
      { n: 2, label: 'วุฒิการศึกษาฉบับจริง', checked: eduDone },
      { n: 3, label: 'สำเนาวุฒิการศึกษา 2 ฉบับ', checked: eduDone },
      { n: 4, label: 'สำเนาบัตรประจำตัวประชาชนของตนเอง 2 ฉบับ', checked: idDone },
      { n: 5, label: 'สำเนาบัตรประจำตัวประชาชนของบิดา', checked: false },
      { n: 6, label: 'สำเนาบัตรประจำตัวประชาชนของมารดา', checked: false },
      { n: 7, label: 'สำเนาบัตรประจำตัวประชาชนของผู้ปกครอง', checked: false },
      { n: 8, label: 'สำเนาทะเบียนบ้านของตนเอง', checked: hasDoc('house_reg') },
      { n: 9, label: 'กรณี โอนหน่วยกิต (วุฒิม.3 และรบ.โอน)', checked: false },
    ];
  }
  return [
    { n: 1,  label: 'รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ', checked: false },
    { n: 2,  label: 'วุฒิการศึกษาฉบับจริง', checked: eduDone },
    { n: 3,  label: 'สำเนาวุฒิการศึกษา 2 ฉบับ', checked: eduDone },
    { n: 4,  label: 'สำเนาบัตรประจำตัวประชาชนของตนเอง 1 ฉบับ', checked: idDone },
    { n: 5,  label: 'สำเนาบัตรประจำตัวประชาชนของบิดา 1 ฉบับ', checked: false },
    { n: 6,  label: 'สำเนาบัตรประจำตัวประชาชนของมารดา 1 ฉบับ', checked: false },
    { n: 7,  label: 'สำเนาบัตรประจำตัวประชาชนของผู้ปกครอง 1 ฉบับ', checked: false },
    { n: 8,  label: 'สำเนาทะเบียนบ้านของตนเอง 1 ฉบับ', checked: hasDoc('house_reg') },
    { n: 9,  label: 'สำเนาสูติบัตร 1 ฉบับ', checked: false },
    { n: 10, label: 'กรณี โอนหน่วยกิต (วุฒิม.3 และรบ.โอน)', checked: false },
  ];
}

function _checklistHtml(items) {
  var half = Math.ceil(items.length / 2);
  var left = items.slice(0, half);
  var right = items.slice(half);
  var rows = '';
  for (var i = 0; i < half; i++) {
    var l = left[i], r = right[i];
    rows += '<div>' + _chk(l.checked) + ' ' + l.n + '. ' + _esc(l.label) + '</div>';
    rows += '<div>' + (r ? _chk(r.checked) + ' ' + r.n + '. ' + _esc(r.label) : '') + '</div>';
  }
  return '<div class="checklist">' + rows + '</div>';
}

// ============================================================
// สาขาวิชา — ตามแบบฟอร์มจริง
// ============================================================
var PVCH_BRANCHES = ['การบัญชี', 'การตลาด', 'ภาษาต่างประเทศธุรกิจบริการ', 'ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]', 'เทคโนโลยีธุรกิจดิจิทัล', 'เทคโนโลยีสารสนเทศ', 'ดิจิทัลกราฟิก', 'การท่องเที่ยว'];
var PVS_BRANCHES  = ['การบัญชี', 'การตลาด', 'ภาษาและการจัดการธุรกิจระหว่างประเทศ', 'ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]', 'เทคโนโลยีธุรกิจดิจิทัล', 'เทคโนโลยีสารสนเทศ', 'ดิจิทัลกราฟิก', 'การท่องเที่ยว', 'การจัดการดูแลผู้สูงอายุ', 'การจัดการสำนักงานดิจิทัล'];

function _branchChecklistHtml(branches, branchName) {
  branchName = branchName || '';
  var perRow = 4;
  var html = '';
  for (var i = 0; i < branches.length; i += perRow) {
    var rowItems = branches.slice(i, i + perRow);
    var cells = [];
    for (var j = 0; j < rowItems.length; j++) {
      var b = rowItems[j];
      var key = b.split(' [')[0];
      cells.push('<span class="branch-item">' + _chk(branchName.indexOf(key) !== -1) + ' ' + _esc(b) + '</span>');
    }
    html += '<div class="row branch-row' + (i > 0 ? ' indent' : '') + '">' + cells.join('') + '</div>';
  }
  return html;
}

// ============================================================
// หน้าปก — ใช้ร่วมกัน ปวช./ปวส.
// ============================================================
function _coverPage(levelLabel, fullName, roundLabel, s, checklistItems, extraRow) {
  return '<div class="page">' +
    '<div class="top-row">นาย/น.ส./นาง ' + _fld(fullName, 'fld-lg') + '&emsp;ห้อง ' + _fld('', 'fld-sm') + '&emsp;รอบ ' + _fld(roundLabel, 'fld-sm') + '</div>' +
    '<div class="row">' + extraRow + '&emsp;รหัสประจำตัว ' + _idCardBoxes(s.idCard) + '</div>' +
    '<div class="row">' +
      _chk(false) + ' บันทึก DATA' + _fld('', 'fld-md') + '&emsp;' +
      _chk(false) + ' บันทึก SISA' + _fld('', 'fld-md') + '&emsp;' +
      _chk(false) + ' กรอกประวัติ' + _fld('', 'fld-md') +
    '</div>' +

    '<div class="cover-wrap">' +
      '<div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>' +
      '<div class="cover-center">' +
        _collegeSeal() +
        '<h1>ใบสมัคร ' + _esc(levelLabel) + '</h1>' +
        '<h2>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h2>' +
        '<div class="en">Charansanitwong Technogical College</div>' +
        '<div class="addr">18 ถ.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700<br>' +
        'โทร. 0-2434-6155-7 โทรสาร. 0-2433-3647 www.charansanitwong.ac.th</div>' +
      '</div>' +
    '</div>' +

    '<hr class="hr">' +
    '<div class="section-title">หลักฐานการสมัครเรียน (เรียงตามหมายเลข)</div>' +
    _checklistHtml(checklistItems) +
  '</div>';
}

// ============================================================
// หน้ากรอกข้อมูล — ใช้ร่วมกัน ปวช./ปวส. (ต่างกันแค่สาขา/วุฒิเดิม/บรรทัดปีที่เข้า)
// ============================================================
function _fillPage(level, s, addr, father, mother, guardian, studyRound, branchName) {
  var isPvs = level === 'pvs';
  var levelTitle = isPvs ? 'ปวส.' : 'ปวช.';
  var branches = isPvs ? PVS_BRANCHES : PVCH_BRANCHES;
  var edu = String(s.education || '');

  var eduRow;
  if (isPvs) {
    var isPvchGrad = edu.toLowerCase().indexOf('ปวช') !== -1;
    eduRow = '<div class="row"><span class="b">3. จบการศึกษา</span> ' +
      _chk(edu.indexOf('ม.6') !== -1) + ' ม.6 ' +
      _chk(isPvchGrad) + ' ปวช. สาขา (ระบุ) ' + _fld(isPvchGrad ? s.education : '', 'fld-md') +
      ' โรงเรียน ' + _fld(s.oldSchool, 'fld-lg') + '</div>';
  } else {
    eduRow = '<div class="row"><span class="b">3. จบการศึกษา</span> ' +
      _chk(edu.indexOf('ม.3') !== -1) + ' ม.3' +
      ' โรงเรียน/วิทยาลัย ' + _fld(s.oldSchool, 'fld-lg') + '</div>';
  }

  var transferRow = isPvs
    ? '<div class="row indent">&#8211; เข้าศึกษา ' + _chk(false) + ' ปวส.2 ' + _chk(false) + ' ปวส.3 ห้อง/รอบ ' + _fld('', 'fld-md') + ' สาขาวิชา ' + _fld('', 'fld-lg') + '</div>'
    : '<div class="row indent">&#8211; เข้าศึกษา ห้อง/รอบ ' + _fld('', 'fld-md') + ' สาขาวิชา ' + _fld('', 'fld-lg') + '</div>';

  var fatherName = (guardian.prefix || '') + (guardian.firstName || '') + ' ' + (guardian.lastName || '');

  return '<div class="page">' +
    '<div class="center b" style="font-size:1.05rem;margin-bottom:6px">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>' +

    '<div class="row">' +
      '<span class="b">วันที่สมัคร</span> ' + _dateSlots(s.applyDate) +
      '&emsp;<span class="b">ระดับที่สมัคร ' + levelTitle + '</span> &#8211; รอบ ' +
      _chk(studyRound === 'morning') + ' เช้า ' +
      _chk(studyRound === 'afternoon') + ' บ่าย ' +
      _chk(studyRound === 'dual') + ' ทวิภาคี' +
    '</div>' +

    '<div class="row">' +
      '<span class="b">1.</span> นาย/นางสาว/นาง ' + _fld(s.firstName, 'fld-lg') +
      ' นามสกุล ' + _fld(s.lastName, 'fld-lg') +
      ' วัน/เดือน/ปีเกิด ' + _dateSlots(s.birthDate) +
    '</div>' +
    '<div class="row indent">' +
      'Mr./Miss./Mrs. ' + _fld(((s.firstNameEn || '') + ' ' + (s.lastNameEn || '')).trim(), 'fld-xl') +
      ' เลขประจำตัวประชาชน ' + _idCardBoxes(s.idCard) +
    '</div>' +
    '<div class="row indent">' +
      '&#8211; สัญชาติ' + _fld(s.nationality || 'ไทย', 'fld-sm') +
      ' เชื้อชาติ' + _fld(s.ethnicity || 'ไทย', 'fld-sm') +
      ' ศาสนา' + _fld(s.religion || 'พุทธ', 'fld-sm') +
      ' น้ำหนัก' + _fld(s.weight, 'fld-xs') +
      ' ส่วนสูง' + _fld(s.height, 'fld-xs') +
      ' หมู่โลหิต' + _fld(s.bloodType, 'fld-xs') +
    '</div>' +

    '<div class="row"><span class="b">2. สาขาวิชาที่สมัคร</span></div>' +
    _branchChecklistHtml(branches, branchName) +

    eduRow +
    '<div class="row indent">' +
      'ตำบล/แขวง ' + _fld(addr.subDistrict, 'fld-md') +
      ' อำเภอ/เขต ' + _fld(addr.district, 'fld-md') +
      ' จังหวัด ' + _fld(addr.province, 'fld-md') +
    '</div>' +
    '<div class="row indent">&#8211; กรณีโอนมา จากวิทยาลัย ' + _fld('', 'fld-lg') + ' สาขาวิชา ' + _fld('', 'fld-lg') + '</div>' +
    transferRow +

    '<div class="row"><span class="b">4. ที่อยู่ปัจจุบัน</span> บ้านเลขที่' + _fld('', 'fld-xs') + ' หมู่' + _fld('', 'fld-xs') + ' ซอย' + _fld('', 'fld-sm') + ' ถนน' + _fld('', 'fld-md') + '</div>' +
    '<div class="row indent">' +
      'ตำบล/แขวง ' + _fld(addr.subDistrict, 'fld-md') +
      ' อำเภอ/เขต ' + _fld(addr.district, 'fld-md') +
      ' จังหวัด ' + _fld(addr.province, 'fld-md') +
      ' รหัสไปรษณีย์ ' + _fld(addr.zipcode, 'fld-sm') +
    '</div>' +
    '<div class="row indent">โทรศัพท์ ' + _fld(s.phone, 'fld-lg') + '</div>' +

    '<div class="section-title" style="border-bottom:1.5px solid #000;padding-bottom:2px">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>' +

    '<div class="row">&#8211; ชื่อบิดา นาย ' + _fld(father.firstName, 'fld-md') + ' นามสกุล ' + _fld(father.lastName, 'fld-md') + ' อาชีพ ' + _fld(father.occupation, 'fld-sm') + ' โทรศัพท์ ' + _fld(father.phone, 'fld-md') + '</div>' +
    '<div class="row indent">ชื่อบิดา(ภาษาอังกฤษ) Mr. ' + _fld(((father.firstNameEn || '') + ' ' + (father.lastNameEn || '')).trim(), 'fld-xl') + ' เลขประจำตัวประชาชน ' + _idCardBoxes(father.idCard) + '</div>' +

    '<div class="row">&#8211; ชื่อมารดา น.ส./นาง ' + _fld(mother.firstName, 'fld-md') + ' นามสกุล ' + _fld(mother.lastName, 'fld-md') + ' อาชีพ ' + _fld(mother.occupation, 'fld-sm') + ' โทรศัพท์ ' + _fld(mother.phone, 'fld-md') + '</div>' +
    '<div class="row indent">ชื่อมารดา(ภาษาอังกฤษ) Miss./Mrs. ' + _fld(((mother.firstNameEn || '') + ' ' + (mother.lastNameEn || '')).trim(), 'fld-xl') + ' เลขประจำตัวประชาชน ' + _idCardBoxes(mother.idCard) + '</div>' +

    '<div class="row">&#8211; ชื่อผู้ปกครอง <span style="font-size:0.8rem">(กรณีที่ไม่ได้อยู่กับบิดา มารดา)</span> นาย/นางสาว/นาง ' + _fld(fatherName.trim(), 'fld-lg') + ' อาชีพ ' + _fld(guardian.occupation, 'fld-sm') + '</div>' +
    '<div class="row indent">เกี่ยวข้องเป็น ' + _fld(guardian.relation, 'fld-sm') + ' โทรศัพท์ ' + _fld(guardian.phone, 'fld-md') + ' ที่อยู่ ' + _fld('', 'fld-xl') + '</div>' +

    '<div class="row" style="margin-top:8px">' +
      '&emsp;&emsp;&emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์' +
    '</div>' +

    '<div class="sig-grid">' +
      '<div><div class="sig-line"></div>ลงชื่อ..............................................ผู้สมัคร<br>(' + _esc((s.prefix || '') + (s.firstName || '') + ' ' + (s.lastName || '')) + ')<br>' + _dateSlots(null) + '</div>' +
      '<div><div class="sig-line"></div>ลงชื่อ..............................................ผู้ปกครอง<br>(' + _esc(fatherName.trim()) + ')<br>' + _dateSlots(null) + '</div>' +
      '<div><div class="sig-line"></div>ลงชื่อ..............................................ผู้รับสมัคร<br>(............................................)<br>' + _dateSlots(null) + '</div>' +
      '<div><div class="sig-line"></div>ลงชื่อ..............................................ฝ่ายการเงิน<br>(............................................)<br>' + _dateSlots(null) + '</div>' +
    '</div>' +

    '<div class="row" style="margin-top:10px"><span class="b">บันทึกฝ่ายการเงิน</span></div>' +
    '<div class="finance-line"></div><div class="finance-line"></div><div class="finance-line"></div>' +
  '</div>';
}

// ============================================================
// หน้าเอกสารแนบ (สำเนาถูกต้อง)
// ============================================================
function _docPages(docs, studentName) {
  var labels = {
    id_card_front: 'สำเนาบัตรประจำตัวประชาชน (ด้านหน้า)',
    id_card_back:  'สำเนาบัตรประจำตัวประชาชน (ด้านหลัง)',
    house_reg:     'สำเนาทะเบียนบ้าน',
    edu_cert_front:'สำเนาวุฒิการศึกษา (ด้านหน้า)',
    edu_cert_back: 'สำเนาวุฒิการศึกษา (ด้านหลัง)',
    edu_cert:      'สำเนาวุฒิการศึกษา',
    payment_slip:  'หลักฐานการชำระเงิน',
  };
  var sigBlock = '<div class="doc-sig"><div class="sig-line" style="width:260px;margin:30px auto 4px"></div>(' + _esc(studentName) + ')<br><span style="font-size:0.8rem;color:#555">ผู้สมัคร</span></div>';

  var idCardBlock = function(doc, sideLabel) {
    var img = doc && doc.driveUrl
      ? '<img src="' + doc.driveUrl + '" class="idcard-img" alt="' + _esc(sideLabel) + '">'
      : '<div class="idcard-placeholder">(ไม่มีรูป' + _esc(sideLabel) + ')</div>';
    return '<div class="idcard-item">' + img + '<div class="idcard-cap">' + _esc(sideLabel) + '</div></div>';
  };

  var front = docs.filter(function(d) { return d.type === 'id_card_front'; })[0];
  var back  = docs.filter(function(d) { return d.type === 'id_card_back'; })[0];
  var idCardPage = '';
  if (front || back) {
    idCardPage = '<div class="page doc-page">' +
      '<div class="doc-title">สำเนาบัตรประจำตัวประชาชน</div>' +
      '<div class="idcard-stack">' +
        idCardBlock(front, 'ด้านหน้า') +
        idCardBlock(back, 'ด้านหลัง') +
      '</div>' +
      '<div class="stamp-wrap"><span class="stamp">สำเนาถูกต้อง</span></div>' +
      sigBlock +
    '</div>';
  }

  var restPages = docs.filter(function(d) {
    return d.type !== 'id_card_front' && d.type !== 'id_card_back';
  }).map(function(doc) {
    var label = labels[doc.type] || doc.type;
    var img = doc.driveUrl
      ? '<img src="' + doc.driveUrl + '" class="doc-img" alt="' + _esc(label) + '">'
      : '<div class="doc-placeholder">(ไม่มีรูปเอกสาร)</div>';
    return '<div class="page doc-page">' +
      '<div class="doc-title">' + _esc(label) + '</div>' +
      img +
      '<div class="stamp-wrap"><span class="stamp">สำเนาถูกต้อง</span></div>' +
      sigBlock +
    '</div>';
  }).join('');

  return idCardPage + restPages;
}

// ============================================================
// ██████ ปวช. ██████
// ============================================================
function _buildPvchPDF(s, enroll, prog, addr, parents, guardian, docs, studyRound) {
  var father = parents.find(function(p) { return p.type === 'father'; }) || {};
  var mother = parents.find(function(p) { return p.type === 'mother'; }) || {};
  var fullName = (s.prefix || '') + (s.firstName || '') + ' ' + (s.lastName || '');
  var branchName = prog.branch || enroll.branchId || '';
  var roundLabel = { morning: 'เช้า', afternoon: 'บ่าย', dual: 'ทวิภาคี' }[studyRound] || '';
  var hasDoc = function(t) { return docs.some(function(d) { return d.type === t; }); };

  var extraRow = _chk(false) + ' ทุนสัณห์ พรนิมิตร&emsp;' + _chk(false) + ' กู้ยศ.&emsp;' + _chk(false) + ' อื่นๆ' + _fld('', 'fld-md');

  var page1 = _coverPage('ปวช.', fullName, roundLabel, s, _checklistItems('pvch', hasDoc), extraRow);
  var page2 = _fillPage('pvch', s, addr, father, mother, guardian, studyRound, branchName);
  var docPages = _docPages(docs, fullName);

  return _wrapHtml('ใบสมัคร ปวช. — ' + (s.applicationNo || ''), page1 + page2 + docPages);
}

// ============================================================
// ██████ ปวส. ██████
// ============================================================
function _buildPvsPDF(s, enroll, prog, addr, parents, guardian, docs, studyRound) {
  var father = parents.find(function(p) { return p.type === 'father'; }) || {};
  var mother = parents.find(function(p) { return p.type === 'mother'; }) || {};
  var fullName = (s.prefix || '') + (s.firstName || '') + ' ' + (s.lastName || '');
  var branchName = prog.branch || enroll.branchId || '';
  var roundLabel = { morning: 'เช้า', afternoon: 'บ่าย', dual: 'ทวิภาคี' }[studyRound] || '';
  var hasDoc = function(t) { return docs.some(function(d) { return d.type === t; }); };

  var extraRow = _chk(false) + ' กู้ยศ.&emsp;' + _chk(false) + ' อื่นๆ' + _fld('', 'fld-md');

  var page1 = _coverPage('ปวส.', fullName, roundLabel, s, _checklistItems('pvs', hasDoc), extraRow);
  var page2 = _fillPage('pvs', s, addr, father, mother, guardian, studyRound, branchName);
  var docPages = _docPages(docs, fullName);

  return _wrapHtml('ใบสมัคร ปวส. — ' + (s.applicationNo || ''), page1 + page2 + docPages);
}
