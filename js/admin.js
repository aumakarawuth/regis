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

// ROUND_LABELS comes from js/round-labels.js (loaded before this file) —
// the round dropdown is restricted to those exact labels on purpose so a
// typo here can't silently make a branch unselectable again.

const Admin = {
  students: [],
  filtered: [],
  currentTab: 'all',
  currentStudent: null,
  page: 1,
  pageSize: 15,
  searchTimeout: null,
  programLevels: [],
  programBranches: [],
  catalogLoaded: false,
  editingBranchId: null,
  staffList: [],
  staffLoaded: false,
  reportsLoaded: false,

  async init() {
    document.getElementById('topbar-date').textContent =
      new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    document.getElementById('sb-school').textContent = CONFIG.SCHOOL_NAME || 'Admin';

    document.getElementById('btn-admin-login').onclick = () => this._login();
    document.getElementById('admin-password').addEventListener('keydown', e => { if (e.key === 'Enter') this._login(); });
    document.getElementById('admin-email').addEventListener('keydown', e => { if (e.key === 'Enter') this._login(); });

    const { data: { session } } = await _sb.auth.getSession();
    if (session) {
      const access = await this._checkAccess();
      if (access) { this._showDashboard(access); return; }
      await _sb.auth.signOut();
    }
  },

  // Returns 'admin', 'staff', or null. Full admins (admin_users) can do
  // everything including delete an application; staff (an active row in
  // `staff` linked via user_id) get read/manage access but never delete
  // — enforced server-side by RLS regardless of what the UI shows.
  async _checkAccess() {
    const { data: { user } } = await _sb.auth.getUser();
    if (!user) return null;
    const { data: adminRow } = await _sb.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    if (adminRow) return 'admin';
    const { data: staffRow } = await _sb.from('staff').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle();
    if (staffRow) return 'staff';
    return null;
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

    const access = await this._checkAccess();
    hideLoading();
    if (!access) {
      await _sb.auth.signOut();
      errEl.textContent = 'บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานระบบนี้';
      errEl.classList.remove('hidden');
      return;
    }
    this._showDashboard(access);
  },

  _showDashboard(access) {
    this.isFullAdmin = access === 'admin';
    document.body.classList.toggle('is-staff-user', !this.isFullAdmin);
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    this._bindEvents();
    this._loadAll();
  },

  async _loadAll() {
    await Promise.all([this._loadStats(), this._loadStudents()]);
    await this._loadStaff();
    await this._loadNotifications();
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

    const trendStart = new Date(todayStart); trendStart.setDate(trendStart.getDate() - 13);
    const { data: trendRows } = await _sb.from('students').select('applied_at').gte('applied_at', trendStart.toISOString());
    this._renderTrendChart(trendRows || [], trendStart);
    this._renderStatusChart({ pending, verified, rejected });

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

  _renderTrendChart(rows, startDate) {
    const canvas = document.getElementById('chart-trend');
    if (!canvas || typeof Chart === 'undefined') return;

    const days = [];
    const counts = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(startDate); d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      days.push(key);
      counts[key] = 0;
    }
    rows.forEach(r => {
      const key = String(r.applied_at || '').slice(0, 10);
      if (key in counts) counts[key]++;
    });
    const labels = days.map(d => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
    const data = days.map(d => counts[d]);

    if (this._trendChart) this._trendChart.destroy();
    this._trendChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'จำนวนผู้สมัคร',
          data,
          borderColor: '#0EA5E9',
          backgroundColor: 'rgba(14,165,233,0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: '#0EA5E9',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  },

  _renderStatusChart({ pending, verified, rejected }) {
    const canvas = document.getElementById('chart-status');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this._statusChart) this._statusChart.destroy();
    this._statusChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['รอตรวจ', 'ผ่านแล้ว', 'ปฏิเสธ'],
        datasets: [{
          data: [pending || 0, verified || 0, rejected || 0],
          backgroundColor: ['#F5B301', '#10B981', '#EF4444'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { family: 'Sarabun' } } } },
      },
    });
  },

  // ---- Notifications --------------------------------------------
  // "New" is per-browser (localStorage, keyed by the logged-in user's
  // id) — a lightweight "since I last checked" marker, not an audit
  // trail. "Unhandled" and "duplicate attempts" are read straight from
  // the database instead, since those need to be the same for every
  // admin/staff regardless of device.
  _notifSeenKey(userId) { return `regis_notif_seen_${userId}`; },

  async _loadNotifications() {
    const { data: { user } } = await _sb.auth.getUser();
    if (!user) return;
    this._notifUserId = user.id;
    const seenRaw = localStorage.getItem(this._notifSeenKey(user.id));
    const seenAt = seenRaw ? new Date(seenRaw) : new Date(0);

    const newApps = this.students
      .filter(s => new Date(s.applyDate) > seenAt)
      .sort((a, b) => new Date(b.applyDate) - new Date(a.applyDate));

    const unhandled = this.students
      .filter(s => s.status === 'pending' && !s.assignedStaffId)
      .sort((a, b) => new Date(a.applyDate) - new Date(b.applyDate));

    const { data: dupRows } = await _sb.from('duplicate_attempt_log')
      .select('id, id_card, attempted_first_name, attempted_last_name, attempted_at, existing_student_id')
      .eq('is_reviewed', false)
      .order('attempted_at', { ascending: false });

    this._notif = { newApps, unhandled, duplicates: dupRows || [] };
    this._renderNotifications();
  },

  _renderNotifications() {
    const { newApps, unhandled, duplicates } = this._notif || { newApps: [], unhandled: [], duplicates: [] };
    const total = newApps.length + unhandled.length + duplicates.length;
    const badge = document.getElementById('notif-badge');
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.toggle('hidden', total === 0);

    const section = (title, items, renderItem, emptyText) => `
      <div class="notif-section">
        <div class="notif-section-title">${title} (${items.length})</div>
        ${items.length ? items.slice(0, 8).map(renderItem).join('') : `<div class="notif-empty">${emptyText}</div>`}
      </div>`;

    const appItem = s => `
      <div class="notif-item" data-open-id="${s.id}">
        <div>
          <div class="notif-item-title">${s.prefix || ''}${s.firstName || ''} ${s.lastName || ''}</div>
          <div class="notif-item-sub">${s.applicationNo || '—'} · ${_thDate(s.applyDate)}</div>
        </div>
      </div>`;

    document.getElementById('notif-list').innerHTML =
      section('🆕 ใบสมัครใหม่', newApps, appItem, 'ไม่มีใบสมัครใหม่ตั้งแต่ครั้งล่าสุดที่ดู') +
      section('⏳ ยังไม่มอบหมายผู้ดูแล', unhandled, appItem, 'ไม่มีรายการค้าง') +
      section('⚠️ ความพยายามสมัครซ้ำ (เลขบัตร ปชช.)', duplicates, d => `
        <div class="notif-item notif-item-dup">
          <div>
            <div class="notif-item-title">${d.attempted_first_name || ''} ${d.attempted_last_name || ''} <span class="notif-item-sub">(${d.id_card})</span></div>
            <div class="notif-item-sub">ลองสมัครซ้ำเมื่อ ${_thDate(d.attempted_at)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${d.existing_student_id ? `<button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:0.75rem" data-open-id="${d.existing_student_id}">ดูใบเดิม</button>` : ''}
            <button class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:0.75rem" data-dismiss-dup="${d.id}">รับทราบ</button>
          </div>
        </div>`, 'ไม่มีความพยายามสมัครซ้ำ');

    document.getElementById('notif-list').querySelectorAll('[data-open-id]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        document.getElementById('notif-panel').classList.add('hidden');
        this._openDetail(el.dataset.openId);
      };
    });
    document.getElementById('notif-list').querySelectorAll('[data-dismiss-dup]').forEach(btn => {
      btn.onclick = async e => {
        e.stopPropagation();
        const id = btn.dataset.dismissDup;
        await _sb.from('duplicate_attempt_log').update({ is_reviewed: true }).eq('id', id);
        this._notif.duplicates = this._notif.duplicates.filter(d => d.id !== id);
        this._renderNotifications();
      };
    });
  },

  _toggleNotifPanel() {
    document.getElementById('notif-panel').classList.toggle('hidden');
  },

  _markNotificationsSeen() {
    if (!this._notifUserId) return;
    localStorage.setItem(this._notifSeenKey(this._notifUserId), new Date().toISOString());
    if (this._notif) this._notif.newApps = [];
    this._renderNotifications();
  },

  async _loadStudents() {
    const { data, error } = await _sb
      .from('students')
      .select(`
        id, application_no, prefix, first_name, last_name, id_card, phone, applied_at, status,
        old_school, assigned_staff_id,
        enrollments(status, program_rounds(round_label, branches(name, education_levels(name)))),
        documents(id, doc_type, storage_path, uploaded_at, is_verified),
        payments(id, storage_path, amount, paid_at, is_verified),
        addresses(province_text)
      `)
      .order('applied_at', { ascending: false });

    if (error) { showToast('โหลดรายชื่อล้มเหลว', 'error'); return; }

    this.students = (data || []).map(s => {
      const enroll = Array.isArray(s.enrollments) ? s.enrollments[0] : s.enrollments;
      const branch = enroll?.program_rounds?.branches;
      const docs = s.documents || [];
      const payment = (Array.isArray(s.payments) ? s.payments[0] : s.payments) || null;
      const addr = Array.isArray(s.addresses) ? s.addresses[0] : s.addresses;
      return {
        id: s.id,
        applicationNo: s.application_no,
        prefix: s.prefix, firstName: s.first_name, lastName: s.last_name,
        idCard: s.id_card, phone: s.phone, applyDate: s.applied_at, status: s.status,
        oldSchool: s.old_school || '', province: addr?.province_text || '',
        assignedStaffId: s.assigned_staff_id,
        branchName: branch?.name || '—',
        roundName: enroll?.program_rounds?.round_label || '—',
        levelName: branch?.education_levels?.name || '—',
        documents: docs,
        payment,
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
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--muted)">ไม่พบข้อมูล</td></tr>';
      document.getElementById('page-btns').innerHTML = '';
      return;
    }

    const staffName = id => this.staffList.find(s => s.id === id)?.name || '—';

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
        <td>${s.assignedStaffId ? staffName(s.assignedStaffId) : '<span style="color:var(--muted)">— ยังไม่มอบหมาย —</span>'}</td>
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
      _infoItem('โรงเรียนเดิม', s.oldSchool) + _infoItem('จังหวัด', s.province) +
      _infoItem('วันที่สมัคร', _thDate(s.applyDate)) +
      `<div><div class="info-label">สถานะ</div><div class="info-value"><span class="badge ${_statusBadge(s.status)}">${_statusLabel(s.status)}</span></div></div>` +
      '</div>' +
      '<div class="section-label">ผู้ดูแล / การติดตาม</div>' +
      '<div class="form-group" style="margin-bottom:12px"><select class="form-control" id="dp-assigned-staff"></select></div>' +
      '<div id="dp-followups" style="margin-bottom:20px"></div>' +
      '<div class="doc-request-panel">' +
        '<div class="section-label">📋 ขอเอกสารเพิ่มเติมทาง LINE</div>' +
        '<div class="doc-chips">' +
          _DOC_REQUEST_TYPES.map(t => `
            <label class="doc-chip">
              <input type="checkbox" class="dp-doc-request-check" value="${t}">
              <span>${_docLabel(t)}</span>
            </label>`).join('') +
        '</div>' +
        '<textarea class="form-control" id="dp-doc-request-note" placeholder="หมายเหตุถึงผู้สมัคร (ถ้ามี) เช่น รูปเบลอ ขอถ่ายใหม่ให้เห็นชัด"></textarea>' +
        '<button class="btn btn-sm btn-send-request" id="dp-btn-send-doc-request">📤 ส่งขอเอกสารทาง LINE</button>' +
        '<div class="doc-request-history" id="dp-doc-requests"></div>' +
      '</div>' +
      '<div class="section-label">เอกสารแนบ</div>' +
      '<div id="dp-docs">' + (docs.length ? docs.map(d => `
        <div class="doc-row" data-doc-id="${d.id}">
          <div class="doc-thumb" data-thumb-for="${d.id}" data-bucket="documents" data-path="${d.storage_path}">📄</div>
          <div style="flex:1"><div class="doc-name">${_docLabel(d.doc_type)}</div><div class="doc-date">${_thDate(d.uploaded_at)}</div></div>
          <button class="btn btn-sm ${d.is_verified ? 'btn-outline' : 'btn-primary'}" data-verify-id="${d.id}" data-verify-table="documents" data-verify-next="${!d.is_verified}">
            ${d.is_verified ? '✓ ผ่านแล้ว' : 'ตรวจสอบ'}
          </button>
        </div>
      `).join('') : '<p style="color:var(--muted);font-size:0.875rem">ยังไม่มีเอกสาร</p>') +
      (s.payment && s.payment.storage_path ? `
        <div class="doc-row" data-doc-id="${s.payment.id}">
          <div class="doc-thumb" data-thumb-for="${s.payment.id}" data-bucket="payment-slips" data-path="${s.payment.storage_path}">📄</div>
          <div style="flex:1"><div class="doc-name">${_docLabel('payment_slip')}</div><div class="doc-date">${_thDate(s.payment.paid_at)}</div></div>
          <button class="btn btn-sm ${s.payment.is_verified ? 'btn-outline' : 'btn-primary'}" data-verify-id="${s.payment.id}" data-verify-table="payments" data-verify-next="${!s.payment.is_verified}">
            ${s.payment.is_verified ? '✓ ผ่านแล้ว' : 'ตรวจสอบ'}
          </button>
        </div>
      ` : '') + '</div>';

    document.getElementById('dp-body').querySelectorAll('[data-verify-id]').forEach(btn => {
      btn.onclick = () => this._verifyDoc(btn.dataset.verifyId, btn.dataset.verifyTable, btn.dataset.verifyNext === 'true', btn);
    });

    this._populateStaffDropdowns();
    document.getElementById('dp-assigned-staff').value = s.assignedStaffId || '';
    document.getElementById('dp-assigned-staff').onchange = e => this._assignStaff(e.target.value);
    this._loadFollowUps(id);
    document.getElementById('dp-btn-send-doc-request').onclick = () => this._sendDocRequest();
    this._loadDocRequests(id);

    document.getElementById('detail-overlay').classList.add('open');
    document.getElementById('detail-panel').classList.add('open');

    // Signed thumbnail URLs load after the panel opens (private buckets).
    document.getElementById('dp-body').querySelectorAll('[data-thumb-for]').forEach(async thumb => {
      const { bucket, path } = thumb.dataset;
      if (!bucket || !path) return;
      const { data: signed } = await _sb.storage.from(bucket).createSignedUrl(path, 3600);
      if (signed?.signedUrl) {
        thumb.innerHTML = `<img src="${signed.signedUrl}" alt="เอกสาร">`;
        thumb.onclick = () => window.open(signed.signedUrl, '_blank');
      }
    });
  },

  async _assignStaff(staffId) {
    if (!this.currentStudent) return;
    const { error } = await _sb.from('students').update({ assigned_staff_id: staffId || null }).eq('id', this.currentStudent.id);
    if (error) return showToast('มอบหมายล้มเหลว: ' + error.message, 'error');

    this.currentStudent.assignedStaffId = staffId || null;
    const s = this.students.find(x => x.id === this.currentStudent.id);
    if (s) s.assignedStaffId = staffId || null;
    showToast('บันทึกผู้ดูแลแล้ว', 'success', 1500);
    this._renderTable();
    this._loadNotifications();
  },

  async _loadFollowUps(studentId) {
    const el = document.getElementById('dp-followups');
    const { data, error } = await _sb.from('follow_ups')
      .select('id, note, created_at, staff!staff_id(name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) { el.innerHTML = '<p style="color:var(--muted);font-size:0.8125rem">โหลดประวัติการติดตามไม่สำเร็จ</p>'; return; }

    el.innerHTML = (data && data.length)
      ? data.map(f => {
          const staff = Array.isArray(f.staff) ? f.staff[0] : f.staff;
          return `<div style="font-size:0.8125rem;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-weight:700">${staff?.name || 'ไม่ระบุ'}</span>
          <span style="color:var(--muted)"> · ${_thDate(f.created_at)}</span>
          <div>${f.note}</div>
        </div>`;
        }).join('')
      : '';
  },

  async _sendDocRequest() {
    if (!this.currentStudent) return;
    const docTypes = Array.from(document.querySelectorAll('.dp-doc-request-check:checked')).map(el => el.value);
    const note = document.getElementById('dp-doc-request-note').value.trim();
    if (!docTypes.length) return showToast('เลือกเอกสารที่ต้องการขอก่อน', 'error');

    const btn = document.getElementById('dp-btn-send-doc-request');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังส่ง...';
    const { data, error } = await _sb.functions.invoke('send-document-request', {
      body: { studentId: this.currentStudent.id, docTypes, note },
    });
    btn.disabled = false;
    btn.textContent = originalLabel;
    if (error) return showToast('ส่งคำขอล้มเหลว: ' + error.message, 'error');
    if (data && data.success === false) return showToast(data.message || 'ส่งคำขอล้มเหลว', 'error');

    document.querySelectorAll('.dp-doc-request-check:checked').forEach(el => el.checked = false);
    document.getElementById('dp-doc-request-note').value = '';
    showToast(data && data.skipped ? data.message : 'ส่งคำขอเอกสารทาง LINE แล้ว', data && data.skipped ? 'warning' : 'success');
    this._loadDocRequests(this.currentStudent.id);
  },

  async _loadDocRequests(studentId) {
    const el = document.getElementById('dp-doc-requests');
    const { data, error } = await _sb.from('document_requests')
      .select('id, doc_types, note, status, requested_at, resolved_at')
      .eq('student_id', studentId)
      .order('requested_at', { ascending: false });
    if (error) { el.innerHTML = '<p class="doc-request-history-empty">โหลดประวัติคำขอเอกสารไม่สำเร็จ</p>'; return; }

    el.innerHTML = (data && data.length)
      ? data.map(r => `
        <div class="doc-request-item">
          <div class="doc-request-item-top">
            <span class="doc-request-item-meta">
              <span class="badge ${r.status === 'resolved' ? 'badge-success' : 'badge-warning'}">${r.status === 'resolved' ? '✓ ครบแล้ว' : '⏳ รอเอกสาร'}</span>
              · ${_thDate(r.requested_at)}
            </span>
            ${r.status === 'pending' ? `<button class="btn btn-outline btn-sm" data-resolve-request="${r.id}">ทำเครื่องหมายว่าครบแล้ว</button>` : ''}
          </div>
          <div class="doc-request-item-docs">${r.doc_types.map(t => `<span>${_docLabel(t)}</span>`).join('')}</div>
          ${r.note ? `<div class="doc-request-item-note">"${r.note}"</div>` : ''}
        </div>`).join('')
      : '<p class="doc-request-history-empty">ยังไม่มีคำขอเอกสาร</p>';

    el.querySelectorAll('[data-resolve-request]').forEach(btn => {
      btn.onclick = () => this._resolveDocRequest(btn.dataset.resolveRequest, studentId);
    });
  },

  async _resolveDocRequest(requestId, studentId) {
    const { error } = await _sb.from('document_requests').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', requestId);
    if (error) return showToast('เกิดข้อผิดพลาด', 'error');
    showToast('ทำเครื่องหมายว่าครบแล้ว', 'success', 1500);
    this._loadDocRequests(studentId);
  },

  _closeDetail() {
    document.getElementById('detail-overlay').classList.remove('open');
    document.getElementById('detail-panel').classList.remove('open');
    this.currentStudent = null;
  },

  // Admin-only in the UI (button has .admin-only) — also enforced
  // server-side: RLS only grants delete on students to is_admin(), a
  // staff account hitting this would fail the request regardless.
  async _deleteApplication() {
    if (!this.currentStudent) return;
    const s = this.currentStudent;
    const name = `${s.prefix || ''}${s.firstName || ''} ${s.lastName || ''}`.trim();
    if (!confirm(`ลบใบสมัครของ "${name}" (เลขที่ ${s.applicationNo || '—'}) ถาวร?\n\nข้อมูลที่อยู่ ผู้ปกครอง เอกสาร และประวัติการติดตามทั้งหมดของใบสมัครนี้จะถูกลบไปด้วย และกู้คืนไม่ได้`)) return;

    showLoading('กำลังลบใบสมัคร...');
    const { error } = await _sb.from('students').delete().eq('id', s.id);
    hideLoading();
    if (error) return showToast('ลบใบสมัครล้มเหลว: ' + error.message, 'error');

    showToast('ลบใบสมัครแล้ว', 'success');
    this._closeDetail();
    this.students = this.students.filter(x => x.id !== s.id);
    this._applyFilter();
    this._loadStats();
    this._loadNotifications();
  },

  async _verifyDoc(docId, table, verified, btn) {
    const { data: { session } } = await _sb.auth.getSession();
    const { error } = await _sb.from(table || 'documents').update({
      is_verified: verified,
      verified_at: verified ? new Date().toISOString() : null,
      verified_by: verified ? session.user.id : null,
    }).eq('id', docId);
    if (error) { showToast('เกิดข้อผิดพลาด', 'error'); return; }

    btn.textContent = verified ? '✓ ผ่านแล้ว' : 'ตรวจสอบ';
    btn.className = `btn btn-sm ${verified ? 'btn-outline' : 'btn-primary'}`;
    btn.dataset.verifyNext = String(!verified);
    showToast(verified ? 'ยืนยันเอกสารแล้ว' : 'ยกเลิกการยืนยัน', 'success');

    if (table === 'payments') {
      if (this.currentStudent?.payment?.id === docId) this.currentStudent.payment.is_verified = verified;
    } else {
      const doc = this.currentStudent?.documents.find(d => d.id === docId);
      if (doc) doc.is_verified = verified;
    }
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

  _downloadCSV(rows, filenamePrefix) {
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  _exportCSV() {
    const staffName = id => this.staffList.find(x => x.id === id)?.name || '';
    const rows = [[
      'เลขสมัคร', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เลขบัตร', 'เบอร์โทร',
      'ระดับ', 'สาขา', 'รอบ', 'โรงเรียนเดิม', 'จังหวัด', 'ผู้ดูแล', 'วันที่สมัคร', 'สถานะ',
    ]];
    this.students.forEach(s => {
      rows.push([
        s.applicationNo, s.prefix, s.firstName, s.lastName, s.idCard, s.phone,
        s.levelName, s.branchName, s.roundName, s.oldSchool, s.province,
        s.assignedStaffId ? staffName(s.assignedStaffId) : '',
        s.applyDate ? new Date(s.applyDate).toLocaleDateString('th-TH') : '',
        _statusLabel(s.status),
      ]);
    });
    this._downloadCSV(rows, 'students');
  },

  // ---------- Reports ----------
  _renderReportsPage() {
    const byBranch = {};
    this.students.forEach(s => {
      const key = `${s.levelName}||${s.branchName}`;
      if (!byBranch[key]) byBranch[key] = { level: s.levelName, branch: s.branchName, total: 0, pending: 0, verified: 0, rejected: 0 };
      byBranch[key].total++;
      byBranch[key][s.status] = (byBranch[key][s.status] || 0) + 1;
    });
    const branchRows = Object.values(byBranch).sort((a, b) => b.total - a.total);
    document.getElementById('report-branch-tbody').innerHTML = branchRows.length
      ? branchRows.map(r => `<tr><td>${r.level}</td><td>${r.branch}</td><td>${r.total}</td><td>${r.pending || 0}</td><td>${r.verified || 0}</td><td>${r.rejected || 0}</td></tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">ยังไม่มีข้อมูล</td></tr>';

    const bySchool = {};
    this.students.forEach(s => { const k = s.oldSchool || 'ไม่ระบุ'; bySchool[k] = (bySchool[k] || 0) + 1; });
    const schoolRows = Object.entries(bySchool).sort((a, b) => b[1] - a[1]);
    document.getElementById('report-school-tbody').innerHTML = schoolRows.length
      ? schoolRows.map(([name, count]) => `<tr><td>${name}</td><td>${count}</td></tr>`).join('')
      : '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--muted)">ยังไม่มีข้อมูล</td></tr>';

    const byProvince = {};
    this.students.forEach(s => { const k = s.province || 'ไม่ระบุ'; byProvince[k] = (byProvince[k] || 0) + 1; });
    const provinceRows = Object.entries(byProvince).sort((a, b) => b[1] - a[1]);
    document.getElementById('report-province-tbody').innerHTML = provinceRows.length
      ? provinceRows.map(([name, count]) => `<tr><td>${name}</td><td>${count}</td></tr>`).join('')
      : '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--muted)">ยังไม่มีข้อมูล</td></tr>';
  },

  _exportReportBranch() {
    const byBranch = {};
    this.students.forEach(s => {
      const key = `${s.levelName}||${s.branchName}`;
      if (!byBranch[key]) byBranch[key] = { level: s.levelName, branch: s.branchName, total: 0, pending: 0, verified: 0, rejected: 0 };
      byBranch[key].total++;
      byBranch[key][s.status] = (byBranch[key][s.status] || 0) + 1;
    });
    const rows = [['ระดับ', 'สาขา', 'ทั้งหมด', 'รอตรวจ', 'ผ่านแล้ว', 'ปฏิเสธ']];
    Object.values(byBranch).forEach(r => rows.push([r.level, r.branch, r.total, r.pending || 0, r.verified || 0, r.rejected || 0]));
    this._downloadCSV(rows, 'report-branch');
  },
  _exportReportSchool() {
    const bySchool = {};
    this.students.forEach(s => { const k = s.oldSchool || 'ไม่ระบุ'; bySchool[k] = (bySchool[k] || 0) + 1; });
    this._downloadCSV([['โรงเรียนเดิม', 'จำนวนผู้สมัคร'], ...Object.entries(bySchool)], 'report-school');
  },
  _exportReportProvince() {
    const byProvince = {};
    this.students.forEach(s => { const k = s.province || 'ไม่ระบุ'; byProvince[k] = (byProvince[k] || 0) + 1; });
    this._downloadCSV([['จังหวัด', 'จำนวนผู้สมัคร'], ...Object.entries(byProvince)], 'report-province');
  },

  // ---------- Staff (ครูแนะแนว / KPI) ----------
  async _loadStaff() {
    const [{ data: staff }, { data: followUps }] = await Promise.all([
      _sb.from('staff').select('id, name, role, phone, email, is_active, user_id').order('name'),
      _sb.from('follow_ups').select('staff_id, created_at'),
    ]);
    const assignedCounts = {};
    this.students.forEach(s => { if (s.assignedStaffId) assignedCounts[s.assignedStaffId] = (assignedCounts[s.assignedStaffId] || 0) + 1; });

    const fuByStaff = {};
    (followUps || []).forEach(f => {
      (fuByStaff[f.staff_id] ||= []).push(f.created_at);
    });

    this.staffList = (staff || []).map(st => {
      const dates = fuByStaff[st.id] || [];
      return {
        ...st,
        assignedCount: assignedCounts[st.id] || 0,
        followUpCount: dates.length,
        lastFollowUp: dates.length ? dates.sort().slice(-1)[0] : null,
      };
    });
  },

  _renderStaffPage() {
    const tbody = document.getElementById('staff-tbody');
    if (!this.staffList.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">ยังไม่มีเจ้าหน้าที่ — เพิ่มจากฟอร์มด้านบน</td></tr>';
      return;
    }
    const STALE_DAYS = 7;
    const now = Date.now();
    tbody.innerHTML = this.staffList.map(st => {
      const daysSince = st.lastFollowUp ? Math.floor((now - new Date(st.lastFollowUp).getTime()) / 86400000) : null;
      const isActive = st.assignedCount > 0 && daysSince !== null && daysSince <= STALE_DAYS;
      const statusBadge = st.assignedCount === 0
        ? '<span class="badge badge-gray">ยังไม่มีงาน</span>'
        : isActive
          ? '<span class="badge badge-success">ทำงานอยู่</span>'
          : '<span class="badge badge-danger">เงียบ / ไม่ติดตาม</span>';
      return `
        <tr>
          <td class="td-name">${st.name}${st.is_active ? '' : ' <span class="badge badge-gray">ปิดใช้งาน</span>'}</td>
          <td>${st.role}</td>
          <td>${st.phone || '—'}</td>
          <td>${st.assignedCount}</td>
          <td>${st.followUpCount}</td>
          <td>${st.lastFollowUp ? _thDate(st.lastFollowUp) : '— ยังไม่เคย —'}</td>
          <td>${statusBadge}</td>
          <td>${st.user_id
            ? '<span class="badge badge-success">มีบัญชีแล้ว</span>'
            : `<button class="btn btn-outline btn-sm admin-only staff-create-login" data-staff-id="${st.id}" data-staff-name="${st.name}" data-staff-email="${st.email || ''}">🔑 สร้างบัญชี login</button>`}</td>
          <td><button class="btn btn-ghost btn-sm staff-toggle admin-only" data-staff-id="${st.id}" data-active="${st.is_active}">${st.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.staff-toggle').forEach(btn => {
      btn.onclick = () => this._toggleStaffActive(btn.dataset.staffId, btn.dataset.active !== 'true');
    });
    tbody.querySelectorAll('.staff-create-login').forEach(btn => {
      btn.onclick = () => this._createStaffLogin(btn.dataset.staffId, btn.dataset.staffName, btn.dataset.staffEmail);
    });
  },

  async _createStaffLogin(staffId, name, existingEmail) {
    const email = prompt(`อีเมลสำหรับเข้าสู่ระบบของ "${name}"`, existingEmail || '');
    if (!email) return;
    const password = prompt('ตั้งรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)');
    if (!password) return;
    if (password.length < 6) return showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');

    showLoading('กำลังสร้างบัญชี...');
    const { data, error } = await _sb.functions.invoke('create-staff-account', {
      body: { staffId, email, password },
    });
    hideLoading();
    if (error) return showToast('สร้างบัญชีล้มเหลว: ' + error.message, 'error');
    if (data && data.success === false) return showToast(data.message || 'สร้างบัญชีล้มเหลว', 'error');

    showToast(`สร้างบัญชี login ให้ ${name} แล้ว`, 'success');
    await this._loadStaff();
    this._renderStaffPage();
  },

  async _addStaff() {
    const name = document.getElementById('new-staff-name').value.trim();
    const role = document.getElementById('new-staff-role').value;
    const phone = document.getElementById('new-staff-phone').value.trim();
    if (!name) return showToast('กรอกชื่อเจ้าหน้าที่', 'error');

    const { error } = await _sb.from('staff').insert({ name, role, phone });
    if (error) return showToast('เพิ่มเจ้าหน้าที่ล้มเหลว: ' + error.message, 'error');

    document.getElementById('new-staff-name').value = '';
    document.getElementById('new-staff-phone').value = '';
    showToast('เพิ่มเจ้าหน้าที่แล้ว', 'success');
    await this._loadStaff();
    this._renderStaffPage();
    this._populateStaffDropdowns();
  },

  async _toggleStaffActive(staffId, active) {
    const { error } = await _sb.from('staff').update({ is_active: active }).eq('id', staffId);
    if (error) return showToast('บันทึกล้มเหลว: ' + error.message, 'error');

    showToast(active ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว', 'success');
    await this._loadStaff();
    this._renderStaffPage();
    this._populateStaffDropdowns();
  },

  // Refreshes the assign/follow-up staff <select>s inside an open detail panel.
  _populateStaffDropdowns() {
    const assignSel = document.getElementById('dp-assigned-staff');
    if (!assignSel) return;
    const active = this.staffList.filter(s => s.is_active);
    const curAssigned = assignSel.value;
    assignSel.innerHTML = '<option value="">— ยังไม่มอบหมาย —</option>' + active.map(s => `<option value="${s.id}">${s.name} (${s.role})</option>`).join('');
    assignSel.value = curAssigned;
  },

  _printStudent() {
    if (!this.currentStudent) return;
    window.open(`print.html?studentId=${this.currentStudent.id}`, '_blank');
  },

  // ---------- Programs (education_levels / branches / program_rounds) ----------
  async _loadCatalog() {
    const [{ data: levels }, { data: branches }, { data: rounds }] = await Promise.all([
      _sb.from('education_levels').select('id, code, name').order('code'),
      _sb.from('branches').select('id, code, name, level_id, max_students, fee, is_open').order('code'),
      _sb.from('program_rounds').select('id, branch_id, round_label, is_open'),
    ]);
    this.programLevels = levels || [];
    this.programBranches = (branches || []).map(b => ({
      ...b,
      rounds: (rounds || []).filter(r => r.branch_id === b.id),
    }));
    this._renderProgramsPage();
  },

  _renderProgramsPage() {
    const chipsEl = document.getElementById('level-chips');
    chipsEl.innerHTML = this.programLevels.length
      ? this.programLevels.map(l => `<span class="badge badge-gray">${l.code} — ${l.name}</span>`).join('')
      : '<span style="color:var(--muted);font-size:0.875rem">ยังไม่มีระดับการศึกษา</span>';

    const levelSel = document.getElementById('new-branch-level');
    const curLevel = levelSel.value;
    levelSel.innerHTML = this.programLevels.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    if (curLevel) levelSel.value = curLevel;

    const levelName = id => this.programLevels.find(l => l.id === id)?.name || '—';

    const tbody = document.getElementById('branch-tbody');
    if (!this.programBranches.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">ยังไม่มีสาขา — เพิ่มจากฟอร์มด้านบน</td></tr>';
      return;
    }

    tbody.innerHTML = this.programBranches.map(b => {
      const isEditing = this.editingBranchId === b.id;
      const nameCell = isEditing
        ? `<input class="form-control edit-name" value="${b.name.replace(/"/g, '&quot;')}" style="width:160px">`
        : `<span class="td-name">${b.name}</span>`;
      const levelCell = isEditing
        ? `<select class="form-control edit-level" style="width:130px">${this.programLevels.map(l => `<option value="${l.id}" ${l.id === b.level_id ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`
        : levelName(b.level_id);
      const actionsCell = isEditing
        ? `<button class="btn btn-primary btn-sm branch-save">บันทึก</button>
           <button class="btn btn-ghost btn-sm branch-cancel">ยกเลิก</button>`
        : `<button class="btn btn-outline btn-sm branch-edit">แก้ไข</button>
           <button class="btn btn-ghost btn-sm branch-delete" style="color:var(--danger)">ลบ</button>`;

      return `
      <tr data-branch-id="${b.id}">
        <td>${nameCell}</td>
        <td>${levelCell}</td>
        <td><input class="form-control branch-fee" type="number" value="${b.fee}" style="width:90px"></td>
        <td><input class="form-control branch-max" type="number" value="${b.max_students}" style="width:80px"></td>
        <td>${ROUND_LABELS.map(r => {
          const isOpen = b.rounds.some(x => x.round_label === r && x.is_open);
          return `<label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:0.8125rem">
            <input type="checkbox" class="round-check" data-round="${r}" ${isOpen ? 'checked' : ''}> ${r}
          </label>`;
        }).join('')}</td>
        <td><input type="checkbox" class="branch-open" ${b.is_open ? 'checked' : ''}></td>
        <td style="white-space:nowrap">${actionsCell}</td>
      </tr>
    `;
    }).join('');

    tbody.querySelectorAll('tr').forEach(row => {
      const branchId = row.dataset.branchId;
      row.querySelector('.branch-fee').addEventListener('change', e => this._updateBranch(branchId, { fee: Number(e.target.value) || 0 }));
      row.querySelector('.branch-max').addEventListener('change', e => this._updateBranch(branchId, { max_students: Number(e.target.value) || 0 }));
      row.querySelector('.branch-open').addEventListener('change', e => this._updateBranch(branchId, { is_open: e.target.checked }));
      row.querySelectorAll('.round-check').forEach(cb => {
        cb.addEventListener('change', e => this._toggleRound(branchId, e.target.dataset.round, e.target.checked));
      });

      const editBtn = row.querySelector('.branch-edit');
      if (editBtn) editBtn.addEventListener('click', () => { this.editingBranchId = branchId; this._renderProgramsPage(); });

      const cancelBtn = row.querySelector('.branch-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', () => { this.editingBranchId = null; this._renderProgramsPage(); });

      const saveBtn = row.querySelector('.branch-save');
      if (saveBtn) saveBtn.addEventListener('click', async () => {
        const name = row.querySelector('.edit-name').value.trim();
        const levelId = row.querySelector('.edit-level').value;
        if (!name) return showToast('กรอกชื่อสาขา', 'error');
        await this._updateBranch(branchId, { name, level_id: levelId });
        this.editingBranchId = null;
        await this._loadCatalog();
      });

      const deleteBtn = row.querySelector('.branch-delete');
      if (deleteBtn) deleteBtn.addEventListener('click', () => this._deleteBranch(branchId));
    });
  },

  async _addLevel() {
    const code = document.getElementById('new-level-code').value.trim();
    const name = document.getElementById('new-level-name').value.trim();
    if (!code || !name) return showToast('กรอกรหัสและชื่อระดับให้ครบ', 'error');

    const { error } = await _sb.from('education_levels').insert({ code, name });
    if (error) return showToast('เพิ่มระดับล้มเหลว: ' + error.message, 'error');

    document.getElementById('new-level-code').value = '';
    document.getElementById('new-level-name').value = '';
    showToast('เพิ่มระดับแล้ว', 'success');
    await this._loadCatalog();
  },

  async _addBranch() {
    const levelId = document.getElementById('new-branch-level').value;
    const code = document.getElementById('new-branch-code').value.trim();
    const name = document.getElementById('new-branch-name').value.trim();
    const fee = Number(document.getElementById('new-branch-fee').value) || 0;
    const maxStudents = Number(document.getElementById('new-branch-max').value) || 0;
    if (!levelId || !code || !name) return showToast('กรอกระดับ/รหัส/ชื่อสาขาให้ครบ', 'error');

    const { error } = await _sb.from('branches').insert({
      level_id: levelId, code, name, fee, max_students: maxStudents, is_open: true,
    });
    if (error) return showToast('เพิ่มสาขาล้มเหลว: ' + error.message, 'error');

    document.getElementById('new-branch-code').value = '';
    document.getElementById('new-branch-name').value = '';
    showToast('เพิ่มสาขาแล้ว', 'success');
    await this._loadCatalog();
  },

  async _updateBranch(branchId, patch) {
    const { error } = await _sb.from('branches').update(patch).eq('id', branchId);
    if (error) return showToast('บันทึกล้มเหลว: ' + error.message, 'error');

    const b = this.programBranches.find(x => x.id === branchId);
    if (b) Object.assign(b, patch);
    showToast('บันทึกแล้ว', 'success', 1500);
  },

  async _toggleRound(branchId, roundLabel, checked) {
    const b = this.programBranches.find(x => x.id === branchId);
    const existing = b?.rounds.find(r => r.round_label === roundLabel);

    if (checked) {
      if (existing) {
        const { error } = await _sb.from('program_rounds').update({ is_open: true }).eq('id', existing.id);
        if (error) return showToast('เปิดรอบล้มเหลว: ' + error.message, 'error');
        existing.is_open = true;
      } else {
        const { data, error } = await _sb.from('program_rounds')
          .insert({ branch_id: branchId, round_label: roundLabel, is_open: true })
          .select().single();
        if (error) return showToast('เพิ่มรอบล้มเหลว: ' + error.message, 'error');
        b.rounds.push(data);
      }
    } else if (existing) {
      const { error } = await _sb.from('program_rounds').update({ is_open: false }).eq('id', existing.id);
      if (error) return showToast('ปิดรอบล้มเหลว: ' + error.message, 'error');
      existing.is_open = false;
    }
    showToast('บันทึกแล้ว', 'success', 1500);
  },

  async _deleteBranch(branchId) {
    const b = this.programBranches.find(x => x.id === branchId);
    if (!confirm(`ลบสาขา "${b?.name || ''}"? รอบเรียนทั้งหมดของสาขานี้จะถูกลบด้วย (ถ้ามีนักเรียนสมัครในรอบนั้นแล้วจะลบไม่ได้)`)) return;

    if (b?.rounds.length) {
      const { error: rErr } = await _sb.from('program_rounds').delete().in('id', b.rounds.map(r => r.id));
      if (rErr) return showToast('ลบไม่ได้: มีนักเรียนสมัครในรอบของสาขานี้แล้ว', 'error');
    }
    const { error } = await _sb.from('branches').delete().eq('id', branchId);
    if (error) return showToast('ลบสาขาล้มเหลว: ' + error.message, 'error');

    showToast('ลบสาขาแล้ว', 'success');
    await this._loadCatalog();
  },

  _bindEvents() {
    const pageTitles = { overview: 'ภาพรวม', students: 'รายชื่อผู้สมัคร', programs: 'จัดการหลักสูตร', reports: 'รายงาน', staff: 'เจ้าหน้าที่' };
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.onclick = async () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const page = item.dataset.page;
        Object.keys(pageTitles).forEach(p => {
          document.getElementById('page-' + p).classList.toggle('hidden', p !== page);
        });
        document.getElementById('topbar-title').textContent = pageTitles[page] || '';
        if (page === 'programs' && !this.catalogLoaded) {
          this.catalogLoaded = true;
          this._loadCatalog();
        } else if (page === 'reports') {
          this._renderReportsPage();
        } else if (page === 'staff') {
          await this._loadStaff();
          this._renderStaffPage();
        }
      };
    });
    document.getElementById('btn-notif').onclick = e => { e.stopPropagation(); this._toggleNotifPanel(); };
    document.getElementById('btn-notif-mark-seen').onclick = e => { e.stopPropagation(); this._markNotificationsSeen(); };
    document.getElementById('notif-panel').onclick = e => e.stopPropagation();
    document.addEventListener('click', () => document.getElementById('notif-panel').classList.add('hidden'));
    document.getElementById('btn-add-level').onclick = () => this._addLevel();
    document.getElementById('btn-add-branch').onclick = () => this._addBranch();
    document.getElementById('btn-add-staff').onclick = () => this._addStaff();
    document.getElementById('btn-export-report-branch').onclick = () => this._exportReportBranch();
    document.getElementById('btn-export-report-school').onclick = () => this._exportReportSchool();
    document.getElementById('btn-export-report-province').onclick = () => this._exportReportProvince();
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
    document.getElementById('dp-btn-delete').onclick = () => this._deleteApplication();
  },
};

// ---- Helpers ----
function _statusBadge(s) { return { pending: 'badge-warning', verified: 'badge-success', rejected: 'badge-danger' }[s] || 'badge-gray'; }
function _statusLabel(s) { return { pending: 'รอตรวจ', verified: 'ผ่านแล้ว', rejected: 'ปฏิเสธ' }[s] || s || '—'; }
const _DOC_REQUEST_TYPES = ['id_card_front', 'id_card_back', 'house_reg', 'edu_cert_front', 'edu_cert_back', 'payment_slip'];
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
