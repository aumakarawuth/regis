// ============================================
// api.js — Supabase API Client
// ============================================
// Replaces the old GAS Web App client. Same method names/shapes as
// before (getPrograms/submitApplication/getApplicationStatus) so
// js/form.js and apply.html's own inline copy don't need to change.

const _sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const _STATUS_LABELS = { pending: 'รอตรวจสอบ', verified: 'ผ่านการตรวจสอบ', rejected: 'ไม่ผ่าน' };

// Storage RLS scopes uploads to the uploader's own auth.uid() (see
// supabase/migrations/0005_storage_owner_scoped.sql) — a plain anon-key
// request has no auth.uid(), so uploads need a real (if anonymous)
// Supabase Auth session first. Doesn't cache a failed attempt, since
// this is a long-lived page (index.html) that could sit open from
// before "Allow anonymous sign-ins" was enabled.
let _anonSessionPromise = null;
function _ensureAnonSession() {
  if (!_anonSessionPromise) {
    _anonSessionPromise = _sb.auth.getSession().then(({ data: { session } }) => {
      if (session) return session;
      return _sb.auth.signInAnonymously().then(({ data, error }) => {
        if (error) throw error;
        return data.session;
      });
    }).catch(err => { _anonSessionPromise = null; throw err; });
  }
  return _anonSessionPromise;
}

function _base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

const API = {
  // ---------- Programs ----------
  // Shape matches the old Programs.gs getPrograms(): { levels, branches }
  // where each branch has .programs = [{ programId, round }].
  async getPrograms() {
    const { data: branches, error } = await _sb
      .from('branches')
      .select('code, name, is_open, education_levels(code, name), program_rounds(id, round_label, is_open)')
      .eq('is_open', true);
    if (error) throw error;

    const levels = [];
    const seenLevels = new Set();
    const branchList = (branches || []).map(b => {
      const level = b.education_levels;
      if (level && !seenLevels.has(level.code)) {
        seenLevels.add(level.code);
        levels.push({ id: level.code, name: level.name });
      }
      return {
        id: b.code,
        name: b.name,
        levelId: level ? level.code : '',
        isOpen: b.is_open,
        programs: (b.program_rounds || [])
          .filter(r => r.is_open)
          .map(r => ({ programId: r.id, round: r.round_label })),
      };
    });

    return { success: true, data: { levels, branches: branchList } };
  },

  // ---------- Application ----------
  // payload is the same shape Students.gs's submitApplication(body) used
  // to take. The RPC handles student/address/parents/guardian/enrollment
  // atomically; documents + payment slip are uploaded here afterwards.
  async submitApplication(payload) {
    const { data: rpcResult, error: rpcError } = await _sb.rpc('submit_application', {
      payload: {
        lineUserId: payload.lineUserId,
        displayName: payload.displayName,
        program: payload.program,
        personal: payload.personal,
        address: payload.address,
        parents: payload.parents,
        guardian: payload.guardian,
      },
    });
    if (rpcError) throw rpcError;
    if (!rpcResult.success) return rpcResult;

    // Storage uploads need a real (if anonymous) session — see
    // _ensureAnonSession above. Without this, every upload below fails
    // RLS silently while the application record itself still saves.
    await _ensureAnonSession().catch(err => console.warn('Anonymous session unavailable, uploads will fail:', err));

    const studentId = rpcResult.studentId;
    const docResults = [];

    for (const doc of payload.documents || []) {
      try {
        const blob = _base64ToBlob(doc.base64Data, doc.mimeType || 'image/jpeg');
        const storagePath = `${studentId}/${doc.type}.jpg`;
        const { error: upErr } = await _sb.storage.from('documents').upload(storagePath, blob, {
          contentType: doc.mimeType || 'image/jpeg',
          upsert: true,
        });
        if (upErr) throw upErr;

        const { error: dbErr } = await _sb.from('documents').insert({
          student_id: studentId,
          doc_type: doc.type,
          storage_path: storagePath,
        });
        if (dbErr) throw dbErr;
        docResults.push({ type: doc.type, success: true });
      } catch (err) {
        docResults.push({ type: doc.type, success: false, error: err.message });
      }
    }

    if (payload.payment && payload.payment.slipBase64) {
      try {
        const blob = _base64ToBlob(payload.payment.slipBase64, 'image/jpeg');
        const storagePath = `${studentId}/slip.jpg`;
        const { error: upErr } = await _sb.storage.from('payment-slips').upload(storagePath, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (upErr) throw upErr;

        const { error: dbErr } = await _sb.from('payments').insert({
          student_id: studentId,
          amount: payload.payment.amount || 0,
          method: 'promptpay',
          storage_path: storagePath,
        });
        if (dbErr) throw dbErr;
      } catch (err) {
        console.error('Payment slip upload error:', err);
      }
    }

    return { success: true, applicationNo: rpcResult.applicationNo, studentId, documents: docResults };
  },

  async getApplicationStatus(lineUserId) {
    if (!lineUserId) return { success: true, applied: false };

    const { data, error } = await _sb.rpc('get_application_status', { p_line_user_id: lineUserId });
    if (error) throw error;
    const row = data && data[0];
    if (!row) return { success: true, applied: false };

    return {
      success: true,
      applied: true,
      applicationNo: row.application_no,
      status: row.status,
      statusLabel: _STATUS_LABELS[row.status] || row.status,
      branchName: row.branch_name,
      applyDate: row.applied_at ? new Date(row.applied_at).toLocaleDateString('th-TH') : '',
    };
  },

  // ---------- Document Requests (admin asking for missing/incomplete docs) ----------
  async getDocumentRequests(lineUserId) {
    if (!lineUserId) return [];
    const { data, error } = await _sb.rpc('get_document_requests', { p_line_user_id: lineUserId });
    if (error) throw error;
    return data || [];
  },

  async resolveDocumentRequest(requestId, lineUserId) {
    const { error } = await _sb.rpc('resolve_document_request', { p_request_id: requestId, p_line_user_id: lineUserId });
    if (error) throw error;
    return { success: true };
  },

  // ---------- Document Upload (standalone) ----------
  async uploadDocument({ studentId, docType, base64Data, mimeType }) {
    if (!studentId || !base64Data) return { success: false, message: 'Missing required fields' };

    await _ensureAnonSession().catch(err => console.warn('Anonymous session unavailable, upload will fail:', err));

    const blob = _base64ToBlob(base64Data, mimeType || 'image/jpeg');
    const storagePath = `${studentId}/${docType}.jpg`;
    const { error: upErr } = await _sb.storage.from('documents').upload(storagePath, blob, {
      contentType: mimeType || 'image/jpeg',
      upsert: true,
    });
    if (upErr) throw upErr;

    const { error: dbErr } = await _sb.from('documents').insert({
      student_id: studentId,
      doc_type: docType,
      storage_path: storagePath,
    });
    if (dbErr) throw dbErr;

    return { success: true, storagePath };
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
