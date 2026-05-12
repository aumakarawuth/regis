// ============================================
// admin.js — Admin Dashboard Logic
// ============================================

const Admin = {
  token: '',
  students: [],
  filtered: [],
  currentTab: 'all',
  page: 1,
  pageSize: 20,
  searchTimeout: null,

  init() {
    // ตรวจ session
    const saved = sessionStorage.getItem('adminToken');
    if (saved) {
      this.token = saved;
      this._showDashboard();
    }

    // Login
    document.getElementById('btn-admin-login').onclick = () => this._login();
    document.getElementById('admin-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._login();
    });
  },

  _login() {
    const pw = document.getElementById('admin-password').value;
    if (!pw) return showToast('กรุณากรอกรหัสผ่าน', 'error');

    if (CONFIG.ADMIN_PASSWORDS.includes(pw)) {
      this.token = pw;
      sessionStorage.setItem('adminToken', pw);
      this._showDashboard();
    } else {
      showToast('รหัสผ่านไม่ถูกต้อง', 'error');
    }
  },

  _showDashboard() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    this._loadAll();
    this._bindEvents();
  },

  async _loadAll() {
    await Promise.all([this._loadStats(), this._loadStudents()]);
  },

  async _loadStats() {
    try {
      const res = await API.adminGetStats(this.token);
      const s = res.data || {};
      document.getElementById('stat-total').textContent = s.total ?? '—';
      document.getElementById('stat-today').textContent = s.today ?? '—';
      document.getElementById('stat-pending').textContent = s.pending ?? '—';
      document.getElementById('stat-verified').textContent = s.verified ?? '—';

      // Branch breakdown
      const branchEl = document.getElementById('branch-stats');
      if (s.byBranch && s.byBranch.length) {
        branchEl.innerHTML = s.byBranch.map(b => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--clr-border)">
            <span style="font-size:0.875rem">${b.name}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:80px;height:6px;background:var(--clr-border);border-radius:3px;overflow:hidden">
                <div style="width:${Math.min(100, (b.count / s.total) * 100)}%;height:100%;background:var(--clr-primary);border-radius:3px"></div>
              </div>
              <span style="font-size:0.875rem;font-weight:700;min-width:24px;text-align:right">${b.count}</span>
            </div>
          </div>
        `).join('');
      } else {
        branchEl.innerHTML = '<p class="text-sm text-muted text-center" style="padding:8px">ยังไม่มีข้อมูล</p>';
      }
    } catch (err) {
      console.error('Stats error:', err);
    }
  },

  async _loadStudents(search = '') {
    showLoading('กำลังโหลดรายชื่อ...');
    try {
      const params = { status: this.currentTab === 'all' ? '' : this.currentTab };
      if (search) params.search = search;

      const res = await API.adminGetStudents(this.token, params);
      this.students = res.data || [];
      this.filtered = [...this.students];
      this.page = 1;
      this._renderList();
    } catch (err) {
      showToast('โหลดข้อมูลล้มเหลว', 'error');
    } finally {
      hideLoading();
    }
  },

  _renderList() {
    const listEl = document.getElementById('student-list');
    const start = (this.page - 1) * this.pageSize;
    const items = this.filtered.slice(start, start + this.pageSize);

    if (items.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--clr-text-muted)">ไม่พบข้อมูล</div>';
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    listEl.innerHTML = items.map(s => `
      <div class="student-row" data-id="${s.id}">
        <div class="student-avatar">👤</div>
        <div class="student-info">
          <div class="student-name">${s.prefix}${s.firstName} ${s.lastName}</div>
          <div class="student-meta">${s.branchName} | ${s.roundName}</div>
          <div class="student-meta">${s.phone} | ${_thDate(s.applyDate)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="student-appno">${s.applicationNo}</span>
          <span class="badge ${_statusBadge(s.status)}">${_statusLabel(s.status)}</span>
          ${!s.docsComplete ? '<span class="badge badge-warning">เอกสารไม่ครบ</span>' : ''}
        </div>
      </div>
    `).join('');

    // Pagination
    const totalPages = Math.ceil(this.filtered.length / this.pageSize);
    document.getElementById('pagination').innerHTML = totalPages <= 1 ? '' : `
      <button class="btn btn-sm btn-outline" onclick="Admin._goPage(${this.page - 1})" ${this.page <= 1 ? 'disabled' : ''}>◀</button>
      <span style="font-size:0.875rem;padding:0 8px">หน้า ${this.page}/${totalPages}</span>
      <button class="btn btn-sm btn-outline" onclick="Admin._goPage(${this.page + 1})" ${this.page >= totalPages ? 'disabled' : ''}>▶</button>
    `;

    // Click → detail
    listEl.querySelectorAll('.student-row').forEach(row => {
      row.onclick = () => {
        const student = this.students.find(s => s.id === row.dataset.id);
        if (student) this._showDetail(student);
      };
    });
  },

  _goPage(n) {
    const totalPages = Math.ceil(this.filtered.length / this.pageSize);
    if (n < 1 || n > totalPages) return;
    this.page = n;
    this._renderList();
  },

  _showDetail(student) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-content');

    const docs = student.documents || [];
    const docsHtml = docs.length ? docs.map(d => `
      <div class="doc-verify-row">
        ${d.driveUrl ? `<img src="${d.driveUrl}" onclick="window.open('${d.driveUrl}','_blank')" alt="${d.type}">` : '<div style="width:60px;height:45px;background:var(--clr-bg);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.25rem">📄</div>'}
        <div class="doc-info">
          <div class="doc-name">${_docLabel(d.type)}</div>
          <div style="font-size:0.75rem;color:var(--clr-text-muted)">${_thDate(d.uploadedAt)}</div>
        </div>
        <button class="btn btn-sm ${d.isVerified ? 'btn-outline' : 'btn-primary'}"
          onclick="Admin._verifyDoc('${d.id}', ${!d.isVerified}, this)">
          ${d.isVerified ? '✓ ผ่านแล้ว' : 'ตรวจสอบ'}
        </button>
      </div>
    `).join('') : '<p class="text-sm text-muted">ยังไม่มีเอกสาร</p>';

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div>
          <h3 style="font-size:1.125rem;font-weight:700">${student.prefix}${student.firstName} ${student.lastName}</h3>
          <p style="font-size:0.875rem;color:var(--clr-text-muted)">${student.applicationNo}</p>
        </div>
        <button onclick="Admin._closeDetail()" class="btn btn-ghost btn-sm">✕ ปิด</button>
      </div>

      <div class="card" style="margin-bottom:16px">
        <p class="section-title">ข้อมูลทั่วไป</p>
        ${_reviewRow('สาขา', student.branchName)}
        ${_reviewRow('รอบ', student.roundName)}
        ${_reviewRow('เลขบัตร', student.idCard)}
        ${_reviewRow('เบอร์โทร', student.phone)}
        ${_reviewRow('วันที่สมัคร', _thDate(student.applyDate))}
        ${_reviewRow('สถานะ', `<span class="badge ${_statusBadge(student.status)}">${_statusLabel(student.status)}</span>`)}
      </div>

      <p class="section-title">เอกสาร</p>
      <div style="margin-bottom:16px">${docsHtml}</div>

      <p class="section-title">เปลี่ยนสถานะ</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn btn-sm btn-primary" onclick="Admin._updateStatus('${student.id}','verified')">✅ อนุมัติ</button>
        <button class="btn btn-sm btn-danger" onclick="Admin._updateStatus('${student.id}','rejected')">❌ ปฏิเสธ</button>
        <button class="btn btn-sm btn-outline" onclick="Admin._updateStatus('${student.id}','pending')">🔄 รอดำเนินการ</button>
      </div>

      <button class="btn btn-outline btn-full" onclick="Admin._printStudent('${student.id}')">🖨️ พิมพ์ใบสมัคร</button>
    `;

    modal.classList.remove('hidden');
    modal.onclick = (e) => { if (e.target === modal) this._closeDetail(); };
  },

  _closeDetail() {
    document.getElementById('detail-modal').classList.add('hidden');
  },

  async _verifyDoc(docId, verified, btn) {
    try {
      await API.adminVerifyDoc(this.token, docId, verified);
      btn.textContent = verified ? '✓ ผ่านแล้ว' : 'ตรวจสอบ';
      btn.className = `btn btn-sm ${verified ? 'btn-outline' : 'btn-primary'}`;
      showToast(verified ? 'ยืนยันเอกสารแล้ว' : 'ยกเลิกการยืนยัน', 'success');
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

  async _updateStatus(studentId, status) {
    try {
      showLoading('กำลังบันทึก...');
      await API.adminUpdateStatus(this.token, studentId, status);
      hideLoading();
      showToast('อัปเดตสถานะแล้ว', 'success');
      this._closeDetail();
      await this._loadAll();
    } catch {
      hideLoading();
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  },

  _printStudent(studentId) {
    const url = `${CONFIG.API_BASE_URL}?action=printApplication&token=${this.token}&studentId=${studentId}`;
    window.open(url, '_blank');
  },

  _exportCSV() {
    const url = `${CONFIG.API_BASE_URL}?action=exportCSV&token=${this.token}`;
    window.open(url, '_blank');
  },

  _bindEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTab = btn.dataset.tab;
        this._loadStudents(document.getElementById('search-input').value);
      };
    });

    // Search
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this._loadStudents(e.target.value.trim());
      }, 400);
    });

    // Buttons
    document.getElementById('btn-export-csv').onclick = () => this._exportCSV();
    document.getElementById('btn-refresh').onclick = () => this._loadAll();
  },
};

// ---- Helpers ----
function _statusBadge(s) {
  return { pending: 'badge-warning', verified: 'badge-success', rejected: 'badge-danger' }[s] || 'badge-gray';
}
function _statusLabel(s) {
  return { pending: 'รอตรวจ', verified: 'ผ่านแล้ว', rejected: 'ปฏิเสธ' }[s] || s;
}
function _docLabel(type) {
  const map = {
    id_card_front: 'บัตร ปชช. ด้านหน้า', id_card_back: 'บัตร ปชช. ด้านหลัง',
    house_reg: 'ทะเบียนบ้าน', edu_cert: 'วุฒิการศึกษา', payment_slip: 'สลิปโอนเงิน',
  };
  return map[type] || type;
}
function _thDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}
function _reviewRow(key, val) {
  return `<div class="review-row"><span class="review-key">${key}</span><span class="review-val">${val || '—'}</span></div>`;
}
