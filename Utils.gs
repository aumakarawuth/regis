// ============================================
// Utils.gs — PDF / Print / LINE Notify  (updated)
// ============================================

// ---- Address lookup helpers ----
// provinces.json / districts.json / subdistricts.json
// ถูก embed ไว้ใน GAS เป็น ScriptProperties หรือ fetch จาก URL
// วิธีง่ายที่สุด: เก็บ JSON ไว้ใน PropertiesService ครั้งแรก
// หรือ fetch จาก GAS WebApp URL อีกที — แต่ที่ง่ายสุดคือเก็บไว้ในชีต

/**
 * ดึงชื่อจังหวัดจาก ID
 * Sheet "provinces": columns [id, name]
 */
function _getProvinceName(id) {
  if (!id) return '';
  // ถ้า id ไม่ใช่ตัวเลข → คืนค่าตรงๆ (เก็บชื่อไว้แล้ว)
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

/**
 * แปลง addr object ให้มีชื่อแทน ID
 */
function _resolveAddress(addr) {
  return {
    detail:      addr.detail      || '',
    subDistrict: _getSubDistrictName(addr.subDistrict),
    district:    _getDistrictName(addr.district),
    province:    _getProvinceName(addr.province),
    zipcode:     addr.zipcode     || '',
  };
}

// ---- สร้างใบสมัคร PDF (HTML to print) ----
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

  // ---- Enrollment lookup: ลอง programId ก่อน ถ้าไม่เจอลอง branchId ----
  const enroll = enrollments.find(e => e.studentId === s.id) || {};
  let prog = programs.find(p => p.id === enroll.programId) || {};
  if (!prog.branch && enroll.branchId) {
    prog = programs.find(p => p.branchId === enroll.branchId) || prog;
  }

  // ---- Address: แปลง ID → ชื่อ ----
  const rawAddr = addresses.find(a => a.studentId === studentId) || {};
  const addr    = _resolveAddress(rawAddr);

  const parentList = parents.filter(p => p.studentId === studentId);
  const guardian   = guardianList.find(g => g.studentId === studentId) || {};
  const studentDocs= documents.filter(d => d.studentId === studentId);

  // ---- เลือก template ตามระดับ ----
  const isPvs = (prog.level || s.education || '').includes('ปวส');
  const html  = isPvs
    ? _buildPvsPDF(s, enroll, prog, addr, parentList, guardian, studentDocs)
    : _buildPvchPDF(s, enroll, prog, addr, parentList, guardian, studentDocs);

  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}

// ============================================================
// HTML Template สำหรับ ปวช.
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

  // Father/Mother id boxes
  const fidBoxes = Array.from({length:13},(_,i)=>`<span class="idbox">${(father.idCard||'').replace(/\D/g,'')[i]||''}</span>`).join('');
  const midBoxes = Array.from({length:13},(_,i)=>`<span class="idbox">${(mother.idCard||'').replace(/\D/g,'')[i]||''}</span>`).join('');

  const branchChecks = _branchCheckboxesPvch(prog.branch || '');
  const docsHtml     = _buildDocsSection(docs, fullName);

  // เช็ค doc ที่มี
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

  /* ---- Page break ---- */
  .page { page-break-after: always; padding: 0; }
  .page:last-child { page-break-after: avoid; }

  /* ---- Header area ---- */
  .header-meta { display: flex; justify-content: flex-end; font-size: 12px; margin-bottom: 3px; flex-wrap: wrap; gap: 6px; }
  .header-meta .item { white-space: nowrap; }
  .idbox { display: inline-block; width: 18px; height: 18px; border: 1px solid #000;
           text-align: center; line-height: 17px; font-size: 12px; font-weight: 700; margin: 0 1px; }
  .cb { display: inline-block; width: 14px; height: 14px; border: 1px solid #000;
        text-align: center; line-height: 13px; font-size: 11px; vertical-align: middle; }
  .cb.checked::after { content: '✓'; font-weight: 700; }

  /* ---- Cover page ---- */
  .cover { text-align: center; padding: 8px 0; }
  .cover h1 { font-size: 26px; font-weight: 700; margin: 8px 0 4px; line-height: 1.3; }
  .cover h2 { font-size: 14px; color: #444; margin: 0 0 6px; }
  .cover .addr { font-size: 12px; color: #555; margin-bottom: 8px; }
  .photo-box { width: 100px; height: 120px; border: 1px solid #000; margin: 0 0 0 auto;
               display: flex; align-items: center; justify-content: center; font-size: 11px;
               color: #888; text-align: center; }

  /* ---- Form page ---- */
  .form-title { text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 8px; }
  .row { margin: 5px 0; line-height: 1.8; }
  .row b { font-weight: 700; }
  .ul { display: inline-block; border-bottom: 1px solid #000; min-width: 100px; padding: 0 3px; vertical-align: bottom; }
  .ul-sm  { min-width: 55px; }
  .ul-md  { min-width: 140px; }
  .ul-lg  { min-width: 220px; }
  .ul-xl  { min-width: 320px; }
  .ul-full{ min-width: 85%; }
  .indent { padding-left: 20px; }
  .section-header { font-weight: 700; font-size: 13px; margin: 10px 0 4px; border-bottom: 1px solid #000; }

  /* ---- Signature area ---- */
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
  .sig-box { text-align: center; font-size: 12px; }
  .sig-line { border-bottom: 1px solid #000; margin: 44px 16px 4px; }

  /* ---- Checklist ---- */
  .checklist { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-size: 12px; text-align: left; margin-top: 8px; }

  /* ---- Document pages ---- */
  .doc-page { text-align: center; padding: 16px 0; }
  .doc-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
  .doc-img { max-width: 88%; max-height: 185mm; border: 1px solid #ccc; display: block; margin: 0 auto; }
  .stamp-wrap { margin: 16px auto 0; display: inline-block; }
  .stamp { border: 3px solid #cc0000; border-radius: 8px; padding: 6px 20px;
           color: #cc0000; font-weight: 700; font-size: 15px; display: inline-block; }
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

<!-- ================================================ -->
<!-- หน้า 1: ปก -->
<!-- ================================================ -->
<div class="page" style="padding:6px 0">

  <!-- แถวด้านบนขวา: ชื่อ ห้อง รอบ / รหัสประจำตัว -->
  <div class="header-meta">
    <div class="item">นาย/น.ส./นาง <span class="ul ul-lg">${fullName}</span></div>
    <div class="item">ห้อง <span class="ul ul-sm"></span></div>
    <div class="item">รอบ <span class="ul ul-sm">${_roundThai(studyRound)}</span></div>
  </div>
  <div style="text-align:right;font-size:12px;margin-bottom:3px">
    <span class="cb ${s.scholarship==='พรนิมิตร'?'checked':''}"></span> ทุนสัณห์พรนิมิตร &nbsp;
    <span class="cb ${s.scholarship==='กู้ยศ'?'checked':''}"></span> กู้ยศ. &nbsp;
    <span class="cb"></span> อื่นๆ............................ &nbsp;
    รหัสประจำตัว ${idBoxes}
  </div>
  <div style="text-align:right;font-size:12px;margin-bottom:8px">
    <span class="cb"></span> บันทึก DATA........................
    <span class="cb"></span> บันทึก SISA........................
    <span class="cb"></span> กรอกประวัติ ........................
  </div>

  <!-- โลโก้ + ชื่อวิทยาลัย (ซ้าย) + กล่องรูป (ขวา) -->
  <div style="display:flex;align-items:flex-start;justify-content:center;gap:16px">
    <div class="cover" style="flex:1">
      <div style="font-size:60px;margin-bottom:4px">🏫</div>
      <h1>ใบสมัคร ปวช.<br>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h1>
      <div class="addr">
        Charansanitwong Technological College<br>
        18 ก.จรัญสนิทวงศ์ ซอย 41 แขวงอรุณอมรินทร์ เขตบางกอกน้อย กทม. 10700<br>
        โทร. 0-2434-6155-7 โทรสาร. 0-2433-3647 www.charansanitwong.ac.th
      </div>
    </div>
    <div class="photo-box">รูปถ่าย<br>1" หรือ 2"</div>
  </div>

  <hr style="margin:8px 0">

  <!-- หลักฐานการสมัคร -->
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
    <div><span class="cb"></span> 10. กรณี โอนหน่วยกิต (วุฒิม.3 และ รบ.โอน)</div>
  </div>
</div>

<!-- ================================================ -->
<!-- หน้า 2: ฟอร์มกรอก -->
<!-- ================================================ -->
<div class="page" style="padding:4px 0">
  <div class="form-title">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>

  <div class="row">
    <b>วันที่สมัคร</b> <span class="ul ul-md">${thDate(s.applyDate)}</span>
    &emsp;<b>ระดับที่สมัคร ปวช.</b> – รอบ
    <span class="cb ${studyRound==='morning'?'checked':''}"></span> เช้า&nbsp;
    <span class="cb ${studyRound==='afternoon'?'checked':''}"></span> บ่าย&nbsp;
    <span class="cb ${studyRound==='dual'?'checked':''}"></span> ทวิภาคี
  </div>

  <!-- ข้อ 1: ข้อมูลส่วนตัว -->
  <div class="row">
    <b>1.</b> นาย/นางสาว/นาง
    <span class="ul ul-lg">${s.firstName||''}</span>
    นามสกุล <span class="ul ul-lg">${s.lastName||''}</span>
    วัน/เดือน/ปีเกิด <span class="ul ul-md">${thDate(s.birthDate)}</span>
  </div>
  <div class="row indent">
    Mr./Miss./Mrs. <span class="ul ul-xl"></span>
    เลขประจำตัวประชาชน ${idBoxes}
  </div>
  <div class="row indent">
    สัญชาติ <span class="ul ul-sm">${s.nationality||'ไทย'}</span>&nbsp;
    เชื้อชาติ <span class="ul ul-sm">${s.ethnicity||'ไทย'}</span>&nbsp;
    ศาสนา <span class="ul ul-sm">${s.religion||'พุทธ'}</span>&nbsp;
    น้ำหนัก <span class="ul ul-sm">${s.weight||''}</span> กก.&nbsp;
    ส่วนสูง <span class="ul ul-sm">${s.height||''}</span> ซม.&nbsp;
    หมู่โลหิต <span class="ul ul-sm">${s.bloodType||''}</span>
  </div>

  <!-- ข้อ 2: สาขา -->
  <div class="row">
    <b>2.</b> สาขาวิชาที่สมัคร ${branchChecks}
  </div>
  <div class="row indent" style="font-size:12px">
    &emsp;<span class="cb"></span> ธุรกิจค้าปลีก [กทม./ต่างจังหวัด]&nbsp;
    <span class="cb"></span> ภาษาต่างประเทศธุรกิจบริการ&nbsp;
    <span class="cb"></span> การท่องเที่ยว
  </div>

  <!-- ข้อ 3: จบการศึกษา -->
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
  <div class="row indent">
    – กรณีโอนมา จากวิทยาลัย <span class="ul ul-lg"></span> สาขาวิชา <span class="ul ul-lg"></span>
  </div>
  <div class="row indent">
    – เข้าศึกษา
    <span class="cb"></span> ปวช.2&nbsp;
    <span class="cb"></span> ปวช.3 &emsp;ห้อง/รอบ <span class="ul ul-md"></span> สาขาวิชา <span class="ul ul-lg"></span>
  </div>

  <!-- ข้อ 4: ที่อยู่ -->
  <div class="row">
    <b>4.</b> ที่อยู่ปัจจุบัน
    บ้านเลขที่ <span class="ul ul-sm">${(addr.detail||'').split(' ')[0]||''}</span>
    หมู่ <span class="ul ul-sm"></span>
    ซอย <span class="ul ul-md"></span>
    ถนน <span class="ul ul-lg">${addr.detail||''}</span>
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

  <!-- ส่วนที่ 2: บิดา/มารดา/ผู้ปกครอง -->
  <div class="section-header">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>
  <div class="row">
    – ชื่อบิดา นาย <span class="ul ul-lg">${father.firstName||''}</span>
    นามสกุล <span class="ul ul-lg">${father.lastName||''}</span>
    อาชีพ <span class="ul ul-md">${father.occupation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${father.phone||''}</span>
  </div>
  <div class="row indent">
    ชื่อบิดา (ภาษาอังกฤษ) Mr. <span class="ul ul-xl"></span>
    เลขประจำตัวประชาชน ${fidBoxes}
  </div>
  <div class="row">
    – ชื่อมารดา น.ส./นาง <span class="ul ul-lg">${mother.firstName||''}</span>
    นามสกุล <span class="ul ul-lg">${mother.lastName||''}</span>
    อาชีพ <span class="ul ul-md">${mother.occupation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${mother.phone||''}</span>
  </div>
  <div class="row indent">
    ชื่อมารดา (ภาษาอังกฤษ) Miss./Mrs. <span class="ul ul-xl"></span>
    เลขประจำตัวประชาชน ${midBoxes}
  </div>
  <div class="row">
    – ชื่อผู้ปกครอง (กรณีที่ไม่ได้อยู่กับบิดา มารดา)
    นาย/นางสาว/นาง <span class="ul ul-xl">${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''}</span>
    อาชีพ <span class="ul ul-md">${guardian.occupation||''}</span>
  </div>
  <div class="row indent">
    เกี่ยวข้องเป็น <span class="ul ul-sm">${guardian.relation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${guardian.phone||''}</span>
    ที่อยู่ <span class="ul ul-xl">${guardian.address||''}</span>
  </div>
  <div class="row" style="font-size:12px;margin-top:6px">
    &emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์
  </div>

  <!-- ลายเซ็น 4 ช่อง -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>ลงชื่อ............................................ผู้สมัคร</div>
      <div>(${fullName})</div>
      <div>........../.........../.............</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>ลงชื่อ............................................ผู้ปกครอง</div>
      <div>(${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''})</div>
      <div>........../.........../.............</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>ลงชื่อ............................................ผู้รับสมัคร</div>
      <div>(............................................)</div>
      <div>........../.........../.............</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>ลงชื่อ............................................ฝ่ายการเงิน</div>
      <div>(............................................)</div>
      <div>........../.........../.............</div>
    </div>
  </div>

  <div style="margin-top:10px;font-size:12px;font-weight:700">บันทึกฝ่ายการเงิน</div>
  <div style="border-bottom:1px solid #999;margin:5px 0 4px"></div>
  <div style="border-bottom:1px solid #999;margin:4px 0"></div>
  <div style="border-bottom:1px solid #999;margin:4px 0"></div>
</div>

<!-- ================================================ -->
<!-- หน้าเอกสารแนบ -->
<!-- ================================================ -->
${docsHtml}

</body>
</html>`;
}

// ============================================================
// HTML Template สำหรับ ปวส. (แยก template เต็ม)
// ============================================================
function _buildPvsPDF(s, enroll, prog, addr, parents, guardian, docs) {
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

  const branchChecks = _branchCheckboxesPvs(prog.branch || '');
  const docsHtml     = _buildDocsSection(docs, fullName);
  const hasDoc = (t) => docs.some(d => d.type === t);

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบสมัคร ปวส. — ${s.applicationNo||''}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun', sans-serif; font-size: 13px; color: #000; margin: 0; background: #fff; }
  .page { page-break-after: always; padding: 0; }
  .page:last-child { page-break-after: avoid; }
  .header-meta { display: flex; justify-content: flex-end; font-size: 12px; margin-bottom: 3px; flex-wrap: wrap; gap: 6px; }
  .idbox { display: inline-block; width: 18px; height: 18px; border: 1px solid #000;
           text-align: center; line-height: 17px; font-size: 12px; font-weight: 700; margin: 0 1px; }
  .cb { display: inline-block; width: 14px; height: 14px; border: 1px solid #000;
        text-align: center; line-height: 13px; font-size: 11px; vertical-align: middle; }
  .cb.checked::after { content: '✓'; font-weight: 700; }
  .photo-box { width: 100px; height: 120px; border: 1px solid #000; margin: 0 0 0 auto;
               display: flex; align-items: center; justify-content: center; font-size: 11px;
               color: #888; text-align: center; }
  .cover { text-align: center; flex: 1; }
  .cover h1 { font-size: 26px; font-weight: 700; margin: 8px 0 4px; line-height: 1.3; }
  .form-title { text-align: center; font-size: 15px; font-weight: 700; margin: 0 0 8px; }
  .row { margin: 5px 0; line-height: 1.8; }
  .ul { display: inline-block; border-bottom: 1px solid #000; min-width: 100px; padding: 0 3px; vertical-align: bottom; }
  .ul-sm  { min-width: 55px; } .ul-md  { min-width: 140px; }
  .ul-lg  { min-width: 220px; } .ul-xl  { min-width: 320px; }
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
  border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;z-index:9999">
  🖨️ พิมพ์ / บันทึก PDF
</button>

<!-- หน้า 1: ปก ปวส. -->
<div class="page" style="padding:6px 0">
  <div class="header-meta">
    <div>นาย/น.ส./นาง <span class="ul ul-lg">${fullName}</span></div>
    <div>ห้อง <span class="ul ul-sm"></span></div>
    <div>รอบ <span class="ul ul-sm">${_roundThai(studyRound)}</span></div>
  </div>
  <div style="text-align:right;font-size:12px;margin-bottom:3px">
    <span class="cb ${s.scholarship==='กู้ยศ'?'checked':''}"></span> กู้ยศ. &nbsp;
    <span class="cb"></span> อื่นๆ............................ &nbsp;
    รหัสประจำตัว ${idBoxes}
  </div>
  <div style="text-align:right;font-size:12px;margin-bottom:8px">
    <span class="cb"></span> บันทึก DATA........................
    <span class="cb"></span> บันทึก SISA........................
    <span class="cb"></span> กรอกประวัติ ........................
  </div>

  <div style="display:flex;align-items:flex-start;justify-content:center;gap:16px">
    <div class="cover">
      <div style="font-size:60px;margin-bottom:4px">🏫</div>
      <h1>ใบสมัคร ปวส.<br>วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์</h1>
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
    <div><span class="cb ${hasDoc('id_card_front')?'checked':''}"></span> 6. สำเนาบัตร ปชช. ของมารดา</div>
    <div><span class="cb ${hasDoc('edu_cert_front')?'checked':''}"></span> 2. วุฒิการศึกษาฉบับจริง</div>
    <div><span class="cb ${hasDoc('id_card_front')?'checked':''}"></span> 7. สำเนาบัตร ปชช. ของผู้ปกครอง</div>
    <div><span class="cb ${hasDoc('edu_cert_front')?'checked':''}"></span> 3. สำเนาวุฒิการศึกษา 2 ฉบับ</div>
    <div><span class="cb ${hasDoc('house_reg')?'checked':''}"></span> 8. สำเนาทะเบียนบ้านของตนเอง</div>
    <div><span class="cb ${hasDoc('id_card_front')?'checked':''}"></span> 4. สำเนาบัตร ปชช. ของตนเอง 2 ฉบับ</div>
    <div><span class="cb"></span> 9. กรณี โอนหน่วยกิต (วุฒิม.3 และ รบ.โอน)</div>
    <div><span class="cb ${hasDoc('id_card_front')?'checked':''}"></span> 5. สำเนาบัตร ปชช. ของบิดา</div>
  </div>
</div>

<!-- หน้า 2: ฟอร์มกรอก ปวส. -->
<div class="page" style="padding:4px 0">
  <div class="form-title">(โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>

  <div class="row">
    <b>วันที่สมัคร</b> <span class="ul ul-md">${thDate(s.applyDate)}</span>
    &emsp;<b>ระดับ ปวส.</b>
    <span class="cb ${(s.education||'').includes('ปวช')?'checked':''}"></span> ปวช.&nbsp;
    <span class="cb ${(s.education||'').includes('ม.6')?'checked':''}"></span> ปวส.ช&nbsp;
    <span class="cb"></span> ปวส.ม.6 | – รอบ
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
    Mr./Miss./Mrs. <span class="ul ul-xl"></span>
    เลขประจำตัวประชาชน ${idBoxes}
  </div>
  <div class="row indent">
    สัญชาติ <span class="ul ul-sm">${s.nationality||'ไทย'}</span>&nbsp;
    เชื้อชาติ <span class="ul ul-sm">${s.ethnicity||'ไทย'}</span>&nbsp;
    ศาสนา <span class="ul ul-sm">${s.religion||'พุทธ'}</span>&nbsp;
    น้ำหนัก <span class="ul ul-sm">${s.weight||''}</span> กก.&nbsp;
    ส่วนสูง <span class="ul ul-sm">${s.height||''}</span> ซม.&nbsp;
    หมู่โลหิต <span class="ul ul-sm">${s.bloodType||''}</span>
  </div>

  <div class="row"><b>2.</b> สาขาวิชาที่สมัคร ${branchChecks}</div>

  <div class="row">
    <b>3.</b> จบการศึกษา
    <span class="cb ${(s.education||'').includes('ม.6')?'checked':''}"></span> ม.6&nbsp;
    <span class="cb ${(s.education||'').includes('ปวช')?'checked':''}"></span> ปวช. สาขา (ระบุ) <span class="ul ul-md">${s.oldBranch||prog.branch||''}</span>
    โรงเรียน/วิทยาลัย <span class="ul ul-xl">${s.oldSchool||''}</span>
  </div>
  <div class="row indent">
    ตำบล/แขวง <span class="ul ul-md">${addr.subDistrict}</span>&nbsp;
    อำเภอ/เขต <span class="ul ul-md">${addr.district}</span>&nbsp;
    จังหวัด <span class="ul ul-md">${addr.province}</span>
  </div>
  <div class="row indent">
    – กรณีโอนมา จากวิทยาลัย <span class="ul ul-lg"></span> สาขาวิชา <span class="ul ul-lg"></span>
  </div>
  <div class="row indent">
    – เข้าศึกษา ห้อง/รอบ <span class="ul ul-md"></span> สาขาวิชา <span class="ul ul-xl"></span>
  </div>

  <div class="row">
    <b>4.</b> ที่อยู่ปัจจุบัน
    บ้านเลขที่ <span class="ul ul-sm">${(addr.detail||'').split(' ')[0]||''}</span>
    หมู่ <span class="ul ul-sm"></span>
    ซอย <span class="ul ul-md"></span>
    ถนน <span class="ul ul-lg">${addr.detail||''}</span>
  </div>
  <div class="row indent">
    ตำบล/แขวง <span class="ul ul-md">${addr.subDistrict}</span>&nbsp;
    อำเภอ/เขต <span class="ul ul-md">${addr.district}</span>&nbsp;
    จังหวัด <span class="ul ul-md">${addr.province}</span>&nbsp;
    รหัสไปรษณีย์ <span class="ul ul-sm">${addr.zipcode}</span>
  </div>
  <div class="row indent">โทรศัพท์ <span class="ul ul-md">${s.phone||''}</span></div>

  <div class="section-header">ส่วนที่ 2 มอบตัว (โปรดกรอกข้อมูลให้ครบถ้วนตัวบรรจง)</div>
  <div class="row">
    – ชื่อบิดา นาย <span class="ul ul-lg">${father.firstName||''}</span>
    นามสกุล <span class="ul ul-lg">${father.lastName||''}</span>
    อาชีพ <span class="ul ul-md">${father.occupation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${father.phone||''}</span>
  </div>
  <div class="row indent">
    ชื่อบิดา (ภาษาอังกฤษ) Mr. <span class="ul ul-xl"></span>
    เลขประจำตัวประชาชน ${fidBoxes}
  </div>
  <div class="row">
    – ชื่อมารดา น.ส./นาง <span class="ul ul-lg">${mother.firstName||''}</span>
    นามสกุล <span class="ul ul-lg">${mother.lastName||''}</span>
    อาชีพ <span class="ul ul-md">${mother.occupation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${mother.phone||''}</span>
  </div>
  <div class="row indent">
    ชื่อมารดา (ภาษาอังกฤษ) Miss./Mrs. <span class="ul ul-xl"></span>
    เลขประจำตัวประชาชน ${midBoxes}
  </div>
  <div class="row">
    – ชื่อผู้ปกครอง (กรณีที่ไม่ได้อยู่กับบิดา มารดา)
    นาย/นางสาว/นาง <span class="ul ul-xl">${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''}</span>
    อาชีพ <span class="ul ul-md">${guardian.occupation||''}</span>
  </div>
  <div class="row indent">
    เกี่ยวข้องเป็น <span class="ul ul-sm">${guardian.relation||''}</span>
    โทรศัพท์ <span class="ul ul-md">${guardian.phone||''}</span>
    ที่อยู่ <span class="ul ul-xl">${guardian.address||''}</span>
  </div>
  <div class="row" style="font-size:12px;margin-top:6px">
    &emsp;ยินยอมให้นักศึกษาในความปกครอง อยู่ในความดูแลและปฏิบัติตามระเบียบของวิทยาลัยฯ ทุกประการ และขอมอบตัวเข้าศึกษาในวิทยาลัยเทคโนโลยีจรัลสนิทวงศ์
  </div>

  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>ลงชื่อ............................................ผู้สมัคร</div>
      <div>(${fullName})</div>
      <div>........../.........../.............</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>ลงชื่อ............................................ผู้ปกครอง</div>
      <div>(${guardian.prefix||''}${guardian.firstName||''} ${guardian.lastName||''})</div>
      <div>........../.........../.............</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>ลงชื่อ............................................ผู้รับสมัคร</div>
      <div>(............................................)</div>
      <div>........../.........../.............</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>ลงชื่อ............................................ฝ่ายการเงิน</div>
      <div>(............................................)</div>
      <div>........../.........../.............</div>
    </div>
  </div>

  <div style="margin-top:10px;font-size:12px;font-weight:700">บันทึกฝ่ายการเงิน</div>
  <div style="border-bottom:1px solid #999;margin:5px 0 4px"></div>
  <div style="border-bottom:1px solid #999;margin:4px 0"></div>
  <div style="border-bottom:1px solid #999;margin:4px 0"></div>
</div>

${docsHtml}

</body>
</html>`;
}

// ---- Branch checkboxes ปวช. (แถวเดียวกับฟอร์มจริง) ----
function _branchCheckboxesPvch(branch) {
  const row1 = ['การบัญชี','การตลาด','เทคโนโลยีธุรกิจดิจิทัล','เทคโนโลยีสารสนเทศ','ดิจิทัลกราฟิก'];
  return row1.map(o => {
    const checked = branch.includes(o) ? ' checked' : '';
    return `<span class="cb${checked}"></span> ${o}&nbsp;`;
  }).join('');
}

// ---- Branch checkboxes ปวส. ----
function _branchCheckboxesPvs(branch) {
  const opts = ['การบัญชี','การตลาด','เทคโนโลยีธุรกิจดิจิทัล','เทคโนโลยีสารสนเทศ',
                'ดิจิทัลกราฟิก','ภาษาและการจัดการธุรกิจระหว่างประเทศ',
                'การท่องเที่ยว','การจัดการดูแลผู้สูงอายุ','การจัดการสำนักงานดิจิทัล'];
  return opts.map(o => {
    const checked = branch.includes(o) ? ' checked' : '';
    return `<span class="cb${checked}"></span> ${o}&nbsp;`;
  }).join('');
}

// ---- Round label ----
function _roundThai(r) {
  return { morning:'เช้า', afternoon:'บ่าย', dual:'ทวิภาคี' }[r] || r || '';
}

// ---- หน้าเอกสารแนบพร้อมตราสำเนาถูกต้อง ----
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
    ? `<img src="${imgUrl}" class="doc-img" alt="${label}" onload="this.style.opacity=1" style="opacity:0;transition:opacity .3s">`
    : `<div style="width:80%;height:160mm;margin:0 auto;border:1px dashed #ccc;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:16px">(ไม่มีรูปเอกสาร)</div>`}
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
