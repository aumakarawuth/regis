// ============================================
// config.js — App Configuration
// ============================================
// แก้ค่าเหล่านี้ก่อนใช้งานจริง

const CONFIG = {
  // LINE LIFF
  LIFF_ID: '2010194460-OF1oXCTY',         // ได้จาก LINE Developers Console

  // Supabase (Project Settings -> API)
  SUPABASE_URL: 'https://bfkklmixuqpwkjzglbpf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJma2tsbWl4dXFwd2tqemdsYnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDYyNTksImV4cCI6MjEwMzIyMjI1OX0.KrvgkzeBAd2ASIizubx6tpOwwPG7iSfzNBRd8ABPZyo', // anon/public key — ปลอดภัยที่ใช้ฝั่ง client (RLS คุมสิทธิ์)

  // PromptPay
  PROMPTPAY_NUMBER: '0812345678',        // เบอร์หรือเลขบัตรประชาชน
  APPLICATION_FEE: 300,                  // ค่าสมัคร (บาท)

  // School Info
  SCHOOL_NAME: 'วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์',
  SCHOOL_ADDRESS: '18 ซอยจรัญสนิทวงศ์41 อรุณอมรินทร์ บางกอกน้อย กรุงเทพฯ',
  SCHOOL_PHONE: '02-4346155',
  SCHOOL_LINE: '@ctc.bangkok',

  // Admin
  ADMIN_PASSWORDS: ['admin1234'],        // ในระบบจริงใช้ Token / OAuth

  // ปีการศึกษา
  ACADEMIC_YEAR: 2569,
};

// อย่า export ถ้าใช้ใน plain HTML — ใช้ CONFIG object โดยตรง
