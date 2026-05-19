// ============================================================
// Utils_Print.gs — HTML Print Templates
// ใบสมัคร ปวช. และ ปวส. วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์
// ตรงตามแบบฟอร์มจริงของวิทยาลัย
// ============================================================



// ============================================================
// SHARED CSS
// ============================================================
function _sharedCSS() {
  return `
    @page { size: A4 portrait; margin: 8mm 10mm 10mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 10.5pt; }
    body {
      font-family: 'Sarabun', 'Noto Sans Thai', sans-serif;
      color: #000;
      background: #fff;
      line-height: 1.55;
    }
    .page {
      width: 210mm;
      margin: 0 auto;
      padding: 6mm 10mm 8mm;
      background: #fff;
    }
    @media print {
      html, body { margin: 0; padding: 0; }
      .page { width: 100%; padding: 6mm 8mm 8mm; }
      .no-print { display: none !important; }
      .page-break { page-break-after: always; }
    }

    /* ── ID Card boxes ── */
    .idcard-row { display: inline-flex; align-items: center; gap: 1px; vertical-align: middle; }
    .idbox {
      display: inline-flex; align-items: center; justify-content: center;
      width: 17px; height: 17px;
      border: 1px solid #000;
      font-size: 10.5pt; font-weight: 700;
      line-height: 1;
    }
    .idbox-gap { width: 4px; }

    /* ── Checkbox / Radio ── */
    .cb {
      display: inline-block;
      width: 12px; height: 12px;
      border: 1px solid #000;
      text-align: center; line-height: 11px;
      font-size: 10pt; font-weight: 700;
      vertical-align: middle;
      position: relative; top: -1px;
      flex-shrink: 0;
    }
    .cb.checked::after { content: '/'; }

    /* ── Underlines ── */
    .ul { display: inline-block; border-bottom: 1px solid #000; vertical-align: bottom; padding: 0 2px; min-width: 80px; }
    .ul-xs  { min-width: 40px; }
    .ul-sm  { min-width: 70px; }
    .ul-md  { min-width: 130px; }
    .ul-lg  { min-width: 180px; }
    .ul-xl  { min-width: 260px; }
    .ul-xxl { min-width: 340px; }

    /* ── Form sections ── */
    .form-row  { margin: 4px 0; line-height: 1.8; }
    .indent    { padding-left: 28px; }
    .indent2   { padding-left: 16px; }
    .bold      { font-weight: 700; }
    .center    { text-align: center; }
    .right     { text-align: right; }

    /* ── Section ── */
    .section-bar {
      font-weight: 700;
      font-size: 10.5pt;
      margin: 6px 0 4px;
    }

    /* ── Signature grid ── */
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 20px;
      margin-top: 12px;
    }
    .sig-box { text-align: center; font-size: 9.5pt; }
    .sig-line {
      border-bottom: 1px solid #000;
      margin: 32px 8px 4px;
    }

    /* ── Finance notes ── */
    .finance-notes {
      margin-top: 10px;
      font-size: 9.5pt;
    }
    .finance-line {
      border-bottom: 1px dotted #888;
      margin: 6px 0;
      height: 14px;
    }

    /* ── Cover page logo area ── */
    .cover-center { text-align: center; margin: 8px 0; }
    .cover-logo {
      width: 140px; height: 140px;
      object-fit: contain;
      display: block; margin: 0 auto;
    }
    .cover-logo-placeholder {
      width: 140px; height: 140px;
      border: 2px solid #000;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto;
      font-size: 70px;
    }
    .cover-title {
      font-size: 28pt;
      font-weight: 700;
      margin-top: 8px;
      line-height: 1.3;
    }
    .cover-subtitle {
      font-size: 16pt;
      font-weight: 700;
      margin-top: 2px;
    }
    .cover-en {
      font-size: 10pt;
      margin-top: 2px;
    }
    .cover-addr {
      font-size: 9.5pt;
      line-height: 1.6;
      margin-top: 4px;
      color: #222;
    }
    .cover-divider {
      border-top: 1.5px solid #000;
      margin: 10px 0 6px;
    }

    /* ── Photo box ── */
    .photo-box {
      width: 90px; height: 110px;
      border: 1px solid #000;
      display: flex; align-items: center; justify-content: center;
      font-size: 9pt; text-align: center; color: #555;
      float: right; margin-left: 8px;
    }

    /* ── Top meta row ── */
    .top-meta {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 4px;
      font-size: 10pt;
      margin-bottom: 4px;
    }

    /* ── Checklist ── */
    .checklist {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 20px;
      font-size: 9.5pt;
      margin-top: 6px;
    }
    .checklist-item { display: flex; align-items: flex-start; gap: 4px; }

    /* ── Document page ── */
    .doc-page-title {
      font-size: 14pt; font-weight: 700;
      text-align: center; margin-bottom: 10px;
    }
    .doc-img-wrap {
      text-align: center;
      margin: 0 auto;
    }
    .doc-img {
      max-width: 90%;
      max-height: 170mm;
      border: 1px solid #ccc;
      display: block;
      margin: 0 auto;
    }
    .stamp-wrap { text-align: right; margin-top: 14px; padding-right: 20px; }
    .stamp {
      display: inline-block;
      border: 2.5px solid #CC0000;
      border-radius: 8px;
      padding: 5px 18px;
      color: #CC0000;
      font-weight: 700;
      font-size: 13pt;
    }
    .sig-name-center {
      text-align: center;
      margin: 10px auto 0;
      width: 260px;
    }
    .sig-name-line { border-bottom: 1px solid #000; height: 36px; }

    /* ── Print button ── */
    .print-btn {
      position: fixed; bottom: 20px; right: 20px;
      background: #009900; color: #fff;
      border: none; border-radius: 8px;
      padding: 12px 24px;
      font-family: 'Sarabun', sans-serif;
      font-size: 15px; font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,153,0,0.35);
      z-index: 999;
    }
    @media print { .print-btn { display: none; } }
  `;
}

// ============================================================
// HELPER: ID Card boxes
// ============================================================
function _idBoxes(idCard) {
  const digits = (idCard || '').replace(/\D/g, '').padEnd(13, ' ');
  // แบ่ง 1-4-5-2-1
  const groups = [
    digits.substring(0, 1),
    digits.substring(1, 5),
    digits.substring(5, 10),
    digits.substring(10, 12),
    digits.substring(12, 13),
  ];
  return `<span class="idcard-row">` +
    groups.map((g, gi) =>
      (gi > 0 ? '<span class="idbox-gap"></span>' : '') +
      g.split('').map(ch =>
        `<span class="idbox">${ch.trim()}</span>`
      ).join('')
    ).join('') +
    `</span>`;
}

// ============================================================
// HELPER: Checkbox
// ============================================================
function _cb(checked) {
  return `<span class="cb${checked ? ' checked' : ''}"></span>`;
}

// ============================================================
// HELPER: Thai date
// ============================================================
function _thDate(d) {
  if (!d) return '........../.........../..........';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return String(d);
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                    'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()+543}`;
  } catch(e) { return String(d); }
}

// ============================================================
// HELPER: Round checkboxes
// ============================================================
function _roundCBs(studyRound) {
  const m = studyRound || '';
  return `${_cb(m==='morning')} เช้า &nbsp; ${_cb(m==='afternoon')} บ่าย &nbsp; ${_cb(m==='dual')} ทวิภาคี`;
}

// ============================================================
// HELPER: Document section (pages after main form)
// ============================================================
function _docPages(docs, studentName) {
  const labels = {
    'id_card_front': 'สำเนาบัตรประจำตัวประชาชน (ด้านหน้า)',
    'id_card_back':  'สำเนาบัตรประจำตัวประชาชน (ด้านหลัง)',
    'house_reg':     'สำเนาทะเบียนบ้าน',
    'edu_cert_front':'สำเนาวุฒิการศึกษา (ด้านหน้า)',
    'edu_cert_back': 'สำเนาวุฒิการศึกษา (ด้านหลัง)',
    'edu_cert':      'สำเนาวุฒิการศึกษา',
    'payment_slip':  'หลักฐานการชำระเงิน',
  };
  if (!docs || !docs.length) return '';
  return docs.map(doc => {
    const label = labels[doc.type] || doc.type;
    const img   = doc.driveUrl
      ? `<img src="${doc.driveUrl}" class="doc-img" alt="${label}">`
      : `<div style="width:70%;height:120mm;margin:0 auto;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:14px">(ไม่มีรูปเอกสาร)</div>`;
    return `
<div class="page page-break">
  <div class="doc-page-title">${label}</div>
  <div class="doc-img-wrap">${img}</div>
  <div class="stamp-wrap"><div class="stamp">สำเนาถูกต้อง</div></div>
  <div class="sig-name-center">
    <div class="sig-name-line"></div>
    <div style="font-size:10pt">(${studentName})</div>
    <div style="font-size:9pt;color:#555">ผู้สมัคร</div>
  </div>
</div>`;
  }).join('\n');
}

// ============================================================
// ███████████ ปวช. ███████████
// หน้า 1 = ปก
// หน้า 2 = แบบฟอร์มกรอก
// ============================================================
function _buildPvchForm(s, enroll, prog, addr, parents, guardian, docs) {
  const father   = parents.find(p => p.type === 'father') || {};
  const mother   = parents.find(p => p.type === 'mother') || {};
  const fullName = `${s.prefix||''}${s.firstName||''} ${s.lastName||''}`;
  const idDigits = (s.idCard||'').replace(/\D/g,'');
  const studyRound = enroll.studyRound || s.studyRound || '';
  const branchName = prog.branch || enroll.branchName || '';
  const levelName  = prog.level  || 'ปวช.';

  const hasDoc = (t) => docs.some(d => d.type === t);

  // ── Branch checkboxes (ปวช.)
  const branches_pvch = [
    ['การบัญชี','การบัญชี'],
    ['การตลาด','การตลาด'],
    ['ภาษาต่างประเทศธุรกิจบริการ','ภาษาต่างประเทศธุรกิจบริการ'],
    ['ธุรกิจค้าปลีก','ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]'],
    ['เทคโนโลยีธุรกิจดิจิทัล','เทคโนโลยีธุรกิจดิจิทัล'],
    ['เทคโนโลยีสารสนเทศ','เทคโนโลยีสารสนเทศ'],
    ['ดิจิทัลกราฟิก','ดิจิทัลกราฟิก'],
    ['การท่องเที่ยว','การท่องเที่ยว'],
  ];
  const branchRow1 = branches_pvch.slice(0, 4);
  const branchRow2 = branches_pvch.slice(4);

  // ── Education checkboxes
  const eduM3  = (s.education||'').includes('ม.3');
  const eduPvs = (s.education||'').toLowerCase().includes('ปวช') ||
                 (s.education||'').includes('ปวช.');

  const docPages = _docPages(docs, fullName);

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ใบสมัคร ปวช. — ${s.applicationNo||''}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>${_sharedCSS()}</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>

<!-- ══════════════════════════════════════════
     หน้า 1: ปก ใบสมัคร ปวช.
══════════════════════════════════════════ -->
<div class="page page-break">

  <!-- แถวบนสุด -->
  <div class="top-meta">
    <div>นาย/น.ส./นาง <span class="ul ul-lg">${fullName}</span>&ensp;ห้อง <span class="ul ul-xs"></span>&ensp;รอบ <span class="ul ul-xs">${{morning:'เช้า',afternoon:'บ่าย',dual:'ทวิภาคี'}[studyRound]||''}</span></div>
    <div style="font-size:9pt">
      ${_cb(false)} ทุนสัณห์ พรนิมิตร &ensp; ${_cb(false)} กู้ยศ. &ensp; ${_cb(false)} อื่นๆ................&ensp;
      รหัสประจำตัว ${_idBoxes(s.idCard)}
    </div>
  </div>
  <div class="form-row" style="font-size:9pt">
    ${_cb(false)} บันทึก DATA..................... &ensp;
    ${_cb(false)} บันทึก SISA..................... &ensp;
    ${_cb(false)} กรอกประวัติ .....................
  </div>

  <!-- โลโก้กลาง + กล่องรูปถ่าย -->
  <div style="position:relative; margin: 4px 0;">
    <div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>
    <div class="cover-center">
      <div class="cover-logo-placeholder">🏫</div>
      <div class="cover-title">ใบสมัคร ปวช.</div>
      <div class="cover-subtitle">วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</div>
      <div class="cover-en">Charansanitwong Technogical College</div>
      <div class="cover-addr">
        18 ถ.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700<br>
        โทร. 0-2434-6155-7 โทรสาร. 0-2433-3647 www.charansanitwong.ac.th
      </div>
    </div>
    <div style="clear:both"></div>
  </div>

  <div class="cover-divider"></div>

  <!-- หลักฐานการสมัคร -->
  <div class="form-row bold">หลักฐานการสมัครเรียน (เรียงตามหมายเลข)</div>
  <div class="checklist">
    <div class="checklist-item">${_cb(true)} 1. รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ</div>
    <div class="checklist-item">${_cb(hasDoc('id_card_back'))} 6. สำเนาบัตรประจำตัวประชาชนของมารดา 1 ฉบับ</div>
    <div class="checklist-item">${_cb(hasDoc('edu_cert_front')||hasDoc('edu_cert'))} 2. วุฒิการศึกษาฉบับจริง</div>
    <div class="checklist-item">${_cb(hasDoc('id_card_front'))} 7. สำเนาบัตรประจำตัวประชาชนของผู้ปกครอง 1 ฉบับ</div>
    <div class="checklist-item">${_cb(hasDoc('edu_cert_front')||hasDoc('edu_cert'))} 3. สำเนาวุฒิการศึกษา 2 ฉบับ</div>
    <div class="checklist-item">${_cb(hasDoc('house_reg'))} 8. สำเนาทะเบียนบ้านของตนเอง 1 ฉบับ</div>
    <div class="checklist-item">${_cb(hasDoc('id_card_front'))} 4. สำเนาบัตรประจำตัวประชาชนของตนเอง 1 ฉบับ</div>
    <div class="checklist-item">${_cb(false)} 9. สำเนาสูติบัตร 1 ฉบับ</div>
    <div class="checklist-item">${_cb(hasDoc('id_card_front'))} 5. สำเนาบัตรประจำตัวประชาชนของบิดา 1 ฉบับ</div>
    <div class="checklist-item">${_cb(false)} 10. กรณี โอนหน่วยกิต</div>
  </div>

</div><!-- /หน้า 1 ปก -->


<!-- ══════════════════════════════════════════
     หน้า 2: แบบฟอร์มกรอก ปวช.
══════════════════════════════════════════ -->
<div class="page page-break">

  <div class="center bold" style="font-size:12pt; margin-bottom: 4px;">
    (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)
  </div>

  <!-- แถววันที่สมัคร + ระดับ + รอบ -->
  <div class="form-row">
    <span class="bold">วันที่สมัคร</span> <span class="ul ul-md">${_thDate(s.applyDate)}</span>
    &ensp;<span class="bold">ระดับที่สมัคร ปวช.</span> – รอบ
    &nbsp;${_cb(studyRound==='morning')} เช้า
    &nbsp;${_cb(studyRound==='afternoon')} บ่าย
    &nbsp;${_cb(studyRound==='dual')} ทวิภาคี
  </div>

  <!-- ข้อ 1 ข้อมูลส่วนตัว -->
  <div class="form-row">
    <span class="bold">1.</span> นาย/นางสาว/นาง <span class="ul ul-lg">${s.firstName||''}</span>
    &ensp;นามสกุล <span class="ul ul-lg">${s.lastName||''}</span>
    &ensp;วัน/เดือน/ปีเกิด <span class="ul ul-md">${_thDate(s.birthDate)}</span>
  </div>
  <div class="form-row indent">
    Mr./ Miss./Mrs. <span class="ul ul-xl">${s.firstNameEn||s.firstName||''} ${s.lastNameEn||s.lastName||''}</span>
    &ensp;เลขประจำตัวประชาชน ${_idBoxes(s.idCard)}
  </div>
  <div class="form-row indent">
    – สัญชาติ<span class="ul ul-sm">${s.nationality||'ไทย'}</span>
    เชื้อชาติ<span class="ul ul-sm">${s.ethnicity||'ไทย'}</span>
    ศาสนา<span class="ul ul-sm">${s.religion||'พุทธ'}</span>
    น้ำหนัก<span class="ul ul-xs">${s.weight||''}</span>
    ส่วนสูง<span class="ul ul-xs">${s.height||''}</span>
    หมู่โลหิต<span class="ul ul-xs">${s.bloodType||''}</span>
  </div>

  <!-- ข้อ 2 สาขาที่สมัคร -->
  <div class="form-row" style="margin-top:3px;">
    <span class="bold">2. สาขาวิชาที่สมัคร</span>
  </div>
  <div class="form-row indent" style="line-height:2">
    ${branchRow1.map(([key, lbl]) => `${_cb(branchName.includes(key))} ${lbl}&ensp;`).join('')}
  </div>
  <div class="form-row indent" style="line-height:2">
    ${branchRow2.map(([key, lbl]) => `${_cb(branchName.includes(key))} ${lbl}&ensp;`).join('')}
  </div>

  <!-- ข้อ 3 จบการศึกษา -->
  <div class="form-row">
    <span class="bold">3. จบการศึกษา</span>
    &nbsp;${_cb(eduM3)} ม.3 &nbsp;${_cb(eduPvs)} ปวช. สาขา (ระบุ) <span class="ul ul-md">${eduPvs ? s.education : ''}</span>
    &ensp;โรงเรียน/วิทยาลัย <span class="ul ul-lg">${s.oldSchool||''}</span>
  </div>
  <div class="form-row indent">
    ตำบล/แขวง <span class="ul ul-md">${addr.subDistrict||''}</span>
    &ensp;อำเภอ/เขต <span class="ul ul-md">${addr.district||''}</span>
    &ensp;จังหวัด <span class="ul ul-md">${addr.province||''}</span>
  </div>
  <div class="form-row indent">
    – กรณีโอนมา จากวิทยาลัย <span class="ul ul-lg"></span>
    &ensp;สาขาวิชา <span class="ul ul-lg"></span>
  </div>
  <div class="form-row indent">
    – เข้าศึกษา ห้อง/รอบ <span class="ul ul-md"></span>
    &ensp;สาขาวิชา <span class="ul ul-lg"></span>
  </div>

  <!-- ข้อ 4 ที่อยู่ปัจจุบัน -->
  <div class="form-row">
    <span class="bold">4. ที่อยู่ปัจจุบัน</span>
    บ้านเลขที่ <span class="ul ul-xs">${(addr.detail||'').split(' ')[0]||''}</span>
    หมู่ <span class="ul ul-xs"></span>
    ซอย <span class="ul ul-sm"></span>
    ถนน <span class="ul ul-md">${(addr.detail||'').includes('ถนน') ? addr.detail.split('ถนน')[1]||'' : ''}</span>
  </div>
  <div class="form-row indent">
    ตำบล/แขวง <span class="ul ul-md">${addr.subDistrict||''}</span>
    &ensp;อำเภอ/เขต <span class="ul ul-md">${addr.district||''}</span>
    &ensp;จังหวัด <span class="ul ul-md">${addr.province||''}</span>
    &ensp;รหัสไปรษณีย์ <span class="ul ul-sm">${addr.zipcode||''}</span>
  </div>
  <div class="form-row indent">
    โทรศัพท์ <span class="ul ul-lg">${s.phone||''}</span>
  </div>

  <!-- ส่วนที่ 2 มอบตัว -->
  <div class="section-bar" style="margin-top:6px;">
    ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)
  </div>

  <!-- บิดา -->
  <div class="form-row">
    – ชื่อบิดา นาย <span class="ul ul-md">${father.firstName||''}</span>
    &ensp;นามสกุล <span class="ul ul-md">${father.lastName||''}</span>
    &ensp;อาชีพ <span class="ul ul-sm">${father.occupation||''}</span>
    &ensp;โทรศัพท์ <span class="ul ul-md">${father.phone||''}</span>
  </div>
  <div class="form-row indent2">
    ชื่อบิดา(ภาษาอังกฤษ) Mr. <span class="ul ul-xl">${father.firstNameEn||''} ${father.lastNameEn||''}</span>
    &ensp;เลขประจำตัวประชาชน ${_idBoxes(father.idCard)}
  </div>

  <!-- มารดา -->
  <div class="form-row">
    – ชื่อมารดา น.ส./นาง <span class="ul ul-md">${mother.firstName||''}</span>
    &ensp;นามสกุล <span class="ul ul-md">${mother.lastName||''}</span>
    &ensp;อาชีพ <span class="ul ul-sm">${mother.occupation||''}</span>
    &ensp;โทรศัพท์ <span class="ul ul-md">${mother.phone||''}</span>
  </div>
  <div class="form-row indent2">
    ชื่อมารดา(ภาษาอังกฤษ) Miss./Mrs. <span class="ul ul-xl">${mother.firstNameEn||''} ${mother.lastNameEn||''}</span>
    &ensp;เลขประจำตัวประชาชน ${_idBoxes(mother.idCard)}
  </div>

  <!-- ผู้ปกครอง -->
  <div class="form-row">
    – ชื่อผู้ปกครอง <span style="font-size:9pt">(กรณีที่ไม่ได้อยู่กับบิดา มารดา)</span>
    นาย/นางสาว/นาง <span class="ul ul-lg">${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''}</span>
    &ensp;อาชีพ <span class="ul ul-sm">${guardian.occupation||''}</span>
  </div>
  <div class="form-row indent2">
    เกี่ยวข้องเป็น <span class="ul ul-sm">${guardian.relation||''}</span>
    &ensp;โทรศัพท์ <span class="ul ul-md">${guardian.phone||''}</span>
    &ensp;ที่อยู่ <span class="ul ul-xl"></span>
  </div>

  <!-- ยินยอม -->
  <div class="form-row" style="margin-top:6px; font-size:10pt; line-height:1.7">
    &emsp;&emsp;&emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ
    และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์
  </div>

  <!-- ลายเซ็น -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-line"></div>
      ลงชื่อ..............................................ผู้สมัคร<br>
      (${fullName})<br>
      ........../.........../............
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      ลงชื่อ..............................................ผู้ปกครอง<br>
      (${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''})<br>
      ........../.........../............
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      ลงชื่อ..............................................ผู้รับสมัคร<br>
      (............................................)<br>
      ........../.........../............
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      ลงชื่อ..............................................ฝ่ายการเงิน<br>
      (............................................)<br>
      ........../.........../............
    </div>
  </div>

  <!-- บันทึกฝ่ายการเงิน -->
  <div class="finance-notes">
    <div class="bold">บันทึกฝ่ายการเงิน</div>
    <div class="finance-line"></div>
    <div class="finance-line"></div>
    <div class="finance-line"></div>
  </div>

</div><!-- /หน้า 2 ฟอร์ม -->

${docPages}

</body>
</html>`;
}


// ============================================================
// ███████████ ปวส. ███████████
// หน้า 1 = ปก
// หน้า 2 = แบบฟอร์มกรอก
// ============================================================
function _buildPvsForm(s, enroll, prog, addr, parents, guardian, docs) {
  const father   = parents.find(p => p.type === 'father') || {};
  const mother   = parents.find(p => p.type === 'mother') || {};
  const fullName = `${s.prefix||''}${s.firstName||''} ${s.lastName||''}`;
  const idDigits = (s.idCard||'').replace(/\D/g,'');
  const studyRound = enroll.studyRound || s.studyRound || '';
  const branchName = prog.branch || enroll.branchName || '';
  const levelName  = prog.level  || 'ปวส.';

  const hasDoc = (t) => docs.some(d => d.type === t);

  // ── Branch checkboxes (ปวส.)
  const branches_pvs = [
    ['การบัญชี','การบัญชี'],
    ['การตลาด','การตลาด'],
    ['ภาษาและการจัดการธุรกิจระหว่างประเทศ','ภาษาและการจัดการธุรกิจระหว่างประเทศ'],
    ['ธุรกิจค้าปลีก','ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]'],
    ['เทคโนโลยีธุรกิจดิจิทัล','เทคโนโลยีธุรกิจดิจิทัล'],
    ['เทคโนโลยีสารสนเทศ','เทคโนโลยีสารสนเทศ'],
    ['ดิจิทัลกราฟิก','ดิจิทัลกราฟิก'],
    ['การท่องเที่ยว','การท่องเที่ยว'],
    ['การจัดการดูแลผู้สูงอายุ','การจัดการดูแลผู้สูงอายุ'],
    ['การจัดการสำนักงานดิจิทัล','การจัดการสำนักงานดิจิทัล'],
  ];
  const branchRow1 = branches_pvs.slice(0, 4);
  const branchRow2 = branches_pvs.slice(4, 8);
  const branchRow3 = branches_pvs.slice(8);

  // Education
  const eduM6  = (s.education||'').includes('ม.6');
  const eduPvch = (s.education||'').toLowerCase().includes('ปวช') || (s.education||'').includes('ปวช.');

  // ปวส.2 / ปวส.3
  const pvsYear = enroll.pvsYear || s.pvsYear || '';

  const docPages = _docPages(docs, fullName);

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ใบสมัคร ปวส. — ${s.applicationNo||''}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>${_sharedCSS()}</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">🖨️ พิมพ์ / บันทึก PDF</button>

<!-- ══════════════════════════════════════════
     หน้า 1: ปก ใบสมัคร ปวส.
══════════════════════════════════════════ -->
<div class="page page-break">

  <!-- แถวบนสุด -->
  <div class="top-meta">
    <div>นาย/น.ส./นาง <span class="ul ul-lg">${fullName}</span>&ensp;ห้อง <span class="ul ul-xs"></span>&ensp;รอบ <span class="ul ul-xs">${{morning:'เช้า',afternoon:'บ่าย',dual:'ทวิภาคี'}[studyRound]||''}</span></div>
    <div style="font-size:9pt">
      ${_cb(false)} กู้ยศ. &ensp; ${_cb(false)} อื่นๆ.................&ensp;
      รหัสประจำตัว ${_idBoxes(s.idCard)}
    </div>
  </div>
  <div class="form-row" style="font-size:9pt">
    ${_cb(false)} บันทึก DATA..................... &ensp;
    ${_cb(false)} บันทึก SISA..................... &ensp;
    ${_cb(false)} กรอกประวัติ .....................
  </div>

  <!-- โลโก้กลาง + กล่องรูปถ่าย -->
  <div style="position:relative; margin: 4px 0;">
    <div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>
    <div class="cover-center">
      <div class="cover-logo-placeholder">🏫</div>
      <div class="cover-title">ใบสมัคร ปวส.</div>
      <div class="cover-subtitle">วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</div>
      <div class="cover-en">Charansanitwong Technogical College</div>
      <div class="cover-addr">
        18 ถ.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700<br>
        โทร. 0-2434-6155-7 โทรสาร. 0-2433-3647 www.charansanitwong.ac.th
      </div>
    </div>
    <div style="clear:both"></div>
  </div>

  <div class="cover-divider"></div>

  <!-- หลักฐานการสมัคร ปวส. -->
  <div class="form-row bold">หลักฐานการสมัครเรียน (เรียงตามหมายเลข)</div>
  <div class="checklist">
    <div class="checklist-item">${_cb(true)} 1. รูปถ่าย 1" หรือ 2" จำนวน 1 ใบ</div>
    <div class="checklist-item">${_cb(hasDoc('id_card_back'))} 6. สำเนาบัตรประจำตัวประชาชนของมารดา</div>
    <div class="checklist-item">${_cb(hasDoc('edu_cert_front')||hasDoc('edu_cert'))} 2. วุฒิการศึกษาฉบับจริง</div>
    <div class="checklist-item">${_cb(hasDoc('id_card_front'))} 7. สำเนาบัตรประจำตัวประชาชนของผู้ปกครอง 1 ฉบับ</div>
    <div class="checklist-item">${_cb(hasDoc('edu_cert_front')||hasDoc('edu_cert'))} 3. สำเนาวุฒิการศึกษา 2 ฉบับ</div>
    <div class="checklist-item">${_cb(hasDoc('house_reg'))} 8. สำเนาทะเบียนบ้านของตนเอง 1 ฉบับ</div>
    <div class="checklist-item">${_cb(hasDoc('id_card_front'))} 4. สำเนาบัตรประจำตัวประชาชนของตนเอง 1 ฉบับ</div>
    <div class="checklist-item">${_cb(false)} 9. กรณี โอนหน่วยกิต (วุฒิม.3 และรบ.โอน)</div>
    <div class="checklist-item">${_cb(hasDoc('id_card_front'))} 5. สำเนาบัตรประจำตัวประชาชนของบิดา</div>
    <div class="checklist-item"></div>
  </div>

</div><!-- /หน้า 1 ปก ปวส. -->


<!-- ══════════════════════════════════════════
     หน้า 2: แบบฟอร์มกรอก ปวส.
══════════════════════════════════════════ -->
<div class="page page-break">

  <div class="center bold" style="font-size:12pt; margin-bottom: 4px;">
    (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)
  </div>

  <!-- วันที่สมัคร + ระดับ + รอบ -->
  <div class="form-row">
    <span class="bold">วันที่สมัคร</span> <span class="ul ul-md">${_thDate(s.applyDate)}</span>
    &ensp;<span class="bold">ระดับที่สมัคร <u>ปวส.</u></span> – รอบ
    &nbsp;${_cb(studyRound==='morning')} เช้า
    &nbsp;${_cb(studyRound==='afternoon')} บ่าย
    &nbsp;${_cb(studyRound==='dual')} ทวิภาคี
  </div>

  <!-- ข้อ 1 -->
  <div class="form-row">
    <span class="bold">1.</span> นาย/นางสาว/นาง <span class="ul ul-lg">${s.firstName||''}</span>
    &ensp;นามสกุล <span class="ul ul-lg">${s.lastName||''}</span>
    &ensp;วัน/เดือน/ปีเกิด <span class="ul ul-md">${_thDate(s.birthDate)}</span>
  </div>
  <div class="form-row indent">
    Mr./ Miss./Mrs. <span class="ul ul-xl">${s.firstNameEn||s.firstName||''} ${s.lastNameEn||s.lastName||''}</span>
    &ensp;เลขประจำตัวประชาชน ${_idBoxes(s.idCard)}
  </div>
  <div class="form-row indent">
    – สัญชาติ<span class="ul ul-sm">${s.nationality||'ไทย'}</span>
    เชื้อชาติ<span class="ul ul-sm">${s.ethnicity||'ไทย'}</span>
    ศาสนา<span class="ul ul-sm">${s.religion||'พุทธ'}</span>
    น้ำหนัก<span class="ul ul-xs">${s.weight||''}</span>
    ส่วนสูง<span class="ul ul-xs">${s.height||''}</span>
    หมู่โลหิต<span class="ul ul-xs">${s.bloodType||''}</span>
  </div>

  <!-- ข้อ 2 สาขา ปวส. -->
  <div class="form-row" style="margin-top:3px;">
    <span class="bold">2. สาขาวิชาที่สมัคร</span>
    ${_cb(branchName.includes('การบัญชี'))} การบัญชี &ensp;
    ${_cb(branchName.includes('การตลาด'))} การตลาด &ensp;
    ${_cb(branchName.includes('ภาษาต่างประเทศ')||branchName.includes('ภาษาและการจัดการ'))} ภาษาต่างประเทศธุรกิจบริการ &ensp;
    ${_cb(branchName.includes('ธุรกิจค้าปลีก'))} ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]
  </div>
  <div class="form-row indent">
    ${_cb(branchName.includes('เทคโนโลยีธุรกิจดิจิทัล'))} เทคโนโลยีธุรกิจดิจิทัล &ensp;
    ${_cb(branchName.includes('เทคโนโลยีสารสนเทศ'))} เทคโนโลยีสารสนเทศ &ensp;
    ${_cb(branchName.includes('ดิจิทัลกราฟิก'))} ดิจิทัลกราฟิก &ensp;
    ${_cb(branchName.includes('การท่องเที่ยว'))} การท่องเที่ยว
  </div>

  <!-- ข้อ 3 จบการศึกษา ปวส. -->
  <div class="form-row">
    <span class="bold">3. จบการศึกษา</span>
    &nbsp;${_cb(eduM6)} ม.6 &nbsp;${_cb(eduPvch)} ปวช. สาขา (ระบุ) <span class="ul ul-md">${eduPvch ? s.education : ''}</span>
    &ensp;โรงเรียน <span class="ul ul-lg">${s.oldSchool||''}</span>
  </div>
  <div class="form-row indent">
    ตำบล/แขวง <span class="ul ul-md">${addr.subDistrict||''}</span>
    &ensp;อำเภอ/เขต <span class="ul ul-md">${addr.district||''}</span>
    &ensp;จังหวัด <span class="ul ul-md">${addr.province||''}</span>
  </div>
  <div class="form-row indent">
    – กรณีโอนมา จากวิทยาลัย <span class="ul ul-lg"></span>
    &ensp;สาขาวิชา <span class="ul ul-lg"></span>
  </div>
  <div class="form-row indent">
    – เข้าศึกษา ${_cb(pvsYear==='2')} ปวส.2 &nbsp;${_cb(pvsYear==='3')} ปวส.3
    ห้อง/รอบ <span class="ul ul-md"></span>
    &ensp;สาขาวิชา <span class="ul ul-lg"></span>
  </div>

  <!-- ข้อ 4 ที่อยู่ -->
  <div class="form-row">
    <span class="bold">4. ที่อยู่ปัจจุบัน</span>
    บ้านเลขที่ <span class="ul ul-xs">${(addr.detail||'').split(' ')[0]||''}</span>
    หมู่ <span class="ul ul-xs"></span>
    ซอย <span class="ul ul-sm"></span>
    ถนน <span class="ul ul-md"></span>
  </div>
  <div class="form-row indent">
    ตำบล/แขวง <span class="ul ul-md">${addr.subDistrict||''}</span>
    &ensp;อำเภอ/เขต <span class="ul ul-md">${addr.district||''}</span>
    &ensp;จังหวัด <span class="ul ul-md">${addr.province||''}</span>
    &ensp;รหัสไปรษณีย์ <span class="ul ul-sm">${addr.zipcode||''}</span>
  </div>
  <div class="form-row indent">
    โทรศัพท์ <span class="ul ul-lg">${s.phone||''}</span>
  </div>

  <!-- ส่วนที่ 2 มอบตัว ปวส. -->
  <div class="section-bar" style="margin-top:6px;">
    ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)
  </div>

  <!-- บิดา -->
  <div class="form-row">
    – ชื่อบิดา นาย <span class="ul ul-md">${father.firstName||''}</span>
    &ensp;นามสกุล <span class="ul ul-md">${father.lastName||''}</span>
    &ensp;อาชีพ <span class="ul ul-sm">${father.occupation||''}</span>
    &ensp;โทรศัพท์ <span class="ul ul-md">${father.phone||''}</span>
  </div>
  <div class="form-row indent2">
    ชื่อบิดา(ภาษาอังกฤษ) Mr. <span class="ul ul-xl">${father.firstNameEn||''} ${father.lastNameEn||''}</span>
    &ensp;เลขประจำตัวประชาชน ${_idBoxes(father.idCard)}
  </div>

  <!-- มารดา -->
  <div class="form-row">
    – ชื่อมารดา น.ส./นาง <span class="ul ul-md">${mother.firstName||''}</span>
    &ensp;นามสกุล <span class="ul ul-md">${mother.lastName||''}</span>
    &ensp;อาชีพ <span class="ul ul-sm">${mother.occupation||''}</span>
    &ensp;โทรศัพท์ <span class="ul ul-md">${mother.phone||''}</span>
  </div>
  <div class="form-row indent2">
    ชื่อมารดา(ภาษาอังกฤษ) Miss./Mrs. <span class="ul ul-xl">${mother.firstNameEn||''} ${mother.lastNameEn||''}</span>
    &ensp;เลขประจำตัวประชาชน ${_idBoxes(mother.idCard)}
  </div>

  <!-- ผู้ปกครอง -->
  <div class="form-row">
    – ชื่อผู้ปกครอง <span style="font-size:9pt">(กรณีที่ไม่ได้อยู่กับบิดา มารดา)</span>
    นาย/นางสาว/นาง <span class="ul ul-lg">${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''}</span>
    &ensp;อาชีพ <span class="ul ul-sm">${guardian.occupation||''}</span>
  </div>
  <div class="form-row indent2">
    เกี่ยวข้องเป็น <span class="ul ul-sm">${guardian.relation||''}</span>
    &ensp;โทรศัพท์ <span class="ul ul-md">${guardian.phone||''}</span>
    &ensp;ที่อยู่ <span class="ul ul-xl"></span>
  </div>

  <!-- ยินยอม -->
  <div class="form-row" style="margin-top:6px; font-size:10pt; line-height:1.7">
    &emsp;&emsp;&emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ
    และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์
  </div>

  <!-- ลายเซ็น -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-line"></div>
      ลงชื่อ..............................................ผู้สมัคร<br>
      (${fullName})<br>
      ........../.........../............
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      ลงชื่อ..............................................ผู้ปกครอง<br>
      (${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''})<br>
      ........../.........../............
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      ลงชื่อ..............................................ผู้รับสมัคร<br>
      (............................................)<br>
      ........../.........../............
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      ลงชื่อ..............................................ฝ่ายการเงิน<br>
      (............................................)<br>
      ........../.........../............
    </div>
  </div>

  <!-- บันทึกฝ่ายการเงิน -->
  <div class="finance-notes">
    <div class="bold">บันทึกฝ่ายการเงิน</div>
    <div class="finance-line"></div>
    <div class="finance-line"></div>
    <div class="finance-line"></div>
  </div>

</div><!-- /หน้า 2 ฟอร์ม ปวส. -->

${docPages}

</body>
</html>`;
}
