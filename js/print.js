// ============================================================
// print.js — ใบสมัคร ปวช./ปวส. สำหรับพิมพ์ (ported from PDF_Generator.gs)
//
// This is a print-ready HTML page, not a real PDF generator — same as the
// old Apps Script version: it builds a styled page and the user prints /
// "saves as PDF" through the browser's print dialog.
//
// Data source changed from Sheets to Supabase; the form layout, checklist
// logic and field placement are ported as-is from PDF_Generator.gs's
// _coverPage/_fillPage/_docPages so the printed form still matches the
// college's paper form.
// ============================================================

const _sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const REQUIRED_LOGIN_REDIRECT = 'admin.html';

// ---- Form primitives ----
function _esc(v) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _chk(checked) {
  return '<span class="chk">(' + (checked ? '<b>&nbsp;/&nbsp;</b>' : '&nbsp;&nbsp;&nbsp;') + ')</span>';
}

function _fld(value, sizeClass) {
  return '<span class="fld ' + (sizeClass || '') + '">' + _esc(value) + '</span>';
}

function _dateSlots(d) {
  var day = '', month = '', year = '';
  if (d) {
    var dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      day = String(dt.getDate());
      month = String(dt.getMonth() + 1);
      year = String(dt.getFullYear() + 543);
    }
  }
  return _fld(day, 'fld-date') + '/' + _fld(month, 'fld-date') + '/' + _fld(year, 'fld-date2');
}

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

// Plain boxes with no group gaps — used for the cover page's
// "รหัสประจำตัว" (school-assigned student code, filled in by hand by
// staff after enrollment — a different number from the 13-digit
// citizen ID card that _idCardBoxes above is for). Called with no
// value on the cover page since it's always blank at print time.
function _plainBoxes(count, value) {
  var digits = String(value || '').replace(/\D/g, '');
  var html = '<span class="idwrap">';
  for (var i = 0; i < count; i++) {
    html += '<span class="idbox">' + (digits[i] || '') + '</span>';
  }
  return html + '</span>';
}

function _collegeSealHtml() {
  return COLLEGE_SEAL_SVG;
}

// ---- CSS ----
const FORM_CSS = [
  '@page { size: A4 portrait; margin: 0; }',
  '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
  'html{font-size:11.5px}',
  'body{font-family:"Sarabun","TH Sarabun New",sans-serif;color:#000;background:#fff;line-height:1.5}',
  '.fill-form{font-size:1.2rem}',
  '.page{box-sizing:border-box;position:relative;width:100%;min-height:297mm;padding:15mm;page-break-after:always}',
  '.page:last-child{page-break-after:avoid}',
  '@media print{.no-print{display:none!important}}',
  '@media screen{body{background:#ddd;overflow-x:auto}.page{background:#fff;width:210mm;max-width:210mm;min-width:210mm;margin:0 auto 18px;padding:15mm;box-shadow:0 2px 12px rgba(0,0,0,.25)}}',

  '.chk{font-weight:700;white-space:nowrap;font-family:monospace}',
  '.fld{display:inline-block;border-bottom:1px dotted #000;min-width:70px;padding:0 3px;text-align:center}',
  '.fld-xs{min-width:34px}.fld-sm{min-width:55px}.fld-md{min-width:110px}.fld-lg{min-width:170px}.fld-xl{min-width:250px}',
  '.fld-date{min-width:22px}.fld-date2{min-width:38px}',
  '.fill-form .row{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 6px}',
  '.fill-form .fld{flex:1 1 40px;min-width:0}',
  '.fill-form .fld-date{flex:0 0 auto;min-width:22px}',
  '.fill-form .fld-date2{flex:0 0 auto;min-width:38px}',

  '.idwrap{display:inline-block;vertical-align:middle}',
  '.idbox{display:inline-block;width:15px;height:18px;border:1px solid #000;font-weight:700;font-size:11px;text-align:center;line-height:18px;vertical-align:middle}',
  '.idgap{display:inline-block;width:4px}',

  '.row{margin:4px 0}',
  '.indent{padding-left:20px}',
  '.b{font-weight:700}',
  '.center{text-align:center}',
  '.branch-row{}',
  '.branch-item{white-space:nowrap;margin-right:14px;display:inline-block}',

  '.top-row{}',
  '.photo-box{width:86px;height:104px;border:1px solid #000;position:absolute;top:34mm;right:15mm;display:flex;align-items:center;justify-content:center;font-size:0.75rem;text-align:center;color:#555}',
  '.seal-wrap{position:absolute;top:38%;left:15mm;right:15mm;transform:translateY(-50%);text-align:center}',
  '.bottom-block{position:absolute;bottom:15mm;left:15mm;right:15mm}',
  '.cover-center{text-align:center}',
  '.seal{width:130mm;height:auto;display:block;margin:0 auto}',
  '.cover-center h1{font-size:2.856rem;margin:2px 0 0}',
  '.cover-center h2{font-size:1.932rem;margin:2px 0}',
  '.cover-center .en{font-size:1.428rem}',
  '.cover-center .addr{font-size:1.344rem;color:#222;margin-top:3px;line-height:1.4}',
  '.hr{border:none;border-top:1.5px solid #000;margin:8px 0 6px}',

  '.section-title{font-weight:700;margin:6px 0 4px;font-size:1.08em}',
  '.checklist{margin-top:4px}',
  '.checklist>div{display:inline-block;width:49%;vertical-align:top;white-space:nowrap;margin-bottom:3px}',

  '.sig-grid{margin-top:20px;text-align:center}',
  '.sig-grid>div{display:inline-block;width:48%;vertical-align:top;margin-bottom:18px;padding-top:14px;line-height:1.8}',
  '.sig-line{border-bottom:1px solid #000;height:34px;margin:0 10px}',
  '.finance-line{border-bottom:1px dotted #888;height:16px;margin:4px 0}',

  '.print-btn{position:fixed;bottom:16px;right:16px;background:#009900;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:999}',

  '.doc-page{padding:10px 0;min-height:273mm;display:table;width:100%}',
  '.doc-page-inner{display:table-cell;vertical-align:middle;text-align:center}',
  '.doc-page-content{display:inline-block;text-align:center}',
  '.doc-title{font-weight:700;font-size:1.05rem;margin-bottom:12px}',
  '.doc-img{max-width:94%;max-height:210mm;width:auto;height:auto;border:1px solid #ccc;display:block;margin:0 auto}',
  '.doc-placeholder{width:80%;height:150mm;margin:20px auto;border:1px dashed #bbb;color:#aaa;line-height:150mm}',
  '.idcard-stack{}',
  '.idcard-item{margin-bottom:8mm}',
  '.idcard-item:last-child{margin-bottom:0}',
  '.idcard-img{width:85.6mm;height:54mm;object-fit:contain;border:1px solid #ccc;display:block;margin:0 auto;background:#fff}',
  '.idcard-placeholder{width:85.6mm;height:54mm;border:1px dashed #bbb;color:#aaa;font-size:0.75rem;line-height:54mm;margin:0 auto}',
  '.idcard-cap{font-size:0.75rem;color:#555;margin-top:2mm}',
  '.stamp-wrap{text-align:right;padding-right:24px;margin-top:14px}',
  '.stamp{display:inline-block;border:2.5px solid #CC0000;border-radius:8px;padding:5px 18px;color:#CC0000;font-weight:700}',
  '.doc-sig{margin-top:8px}',
].join('\n');

// ---- Checklist ----
function _checklistItems(level, hasDoc) {
  var eduDone = hasDoc('edu_cert_front') || hasDoc('edu_cert');
  var idDone = hasDoc('id_card_front') && hasDoc('id_card_back');
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
    { n: 1, label: 'รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ', checked: false },
    { n: 2, label: 'วุฒิการศึกษาฉบับจริง', checked: eduDone },
    { n: 3, label: 'สำเนาวุฒิการศึกษา 2 ฉบับ', checked: eduDone },
    { n: 4, label: 'สำเนาบัตรประจำตัวประชาชนของตนเอง 1 ฉบับ', checked: idDone },
    { n: 5, label: 'สำเนาบัตรประจำตัวประชาชนของบิดา 1 ฉบับ', checked: false },
    { n: 6, label: 'สำเนาบัตรประจำตัวประชาชนของมารดา 1 ฉบับ', checked: false },
    { n: 7, label: 'สำเนาบัตรประจำตัวประชาชนของผู้ปกครอง 1 ฉบับ', checked: false },
    { n: 8, label: 'สำเนาทะเบียนบ้านของตนเอง 1 ฉบับ', checked: hasDoc('house_reg') },
    { n: 9, label: 'สำเนาสูติบัตร 1 ฉบับ', checked: false },
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

// ---- Branches ----
const PVCH_BRANCHES = ['การบัญชี', 'การตลาด', 'ภาษาต่างประเทศธุรกิจบริการ', 'ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]', 'เทคโนโลยีธุรกิจดิจิทัล', 'เทคโนโลยีสารสนเทศ', 'ดิจิทัลกราฟิก', 'การท่องเที่ยว'];
const PVS_BRANCHES = ['การบัญชี', 'การตลาด', 'ภาษาและการจัดการธุรกิจระหว่างประเทศ', 'ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]', 'เทคโนโลยีธุรกิจดิจิทัล', 'เทคโนโลยีสารสนเทศ', 'ดิจิทัลกราฟิก', 'การท่องเที่ยว', 'การจัดการดูแลผู้สูงอายุ', 'การจัดการสำนักงานดิจิทัล'];

function _branchChecklistHtml(branches, branchName) {
  branchName = branchName || '';
  var perRow = 4;
  var html = '';
  for (var i = 0; i < branches.length; i += perRow) {
    var rowItems = branches.slice(i, i + perRow);
    var cells = rowItems.map(function (b) {
      var key = b.split(' [')[0];
      return '<span class="branch-item">' + _chk(branchName.indexOf(key) !== -1) + ' ' + _esc(b) + '</span>';
    });
    html += '<div class="row branch-row' + (i > 0 ? ' indent' : '') + '">' + cells.join('') + '</div>';
  }
  return html;
}

// ---- Cover page ----
function _coverPage(levelLabel, fullName, roundLabel, s, checklistItems, extraRow) {
  return '<div class="page">' +
    '<div class="top-row">นาย/น.ส./นาง ' + _fld(fullName, 'fld-lg') + '&emsp;ห้อง ' + _fld('', 'fld-sm') + '&emsp;รอบ ' + _fld(roundLabel, 'fld-sm') + '</div>' +
    '<div class="row">' + extraRow + '&emsp;รหัสประจำตัว ' + _plainBoxes(11) + '</div>' +
    '<div class="row">' +
      _chk(false) + ' บันทึก DATA' + _fld('', 'fld-md') + '&emsp;' +
      _chk(false) + ' บันทึก SISA' + _fld('', 'fld-md') + '&emsp;' +
      _chk(false) + ' กรอกประวัติ' + _fld('', 'fld-md') +
    '</div>' +
    '<div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>' +
    '<div class="seal-wrap">' + _collegeSealHtml() + '</div>' +
    '<div class="bottom-block">' +
      '<div class="cover-center">' +
        '<h1>ใบสมัคร ' + _esc(levelLabel) + '</h1>' +
        '<h2>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h2>' +
        '<div class="en">Charansanitwong Technogical College</div>' +
        '<div class="addr">18 ถ.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700<br>' +
        'โทร. 0-2434-6155-7 โทรสาร. 0-2433-3647 www.charansanitwong.ac.th</div>' +
      '</div>' +
      '<hr class="hr">' +
      '<div class="section-title">หลักฐานการสมัครเรียน (เรียงตามหมายเลข)</div>' +
      _checklistHtml(checklistItems) +
    '</div>' +
  '</div>';
}

// ---- Fill page ----
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

  return '<div class="page fill-form" style="padding:8mm">' +
    '<div class="center b" style="font-size:1.05em;margin-bottom:6px">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>' +

    '<div class="row">' +
      '<span class="b">วันที่สมัคร</span> ' + _dateSlots(s.applyDate) +
      '&emsp;<span class="b">ระดับที่สมัคร ' + levelTitle + '</span> &#8211; รอบ ' +
      _chk(studyRound === 'morning') + ' เช้า ' +
      _chk(studyRound === 'afternoon') + ' บ่าย ' +
      _chk(studyRound === 'dual') + ' ทวิภาคี' +
    '</div>' +

    '<div class="row"><span class="b">1. ข้อมูลส่วนตัว</span></div>' +
    '<div class="row indent">' +
      'นาย/นางสาว/นาง ' + _fld(s.firstName, 'fld-lg') +
      ' นามสกุล ' + _fld(s.lastName, 'fld-lg') +
      ' วัน/เดือน/ปีเกิด ' + _dateSlots(s.birthDate) +
    '</div>' +
    '<div class="row indent">Mr./Miss./Mrs. ' + _fld(((s.firstNameEn || '') + ' ' + (s.lastNameEn || '')).trim(), 'fld-xl') + '</div>' +
    '<div class="row indent">เลขประจำตัวประชาชน ' + _idCardBoxes(s.idCard) + '</div>' +
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

    '<div class="section-title" style="border-bottom:1.5px solid #000;padding-bottom:2px;margin-top:12px;margin-bottom:8px">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>' +

    '<div class="row">&#8211; ชื่อบิดา นาย ' + _fld(father.firstName, 'fld-md') + ' นามสกุล ' + _fld(father.lastName, 'fld-md') + ' อาชีพ ' + _fld(father.occupation, 'fld-sm') + ' โทรศัพท์ ' + _fld(father.phone, 'fld-md') + '</div>' +
    '<div class="row indent">ชื่อบิดา(ภาษาอังกฤษ) Mr. ' + _fld(((father.firstNameEn || '') + ' ' + (father.lastNameEn || '')).trim(), 'fld-xl') + '</div>' +
    '<div class="row indent">เลขประจำตัวประชาชน ' + _idCardBoxes(father.idCard) + '</div>' +

    '<div class="row">&#8211; ชื่อมารดา น.ส./นาง ' + _fld(mother.firstName, 'fld-md') + ' นามสกุล ' + _fld(mother.lastName, 'fld-md') + ' อาชีพ ' + _fld(mother.occupation, 'fld-sm') + ' โทรศัพท์ ' + _fld(mother.phone, 'fld-md') + '</div>' +
    '<div class="row indent">ชื่อมารดา(ภาษาอังกฤษ) Miss./Mrs. ' + _fld(((mother.firstNameEn || '') + ' ' + (mother.lastNameEn || '')).trim(), 'fld-xl') + '</div>' +
    '<div class="row indent">เลขประจำตัวประชาชน ' + _idCardBoxes(mother.idCard) + '</div>' +

    '<div class="row">&#8211; ชื่อผู้ปกครอง <span style="font-size:0.8em">(กรณีที่ไม่ได้อยู่กับบิดา มารดา)</span> นาย/นางสาว/นาง ' + _fld(fatherName.trim(), 'fld-lg') + ' อาชีพ ' + _fld(guardian.occupation, 'fld-sm') + '</div>' +
    '<div class="row indent">เกี่ยวข้องเป็น ' + _fld(guardian.relation, 'fld-sm') + ' โทรศัพท์ ' + _fld(guardian.phone, 'fld-md') + ' ที่อยู่ ' + _fld('', 'fld-xl') + '</div>' +

    '<div class="row" style="margin-top:8px">' +
      '&emsp;&emsp;&emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์' +
    '</div>' +

    '<div class="sig-grid">' +
      '<div>ลงชื่อ..............................................ผู้สมัคร<br>(' + _esc((s.prefix || '') + (s.firstName || '') + ' ' + (s.lastName || '')) + ')<br>' + _dateSlots(null) + '</div>' +
      '<div>ลงชื่อ..............................................ผู้ปกครอง<br>(' + _esc(fatherName.trim()) + ')<br>' + _dateSlots(null) + '</div>' +
      '<div>ลงชื่อ..............................................ผู้รับสมัคร<br>(............................................)<br>' + _dateSlots(null) + '</div>' +
      '<div>ลงชื่อ..............................................ฝ่ายการเงิน<br>(............................................)<br>' + _dateSlots(null) + '</div>' +
    '</div>' +

    '<div class="row" style="margin-top:10px"><span class="b">บันทึกฝ่ายการเงิน</span></div>' +
    '<div class="finance-line"></div><div class="finance-line"></div>' +
  '</div>';
}

// ---- Document pages (docs already carry a signed .url) ----
function _docPages(docs, studentName) {
  var labels = {
    id_card_front: 'สำเนาบัตรประจำตัวประชาชน (ด้านหน้า)',
    id_card_back: 'สำเนาบัตรประจำตัวประชาชน (ด้านหลัง)',
    house_reg: 'สำเนาทะเบียนบ้าน',
    edu_cert_front: 'สำเนาวุฒิการศึกษา (ด้านหน้า)',
    edu_cert_back: 'สำเนาวุฒิการศึกษา (ด้านหลัง)',
    edu_cert: 'สำเนาวุฒิการศึกษา',
    payment_slip: 'หลักฐานการชำระเงิน',
  };
  var sigBlock = '<div class="doc-sig"><div class="sig-line" style="width:260px;margin:30px auto 4px"></div>(' + _esc(studentName) + ')<br><span style="font-size:0.8rem;color:#555">ผู้สมัคร</span></div>';

  var idCardBlock = function (doc, sideLabel) {
    var img = doc && doc.url
      ? '<img src="' + doc.url + '" class="idcard-img" alt="' + _esc(sideLabel) + '">'
      : '<div class="idcard-placeholder">(ไม่มีรูป' + _esc(sideLabel) + ')</div>';
    return '<div class="idcard-item">' + img + '<div class="idcard-cap">' + _esc(sideLabel) + '</div></div>';
  };

  var front = docs.filter(function (d) { return d.doc_type === 'id_card_front'; })[0];
  var back = docs.filter(function (d) { return d.doc_type === 'id_card_back'; })[0];
  var idCardPage = '';
  if (front || back) {
    idCardPage = '<div class="page doc-page"><div class="doc-page-inner"><div class="doc-page-content">' +
      '<div class="doc-title">สำเนาบัตรประจำตัวประชาชน</div>' +
      '<div class="idcard-stack">' + idCardBlock(front, 'ด้านหน้า') + idCardBlock(back, 'ด้านหลัง') + '</div>' +
      '<div class="stamp-wrap"><span class="stamp">สำเนาถูกต้อง</span></div>' +
      sigBlock +
    '</div></div></div>';
  }

  var restPages = docs.filter(function (d) {
    return d.doc_type !== 'id_card_front' && d.doc_type !== 'id_card_back';
  }).map(function (doc) {
    var label = labels[doc.doc_type] || doc.doc_type;
    var img = doc.url
      ? '<img src="' + doc.url + '" class="doc-img" alt="' + _esc(label) + '">'
      : '<div class="doc-placeholder">(ไม่มีรูปเอกสาร)</div>';
    return '<div class="page doc-page"><div class="doc-page-inner"><div class="doc-page-content">' +
      '<div class="doc-title">' + _esc(label) + '</div>' + img +
      '<div class="stamp-wrap"><span class="stamp">สำเนาถูกต้อง</span></div>' +
      sigBlock +
    '</div></div></div>';
  }).join('');

  return idCardPage + restPages;
}

function _roundKey(roundLabel) {
  roundLabel = roundLabel || '';
  if (roundLabel.indexOf('เช้า') !== -1) return 'morning';
  if (roundLabel.indexOf('บ่าย') !== -1) return 'afternoon';
  if (roundLabel.indexOf('ทวิภาคี') !== -1) return 'dual';
  return '';
}

function _buildFormHtml(isPvs, s, addr, father, mother, guardian, docs, branchName, roundLabelRaw) {
  var studyRound = _roundKey(roundLabelRaw);
  var roundLabel = { morning: 'เช้า', afternoon: 'บ่าย', dual: 'ทวิภาคี' }[studyRound] || '';
  var fullName = (s.prefix || '') + (s.firstName || '') + ' ' + (s.lastName || '');
  var hasDoc = function (t) { return docs.some(function (d) { return d.doc_type === t; }); };
  var level = isPvs ? 'pvs' : 'pvch';
  var extraRow = isPvs
    ? (_chk(false) + ' กู้ยศ.&emsp;' + _chk(false) + ' อื่นๆ' + _fld('', 'fld-md'))
    : (_chk(false) + ' ทุนสัณห์ พรนิมิตร&emsp;' + _chk(false) + ' กู้ยศ.&emsp;' + _chk(false) + ' อื่นๆ' + _fld('', 'fld-md'));

  var page1 = _coverPage(isPvs ? 'ปวส.' : 'ปวช.', fullName, roundLabel, s, _checklistItems(level, hasDoc), extraRow);
  var page2 = _fillPage(level, s, addr, father, mother, guardian, studyRound, branchName);
  var docPages = _docPages(docs, fullName);
  return page1 + page2 + docPages;
}

// ---- Data fetching + page assembly ----
// Returns true for both full admins (admin_users) and active staff
// (staff.user_id, is_active = true) — matches admin.js's _checkAccess.
async function _isAdmin() {
  const { data: { user } } = await _sb.auth.getUser();
  if (!user) return false;
  const { data: adminRow } = await _sb.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (adminRow) return true;
  const { data: staffRow } = await _sb.from('staff').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  return !!staffRow;
}

async function _loadStudent(studentId) {
  const { data: s, error } = await _sb
    .from('students')
    .select(`
      id, application_no, prefix, first_name, last_name, first_name_en, last_name_en,
      nationality, ethnicity, religion, weight, height, blood_type,
      id_card, phone, birth_date, applied_at, education, old_school,
      addresses(province_text, district_text, subdistrict_text, zipcode),
      parents(type, id_card, prefix, first_name, last_name, first_name_en, last_name_en, phone, occupation),
      guardians(id_card, prefix, first_name, last_name, phone, relation),
      enrollments(program_rounds(round_label, branches(name, education_levels(name)))),
      documents(id, doc_type, storage_path, uploaded_at)
    `)
    .eq('id', studentId)
    .single();
  if (error) throw error;
  return s;
}

// Rows above come back snake_case; the page-builder functions
// (ported straight from PDF_Generator.gs) expect camelCase.
function _camelPerson(row) {
  if (!row) return {};
  return {
    idCard: row.id_card, prefix: row.prefix, firstName: row.first_name, lastName: row.last_name,
    firstNameEn: row.first_name_en, lastNameEn: row.last_name_en,
    phone: row.phone, occupation: row.occupation, relation: row.relation,
  };
}

async function _signDocUrls(docs) {
  const withUrls = [];
  for (const d of docs) {
    const { data } = await _sb.storage.from('documents').createSignedUrl(d.storage_path, 3600);
    withUrls.push({ ...d, url: data?.signedUrl || '' });
  }
  return withUrls;
}

async function init() {
  const root = document.getElementById('root');
  const params = new URLSearchParams(location.search);
  const studentId = params.get('studentId');

  if (!studentId) { root.textContent = 'ไม่พบ studentId'; return; }

  const { data: { session } } = await _sb.auth.getSession();
  if (!session || !(await _isAdmin())) {
    root.innerHTML = 'กรุณาเข้าสู่ระบบแอดมินก่อน — <a href="' + REQUIRED_LOGIN_REDIRECT + '">ไปหน้าเข้าสู่ระบบ</a>';
    return;
  }

  root.textContent = 'กำลังโหลดข้อมูล...';

  let s;
  try {
    s = await _loadStudent(studentId);
  } catch (err) {
    root.textContent = 'ไม่พบข้อมูลนักเรียน: ' + err.message;
    return;
  }

  const addrRow = Array.isArray(s.addresses) ? s.addresses[0] : s.addresses;
  const addr = {
    subDistrict: addrRow?.subdistrict_text || '',
    district: addrRow?.district_text || '',
    province: addrRow?.province_text || '',
    zipcode: addrRow?.zipcode || '',
  };
  const father = _camelPerson((s.parents || []).find(p => p.type === 'father'));
  const mother = _camelPerson((s.parents || []).find(p => p.type === 'mother'));
  const guardian = _camelPerson(Array.isArray(s.guardians) ? s.guardians[0] : s.guardians);
  const enroll = Array.isArray(s.enrollments) ? s.enrollments[0] : s.enrollments;
  const branch = enroll?.program_rounds?.branches;
  const branchName = branch?.name || '';
  const levelName = branch?.education_levels?.name || '';
  const isPvs = (levelName || s.education || '').indexOf('ปวส') !== -1;

  const student = {
    idCard: s.id_card, prefix: s.prefix, firstName: s.first_name, lastName: s.last_name,
    firstNameEn: s.first_name_en, lastNameEn: s.last_name_en,
    nationality: s.nationality, ethnicity: s.ethnicity, religion: s.religion,
    weight: s.weight, height: s.height, bloodType: s.blood_type,
    birthDate: s.birth_date, phone: s.phone, education: s.education, oldSchool: s.old_school,
    applyDate: s.applied_at, applicationNo: s.application_no,
  };

  const docs = await _signDocUrls(s.documents || []);

  document.title = 'ใบสมัคร ' + (isPvs ? 'ปวส.' : 'ปวช.') + ' — ' + (student.applicationNo || '');
  const style = document.createElement('style');
  style.textContent = FORM_CSS;
  document.head.appendChild(style);

  root.innerHTML =
    '<button class="print-btn no-print" id="btn-print">🖨️ พิมพ์ / บันทึก PDF</button>' +
    _buildFormHtml(isPvs, student, addr, father, mother, guardian, docs, branchName, enroll?.program_rounds?.round_label);

  document.getElementById('btn-print').onclick = () => window.print();
}

init();
