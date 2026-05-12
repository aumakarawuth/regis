// ============================================
// api.js — GAS API Client
// ============================================

const API = {
  baseUrl: CONFIG.API_BASE_URL,

  async get(action, params = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async post(action, body = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
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
  // GAS ไม่รองรับ multipart โดยตรง → ส่งเป็น base64
  async uploadDocument(payload) {
    // payload = { studentId, docType, fileName, base64Data, mimeType }
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
};

// ---- Helpers ----
function showLoading(msg = 'กำลังโหลด...') {
  const el = document.getElementById('loading-overlay');
  if (el) {
    el.querySelector('p').textContent = msg;
    el.classList.remove('hidden');
  }
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.add('hidden');
}

function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
