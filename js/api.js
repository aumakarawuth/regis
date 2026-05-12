// ============================================
// api.js — GAS API Client (แก้ 400 Bad Request)
// ============================================
// ปัญหา: GAS Web App ไม่รองรับ CORS preflight (OPTIONS)
// วิธีแก้:
//   GET  → fetch ปกติ (ไม่มี preflight)
//   POST → ส่ง body เป็น text/plain หรือ no-cors
//          แต่ no-cors อ่าน response ไม่ได้
//          → ใช้ GET + query string แทน POST สำหรับข้อมูลเล็ก
//          → ใช้ POST + mode:'cors' + Content-Type ไม่ใส่ (ให้เป็น text/plain auto)

const API = {
  baseUrl: CONFIG.API_BASE_URL,

  // ---- GET request ----
  async get(action, params = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error('GET ' + action + ' failed: HTTP ' + res.status);
    const text = await res.text();
    return JSON.parse(text);
  },

  // ---- POST request ----
  // GAS รับ POST ได้แต่ต้องไม่ส่ง Content-Type: application/json (ทำให้เกิด preflight)
  // วิธีที่ได้ผลสุด: ใส่ action ใน query string, ส่ง body เป็น JSON string ธรรมดา
  async post(action, body = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);

    // ใส่ action ใน body ด้วยเพื่อความมั่นใจ
    const payload = { ...body, action };

    const res = await fetch(url.toString(), {
      method: 'POST',
      // ไม่ใส่ Content-Type header → browser ใช้ text/plain อัตโนมัติ → ไม่มี preflight
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('POST ' + action + ' failed: HTTP ' + res.status);
    const text = await res.text();
    return JSON.parse(text);
  },

  // ---------- Programs ----------
  async getPrograms() {
    return this.get('getPrograms');
  },

  // ---------- Address ----------
  async getProvinces() {
    return this.get('getProvinces');
  },

  async getDistricts(provinceId) {
    return this.get('getDistricts', { provinceId });
  },

  async getSubDistricts(districtId) {
    return this.get('getSubDistricts', { districtId });
  },

  // ---------- Application ----------
  async submitApplication(data) {
    return this.post('submitApplication', data);
  },

  async getApplicationStatus(lineUserId) {
    return this.get('getApplicationStatus', { lineUserId });
  },

  // ---------- Document Upload ----------
  async uploadDocument(payload) {
    return this.post('uploadDocument', payload);
  },

  // ---------- Admin ----------
  async adminGetStats(token) {
    return this.get('adminGetStats', { token });
  },

  async adminGetStudents(token, params = {}) {
    return this.get('adminGetStudents', { token, ...params });
  },

  async adminVerifyDoc(token, docId, verified) {
    return this.post('adminVerifyDoc', { token, docId, verified });
  },

  async adminUpdateStatus(token, studentId, status) {
    return this.post('adminUpdateStatus', { token, studentId, status });
  },

  // ---------- Health Check ----------
  async ping() {
    return this.get('ping');
  },
};

// ---- UI Helpers ----
function showLoading(msg = 'กำลังโหลด...') {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  const p = el.querySelector('p');
  if (p) p.textContent = msg;
  el.classList.remove('hidden');
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) { console.warn('Toast:', msg); return; }

  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
