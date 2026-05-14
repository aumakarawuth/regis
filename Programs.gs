// ============================================
// Programs.gs — ระดับ / สาขา / รอบ
// ============================================

function getPrograms() {
  const sheet = getSheet(SHEETS.PROGRAMS);
  const rows = sheetToObjects(sheet);
  const levels = [];
  const levelSet = {};
  const branchMap = {};

  rows.forEach(r => {
    if (!r.isOpen) return;

    if (!levelSet[r.levelId]) {
      levelSet[r.levelId] = true;
      levels.push({ id: r.levelId, name: r.level });
    }

    if (!branchMap[r.branchId]) {
      branchMap[r.branchId] = {
        id: r.branchId,
        name: r.branch,
        levelId: r.levelId,
        isOpen: true,
        programs: [],
      };
    }

    branchMap[r.branchId].programs.push({
      programId: r.id,
      round: r.round,
    });
  });

  return {
    success: true,
    data: {
      levels,
      branches: Object.values(branchMap),
    },
  };
}

// ---- ตั้งค่า Header Sheet Programs (รันครั้งเดียว) ----
function setupProgramsSheet() {
  const sheet = getSheet(SHEETS.PROGRAMS);
  if (sheet.getLastRow() === 0) {
    const headers = ['id','levelId','level','branchId','branch','round','maxStudents','fee','isOpen'];
    sheet.appendRow(headers);

    // ตัวอย่างข้อมูล
    const examples = [
      [generateId(),'LV1','ปวช.','BR1','ช่างยนต์','รอบที่ 1 (มี.ค. - เม.ย.)',30,300,true],
      [generateId(),'LV1','ปวช.','BR1','ช่างยนต์','รอบที่ 2 (พ.ค. - มิ.ย.)',30,300,true],
      [generateId(),'LV1','ปวช.','BR2','ช่างไฟฟ้า','รอบที่ 1 (มี.ค. - เม.ย.)',30,300,true],
      [generateId(),'LV1','ปวช.','BR3','การบัญชี','รอบที่ 1 (มี.ค. - เม.ย.)',25,300,true],
      [generateId(),'LV1','ปวช.','BR4','คอมพิวเตอร์ธุรกิจ','รอบที่ 1',20,300,true],
      [generateId(),'LV2','ปวส.','BR5','ช่างยนต์','รอบที่ 1',20,300,false],
      [generateId(),'LV2','ปวส.','BR6','เทคโนโลยีสารสนเทศ','รอบที่ 1',25,300,true],
    ];
    examples.forEach(row => sheet.appendRow(row));
  }
}
