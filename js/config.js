// ============================================
// config.js — App Configuration
// ============================================
// แก้ค่าเหล่านี้ก่อนใช้งานจริง

const CONFIG = {
  // LINE LIFF
  LIFF_ID: '2010038922-8oEBPiap',         // ได้จาก LINE Developers Console

  // Google Apps Script Web App URL
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbyaeKOOtAxBLnbS2i1mKCFB-8sAExUWLy4sqM8uZvAFPRkNQ-gB6ISLF6EskaJlcf-dww/exec',  // Publish > Deploy as web app

  // PromptPay
  PROMPTPAY_NUMBER: '0812345678',        // เบอร์หรือเลขบัตรประชาชน
  APPLICATION_FEE: 300,                  // ค่าสมัคร (บาท)

  // Google Drive Folder IDs (สร้างแล้วแชร์สิทธิ์กับ Service Account)
  DRIVE_FOLDER: {
    ROOT: '1njmYVDNAI-IQZ4dGN_PqV_eb0Ut8p2m-',
    DOCS: '1IATeVqM2ciw2BcZWP7OBQEl4hRsnvb50',
    PAYMENTS: '11eeTv6Jua1t5Q3x__oTlhgBfaJgAy92C',
  },

  // School Info
  SCHOOL_NAME: 'วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์',
  SCHOOL_ADDRESS: '123 ถนนตัวอย่าง อำเภอเมือง จังหวัดตัวอย่าง 10000',
  SCHOOL_PHONE: '02-4346155',
  SCHOOL_LINE: '@ctc.bangkok',

  // Admin
  ADMIN_PASSWORDS: ['admin1234'],        // ในระบบจริงใช้ Token / OAuth

  // ปีการศึกษา
  ACADEMIC_YEAR: 2568,
};

// อย่า export ถ้าใช้ใน plain HTML — ใช้ CONFIG object โดยตรง
