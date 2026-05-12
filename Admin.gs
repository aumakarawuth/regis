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

  // แยกตามสาขา
  const enrollments = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  const programs = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  const branchCount = {};

  enrollments.forEach(e => {
    const prog = programs.find(p => p.id === e.programId || p.branchId === e.branchId);
    const name = prog ? prog.branch : (e.branchId || 'ไม่ระบุ');
    branchCount[name] = (branchCount[name] || 0) + 1;
  });

  const byBranch = Object.entries(branchCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { success: true, data: { total, today: todayCount, pending, verified, rejected, byBranch } };
}

function adminGetStudents(params) {
  _checkAdmin(params.token);

  const students = sheetToObjects(getSheet(SHEETS.STUDENTS));
  const enrollments = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  const programs = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  const documents = sheetToObjects(getSheet(SHEETS.DOCUMENTS));

  const search = (params.search || '').toLowerCase();
  const statusFilter = params.status || '';

  const requiredDocs = ['id_card_front', 'id_card_back', 'house_reg', 'edu_cert'];

  let result = students.map(s => {
    const enroll = enrollments.find(e => e.studentId === s.id) || {};
    const prog = programs.find(p => p.id === enroll.programId || p.branchId === enroll.branchId) || {};
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
      docsComplete,
      documents: studentDocs,
    };
  });

  // Filter status
  if (statusFilter === 'pending')    result = result.filter(s => s.status === 'pending');
  if (statusFilter === 'verified')   result = result.filter(s => s.status === 'verified');
  if (statusFilter === 'incomplete') result = result.filter(s => !s.docsComplete);

  // Search
  if (search) {
    result = result.filter(s =>
      s.firstName?.toLowerCase().includes(search) ||
      s.lastName?.toLowerCase().includes(search) ||
      s.idCard?.includes(search) ||
      s.applicationNo?.toLowerCase().includes(search) ||
      s.phone?.includes(search)
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
function exportCSV(token) {
  _checkAdmin(token);

  const students = sheetToObjects(getSheet(SHEETS.STUDENTS));
  const enrollments = sheetToObjects(getSheet(SHEETS.ENROLLMENTS));
  const programs = sheetToObjects(getSheet(SHEETS.PROGRAMS));

  const rows = [
    ['เลขสมัคร','คำนำหน้า','ชื่อ','นามสกุล','เลขบัตร','เบอร์โทร',
     'วุฒิการศึกษา','โรงเรียนเดิม','สาขา','รอบ','วันที่สมัคร','สถานะ'],
  ];

  students.forEach(s => {
    const enroll = enrollments.find(e => e.studentId === s.id) || {};
    const prog = programs.find(p => p.id === enroll.programId) || {};
    rows.push([
      s.applicationNo, s.prefix, s.firstName, s.lastName,
      s.idCard, s.phone, s.education, s.oldSchool,
      prog.branch || '', prog.round || '',
      s.applyDate ? new Date(s.applyDate).toLocaleDateString('th-TH') : '',
      s.status,
    ]);
  });

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const bom = '\uFEFF'; // UTF-8 BOM for Excel
  return ContentService
    .createTextOutput(bom + csv)
    .setMimeType(ContentService.MimeType.CSV)
    .addHeader('Content-Disposition', 'attachment; filename="applicants.csv"');
}
