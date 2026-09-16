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

// English title matching the Thai prefix, so the "Mr./Miss./Mrs." line
// shows the one that actually applies instead of listing all three.
function _enTitle(prefixTh) {
  if (prefixTh === 'นาย' || prefixTh === 'เด็กชาย') return 'Mr.';
  if (prefixTh === 'นาง') return 'Mrs.';
  return 'Miss.'; // นางสาว, เด็กหญิง, or unset
}

function _fld(value, sizeClass) {
  return '<span class="fld ' + (sizeClass || '') + '">' + _esc(value) + '</span>';
}

// Editable version of _fld — used on print.html so an admin can correct
// data straight on the printed form and save it back, instead of only
// through the separate dashboard edit fields. `table`/`col` say which
// Supabase column this maps to; `rowId` is that row's id (blank when
// the row doesn't exist yet — e.g. no father/guardian on file — in
// which case `newRowMeta` carries what _saveEdits() needs to insert one:
// {student_id, type} for parents/guardians.
function _efld(value, sizeClass, table, col, rowId, newRowMeta) {
  return _efldGroup(sizeClass, [{ value: value, table: table, col: col, id: rowId, newRowMeta: newRowMeta }]);
}

// Cells belonging to the same _efldGroup/_idCardBoxes call share a
// "seq" so _saveEdits() knows to concatenate them (e.g. 13 id-card
// digit boxes, or a name's prefix/first/last parts) — as opposed to two
// *separate* calls that happen to show the same column (the address
// block appears twice on the form): those must NOT be concatenated
// together, just take whichever was edited most recently.
var _efldSeq = 0;

// One editable cell: `part` is either a plain string (rendered as-is,
// not editable — e.g. the space between first/last name) or
// {value, table, col, id, newRowMeta, datepart}. `datepart` ('d'/'m'/'y')
// marks one of a _efldDate()'s three boxes so _saveEdits() composes them
// into one ISO date instead of concatenating their text.
function _ecell(part, seq) {
  if (typeof part === 'string') return _esc(part);
  var attrs = ' class="ecell" contenteditable="true" data-table="' + part.table + '" data-col="' + part.col + '"' +
    ' data-id="' + (part.id || '') + '" data-seq="' + seq + '"';
  if (!part.id && part.newRowMeta) attrs += ' data-new="' + _esc(JSON.stringify(part.newRowMeta)).replace(/"/g, '&quot;') + '"';
  if (part.datepart) attrs += ' data-datepart="' + part.datepart + '"';
  return '<span' + attrs + '>' + _esc(part.value) + '</span>';
}

// A _fld-styled box that can hold several independently-editable cells
// glued together with no visible seam — e.g. "ชื่อ-นามสกุล" is one
// printed field but three Supabase columns (prefix/first_name/
// last_name). Each part maps to its own column, so splitting/combining
// text on save is never guessed — the columns were never actually
// merged, just displayed together.
function _efldGroup(sizeClass, parts) {
  var seq = _efldSeq++;
  return '<span class="fld editable ' + (sizeClass || '') + '">' + parts.map(function (p) { return _ecell(p, seq); }).join('') + '</span>';
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

// Editable version of _dateSlots — three independently-editable boxes
// (day/month/Buddhist-era year), each tagged with data-datepart so
// _saveEdits() composes them into one ISO date instead of concatenating
// their text like a regular _efldGroup.
function _efldDate(d, table, col, rowId, newRowMeta) {
  var day = '', month = '', year = '';
  if (d) {
    var dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      day = String(dt.getDate());
      month = String(dt.getMonth() + 1);
      year = String(dt.getFullYear() + 543);
    }
  }
  var seq = _efldSeq++;
  var box = function (value, sizeClass, part) {
    return '<span class="fld editable ' + sizeClass + '">' +
      _ecell({ value: value, table: table, col: col, id: rowId, newRowMeta: newRowMeta, datepart: part }, seq) +
      '</span>';
  };
  return box(day, 'fld-date', 'd') + '/' + box(month, 'fld-date', 'm') + '/' + box(year, 'fld-date2', 'y');
}

// `edit`, when given ({table, col, id, newRowMeta}), makes each digit box
// independently contenteditable but all 13 sharing the same
// table/col/id — _saveEdits() concatenates same-column cells in DOM
// order back into one id-card string, same mechanism as _efldGroup.
function _idCardBoxes(idCard, edit) {
  var digits = String(idCard || '').replace(/\D/g, '');
  var groupLens = [1, 4, 5, 2, 1];
  var pos = 0;
  var seq = edit ? _efldSeq++ : null;
  var html = '<span class="idwrap' + (edit ? ' editable' : '') + '">';
  for (var gi = 0; gi < groupLens.length; gi++) {
    if (gi > 0) html += '<span class="idgap"></span>';
    for (var i = 0; i < groupLens[gi]; i++) {
      var digit = digits[pos] || '';
      html += edit
        ? _ecell({ value: digit, table: edit.table, col: edit.col, id: edit.id, newRowMeta: edit.newRowMeta }, seq).replace('class="ecell"', 'class="ecell idbox"')
        : '<span class="idbox">' + digit + '</span>';
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
  '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  'html{font-size:11.5px}',
  'body{font-family:"Sarabun","TH Sarabun New",sans-serif;color:#000;background:#fff;line-height:1.5}',
  '.fill-form{font-size:1.08rem;height:280mm;display:flex;flex-direction:column;overflow:hidden}',
  '.fill-main{flex:0 0 auto}',
  '.finance-fill{position:relative;flex:1 1 auto;margin-top:6px;background-image:repeating-linear-gradient(to bottom,transparent,transparent 23px,#888 23px 24px)}',
  '.finance-box{position:absolute;top:0;left:0;right:0;border:2px solid #000;padding:8px 12px;text-align:center;background:#fff}',
  '.page{box-sizing:border-box;position:relative;width:100%;min-height:280mm;padding:15mm;page-break-after:always}',
  '.page:last-child{page-break-after:avoid}',
  '.cover-page{height:280mm}',
  '@media print{.no-print{display:none!important}}',
  '@media screen{body{background:#ddd;overflow-x:auto}.page{background:#fff;width:210mm;max-width:210mm;min-width:210mm;margin:0 auto 18px;padding:15mm;box-shadow:0 2px 12px rgba(0,0,0,.25)}}',

  '.chk{font-weight:700;white-space:nowrap;font-family:monospace}',
  // vertical-align:bottom keeps every .fld's baseline consistent whether
  // it holds text or is empty — an empty inline-block otherwise uses its
  // own bottom margin edge as its baseline instead of the surrounding
  // text's baseline, making it sit at a different height than its
  // siblings on the same line (e.g. an unfilled "ห้อง" field next to a
  // filled "รอบ" field on the cover page's top row).
  // An empty inline-block has no content to establish a line box, so a
  // blank .fld collapses to ~0 height — invisible and unclickable, which
  // is exactly wrong for a blank *editable* field. line-height gives it a
  // real height regardless of whether it currently holds any text.
  '.fld{display:inline-block;vertical-align:bottom;border-bottom:1px dotted #000;min-width:70px;min-height:1.3em;padding:0 3px;text-align:center}',
  '.fld-xs{min-width:34px}.fld-sm{min-width:55px}.fld-md{min-width:110px}.fld-lg{min-width:170px}.fld-xl{min-width:250px}',
  '.fld-date{min-width:22px}.fld-date2{min-width:38px}',
  '.fill-form .row{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 6px}',
  // Every .fld used to share row width equally (flex:1 1 40px) regardless
  // of its fld-xs/sm/md/lg/xl size class, since this rule's higher
  // specificity (two classes) overrode the plain .fld-lg etc rules above.
  // That's why a short field (e.g. ปวช. สาขา) next to a long one (โรงเรียน)
  // could claim just as much space, starving the long field and forcing
  // its text to wrap onto a second line. Scaling flex-grow by size class
  // instead lets longer fields actually claim more of the row.
  '.fill-form .fld{flex:1 1 40px;min-width:0}',
  '.fill-form .fld-xs{flex:0.5 1 30px}',
  '.fill-form .fld-sm{flex:0.8 1 40px}',
  '.fill-form .fld-md{flex:1.6 1 60px}',
  '.fill-form .fld-lg{flex:2.6 1 90px}',
  '.fill-form .fld-xl{flex:3.6 1 120px}',
  '.fill-form .fld-date{flex:0 0 auto;min-width:22px}',
  '.fill-form .fld-date2{flex:0 0 auto;min-width:38px}',

  '.idwrap{display:inline-block;vertical-align:middle}',
  '.idbox{display:inline-block;width:15px;height:18px;border:1px solid #000;font-weight:700;font-size:11px;text-align:center;line-height:18px;vertical-align:middle}',
  '.idgap{display:inline-block;width:4px}',
  '.big-idcode{position:relative;display:inline-block;width:1px;height:1px;vertical-align:bottom}',
  '.big-idcode .idwrap{position:absolute;left:0;bottom:0;white-space:nowrap}',
  '.big-idcode .idbox{width:22.5px;height:27px;font-size:16.5px;line-height:27px}',

  '.row{margin:4px 0}',
  '.indent{padding-left:20px}',
  '.b{font-weight:700}',
  '.center{text-align:center}',
  '.branch-row{}',
  '.branch-item{white-space:nowrap;margin-right:14px;display:inline-block}',

  '.top-row{}',
  '.top-row .name-fld{font-size:1.3rem;font-weight:700}',
  '.photo-box{width:86px;height:104px;border:1px solid #000;position:absolute;top:34mm;right:15mm;display:flex;align-items:center;justify-content:center;font-size:0.75rem;text-align:center;color:#555}',
  '.seal-wrap{position:absolute;top:38%;left:15mm;right:15mm;transform:translateY(-50%);text-align:center}',
  '.bottom-block{position:absolute;bottom:15mm;left:15mm;right:15mm}',
  '.cover-center{text-align:center}',
  '.seal{width:104mm;height:auto;display:block;margin:0 auto}',
  '.cover-center h1{font-size:2.856rem;margin:2px 0 0}',
  '.cover-center h2{font-size:1.932rem;margin:2px 0}',
  '.cover-center .en{font-size:1.428rem}',
  '.cover-center .addr{font-size:1.344rem;color:#222;margin-top:3px;line-height:1.4}',
  '.hr{border:none;border-top:1.5px solid #000;margin:8px 0 6px}',

  '.section-title{font-weight:700;margin:6px 0 4px;font-size:1.08em}',
  '.checklist{margin-top:4px}',
  '.checklist>div{display:inline-block;width:49%;vertical-align:top;white-space:nowrap;margin-bottom:3px}',

  '.sig-grid{margin-top:16px;text-align:center}',
  '.sig-grid>div{display:inline-block;width:48%;vertical-align:top;margin-bottom:14px;padding-top:10px;line-height:1.6}',
  '.sig-line{border-bottom:1px solid #000;height:34px;margin:0 10px}',
  '.sig-blank{display:inline-block;width:180px;border-bottom:1px dotted #000;height:1.4em;vertical-align:bottom;margin:0 4px}',

  '.print-btn{position:fixed;bottom:16px;right:16px;background:#009900;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:999}',
  '.save-btn{position:fixed;bottom:16px;right:170px;background:#0066cc;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-family:inherit;font-size:0.9rem;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:999}',
  '@media screen{.fld.editable{cursor:text;background:#FFF3B0;border-radius:2px}.fld.editable:hover{background:#FFE580}.ecell:focus{outline:2px solid #0066cc;outline-offset:1px;background:#fff}}',
  '@media print{.fld.editable{background:transparent}}',
  '@media screen{.idwrap.editable .idbox{cursor:text;background:#FFF3B0}.idwrap.editable .idbox:hover{background:#FFE580}.idwrap.editable .idbox:focus{outline:2px solid #0066cc;outline-offset:-2px;background:#fff}}',
  '@media print{.idwrap.editable .idbox{background:transparent}}',

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

// The cover page's ชื่อ-นามสกุล field is deliberately bigger/bolder
// than the rest of the form (see #83) — fine for a typical name, but a
// long one at that size overflows past where "ห้อง"/"รอบ" sit on the
// same line. Scale the font down as the name gets longer instead of
// letting it overflow.
function _nameFontSize(name) {
  var len = (name || '').length;
  if (len <= 18) return '1.3rem';
  if (len <= 24) return '1.1rem';
  if (len <= 30) return '0.95rem';
  return '0.85rem';
}

// ---- Cover page ----
function _coverPage(levelLabel, fullName, roundLabel, s, checklistItems, extraRow) {
  var nameFld = '<span class="fld fld-lg name-fld" style="font-size:' + _nameFontSize(fullName) + '">' + _esc(fullName) + '</span>';
  return '<div class="page cover-page">' +
    '<div class="top-row">ชื่อ-นามสกุล ' + nameFld + '&emsp;ห้อง ' + _fld('', 'fld-sm') + '&emsp;รอบ ' + _fld(roundLabel, 'fld-sm') + '</div>' +
    '<div class="row">' + extraRow + '&emsp;รหัสประจำตัว <span class="big-idcode">' + _plainBoxes(11) + '</span></div>' +
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
        '<div class="en">Charansanitwong Technological College</div>' +
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
function _fillPage(level, s, addr, father, mother, guardian, studyRound, branchName, studyCategory, workLocation) {
  var isPvs = level === 'pvs';
  var levelTitle = isPvs ? 'ปวส.' : 'ปวช.';
  var roundLabel = { morning: 'เช้า', afternoon: 'บ่าย', dual: 'ทวิภาคี' }[studyRound] || '';
  var edu = String(s.education || '');

  var eduRow;
  if (isPvs) {
    var isPvchGrad = edu.toLowerCase().indexOf('ปวช') !== -1;
    eduRow = '<div class="row"><span class="b">3. จบการศึกษา</span> ' +
      _chk(edu.indexOf('ม.6') !== -1) + ' ม.6 ' +
      _chk(isPvchGrad) + ' ปวช. สาขา (ระบุ) ' + _fld(isPvchGrad ? s.education : '', 'fld-sm') +
      ' โรงเรียน ' + _efld(s.oldSchool, 'fld-lg', 'students', 'old_school', s.id) + '</div>';
  } else {
    eduRow = '<div class="row"><span class="b">3. จบการศึกษา</span> ' +
      _chk(edu.indexOf('ม.3') !== -1) + ' ม.3' +
      ' โรงเรียน/วิทยาลัย ' + _efld(s.oldSchool, 'fld-lg', 'students', 'old_school', s.id) + '</div>';
  }

  var transferRow = isPvs
    ? '<div class="row indent">&#8211; เข้าศึกษา ' + _chk(false) + ' ปวส.2 ' + _chk(false) + ' ปวส.3 ห้อง/รอบ ' + _fld('', 'fld-md') + ' สาขาวิชา ' + _fld('', 'fld-lg') + '</div>'
    : '<div class="row indent">&#8211; เข้าศึกษา ห้อง/รอบ ' + _fld('', 'fld-md') + ' สาขาวิชา ' + _fld('', 'fld-lg') + '</div>';

  var guardianName = (guardian.prefix || '') + (guardian.firstName || '') + ' ' + (guardian.lastName || '');
  // The "ลงชื่อ...ผู้ปกครอง" signature line always needs *someone's* name to
  // put in parens — falling back to father then mother when no separate
  // guardian was given avoids printing a bare "()" (verified against a real
  // printed form where guardian was blank: it showed "()" with nothing
  // inside, unlike the other two blank signature lines which use a dotted
  // placeholder instead).
  var guardianSignName = guardianName.trim()
    || ((father.firstName || father.lastName) ? ((father.prefix || 'นาย') + (father.firstName || '') + ' ' + (father.lastName || '')).trim() : '')
    || ((mother.firstName || mother.lastName) ? ((mother.prefix || 'นาง') + (mother.firstName || '') + ' ' + (mother.lastName || '')).trim() : '');

  return '<div class="page fill-form" style="padding:8mm">' +
    '<div class="fill-main">' +
    '<div class="center b" style="font-size:1.05em;margin-bottom:6px">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>' +

    '<div class="row">' +
      '<span class="b">วันที่สมัคร</span> ' + _dateSlots(s.applyDate) +
    '</div>' +

    '<div class="row"><span class="b">1. ข้อมูลส่วนตัว</span></div>' +
    '<div class="row indent">' +
      'ชื่อ-นามสกุล ' + _efldGroup('fld-xl', [
        { value: s.prefix, table: 'students', col: 'prefix', id: s.id },
        { value: s.firstName, table: 'students', col: 'first_name', id: s.id },
        ' ',
        { value: s.lastName, table: 'students', col: 'last_name', id: s.id },
      ]) +
      ' วัน/เดือน/ปีเกิด ' + _efldDate(s.birthDate, 'students', 'birth_date', s.id) +
    '</div>' +
    '<div class="row indent">' + _enTitle(s.prefix) + ' ' + _efldGroup('', [
        { value: s.firstNameEn, table: 'students', col: 'first_name_en', id: s.id },
        ' ',
        { value: s.lastNameEn, table: 'students', col: 'last_name_en', id: s.id },
      ]).replace('class="fld editable', 'style="text-align:center;flex:0 1 200px;min-width:140px" class="fld editable') +
      '&emsp;เลขประจำตัวประชาชน ' + _idCardBoxes(s.idCard, { table: 'students', col: 'id_card', id: s.id }) + '</div>' +
    '<div class="row indent">' +
      '&#8211; สัญชาติ' + _efld(s.nationality || 'ไทย', 'fld-sm', 'students', 'nationality', s.id) +
      ' เชื้อชาติ' + _efld(s.ethnicity || 'ไทย', 'fld-sm', 'students', 'ethnicity', s.id) +
      ' ศาสนา' + _efld(s.religion || 'พุทธ', 'fld-sm', 'students', 'religion', s.id) +
      ' น้ำหนัก' + _efld(s.weight, 'fld-xs', 'students', 'weight', s.id) +
      ' ส่วนสูง' + _efld(s.height, 'fld-xs', 'students', 'height', s.id) +
      ' หมู่โลหิต' + _efld(s.bloodType, 'fld-xs', 'students', 'blood_type', s.id) +
    '</div>' +

    '<div class="row"><span class="b">2. สาขาวิชาที่สมัคร</span></div>' +
    '<div class="row indent b" style="font-size:1.1em">' +
      'ระดับที่สมัคร ' + _esc(levelTitle) + ' รอบ ' + _esc(roundLabel) + ' สาขาวิชา ' + _esc(branchName) +
      (workLocation ? ' ' + _esc(workLocation) : '') +
    '</div>' +

    eduRow +
    '<div class="row indent">' +
      'ตำบล/แขวง ' + _efld(addr.subDistrict, 'fld-md', 'addresses', 'subdistrict_text', addr.id) +
      ' อำเภอ/เขต ' + _efld(addr.district, 'fld-md', 'addresses', 'district_text', addr.id) +
      ' จังหวัด ' + _efld(addr.province, 'fld-md', 'addresses', 'province_text', addr.id) +
    '</div>' +
    '<div class="row indent">&#8211; กรณีโอนมา จากวิทยาลัย ' + _fld('', 'fld-lg') + ' สาขาวิชา ' + _fld('', 'fld-lg') + '</div>' +
    transferRow +

    // apply.html collects house no./moo/soi/road as one free-text field
    // (not four separate inputs), so there's no reliable way to split it
    // back into these four boxes — print the whole thing in one wide
    // field instead of leaving it permanently blank.
    '<div class="row"><span class="b">4. ที่อยู่ปัจจุบัน</span> ' + _efld(addr.detail, 'fld-xl', 'addresses', 'detail', addr.id) + '</div>' +
    '<div class="row indent">' +
      'ตำบล/แขวง ' + _efld(addr.subDistrict, 'fld-md', 'addresses', 'subdistrict_text', addr.id) +
      ' อำเภอ/เขต ' + _efld(addr.district, 'fld-md', 'addresses', 'district_text', addr.id) +
      ' จังหวัด ' + _efld(addr.province, 'fld-md', 'addresses', 'province_text', addr.id) +
      ' รหัสไปรษณีย์ ' + _efld(addr.zipcode, 'fld-sm', 'addresses', 'zipcode', addr.id) +
    '</div>' +
    '<div class="row indent">โทรศัพท์ ' + _efld(s.phone, 'fld-lg', 'students', 'phone', s.id) + '</div>' +

    '<div class="section-title" style="border-bottom:1.5px solid #000;padding-bottom:2px;margin-top:12px;margin-bottom:8px">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>' +

    '<div class="row">&#8211; ชื่อบิดา นาย ' + _efld(father.firstName, 'fld-md', 'parents', 'first_name', father.id, {student_id: s.id, type: 'father'}) + ' นามสกุล ' + _efld(father.lastName, 'fld-md', 'parents', 'last_name', father.id, {student_id: s.id, type: 'father'}) + ' อาชีพ ' + _efld(father.occupation, 'fld-sm', 'parents', 'occupation', father.id, {student_id: s.id, type: 'father'}) + ' โทรศัพท์ ' + _efld(father.phone, 'fld-md', 'parents', 'phone', father.id, {student_id: s.id, type: 'father'}) + '</div>' +
    '<div class="row indent">ชื่อบิดา(ภาษาอังกฤษ) Mr. ' + _efldGroup('fld-xl', [
        { value: father.firstNameEn, table: 'parents', col: 'first_name_en', id: father.id, newRowMeta: { student_id: s.id, type: 'father' } },
        ' ',
        { value: father.lastNameEn, table: 'parents', col: 'last_name_en', id: father.id, newRowMeta: { student_id: s.id, type: 'father' } },
      ]) + '</div>' +
    '<div class="row indent">เลขประจำตัวประชาชน ' + _idCardBoxes(father.idCard, { table: 'parents', col: 'id_card', id: father.id, newRowMeta: { student_id: s.id, type: 'father' } }) + '</div>' +

    '<div class="row">&#8211; ชื่อมารดา น.ส./นาง ' + _efld(mother.firstName, 'fld-md', 'parents', 'first_name', mother.id, {student_id: s.id, type: 'mother'}) + ' นามสกุล ' + _efld(mother.lastName, 'fld-md', 'parents', 'last_name', mother.id, {student_id: s.id, type: 'mother'}) + ' อาชีพ ' + _efld(mother.occupation, 'fld-sm', 'parents', 'occupation', mother.id, {student_id: s.id, type: 'mother'}) + ' โทรศัพท์ ' + _efld(mother.phone, 'fld-md', 'parents', 'phone', mother.id, {student_id: s.id, type: 'mother'}) + '</div>' +
    '<div class="row indent">ชื่อมารดา(ภาษาอังกฤษ) Miss./Mrs. ' + _efldGroup('fld-xl', [
        { value: mother.firstNameEn, table: 'parents', col: 'first_name_en', id: mother.id, newRowMeta: { student_id: s.id, type: 'mother' } },
        ' ',
        { value: mother.lastNameEn, table: 'parents', col: 'last_name_en', id: mother.id, newRowMeta: { student_id: s.id, type: 'mother' } },
      ]) + '</div>' +
    '<div class="row indent">เลขประจำตัวประชาชน ' + _idCardBoxes(mother.idCard, { table: 'parents', col: 'id_card', id: mother.id, newRowMeta: { student_id: s.id, type: 'mother' } }) + '</div>' +

    '<div class="row">&#8211; ชื่อผู้ปกครอง <span style="font-size:0.8em">(กรณีที่ไม่ได้อยู่กับบิดา มารดา)</span> ชื่อ-นามสกุล ' + _efldGroup('fld-lg', [
        { value: guardian.prefix, table: 'guardians', col: 'prefix', id: guardian.id, newRowMeta: { student_id: s.id } },
        { value: guardian.firstName, table: 'guardians', col: 'first_name', id: guardian.id, newRowMeta: { student_id: s.id } },
        ' ',
        { value: guardian.lastName, table: 'guardians', col: 'last_name', id: guardian.id, newRowMeta: { student_id: s.id } },
      ]) + ' อาชีพ ' + _efld(guardian.occupation, 'fld-sm', 'guardians', 'occupation', guardian.id, {student_id: s.id}) + '</div>' +
    '<div class="row indent">เกี่ยวข้องเป็น ' + _efld(guardian.relation, 'fld-sm', 'guardians', 'relation', guardian.id, {student_id: s.id}) + ' โทรศัพท์ ' + _efld(guardian.phone, 'fld-md', 'guardians', 'phone', guardian.id, {student_id: s.id}) + ' ที่อยู่ ' + _efld(guardian.address, 'fld-xl', 'guardians', 'address', guardian.id, {student_id: s.id}) + '</div>' +
    // Blank continuation line for a long guardian address — one solid
    // dotted line spanning the same width as the row above, with no gap
    // at the start (a hidden label there previously left a visible break
    // before the dots began).
    '<div class="row indent" style="border-bottom:1px dotted #000;height:1.3em"></div>' +

    '<div class="row" style="margin-top:8px">' +
      '&emsp;&emsp;&emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์' +
    '</div>' +

    '<div class="sig-grid">' +
      '<div>ลงชื่อ<span class="sig-blank"></span>ผู้สมัคร<br>(' + _esc((s.prefix || '') + (s.firstName || '') + ' ' + (s.lastName || '')) + ')<br>' + _dateSlots(null) + '</div>' +
      '<div>ลงชื่อ<span class="sig-blank"></span>ผู้ปกครอง<br>(' + (guardianSignName ? _esc(guardianSignName) : '............................................') + ')<br>' + _dateSlots(null) + '</div>' +
      '<div>ลงชื่อ<span class="sig-blank"></span>ผู้รับสมัคร<br>(............................................)<br>' + _dateSlots(null) + '</div>' +
      '<div>ลงชื่อ<span class="sig-blank"></span>ฝ่ายการเงิน<br>(............................................)<br>' + _dateSlots(null) + '</div>' +
    '</div>' +

    '<div class="row" style="margin-top:10px"><span class="b">บันทึกฝ่ายการเงิน</span></div>' +
    '</div>' +
    '<div class="finance-fill"><div class="finance-box"><b>รับเงินค่าลงทะเบียนและค่าธรรมเนียมการศึกษา</b><br>ใบเสร็จ เลขที่...................................&emsp;วันที่ ............/............/...............</div></div>' +
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

function _buildFormHtml(isPvs, s, addr, father, mother, guardian, docs, branchName, roundLabelRaw, studyCategory, workLocation) {
  var studyRound = _roundKey(roundLabelRaw);
  var roundLabel = { morning: 'เช้า', afternoon: 'บ่าย', dual: 'ทวิภาคี' }[studyRound] || '';
  var fullName = (s.prefix || '') + (s.firstName || '') + ' ' + (s.lastName || '');
  var hasDoc = function (t) { return docs.some(function (d) { return d.doc_type === t; }); };
  var level = isPvs ? 'pvs' : 'pvch';
  var extraRow = isPvs
    ? (_chk(false) + ' กู้กยศ.&emsp;' + _chk(false) + ' อื่นๆ' + _fld('', 'fld-md'))
    : (_chk(false) + ' ทุนสัณห์ พรนิมิตร&emsp;' + _chk(false) + ' กู้กยศ.&emsp;' + _chk(false) + ' อื่นๆ' + _fld('', 'fld-md'));

  var page1 = _coverPage(isPvs ? 'ปวส.' : 'ปวช.', fullName, roundLabel, s, _checklistItems(level, hasDoc), extraRow);
  var page2 = _fillPage(level, s, addr, father, mother, guardian, studyRound, branchName, studyCategory, workLocation);
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
      addresses(id, province_text, district_text, subdistrict_text, zipcode, detail),
      parents(id, type, id_card, prefix, first_name, last_name, first_name_en, last_name_en, phone, occupation),
      guardians(id, id_card, prefix, first_name, last_name, phone, relation, address),
      enrollments(study_category, work_location, program_rounds(round_label, branches(name, education_levels(name)))),
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
    id: row.id, idCard: row.id_card, prefix: row.prefix, firstName: row.first_name, lastName: row.last_name,
    firstNameEn: row.first_name_en, lastNameEn: row.last_name_en,
    phone: row.phone, occupation: row.occupation, relation: row.relation, address: row.address,
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
    id: addrRow?.id,
    subDistrict: addrRow?.subdistrict_text || '',
    district: addrRow?.district_text || '',
    province: addrRow?.province_text || '',
    zipcode: addrRow?.zipcode || '',
    detail: addrRow?.detail || '',
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
    id: s.id,
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
    '<button class="save-btn no-print" id="btn-save">💾 บันทึกการแก้ไข</button>' +
    _buildFormHtml(isPvs, student, addr, father, mother, guardian, docs, branchName, enroll?.program_rounds?.round_label, enroll?.study_category, enroll?.work_location);

  document.getElementById('btn-print').onclick = () => window.print();
  document.getElementById('btn-save').onclick = () => _saveEdits(studentId);
  _wireIdBoxInput();
}

// Each id-card digit box is its own contenteditable span (see
// _idCardBoxes) — keep it to one digit and jump to the next box as
// soon as one is typed, so it still behaves like a normal digit-box
// input instead of letting someone type a whole number into one cell.
function _wireIdBoxInput() {
  document.querySelectorAll('.idwrap.editable .idbox').forEach(box => {
    box.addEventListener('input', () => {
      const digit = box.textContent.replace(/\D/g, '').slice(-1);
      box.textContent = digit;
      if (digit) {
        let next = box.nextElementSibling;
        while (next && !next.classList.contains('idbox')) next = next.nextElementSibling;
        if (next) { next.focus(); _placeCaretAtEnd(next); }
      }
    });
  });
}

function _placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// Reads every [contenteditable][data-table] field on the page, groups
// the edits by table+row (new rows — no data-id — are inserted first so
// later edits to the same not-yet-existing father/mother/guardian land
// on one row instead of one insert per field), and writes them back to
// Supabase. Two fields showing the same column (the current address
// block appears twice on the form) both update the same row, so
// whichever was edited last wins — consistent since both start from the
// same value anyway.
async function _saveEdits(studentId) {
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';
  try {
    // Every editable cell — single fields (_efld) and the individual
    // parts of a composite one (_efldGroup: name parts, id-card digit
    // boxes) all render as one plain [contenteditable][data-table] node,
    // so one selector covers both. Cells sharing the same table+col+row
    // AND the same data-seq (i.e. cells from one _efldGroup/_idCardBoxes
    // call — 13 id-card digit boxes, or a name's prefix/first/last
    // parts) are concatenated in DOM order into one value. A *different*
    // call that happens to show the same column (the address block
    // appears twice on the form, each its own single-cell field with
    // its own seq) is kept separate here and only reduced to "whichever
    // was edited most recently" below — concatenating those together
    // would double the text instead of just picking one.
    const cells = Array.from(document.querySelectorAll('[contenteditable][data-table]'));
    const seqGroups = new Map(); // key -> { table, col, id, isNew, meta, values: [], dateparts: {} }
    cells.forEach(el => {
      const table = el.dataset.table, col = el.dataset.col, id = el.dataset.id, seq = el.dataset.seq;
      const isNew = !id;
      const key = table + '|' + col + '|' + (id || el.dataset.new) + '|' + seq;
      if (!seqGroups.has(key)) {
        seqGroups.set(key, { table, col, id: id || null, isNew, meta: isNew && el.dataset.new ? JSON.parse(el.dataset.new) : null, values: [], dateparts: {} });
      }
      const g = seqGroups.get(key);
      const text = el.textContent.trim();
      g.values.push(text);
      if (el.dataset.datepart) g.dateparts[el.dataset.datepart] = text;
    });

    // A _efldDate() group (day/month/Buddhist-year boxes) composes to one
    // ISO date instead of concatenating its three boxes' text; an
    // incomplete date is skipped rather than written as a bad partial
    // string.
    function _composedValue(g) {
      if (Object.keys(g.dateparts).length === 0) return g.values.join('');
      const { d, m, y } = g.dateparts;
      if (!d || !m || !y) return undefined;
      const ce = parseInt(y, 10) - 543;
      if (!ce || !parseInt(d, 10) || !parseInt(m, 10)) return undefined;
      return ce + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    // Fold groups into per-row patches: existing rows by id, new rows by
    // table+meta (so e.g. father's first_name_en/last_name_en/id_card
    // cells — all "new" since no parents row exists yet — become one
    // insert, not three). Iterating seqGroups in DOM order means a later
    // seq for the same table+col+id simply overwrites patch[col] —
    // that's the "most recently edited wins" behavior for the
    // duplicated address fields.
    const existingRows = new Map();
    const newRows = new Map();
    seqGroups.forEach(g => {
      const value = _composedValue(g);
      if (value === undefined) return;
      if (g.isNew) {
        const key = g.table + '|' + JSON.stringify(g.meta);
        if (!newRows.has(key)) newRows.set(key, { table: g.table, meta: g.meta, patch: {} });
        newRows.get(key).patch[g.col] = value;
      } else {
        const key = g.table + '|' + g.id;
        if (!existingRows.has(key)) existingRows.set(key, { table: g.table, id: g.id, patch: {} });
        existingRows.get(key).patch[g.col] = value;
      }
    });

    // Insert new parent/guardian rows first — only if the admin actually
    // typed something (an all-blank new row isn't worth creating).
    for (const { table, meta, patch } of newRows.values()) {
      if (!Object.values(patch).some(v => v)) continue;
      const { error } = await _sb.from(table).insert({ ...meta, ...patch });
      if (error) throw error;
    }

    for (const { table, id, patch } of existingRows.values()) {
      const { error } = await _sb.from(table).update(patch).eq('id', id);
      if (error) throw error;
    }

    showFormToast('บันทึกข้อมูลแล้ว — กำลังโหลดข้อมูลล่าสุด...');
    location.reload();
  } catch (err) {
    alert('บันทึกล้มเหลว: ' + err.message);
    btn.disabled = false;
    btn.textContent = '💾 บันทึกการแก้ไข';
  }
}

function showFormToast(msg) {
  const el = document.createElement('div');
  el.className = 'no-print';
  el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#0066cc;color:#fff;padding:10px 20px;border-radius:8px;font-weight:700;z-index:1000';
  el.textContent = msg;
  document.body.appendChild(el);
}

init();
