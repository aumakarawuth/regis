// ============================================
// admin.js — Admin Dashboard (Supabase Auth + Postgres)
// ============================================
// Replaces AdminPage.gs's server-rendered dashboard + google.script.run
// calls. Auth: Supabase Auth (email/password) instead of the shared
// ADMIN_PASSWORDS token; an account only sees data once it also has a
// row in admin_users (see supabase/migrations/0001_init_schema.sql) —
// RLS enforces that server-side too, this is just for a clear login error.

const _sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const REQUIRED_DOC_TYPES = ['id_card_front', 'id_card_back', 'house_reg', 'edu_cert_front', 'edu_cert_back'];

const Admin = {
  students: [],
  filtered: [],
  currentTab: 'all',
  currentStudent: null,
  page: 1,
  pageSize: 15,
  searchTimeout: null,

  async init() {
    document.getElementById('topbar-date').textContent =
      new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    document.getElementById('sb-school').textContent = CONFIG.SCHOOL_NAME || 'Admin';

    document.getElementById('btn-admin-login').onclick = () => this._login();
    document.getElementById('admin-password').addEventListener('keydown', e => { if (e.key === 'Enter') this._login(); });
    document.getElementById('admin-email').addEventListener('keydown', e => { if (e.key === 'Enter') this._login(); });

    const { data: { session } } = await _sb.auth.getSession();
    if (session) {
      const isAdmin = await this._checkIsAdmin();
      if (isAdmin) { this._showDashboard(); return; }
      await _sb.auth.signOut();
    }
  },

  async _checkIsAdmin() {
    const { data: { user } } = await _sb.auth.getUser();
    if (!user) return false;
    const { data, error } = await _sb.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    return !error && !!data;
  },

  async _login() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    if (!email || !password) return showToast('กรุณากรอกอีเมลและรหัสผ่าน', 'error');

    showLoading('กำลังตรวจสอบ...');
    const { error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) {
      hideLoading();
      errEl.textContent = 'เข้าสู่ระบบไม่สำเร็จ: อีเมลหรือรหัสผ่านไม่ถูกต้อง';
      errEl.classList.remove('hidden');
      return;
    }

    const isAdmin = await this._checkIsAdmin();
    hideLoading();
    if (!isAdmin) {
      await _sb.auth.signOut();
      errEl.textContent = 'บัญชีนี้ไม่มีสิทธิ์แอดมิน';
      errEl.classList.remove('hidden');
      return;
    }
    this._showDashboard();
  },

  _showDashboard() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    this._bindEvents();
    this._loadAll();
  },

  async _loadAll() {
    await Promise.all([this._loadStats(), this._loadStudents()]);
  },

  async _refreshAll() {
    showToast('กำลังรีเฟรช...', 'info', 1500);
    await this._loadAll();
  },

  async _loadStats() {
    const [{ count: total }, { count: pending }, { count: verified }, { count: rejected }] = await Promise.all([
      _sb.from('students').select('*', { count: 'exact', head: true }),
      _sb.from('students').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      _sb.from('students').select('*', { count: 'exact', head: true }).eq('status', 'verified'),
      _sb.from('students').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    ]);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { count: today } = await _sb.from('students').select('*', { count: 'exact', head: true }).gte('applied_at', todayStart.toISOString());

    const { data: enrollments } = await _sb.from('enrollments').select('program_rounds(branches(name))');
    const branchCount = {};
    (enrollments || []).forEach(e => {
      const name = e.program_rounds?.branches?.name || 'ไม่ระบุ';
      branchCount[name] = (branchCount[name] || 0) + 1;
    });
    const byBranch = Object.entries(branchCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    document.getElementById('stat-total').textContent = total ?? '—';
    document.getElementById('stat-today').textContent = today ?? '—';
    document.getElementById('stat-pending').textContent = pending ?? '—';
    document.getElementById('stat-verified').textContent = verified ?? '—';
    document.getElementById('nav-pending-badge').textContent = pending || 0;

    const branchEl = document.getElementById('branch-stats');
    if (byBranch.length) {
      const max = Math.max(...byBranch.map(b => b.count));
      branchEl.innerHTML = byBranch.map(b => `
        <div class="branch-row"><div style="width:160px;flex-shrink:0">${b.name}</div>
          <div class="branch-bar-wrap"><div class="branch-bar" style="width:${Math.round(b.count / max * 100)}%"></div></div>
          <div style="width:32px;text-align:right;font-weight:700;color:var(--primary)">${b.count}</div></div>
      `).join('');
    } else {
      branchEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:8px">ยังไม่มีข้อมูล</p>';
    }
  },

  async _loadStudents() {
    const { data, error } = await _sb
      .from('students')
      .select(`
        id, application_no, prefix, first_name, last_name, id_card, phone, applied_at, status,
        enrollments(status, program_rounds(round_label, branches(name, education_levels(name)))),
        documents(id, doc_type, storage_path, uploaded_at, is_verified)
      `)
      .order('applied_at', { ascending: false });

    if (error) { showToast('โหลดรายชื่อล้มเหลว', 'error'); return; }

    this.students = (data || []).map(s => {
      const enroll = Array.isArray(s.enrollments) ? s.enrollments[0] : s.enrollments;
      const branch = enroll?.program_rounds?.branches;
      const docs = s.documents || [];
      return {
        id: s.id,
        applicationNo: s.application_no,
        prefix: s.prefix, firstName: s.first_name, lastName: s.last_name,
        idCard: s.id_card, phone: s.phone, applyDate: s.applied_at, status: s.status,
        branchName: branch?.name || '—',
        roundName: enroll?.program_rounds?.round_label || '—',
        levelName: branch?.education_levels?.name || '—',
        documents: docs,
        docsComplete: REQUIRED_DOC_TYPES.every(t => docs.some(d => d.doc_type === t)),
      };
    });
    this.filtered = this.students.slice();
    this._populateBranchFilter();
    this.page = 1;
    this._renderTable();
  },

  _populateBranchFilter() {
    const sel = document.getElementById('filter-branch');
    const current = sel.value;
    const branches = [...new Set(this.students.map(s => s.branchName).filter(b => b && b !== '—'))];
    sel.innerHTML = '<option value="">ทุกสาขา</option>' + branches.map(b => `<option value="${b}">${b}</option>`).join('');
    sel.value = current;
  },

  _applyFilter() {
    const search = (document.getElementById('search-input').value || '').toLowerCase().trim();
    const branch = document.getElementById('filter-branch').value;
    const tab = this.currentTab;
    this.filtered = this.students.filter(s => {
      const matchTab = tab === 'all' || s.status === tab;
      const matchBranch = !branch || s.branchName === branch;
      const matchSearch = !search || [s.firstName, s.lastName, s.idCard, s.applicationNo, s.phone]
        .some(v => v && String(v).toLowerCase().includes(search));
      return matchTab && matchBranch && matchSearch;
    });
    this.page = 1;
    this._renderTable();
  },

  _renderTable() {
    const tbody = document.getElementById('student-tbody');
    const start = (this.page - 1) * this.pageSize;
    const items = this.filtered.slice(start, start + this.pageSize);
    const total = this.filtered.length;

    document.getElementById('page-info').textContent =
      `แสดง ${total ? start + 1 : 0}–${Math.min(start + items.length, total)} จาก ${total} รายการ`;

    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">ไม่พบข้อมูล</td></tr>';
      document.getElementById('page-btns').innerHTML = '';
      return;
    }

    tbody.innerHTML = items.map(s => `
      <tr data-id="${s.id}">
        <td class="td-appno">${s.applicationNo || '—'}</td>
        <td><div class="td-name">${s.prefix || ''}${s.firstName || ''} ${s.lastName || ''}</div>
        <div class="td-sub">${s.idCard || ''}</div></td>
        <td><div>${s.branchName || '—'}</div><div class="td-sub">${s.roundName || ''}</div></td>
        <td>${s.phone || '—'}</td>
        <td style="white-space:nowrap">${_thDate(s.applyDate)}</td>
        <td><span class="badge ${_statusBadge(s.status)}">${_statusLabel(s.status)}</span></td>
        <td>${s.docsComplete ? '<span class="badge badge-success">ครบ</span>' : '<span class="badge badge-warning">ไม่ครบ</span>'}</td>
        <td><button class="btn btn-outline btn-sm" data-open-id="${s.id}">ดูรายละเอียด</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('tr').forEach(row => { row.onclick = () => this._openDetail(row.dataset.id); });
    tbody.querySelectorAll('[data-open-id]').forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); this._openDetail(btn.dataset.openId); };
    });

    const totalPages = Math.ceil(total / this.pageSize);
    let btns = `<button class="page-btn" data-page="${this.page - 1}" ${this.page <= 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - this.page) <= 2) {
        btns += `<button class="page-btn ${i === this.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
      } else if (Math.abs(i - this.page) === 3) {
        btns += '<span style="padding:0 4px;color:var(--muted)">…</span>';
      }
    }
    btns += `<button class="page-btn" data-page="${this.page + 1}" ${this.page >= totalPages ? 'disabled' : ''}>›</button>`;
    const pageBtns = document.getElementById('page-btns');
    pageBtns.innerHTML = btns;
    pageBtns.querySelectorAll('[data-page]').forEach(b => { b.onclick = () => this._goPage(+b.dataset.page); });
  },

  _goPage(n) {
    const total = Math.ceil(this.filtered.length / this.pageSize);
    if (n < 1 || n > total) return;
    this.page = n;
    this._renderTable();
  },

  async _openDetail(id) {
    const s = this.students.find(st => st.id === id);
    if (!s) return;
    this.currentStudent = s;

    document.getElementById('dp-name').textContent = `${s.prefix || ''}${s.firstName || ''} ${s.lastName || ''}`;
    document.getElementById('dp-appno').textContent = s.applicationNo || '—';

    const docs = s.documents || [];
    document.getElementById('dp-body').innerHTML =
      '<div class="section-label">ข้อมูลการสมัคร</div>' +
      '<div class="info-grid" style="margin-bottom:20px">' +
      _infoItem('สาขา', s.branchName) + _infoItem('รอบ', s.roundName) +
      _infoItem('เลขบัตร', s.idCard) + _infoItem('เบอร์โทร', s.phone) +
      _infoItem('วันที่สมัคร', _thDate(s.applyDate)) +
      `<div><div class="info-label">สถานะ</div><div class="info-value"><span class="badge ${_statusBadge(s.status)}">${_statusLabel(s.status)}</span></div></div>` +
      '</div>' +
      '<div class="section-label">เอกสารแนบ</div>' +
      '<div id="dp-docs">' + (docs.length ? docs.map(d => `
        <div class="doc-row" data-doc-id="${d.id}">
          <div class="doc-thumb" data-thumb-for="${d.id}">📄</div>
          <div style="flex:1"><div class="doc-name">${_docLabel(d.doc_type)}</div><div class="doc-date">${_thDate(d.uploaded_at)}</div></div>
          <button class="btn btn-sm ${d.is_verified ? 'btn-outline' : 'btn-primary'}" data-verify-id="${d.id}" data-verify-next="${!d.is_verified}">
            ${d.is_verified ? '✓ ผ่านแล้ว' : 'ตรวจสอบ'}
          </button>
        </div>
      `).join('') : '<p style="color:var(--muted);font-size:0.875rem">ยังไม่มีเอกสาร</p>') + '</div>';

    document.getElementById('dp-body').querySelectorAll('[data-verify-id]').forEach(btn => {
      btn.onclick = () => this._verifyDoc(btn.dataset.verifyId, btn.dataset.verifyNext === 'true', btn);
    });

    document.getElementById('detail-overlay').classList.add('open');
    document.getElementById('detail-panel').classList.add('open');

    // Signed thumbnail URLs load after the panel opens (private bucket).
    docs.forEach(async d => {
      const thumb = document.querySelector(`[data-thumb-for="${d.id}"]`);
      if (!thumb) return;
      const { data: signed } = await _sb.storage.from('documents').createSignedUrl(d.storage_path, 3600);
      if (signed?.signedUrl) {
        thumb.innerHTML = `<img src="${signed.signedUrl}" alt="${_docLabel(d.doc_type)}">`;
        thumb.onclick = () => window.open(signed.signedUrl, '_blank');
      }
    });
  },

  _closeDetail() {
    document.getElementById('detail-overlay').classList.remove('open');
    document.getElementById('detail-panel').classList.remove('open');
    this.currentStudent = null;
  },

  async _verifyDoc(docId, verified, btn) {
    const { data: { session } } = await _sb.auth.getSession();
    const { error } = await _sb.from('documents').update({
      is_verified: verified,
      verified_at: verified ? new Date().toISOString() : null,
      verified_by: verified ? session.user.id : null,
    }).eq('id', docId);
    if (error) { showToast('เกิดข้อผิดพลาด', 'error'); return; }

    btn.textContent = verified ? '✓ ผ่านแล้ว' : 'ตรวจสอบ';
    btn.className = `btn btn-sm ${verified ? 'btn-outline' : 'btn-primary'}`;
    btn.dataset.verifyNext = String(!verified);
    showToast(verified ? 'ยืนยันเอกสารแล้ว' : 'ยกเลิกการยืนยัน', 'success');

    const doc = this.currentStudent?.documents.find(d => d.id === docId);
    if (doc) doc.is_verified = verified;
  },

  async _updateStatus(status) {
    if (!this.currentStudent) return;
    showLoading('กำลังบันทึก...');
    const { error } = await _sb.from('students').update({ status }).eq('id', this.currentStudent.id);
    hideLoading();
    if (error) { showToast('เกิดข้อผิดพลาด', 'error'); return; }
    showToast('อัปเดตสถานะแล้ว', 'success');
    this._closeDetail();
    await this._loadAll();
  },

  async _exportCSV() {
    const rows = [[
      'เลขสมัคร', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เลขบัตร', 'เบอร์โทร',
      'ระดับ', 'สาขา', 'รอบ', 'วันที่สมัคร', 'สถานะ',
    ]];
    this.students.forEach(s => {
      rows.push([
        s.applicationNo, s.prefix, s.firstName, s.lastName, s.idCard, s.phone,
        s.levelName, s.branchName, s.roundName,
        s.applyDate ? new Date(s.applyDate).toLocaleDateString('th-TH') : '',
        _statusLabel(s.status),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  _printStudent() {
    if (!this.currentStudent) return;
    window.open(`print.html?studentId=${this.currentStudent.id}`, '_blank');
  },

  _bindEvents() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.onclick = () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const page = item.dataset.page;
        document.getElementById('page-overview').classList.toggle('hidden', page !== 'overview');
        document.getElementById('page-students').classList.toggle('hidden', page !== 'students');
        document.getElementById('topbar-title').textContent = page === 'overview' ? 'ภาพรวม' : 'รายชื่อผู้สมัคร';
      };
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTab = btn.dataset.tab;
        this._applyFilter();
      };
    });
    document.getElementById('search-input').addEventListener('input', () => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => this._applyFilter(), 300);
    });
    document.getElementById('filter-branch').addEventListener('change', () => this._applyFilter());
    document.getElementById('btn-export-csv').onclick = () => this._exportCSV();
    document.getElementById('nav-export').onclick = () => this._exportCSV();
    document.getElementById('btn-refresh-list').onclick = () => this._refreshAll();
    document.getElementById('nav-refresh').onclick = () => this._refreshAll();
    document.getElementById('btn-logout').onclick = async () => { await _sb.auth.signOut(); location.reload(); };
    document.getElementById('btn-toggle-sidebar').onclick = () => document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('btn-close-detail').onclick = () => this._closeDetail();
    document.getElementById('detail-overlay').onclick = () => this._closeDetail();
    document.getElementById('dp-btn-approve').onclick = () => this._updateStatus('verified');
    document.getElementById('dp-btn-reject').onclick = () => this._updateStatus('rejected');
    document.getElementById('dp-btn-pending').onclick = () => this._updateStatus('pending');
    document.getElementById('dp-btn-print').onclick = () => this._printStudent();
  },
};

// ---- Helpers ----
function _statusBadge(s) { return { pending: 'badge-warning', verified: 'badge-success', rejected: 'badge-danger' }[s] || 'badge-gray'; }
function _statusLabel(s) { return { pending: 'รอตรวจ', verified: 'ผ่านแล้ว', rejected: 'ปฏิเสธ' }[s] || s || '—'; }
function _docLabel(t) {
  return {
    id_card_front: 'บัตร ปชช. ด้านหน้า', id_card_back: 'บัตร ปชช. ด้านหลัง',
    house_reg: 'ทะเบียนบ้าน', edu_cert: 'วุฒิการศึกษา',
    edu_cert_front: 'วุฒิ ด้านหน้า', edu_cert_back: 'วุฒิ ด้านหลัง',
    payment_slip: 'สลิปโอนเงิน',
  }[t] || t;
}
function _thDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}
function _infoItem(label, val) { return `<div><div class="info-label">${label}</div><div class="info-value">${val || '—'}</div></div>`; }

function showToast(msg, type = 'info', ms = 3500) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, ms);
}
function showLoading(msg) {
  const el = document.getElementById('loading-overlay');
  const p = el.querySelector('p');
  if (p && msg) p.textContent = msg;
  el.classList.remove('hidden');
}
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

document.addEventListener('DOMContentLoaded', () => Admin.init());
