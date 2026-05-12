// ============================================
// form.js — Step Form Controller (8 Steps)
// ============================================

const Form = {
  currentStep: 1,
  totalSteps: 8,
  data: {
    // Step 1
    levelId: '', levelName: '',
    branchId: '', branchName: '',
    roundId: '', roundName: '',
    // Step 2
    idCard: '', prefix: '', firstName: '', lastName: '',
    birthDate: '', phone: '', education: '', oldSchool: '',
    educationProvince: '',
    // Step 3
    addrProvince: '', addrDistrict: '', addrSubDistrict: '',
    addrZipcode: '', addrDetail: '',
    // Step 4
    parents: [],     // [{type, idCard, prefix, firstName, lastName, phone, occupation}]
    // Step 5
    guardian: {},    // {idCard, prefix, firstName, lastName, phone, relation}
    // Step 6
    documents: {},   // {docType: base64}
    // Step 7
    payment: { slipBase64: '' },
    // LINE
    lineUserId: '', displayName: '', pictureUrl: '',
  },
  programs: { levels: [], branches: [], rounds: [] },

  async init() {
    const user = LIFF.getUser();
    if (!user) { location.href = 'index.html'; return; }

    this.data.lineUserId = user.userId;
    this.data.displayName = user.displayName;
    this.data.pictureUrl = user.pictureUrl;

    // แสดงชื่อ header
    const nameEl = document.getElementById('header-name');
    if (nameEl) nameEl.textContent = user.displayName;
    const avatarEl = document.getElementById('header-avatar');
    if (avatarEl && user.pictureUrl) avatarEl.src = user.pictureUrl;

    Camera.init();
    await this._loadPrograms();
    this._bindNav();
    this._renderStep(1);
  },

  // ---- Programs ----
  async _loadPrograms() {
    try {
      showLoading('กำลังโหลดข้อมูลหลักสูตร...');
      const res = await API.getPrograms();
      this.programs = res.data || { levels: [], branches: [], rounds: [] };
    } catch {
      showToast('โหลดข้อมูลหลักสูตรล้มเหลว', 'error');
    } finally {
      hideLoading();
    }
  },

  // ---- Navigation ----
  _bindNav() {
    document.getElementById('btn-next').addEventListener('click', () => this.next());
    document.getElementById('btn-back').addEventListener('click', () => this.back());
  },

  next() {
    if (!this._validate(this.currentStep)) return;
    this._saveStep(this.currentStep);
    if (this.currentStep < this.totalSteps) {
      this._renderStep(this.currentStep + 1);
    } else {
      this._submit();
    }
  },

  back() {
    if (this.currentStep > 1) {
      this._renderStep(this.currentStep - 1);
    } else {
      if (confirm('ออกจากการสมัคร?')) location.href = 'index.html';
    }
  },

  async _renderStep(n) {
    this.currentStep = n;
    // ซ่อนทุก panel
    document.querySelectorAll('.step-panel').forEach(el => el.classList.remove('active'));
    const panel = document.getElementById(`step-${n}`);
    if (panel) panel.classList.add('active');

    // Progress
    const pct = ((n - 1) / (this.totalSteps - 1)) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('step-current').textContent = n;

    const titles = [
      '', 'เลือกหลักสูตร', 'ข้อมูลส่วนตัว', 'ที่อยู่',
      'ข้อมูลบิดา/มารดา', 'ผู้ปกครอง', 'เอกสารประกอบ',
      'ชำระเงิน', 'ตรวจสอบและส่งใบสมัคร',
    ];
    document.getElementById('step-title-text').textContent = titles[n] || '';

    // Back button
    const backBtn = document.getElementById('btn-back');
    backBtn.textContent = n === 1 ? '✕ ออก' : '← ย้อนกลับ';

    // Next button label
    const nextBtn = document.getElementById('btn-next');
    nextBtn.textContent = n === this.totalSteps ? '✅ ส่งใบสมัคร' : 'ถัดไป →';

    // Init each step's UI
    const initMap = {
      1: () => this._initStep1(),
      2: () => this._initStep2(),
      3: () => this._initStep3(),
      4: () => this._initStep4(),
      5: () => this._initStep5(),
      6: () => this._initStep6(),
      7: () => this._initStep7(),
      8: () => this._initStep8(),
    };
    if (initMap[n]) await initMap[n]();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ============ Step 1: เลือกหลักสูตร ============
  _initStep1() {
    const { levels, branches, rounds } = this.programs;

    const levelSel = document.getElementById('sel-level');
    const branchSel = document.getElementById('sel-branch');
    const roundSel = document.getElementById('sel-round');

    // Populate levels
    levelSel.innerHTML = '<option value="">-- เลือกระดับการศึกษา --</option>';
    levels.forEach(l => {
      const o = new Option(l.name, l.id);
      levelSel.appendChild(o);
    });

    levelSel.value = this.data.levelId;

    const updateBranches = () => {
      const lvId = levelSel.value;
      const filtered = branches.filter(b => b.levelId === lvId && b.isOpen);
      branchSel.innerHTML = '<option value="">-- เลือกสาขาวิชา --</option>';
      filtered.forEach(b => {
        const o = new Option(b.name, b.id);
        branchSel.appendChild(o);
      });
      branchSel.disabled = filtered.length === 0;
      branchSel.value = this.data.branchId;
      roundSel.innerHTML = '<option value="">-- เลือกรอบ --</option>';
      roundSel.disabled = true;
      roundSel.value = '';
    };

    const updateRounds = () => {
      const brId = branchSel.value;
      const filtered = rounds.filter(r => r.branchId === brId);
      roundSel.innerHTML = '<option value="">-- เลือกรอบ --</option>';
      filtered.forEach(r => {
        const o = new Option(`${r.name} (${r.remaining} ที่เหลือ)`, r.id);
        o.disabled = r.remaining <= 0;
        roundSel.appendChild(o);
      });
      roundSel.disabled = filtered.length === 0;
      roundSel.value = this.data.roundId;
    };

    levelSel.addEventListener('change', updateBranches);
    branchSel.addEventListener('change', updateRounds);

    if (this.data.levelId) { updateBranches(); updateRounds(); }
  },

  // ============ Step 2: ข้อมูลส่วนตัว ============
  _initStep2() {
    const fields = ['idCard', 'prefix', 'firstName', 'lastName',
      'birthDate', 'phone', 'education', 'oldSchool', 'educationProvince'];
    fields.forEach(f => {
      const el = document.getElementById(`inp-${f}`);
      if (el && this.data[f]) el.value = this.data[f];
    });

    // Format ID card
    const idCardEl = document.getElementById('inp-idCard');
    if (idCardEl) {
      idCardEl.addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 13);
      });
    }

    // Format phone
    const phoneEl = document.getElementById('inp-phone');
    if (phoneEl) {
      phoneEl.addEventListener('input', e => {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10);
      });
    }
  },

  // ============ Step 3: ที่อยู่ ============
  async _initStep3() {
    await Address.bindAddressSelects({
      provinceSelect: document.getElementById('addr-province'),
      districtSelect: document.getElementById('addr-district'),
      subDistrictSelect: document.getElementById('addr-subdistrict'),
      zipcodeInput: document.getElementById('addr-zipcode'),
    });

    // Restore values
    const el = (id) => document.getElementById(id);
    if (this.data.addrDetail) el('addr-detail').value = this.data.addrDetail;
    if (this.data.addrZipcode) el('addr-zipcode').value = this.data.addrZipcode;
  },

  // ============ Step 4: บิดา/มารดา ============
  _initStep4() {
    this._renderParents();

    document.getElementById('btn-add-parent').onclick = () => {
      this.data.parents.push({
        type: 'father', idCard: '', prefix: 'นาย', firstName: '', lastName: '',
        phone: '', occupation: '', isDeceased: false,
      });
      this._renderParents();
    };
  },

  _renderParents() {
    const container = document.getElementById('parents-container');
    container.innerHTML = '';

    if (this.data.parents.length === 0) {
      container.innerHTML = `<p class="text-muted text-sm text-center" style="padding:16px">ยังไม่มีข้อมูล — กดปุ่มด้านล่างเพื่อเพิ่ม</p>`;
      return;
    }

    this.data.parents.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'parent-item';
      card.innerHTML = `
        <button class="btn btn-sm btn-danger remove-btn" data-idx="${i}">ลบ</button>
        <div class="field-stack">
          <div class="form-group">
            <label class="form-label">ประเภท</label>
            <select class="form-control" data-field="type" data-idx="${i}">
              <option value="father" ${p.type==='father'?'selected':''}>บิดา</option>
              <option value="mother" ${p.type==='mother'?'selected':''}>มารดา</option>
            </select>
          </div>
          <div class="field-row">
            <div class="form-group">
              <label class="form-label">คำนำหน้า</label>
              <select class="form-control" data-field="prefix" data-idx="${i}">
                <option value="นาย" ${p.prefix==='นาย'?'selected':''}>นาย</option>
                <option value="นาง" ${p.prefix==='นาง'?'selected':''}>นาง</option>
                <option value="นางสาว" ${p.prefix==='นางสาว'?'selected':''}>นางสาว</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">เลขบัตร ปชช.</label>
              <input class="form-control" type="tel" maxlength="13" placeholder="13 หลัก"
                data-field="idCard" data-idx="${i}" value="${p.idCard}">
            </div>
          </div>
          <div class="field-row">
            <div class="form-group">
              <label class="form-label">ชื่อ <span class="required">*</span></label>
              <input class="form-control" type="text" data-field="firstName" data-idx="${i}" value="${p.firstName}">
            </div>
            <div class="form-group">
              <label class="form-label">นามสกุล <span class="required">*</span></label>
              <input class="form-control" type="text" data-field="lastName" data-idx="${i}" value="${p.lastName}">
            </div>
          </div>
          <div class="field-row">
            <div class="form-group">
              <label class="form-label">เบอร์โทร</label>
              <input class="form-control" type="tel" maxlength="10" data-field="phone" data-idx="${i}" value="${p.phone}">
            </div>
            <div class="form-group">
              <label class="form-label">อาชีพ</label>
              <input class="form-control" type="text" data-field="occupation" data-idx="${i}" value="${p.occupation}">
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem">
            <input type="checkbox" data-field="isDeceased" data-idx="${i}" ${p.isDeceased?'checked':''}>
            ถึงแก่กรรมแล้ว
          </label>
        </div>
      `;
      container.appendChild(card);
    });

    // Bind events
    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.onclick = () => {
        this.data.parents.splice(+btn.dataset.idx, 1);
        this._renderParents();
      };
    });

    container.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        const idx = +el.dataset.idx;
        const field = el.dataset.field;
        this.data.parents[idx][field] = el.type === 'checkbox' ? el.checked : el.value;
      });
    });
  },

  // ============ Step 5: ผู้ปกครอง ============
  _initStep5() {
    const fields = ['idCard', 'prefix', 'firstName', 'lastName', 'phone', 'relation'];
    fields.forEach(f => {
      const el = document.getElementById(`grd-${f}`);
      if (el && this.data.guardian[f]) el.value = this.data.guardian[f];
    });

    // ปุ่มดึงข้อมูลจากบิดา/มารดา
    document.getElementById('btn-copy-father').onclick = () => this._copyParentToGuardian('father');
    document.getElementById('btn-copy-mother').onclick = () => this._copyParentToGuardian('mother');
  },

  _copyParentToGuardian(type) {
    const parent = this.data.parents.find(p => p.type === type);
    if (!parent) { showToast(`ไม่พบข้อมูล${type === 'father' ? 'บิดา' : 'มารดา'}`, 'warning'); return; }

    ['idCard', 'prefix', 'firstName', 'lastName', 'phone'].forEach(f => {
      const el = document.getElementById(`grd-${f}`);
      if (el) { el.value = parent[f]; this.data.guardian[f] = parent[f]; }
    });
    document.getElementById('grd-relation').value = type === 'father' ? 'บิดา' : 'มารดา';
    this.data.guardian.relation = type === 'father' ? 'บิดา' : 'มารดา';
    showToast('คัดลอกข้อมูลแล้ว', 'success');
  },

  // ============ Step 6: เอกสาร ============
  _initStep6() {
    const docTypes = [
      { id: 'id_card_front', label: 'บัตร ปชช. ด้านหน้า', icon: '🪪', required: true },
      { id: 'id_card_back',  label: 'บัตร ปชช. ด้านหลัง', icon: '🪪', required: true },
      { id: 'house_reg',     label: 'ทะเบียนบ้าน', icon: '🏠', required: true },
      { id: 'edu_cert',      label: 'วุฒิการศึกษา', icon: '📜', required: true },
      { id: 'payment_slip',  label: 'สลิปโอนเงิน', icon: '💳', required: false },
    ];

    const grid = document.getElementById('doc-grid');
    grid.innerHTML = '';

    docTypes.forEach(doc => {
      const wrapper = document.createElement('div');
      wrapper.className = doc.id === 'house_reg' || doc.id === 'edu_cert' ? 'doc-full' : '';

      const card = document.createElement('div');
      card.className = 'doc-upload-card';
      card.dataset.docType = doc.id;
      card.innerHTML = `
        <div class="doc-icon">${doc.icon}</div>
        <div class="doc-label">${doc.label}${doc.required ? ' <span style="color:var(--clr-danger)">*</span>' : ''}</div>
        <div class="doc-sublabel">แตะเพื่อถ่าย/เลือก</div>
        <img class="doc-preview hidden" alt="preview">
      `;

      if (this.data.documents[doc.id]) {
        card.classList.add('has-file');
        card.querySelector('.doc-preview').src = this.data.documents[doc.id];
        card.querySelector('.doc-preview').classList.remove('hidden');
        card.querySelector('.doc-label').innerHTML = `✅ ${doc.label}`;
      }

      initDocUpload(card, doc.id, (type, base64) => {
        this.data.documents[type] = base64;
      });

      wrapper.appendChild(card);
      grid.appendChild(wrapper);
    });
  },

  // ============ Step 7: ชำระเงิน ============
  _initStep7() {
    // Generate QR PromptPay (ใช้ library promptpay-qr หรือ endpoint จาก GAS)
    const amount = CONFIG.APPLICATION_FEE;
    document.getElementById('payment-amount').textContent =
      `฿${amount.toLocaleString()}`;

    // QR image จาก API PromptPay (หรือ static image จากโรงเรียน)
    const qrImg = document.getElementById('promptpay-qr');
    qrImg.src = `https://promptpay.io/${CONFIG.PROMPTPAY_NUMBER}/${amount}.png`;
    qrImg.onerror = () => {
      qrImg.style.display = 'none';
      document.getElementById('qr-fallback').classList.remove('hidden');
    };

    // สลิปอัปโหลด
    const slipCard = document.getElementById('slip-upload-card');
    if (!slipCard._bound) {
      initDocUpload(slipCard, 'payment_slip', (_, base64) => {
        this.data.payment.slipBase64 = base64;
      });
      slipCard._bound = true;
    }
    if (this.data.payment.slipBase64) {
      slipCard.classList.add('has-file');
      slipCard.querySelector('.doc-preview').src = this.data.payment.slipBase64;
      slipCard.querySelector('.doc-preview').classList.remove('hidden');
    }
  },

  // ============ Step 8: ตรวจสอบ ============
  _initStep8() {
    const d = this.data;
    const html = `
      <div class="review-section">
        <h3>หลักสูตรที่เลือก</h3>
        <div class="review-row"><span class="review-key">ระดับ</span><span class="review-val">${d.levelName}</span></div>
        <div class="review-row"><span class="review-key">สาขา</span><span class="review-val">${d.branchName}</span></div>
        <div class="review-row"><span class="review-key">รอบ</span><span class="review-val">${d.roundName}</span></div>
      </div>
      <div class="review-section">
        <h3>ข้อมูลส่วนตัว</h3>
        <div class="review-row"><span class="review-key">ชื่อ-นามสกุล</span><span class="review-val">${d.prefix}${d.firstName} ${d.lastName}</span></div>
        <div class="review-row"><span class="review-key">เลขบัตร ปชช.</span><span class="review-val">${d.idCard}</span></div>
        <div class="review-row"><span class="review-key">วันเกิด</span><span class="review-val">${d.birthDate}</span></div>
        <div class="review-row"><span class="review-key">เบอร์โทร</span><span class="review-val">${d.phone}</span></div>
        <div class="review-row"><span class="review-key">วุฒิการศึกษา</span><span class="review-val">${d.education}</span></div>
        <div class="review-row"><span class="review-key">โรงเรียนเดิม</span><span class="review-val">${d.oldSchool}</span></div>
      </div>
      <div class="review-section">
        <h3>เอกสาร</h3>
        ${Object.keys(d.documents).map(k =>
          `<div class="review-row">
            <span class="review-key">${_docLabel(k)}</span>
            <span class="review-val"><span class="badge badge-success">✓ อัปโหลดแล้ว</span></span>
          </div>`
        ).join('')}
        ${d.payment.slipBase64 ? '<div class="review-row"><span class="review-key">สลิปชำระ</span><span class="review-val"><span class="badge badge-success">✓ แนบแล้ว</span></span></div>' : ''}
      </div>
    `;
    document.getElementById('review-content').innerHTML = html;
  },

  // ============ Validation ============
  _validate(step) {
    const err = (msg) => { showToast(msg, 'error'); return false; };

    if (step === 1) {
      const levelEl = document.getElementById('sel-level');
      const branchEl = document.getElementById('sel-branch');
      const roundEl = document.getElementById('sel-round');
      if (!levelEl.value) return err('กรุณาเลือกระดับการศึกษา');
      if (!branchEl.value) return err('กรุณาเลือกสาขาวิชา');
      if (!roundEl.value) return err('กรุณาเลือกรอบ');
    }

    if (step === 2) {
      const required = [
        ['idCard', 'เลขบัตรประชาชน'], ['firstName', 'ชื่อ'],
        ['lastName', 'นามสกุล'], ['birthDate', 'วันเกิด'],
        ['phone', 'เบอร์โทร'], ['education', 'การศึกษาล่าสุด'],
        ['oldSchool', 'โรงเรียนเดิม'],
      ];
      for (const [id, label] of required) {
        const el = document.getElementById(`inp-${id}`);
        if (!el || !el.value.trim()) return err(`กรุณากรอก${label}`);
      }
      const id = document.getElementById('inp-idCard').value;
      if (id.length !== 13) return err('เลขบัตรประชาชนต้องมี 13 หลัก');
    }

    if (step === 3) {
      if (!document.getElementById('addr-province').value) return err('กรุณาเลือกจังหวัด');
      if (!document.getElementById('addr-district').value) return err('กรุณาเลือกอำเภอ/เขต');
      if (!document.getElementById('addr-subdistrict').value) return err('กรุณาเลือกตำบล/แขวง');
      if (!document.getElementById('addr-detail').value.trim()) return err('กรุณากรอกรายละเอียดที่อยู่');
    }

    if (step === 6) {
      const required = ['id_card_front', 'id_card_back', 'house_reg', 'edu_cert'];
      for (const r of required) {
        if (!this.data.documents[r]) return err(`กรุณาอัปโหลด${_docLabel(r)}`);
      }
    }

    if (step === 7) {
      if (!this.data.payment.slipBase64) return err('กรุณาแนบสลิปการชำระเงิน');
    }

    return true;
  },

  // ============ Save Step Data ============
  _saveStep(step) {
    if (step === 1) {
      const levelEl = document.getElementById('sel-level');
      const branchEl = document.getElementById('sel-branch');
      const roundEl = document.getElementById('sel-round');
      this.data.levelId = levelEl.value;
      this.data.levelName = levelEl.options[levelEl.selectedIndex]?.text || '';
      this.data.branchId = branchEl.value;
      this.data.branchName = branchEl.options[branchEl.selectedIndex]?.text || '';
      this.data.roundId = roundEl.value;
      this.data.roundName = roundEl.options[roundEl.selectedIndex]?.text || '';
    }
    if (step === 2) {
      ['idCard', 'prefix', 'firstName', 'lastName', 'birthDate',
       'phone', 'education', 'oldSchool', 'educationProvince'].forEach(f => {
        const el = document.getElementById(`inp-${f}`);
        if (el) this.data[f] = el.value;
      });
    }
    if (step === 3) {
      this.data.addrProvince = document.getElementById('addr-province').value;
      this.data.addrDistrict = document.getElementById('addr-district').value;
      this.data.addrSubDistrict = document.getElementById('addr-subdistrict').value;
      this.data.addrZipcode = document.getElementById('addr-zipcode').value;
      this.data.addrDetail = document.getElementById('addr-detail').value;
    }
    if (step === 5) {
      ['idCard', 'prefix', 'firstName', 'lastName', 'phone', 'relation'].forEach(f => {
        const el = document.getElementById(`grd-${f}`);
        if (el) this.data.guardian[f] = el.value;
      });
    }
  },

  // ============ Submit ============
  async _submit() {
    showLoading('กำลังส่งใบสมัคร...');
    try {
      // แปลง documents เป็น array ที่ส่งได้
      const docs = Object.entries(this.data.documents).map(([type, base64]) => ({
        type,
        base64Data: base64.split(',')[1],  // ตัด header
        mimeType: 'image/jpeg',
        fileName: `${this.data.idCard}_${type}.jpg`,
      }));

      const payload = {
        lineUserId: this.data.lineUserId,
        displayName: this.data.displayName,
        program: {
          levelId: this.data.levelId,
          branchId: this.data.branchId,
          roundId: this.data.roundId,
        },
        personal: {
          idCard: this.data.idCard,
          prefix: this.data.prefix,
          firstName: this.data.firstName,
          lastName: this.data.lastName,
          birthDate: this.data.birthDate,
          phone: this.data.phone,
          education: this.data.education,
          oldSchool: this.data.oldSchool,
          educationProvince: this.data.educationProvince,
        },
        address: {
          province: this.data.addrProvince,
          district: this.data.addrDistrict,
          subDistrict: this.data.addrSubDistrict,
          zipcode: this.data.addrZipcode,
          detail: this.data.addrDetail,
        },
        parents: this.data.parents,
        guardian: this.data.guardian,
        documents: docs,
        payment: {
          amount: CONFIG.APPLICATION_FEE,
          slipBase64: this.data.payment.slipBase64?.split(',')[1] || '',
          slipFileName: `${this.data.idCard}_payment_slip.jpg`,
        },
      };

      const res = await API.submitApplication(payload);

      if (res.success) {
        hideLoading();
        this._showSuccess(res.applicationNo);
      } else {
        throw new Error(res.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err) {
      hideLoading();
      showToast('ส่งใบสมัครล้มเหลว: ' + err.message, 'error');
    }
  },

  _showSuccess(appNo) {
    document.getElementById('step-progress').classList.add('hidden');
    document.getElementById('step-nav').classList.add('hidden');
    document.querySelectorAll('.step-panel').forEach(el => el.classList.remove('active'));

    const success = document.getElementById('success-screen');
    success.classList.remove('hidden');
    document.getElementById('app-number').textContent = appNo;

    // ปุ่มพิมพ์
    document.getElementById('btn-print').onclick = () => {
      window.print();
    };
  },
};

// Helper
function _docLabel(type) {
  const map = {
    id_card_front: 'บัตร ปชช. ด้านหน้า',
    id_card_back: 'บัตร ปชช. ด้านหลัง',
    house_reg: 'ทะเบียนบ้าน',
    edu_cert: 'วุฒิการศึกษา',
    payment_slip: 'สลิปโอนเงิน',
  };
  return map[type] || type;
}
