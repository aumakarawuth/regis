// ============================================
// Admin.gs — Dashboard, Stats, Verify
// ============================================

function adminGetStats(token) {
  _checkAdmin(token);

  const students = sheetToObjects(getSheet(SHEETS.STUDENTS));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const total = students.length;
  const todayCount = students.filter(s => {
    const d = new Date(s.applyDate);
    return d >= today;
  }).length;
  const pending  = students.filter(s => s.status === 'pending').length;
  const verified = students.filter(s => s.status === 'verified').length;
  const rejected = students.filter(s => s.status === 'rejected').length;

  // แยกตามสาขา — ใช้ branchId field ที่ถูกต้อง
  const enrollments = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  const programs = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  const branchCount = {};

  enrollments.forEach(e => {
    // FIX: หาชื่อสาขาจาก branchId ก่อน ถ้าไม่เจอค่อย fallback
    let prog = programs.find(p => p.branchId === e.branchId);
    if (!prog) prog = programs.find(p => p.id === e.programId);
    const name = prog ? prog.branch : (e.branchId || 'ไม่ระบุ');
    branchCount[name] = (branchCount[name] || 0) + 1;
  });

  const byBranch = Object.entries(branchCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { success: true, data: { total, today: todayCount, pending, verified, rejected, byBranch } };
}

// FIX: รับทั้ง object (POST) และ query params (GET) ได้
function adminGetStudents(params) {
  _checkAdmin(params.token);

  const students = sheetToObjects(getSheet(SHEETS.STUDENTS));
  const enrollments = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  const programs = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  const documents = sheetToObjects(getSheet(SHEETS.DOCUMENTS));

  const search = (params.search || '').toLowerCase();
  const statusFilter = params.status || '';

  const requiredDocs = ['id_card_front', 'id_card_back', 'house_reg', 'edu_cert_front'];

  let result = students.map(s => {
    const enroll = enrollments.find(e => e.studentId === s.id) || {};

    // FIX: หาชื่อสาขาจาก branchId ก่อน ถ้าไม่เจอ fallback programId
    let prog = programs.find(p => p.branchId === enroll.branchId);
    if (!prog) prog = programs.find(p => p.id === enroll.programId);
    if (!prog) prog = {};

    const studentDocs = documents.filter(d => d.studentId === s.id);
    const docsComplete = requiredDocs.every(r => studentDocs.find(d => d.type === r));

    return {
      id: s.id,
      applicationNo: s.applicationNo,
      prefix: s.prefix,
      firstName: s.firstName,
      lastName: s.lastName,
      idCard: s.idCard,
      phone: s.phone,
      applyDate: s.applyDate,
      status: s.status,
      branchName: prog.branch || enroll.branchId || '—',
      roundName: prog.round || enroll.roundId || '—',
      levelName: prog.level || enroll.levelId || '—',
      docsComplete,
      documents: studentDocs,
    };
  });

  // Filter status
  if (statusFilter === 'pending')    result = result.filter(s => s.status === 'pending');
  if (statusFilter === 'verified')   result = result.filter(s => s.status === 'verified');
  if (statusFilter === 'rejected')   result = result.filter(s => s.status === 'rejected');
  if (statusFilter === 'incomplete') result = result.filter(s => !s.docsComplete);

  // Search
  if (search) {
    result = result.filter(s =>
      s.firstName?.toLowerCase().includes(search) ||
      s.lastName?.toLowerCase().includes(search) ||
      s.idCard?.includes(search) ||
      s.applicationNo?.toLowerCase().includes(search) ||
      s.phone?.includes(search) ||
      s.branchName?.toLowerCase().includes(search)
    );
  }

  // Sort newest first
  result.sort((a, b) => new Date(b.applyDate) - new Date(a.applyDate));

  return { success: true, data: result };
}

function adminVerifyDoc(body) {
  _checkAdmin(body.token);
  const sheet = getSheet(SHEETS.DOCUMENTS);
  const updated = updateRowById(sheet, body.docId, { isVerified: body.verified });
  return { success: updated };
}

function adminUpdateStatus(body) {
  _checkAdmin(body.token);
  const sheet = getSheet(SHEETS.STUDENTS);
  const updated = updateRowById(sheet, body.studentId, { status: body.status });
  return { success: updated };
}

// ---- Export CSV ----
// FIX: เรียกได้ทั้ง GET (?action=exportCSV&token=xxx) และผ่าน doGet
function exportCSV(token) {
  _checkAdmin(token);

  const students = sheetToObjects(getSheet(SHEETS.STUDENTS));
  const enrollments = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  const programs = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  const addresses = sheetToObjects(getSheet(SHEETS.ADDRESSES));

  const rows = [
    ['เลขสมัคร','คำนำหน้า','ชื่อ','นามสกุล','เลขบัตร','เบอร์โทร',
     'วุฒิการศึกษา','โรงเรียนเดิม','ระดับ','สาขา','รอบ',
     'จังหวัด','อำเภอ','ตำบล','วันที่สมัคร','สถานะ'],
  ];

  students.forEach(s => {
    const enroll = enrollments.find(e => e.studentId === s.id) || {};
    // FIX: lookup by branchId first
    let prog = programs.find(p => p.branchId === enroll.branchId);
    if (!prog) prog = programs.find(p => p.id === enroll.programId);
    prog = prog || {};
    const addr = addresses.find(a => a.studentId === s.id) || {};

    rows.push([
      s.applicationNo, s.prefix, s.firstName, s.lastName,
      s.idCard, s.phone, s.education, s.oldSchool,
      prog.level || enroll.levelId || '',
      prog.branch || enroll.branchId || '',
      prog.round || '',
      addr.province || '', addr.district || '', addr.subDistrict || '',
      s.applyDate ? new Date(s.applyDate).toLocaleDateString('th-TH') : '',
      s.status,
    ]);
  });

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const bom = '\uFEFF'; // UTF-8 BOM for Excel
  return ContentService
    .createTextOutput(bom + csv)
    .setMimeType(ContentService.MimeType.CSV);
}
