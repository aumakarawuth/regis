// ============================================
// config.js — App Configuration
// ============================================
// แก้ค่าเหล่านี้ก่อนใช้งานจริง

const CONFIG = {
  // LINE LIFF
  LIFF_ID: '2011646500-ET0zwCRy',         // ได้จาก LINE Developers Console

  // Supabase (Project Settings -> API)
  SUPABASE_URL: 'https://bfkklmixuqpwkjzglbpf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJma2tsbWl4dXFwd2tqemdsYnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDYyNTksImV4cCI6MjEwMzIyMjI1OX0.KrvgkzeBAd2ASIizubx6tpOwwPG7iSfzNBRd8ABPZyo', // anon/public key — ปลอดภัยที่ใช้ฝั่ง client (RLS คุมสิทธิ์)

  // ค่าสมัคร — QR โอนเงินเป็นภาพนิ่งที่ assets/payment-qr.jpg (บัญชีธนาคาร
  // ของวิทยาลัยโดยตรง ไม่ใช่ QR PromptPay ที่ฝังจำนวนเงินอัตโนมัติ)
  APPLICATION_FEE: 300,                  // ค่าสมัคร (บาท)

  // School Info
  SCHOOL_NAME: 'วิทยาลัยเทคโนโลยีจรัลสนิทวงศ์',
  SCHOOL_ADDRESS: '18 ซอยจรัญสนิทวงศ์41 อรุณอมรินทร์ บางกอกน้อย กรุงเทพฯ',
  SCHOOL_PHONE: '02-4346155',
  SCHOOL_LINE: '@ctc.bangkok',

  // Admin
  ADMIN_PASSWORDS: ['admin1234'],        // ในระบบจริงใช้ Token / OAuth

  // Web Push (admin dashboard "🔔 เปิดการแจ้งเตือน") — public key only,
  // safe to ship to the browser. Must match the VAPID_PUBLIC_KEY secret
  // set on the notify-new-application edge function.
  VAPID_PUBLIC_KEY: 'BJO1y1KYT2AzZMReHJzvI_O1eaI7P5oukrah2nsXFBw3qpimu179dMlYVYklBsdb7SM8I6uJV1z4ZkObrrpE5EE',

  // ปีการศึกษา
  ACADEMIC_YEAR: 2569,
};

// อย่า export ถ้าใช้ใน plain HTML — ใช้ CONFIG object โดยตรง
