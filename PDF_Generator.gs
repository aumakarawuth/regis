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
  return '<svg class="seal" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<path id="sealTopArc" d="M 26,108 A 76,76 0 0 1 174,108" fill="none"/>' +
      '<path id="sealBotArc" d="M 40,145 A 64,64 0 0 0 160,145" fill="none"/>' +
    '</defs>' +
    '<circle cx="100" cy="100" r="95" fill="none" stroke="#000" stroke-width="2.5"/>' +
    '<circle cx="100" cy="100" r="87" fill="none" stroke="#000" stroke-width="1"/>' +
    '<g stroke="#000" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M100,38 C93,47 91,54 100,61 C109,54 107,47 100,38 Z" fill="#000"/>' +
      '<path d="M91,61 L109,61 L104,80 L96,80 Z" fill="#000"/>' +
      '<line x1="100" y1="80" x2="100" y2="110"/>' +
      '<path d="M86,110 C86,123 114,123 114,110"/>' +
    '</g>' +
    '<g stroke="#000" stroke-width="1.3" fill="none">' +
      '<circle cx="100" cy="128" r="16"/>' +
      '<circle cx="100" cy="128" r="3.5" fill="#000"/>' +
      '<line x1="104" y1="128" x2="116" y2="128"/>' +
      '<line x1="102.8" y1="131.3" x2="111.3" y2="139.3"/>' +
      '<line x1="100" y1="132" x2="100" y2="144"/>' +
      '<line x1="97.2" y1="131.3" x2="88.7" y2="139.3"/>' +
      '<line x1="96" y1="128" x2="84" y2="128"/>' +
      '<line x1="97.2" y1="124.7" x2="88.7" y2="116.7"/>' +
      '<line x1="100" y1="124" x2="100" y2="112"/>' +
      '<line x1="102.8" y1="124.7" x2="111.3" y2="116.7"/>' +
    '</g>' +
    '<text font-size="11.5" font-weight="700" letter-spacing="0.5">' +
      '<textPath href="#sealTopArc" startOffset="50%" text-anchor="middle">วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</textPath>' +
    '</text>' +
    '<text font-size="7.5" letter-spacing="0.3">' +
      '<textPath href="#sealBotArc" startOffset="50%" text-anchor="middle">CHARANSANITWONG TECHNOLOGICAL COLLEGE</textPath>' +
    '</text>' +
  '</svg>';
}

// ============================================================
// CSS ร่วม
// ============================================================
function _formCSS() {
  return [
    '@page { size: A4 portrait; margin: 10mm 12mm; }',
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
    'html{font-size:13px}',
    'body{font-family:"Sarabun","TH Sarabun New",sans-serif;color:#000;background:#fff;line-height:1.95}',
    '.page{width:100%;padding:3mm 1mm;page-break-after:always}',
    '.page:last-child{page-break-after:avoid}',
    '@media print{.no-print{display:none!important}}',
    '@media screen{body{background:#ddd}.page{background:#fff;max-width:194mm;margin:0 auto 18px;padding:8mm 10mm;box-shadow:0 2px 12px rgba(0,0,0,.25)}}',

    '.chk{font-weight:700;white-space:nowrap;font-family:monospace}',
    '.fld{display:inline-block;border-bottom:1px dotted #000;min-width:70px;padding:0 3px;text-align:center}',
    '.fld-xs{min-width:34px}.fld-sm{min-width:55px}.fld-md{min-width:110px}.fld-lg{min-width:170px}.fld-xl{min-width:250px}',
    '.fld-date{min-width:22px}.fld-date2{min-width:38px}',

    '.idwrap{display:inline-flex;align-items:center;vertical-align:middle}',
    '.idbox{display:inline-flex;align-items:center;justify-content:center;width:15px;height:18px;border:1px solid #000;font-weight:700;font-size:11px}',
    '.idgap{width:4px}',

    '.row{margin:5px 0}',
    '.indent{padding-left:20px}',
    '.b{font-weight:700}',
    '.center{text-align:center}',
    '.branch-row{font-size:0.86rem;line-height:2}',
    '.branch-item{white-space:nowrap;margin-right:14px;display:inline-block}',

    '.top-row{font-size:0.9rem}',
    '.cover-wrap{margin:8px 0;overflow:hidden}',
    '.photo-box{width:86px;height:104px;border:1px solid #000;float:right;margin-left:10px;display:flex;align-items:center;justify-content:center;font-size:0.66rem;text-align:center;color:#555}',
    '.cover-center{text-align:center}',
    '.seal{width:130px;height:130px;display:block;margin:0 auto}',
    '.cover-center h1{font-size:1.55rem;margin:2px 0 0}',
    '.cover-center h2{font-size:1.05rem;margin:2px 0}',
    '.cover-center .en{font-size:0.8rem}',
    '.cover-center .addr{font-size:0.76rem;color:#222;margin-top:3px;line-height:1.55}',
    '.hr{border:none;border-top:1.5px solid #000;margin:8px 0 6px;clear:both}',

    '.section-title{font-weight:700;margin:4px 0;font-size:0.96rem}',
    '.checklist{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font-size:0.8rem;margin-top:4px}',
    '.checklist>div{display:flex;gap:4px;align-items:baseline;white-space:nowrap}',

    '.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin-top:22px;text-align:center;font-size:0.85rem}',
    '.sig-line{border-bottom:1px solid #000;height:34px;margin:0 10px}',
    '.finance-line{border-bottom:1px dotted #888;height:16px;margin:4px 0}',

    '.print-btn{position:fixed;bottom:16px;right:16px;background:#009900;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:999}',

    '.doc-page{text-align:center;padding:10px 0}',
    '.doc-title{font-weight:700;font-size:1.05rem;margin-bottom:12px}',
    '.doc-img{max-width:88%;max-height:190mm;border:1px solid #ccc;display:block;margin:0 auto}',
    '.doc-placeholder{width:80%;height:150mm;margin:20px auto;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#aaa}',
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
    '<div class="row" style="font-size:0.85rem">' + extraRow + '&emsp;รหัสประจำตัว ' + _idCardBoxes(s.idCard) + '</div>' +
    '<div class="row" style="font-size:0.85rem">' +
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

    '<div class="row" style="font-size:0.85rem;margin-top:8px">' +
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
  return docs.map(function(doc) {
    var label = labels[doc.type] || doc.type;
    var img = doc.driveUrl
      ? '<img src="' + doc.driveUrl + '" class="doc-img" alt="' + _esc(label) + '">'
      : '<div class="doc-placeholder">(ไม่มีรูปเอกสาร)</div>';
    return '<div class="page doc-page">' +
      '<div class="doc-title">' + _esc(label) + '</div>' +
      img +
      '<div class="stamp-wrap"><span class="stamp">สำเนาถูกต้อง</span></div>' +
      '<div class="doc-sig"><div class="sig-line" style="width:260px;margin:30px auto 4px"></div>(' + _esc(studentName) + ')<br><span style="font-size:0.8rem;color:#555">ผู้สมัคร</span></div>' +
    '</div>';
  }).join('');
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
