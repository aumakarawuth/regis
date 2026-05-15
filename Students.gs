// ============================================
// Students.gs — บันทึก / ดึงข้อมูลนักเรียน
// ============================================

const STUDENT_HEADERS = [
  'id','lineUserId','displayName','idCard','prefix','firstName','lastName',
  'birthDate','phone','education','oldSchool','educationProvince',
  'applyDate','status','applicationNo',
];

const ADDRESS_HEADERS = [
  'id','studentId','province','district','subDistrict','zipcode','detail',
];

const PARENT_HEADERS = [
  'id','studentId','type','idCard','prefix','firstName','lastName',
  'phone','occupation','isDeceased',
];

const GUARDIAN_HEADERS = [
  'id','studentId','idCard','prefix','firstName','lastName','phone','relation',
];

const ENROLLMENT_HEADERS = [
  'id','studentId','programId','levelId','branchId','roundId',
  'applicationNo','status','applyDate',
];

// ---- Setup Sheets (รันครั้งเดียว) ----
function setupAllSheets() {
  _ensureHeaders(SHEETS.STUDENTS, STUDENT_HEADERS);
  _ensureHeaders(SHEETS.ADDRESSES, ADDRESS_HEADERS);
  _ensureHeaders(SHEETS.PARENTS, PARENT_HEADERS);
  _ensureHeaders(SHEETS.GUARDIANS, GUARDIAN_HEADERS);
  _ensureHeaders(SHEETS.ENROLLMENTS, ENROLLMENT_HEADERS);
  _ensureHeaders(SHEETS.DOCUMENTS, ['id','studentId','type','driveFileId','driveUrl','uploadedAt','isVerified']);
  _ensureHeaders(SHEETS.PAYMENTS, ['id','studentId','amount','method','slipDriveId','slipUrl','paidAt','isVerified']);
  setupProgramsSheet();
  Logger.log('All sheets initialized!');
}

function _ensureHeaders(sheetName, headers) {
  const sheet = getSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1A1D23')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  }
}

// ---- getApplicationStatus ----
function getApplicationStatus(lineUserId) {
  if (!lineUserId) return { success: true, applied: false };

  const studentSheet = getSheet(SHEETS.STUDENTS);
  const students = sheetToObjects(studentSheet);
  const student = students.find(s => s.lineUserId === lineUserId);

  if (!student) return { success: true, applied: false };

  // ดึงข้อมูล enrollment
  const enrollSheet = getSheet(SHEETS.ENROLLMENTS);
  const enrollments = sheetToObjects(enrollSheet);
  const enroll = enrollments.find(e => e.studentId === student.id);

  // ดึงชื่อสาขา — ลองหลาย field เพราะ programId อาจ store ต่างกัน
  const programSheet = getSheet(SHEETS.PROGRAMS);
  const programs = sheetToObjects(programSheet);

  let branchName = '';
  if (enroll) {
    // ลองหาจาก branchId ก่อน (field ที่ถูกต้อง)
    let prog = programs.find(p => p.branchId === enroll.branchId);
    // fallback: หาจาก programId
    if (!prog) prog = programs.find(p => p.id === enroll.programId);
    // fallback: หาจาก roundId
    if (!prog) prog = programs.find(p => p.id === enroll.roundId);
    branchName = prog ? prog.branch : (enroll.branchId || '');
  }

  return {
    success: true,
    applied: true,
    applicationNo: student.applicationNo,
    status: student.status,
    statusLabel: _statusLabel(student.status),
    branchName: branchName,
    applyDate: student.applyDate ? new Date(student.applyDate).toLocaleDateString('th-TH') : '',
  };
}

// ---- submitApplication ----
function submitApplication(body) {
  // 1. ตรวจสอบ idCard ซ้ำ
  const studentSheet = getSheet(SHEETS.STUDENTS);
  const existing = sheetToObjects(studentSheet);
  const dup = existing.find(s => s.idCard === body.personal?.idCard);
  if (dup) {
    return { success: false, message: 'เลขบัตรประชาชนนี้ถูกใช้งานแล้ว' };
  }

  const now = new Date();
  const studentId = generateId();
  const appNo = generateApplicationNo();

  // 2. บันทึก student
  const student = {
    id: studentId,
    lineUserId: body.lineUserId || '',
    displayName: body.displayName || '',
    idCard: body.personal?.idCard || '',
    prefix: body.personal?.prefix || '',
    firstName: body.personal?.firstName || '',
    lastName: body.personal?.lastName || '',
    birthDate: body.personal?.birthDate || '',
    phone: body.personal?.phone || '',
    education: body.personal?.education || '',
    oldSchool: body.personal?.oldSchool || '',
    educationProvince: body.personal?.educationProvince || '',
    applyDate: now.toISOString(),
    status: 'pending',
    applicationNo: appNo,
  };
  appendRow(studentSheet, student, STUDENT_HEADERS);

  // 3. บันทึก address
  const addrSheet = getSheet(SHEETS.ADDRESSES);
  const addr = {
    id: generateId(),
    studentId,
    province: body.address?.province || '',
    district: body.address?.district || '',
    subDistrict: body.address?.subDistrict || '',
    zipcode: body.address?.zipcode || '',
    detail: body.address?.detail || '',
  };
  appendRow(addrSheet, addr, ADDRESS_HEADERS);

  // 4. บันทึก parents
  const parentSheet = getSheet(SHEETS.PARENTS);
  (body.parents || []).forEach(p => {
    const parent = {
      id: generateId(), studentId,
      type: p.type || '', idCard: p.idCard || '',
      prefix: p.prefix || '', firstName: p.firstName || '',
      lastName: p.lastName || '', phone: p.phone || '',
      occupation: p.occupation || '', isDeceased: p.isDeceased || false,
    };
    appendRow(parentSheet, parent, PARENT_HEADERS);
  });

  // 5. บันทึก guardian
  const guardianSheet = getSheet(SHEETS.GUARDIANS);
  if (body.guardian?.firstName) {
    const g = body.guardian;
    appendRow(guardianSheet, {
      id: generateId(), studentId,
      idCard: g.idCard || '', prefix: g.prefix || '',
      firstName: g.firstName || '', lastName: g.lastName || '',
      phone: g.phone || '', relation: g.relation || '',
    }, GUARDIAN_HEADERS);
  }

  // 6. บันทึก enrollment
  // FIX: เก็บ branchId และ programId แยกกันให้ถูกต้อง
  const branchId  = body.program?.branchId || '';
  const levelId   = body.program?.levelId  || '';
  const studyRound= body.program?.studyRound|| '';

  // หา programId ที่ตรงกับ branchId + round จาก Programs sheet
  const programs = sheetToObjects(getSheet(SHEETS.PROGRAMS));
  const roundLabel = { morning:'รอบเช้า', afternoon:'รอบบ่าย', dual:'ทวิภาคี' }[studyRound] || studyRound;
  const matchedProg = programs.find(p =>
    p.branchId === branchId && (p.round || '').includes(roundLabel.split(' ')[0])
  ) || programs.find(p => p.branchId === branchId) || {};

  const enrollSheet = getSheet(SHEETS.ENROLLMENTS);
  appendRow(enrollSheet, {
    id: generateId(),
    studentId,
    programId: matchedProg.id || branchId,  // FIX: ใช้ ID จริงจาก programs sheet
    levelId:   levelId,
    branchId:  branchId,                     // FIX: เก็บ branchId แยก
    roundId:   matchedProg.id || '',
    applicationNo: appNo,
    status: 'pending',
    applyDate: now.toISOString(),
  }, ENROLLMENT_HEADERS);

  // 7. อัปโหลดเอกสาร
  const docResults = [];
  if (body.documents && body.documents.length) {
    body.documents.forEach(doc => {
      try {
        const result = _uploadBase64Todrive(
          doc.base64Data, doc.fileName, doc.mimeType, studentId
        );
        const docSheet = getSheet(SHEETS.DOCUMENTS);
        appendRow(docSheet, {
          id: generateId(), studentId,
          type: doc.type,
          driveFileId: result.fileId,
          driveUrl: result.url,
          uploadedAt: now.toISOString(),
          isVerified: false,
        }, ['id','studentId','type','driveFileId','driveUrl','uploadedAt','isVerified']);
        docResults.push({ type: doc.type, success: true });
      } catch (err) {
        docResults.push({ type: doc.type, success: false, error: err.toString() });
      }
    });
  }

  // 8. อัปโหลดสลิปชำระ
  if (body.payment?.slipBase64) {
    try {
      const result = _uploadBase64Todrive(
        body.payment.slipBase64, body.payment.slipFileName || `${studentId}_slip.jpg`,
        'image/jpeg', studentId, 'payments'
      );
      const paySheet = getSheet(SHEETS.PAYMENTS);
      appendRow(paySheet, {
        id: generateId(), studentId,
        amount: body.payment.amount || 0,
        method: 'promptpay',
        slipDriveId: result.fileId,
        slipUrl: result.url,
        paidAt: now.toISOString(),
        isVerified: false,
      }, ['id','studentId','amount','method','slipDriveId','slipUrl','paidAt','isVerified']);
    } catch (err) {
      Logger.log('Payment slip upload error: ' + err);
    }
  }

  // 9. ส่ง LINE Notification (optional)
  // _notifyLine(body.lineUserId, appNo);

  return { success: true, applicationNo: appNo, studentId, documents: docResults };
}

function _statusLabel(s) {
  const m = { pending: 'รอตรวจสอบ', verified: 'ผ่านการตรวจสอบ', rejected: 'ไม่ผ่าน' };
  return m[s] || s;
}
