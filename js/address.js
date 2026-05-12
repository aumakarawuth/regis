// ============================================
// address.js — จังหวัด / อำเภอ / ตำบล
// โหลดจาก JSON files แยก (ไม่ฝังข้อมูลใน JS)
// ============================================

const Address = {
  provinces: [],
  _districts: {},
  _subdistricts: {},
  _loaded: false,

  // หา base path ของไฟล์ data/
  _basePath() {
    // หา script tag ของ address.js
    var scripts = document.querySelectorAll('script[src*="address"]');
    if (scripts.length) {
      return scripts[scripts.length-1].src.replace(/\/[^/]+$/, '/');
    }
    return location.href.replace(/\/[^/]*(\?.*)?$/, '/');
  },

  // โหลด JSON ทั้ง 3 ไฟล์พร้อมกัน (ครั้งเดียว)
  async _loadAll() {
    if (this._loaded) return;
    var base = this._basePath();
    try {
      var results = await Promise.all([
        fetch(base + 'data/provinces.json').then(function(r){ return r.json(); }),
        fetch(base + 'data/districts.json').then(function(r){ return r.json(); }),
        fetch(base + 'data/subdistricts.json').then(function(r){ return r.json(); }),
      ]);
      this.provinces     = results[0];
      this._districts    = results[1];
      this._subdistricts = results[2];
      this._loaded = true;
      console.log('[Address] โหลดสำเร็จ:', this.provinces.length, 'จังหวัด');
    } catch(e) {
      console.error('[Address] โหลดล้มเหลว:', e);
    }
  },

  async loadProvinces() {
    await this._loadAll();
    return this.provinces;
  },

  async loadDistricts(provinceId) {
    await this._loadAll();
    return this._districts[String(provinceId)] || [];
  },

  async loadSubDistricts(provinceId, districtId) {
    await this._loadAll();
    return this._subdistricts[String(districtId)] || [];
  },

  populateSelect(selectEl, items, valueKey, labelKey, placeholder) {
    selectEl.innerHTML = '<option value="">' + placeholder + '</option>';
    items.forEach(function(item) {
      var opt = document.createElement('option');
      opt.value = item[valueKey];
      opt.textContent = item[labelKey];
      if (item.zipcode) opt.dataset.zipcode = item.zipcode;
      selectEl.appendChild(opt);
    });
    selectEl.disabled = items.length === 0;
  },

  async bindAddressSelects(opts) {
    var self = this;
    var provinceSelect    = opts.provinceSelect;
    var districtSelect    = opts.districtSelect;
    var subDistrictSelect = opts.subDistrictSelect;
    var zipcodeInput      = opts.zipcodeInput;

    var provinces = await this.loadProvinces();
    this.populateSelect(provinceSelect, provinces, 'id', 'name', '-- เลือกจังหวัด --');
    this.populateSelect(districtSelect,    [], 'id', 'name', '-- เลือกอำเภอ/เขต --');
    this.populateSelect(subDistrictSelect, [], 'id', 'name', '-- เลือกตำบล/แขวง --');
    districtSelect.disabled    = true;
    subDistrictSelect.disabled = true;

    provinceSelect.addEventListener('change', async function() {
      var provId = provinceSelect.value;
      var isBkk  = (provId === '111');
      if (!provId) {
        self.populateSelect(districtSelect,    [], 'id', 'name', '-- เลือกอำเภอ/เขต --');
        self.populateSelect(subDistrictSelect, [], 'id', 'name', '-- เลือกตำบล/แขวง --');
        districtSelect.disabled = subDistrictSelect.disabled = true;
        if (zipcodeInput) zipcodeInput.value = '';
        return;
      }
      var districts = await self.loadDistricts(provId);
      self.populateSelect(districtSelect, districts, 'id', 'name',
        isBkk ? '-- เลือกเขต --' : '-- เลือกอำเภอ --');
      districtSelect.disabled = false;
      self.populateSelect(subDistrictSelect, [], 'id', 'name',
        isBkk ? '-- เลือกแขวง --' : '-- เลือกตำบล --');
      subDistrictSelect.disabled = true;
      if (zipcodeInput) zipcodeInput.value = '';
    });

    districtSelect.addEventListener('change', async function() {
      var provId = provinceSelect.value;
      var distId = districtSelect.value;
      var isBkk  = (provId === '111');
      if (!distId) {
        self.populateSelect(subDistrictSelect, [], 'id', 'name',
          isBkk ? '-- เลือกแขวง --' : '-- เลือกตำบล --');
        subDistrictSelect.disabled = true;
        if (zipcodeInput) zipcodeInput.value = '';
        return;
      }
      var subs = await self.loadSubDistricts(provId, distId);
      self.populateSelect(subDistrictSelect, subs, 'id', 'name',
        isBkk ? '-- เลือกแขวง --' : '-- เลือกตำบล --');
      subDistrictSelect.disabled = false;
      if (zipcodeInput) zipcodeInput.value = '';
    });

    if (zipcodeInput) {
      subDistrictSelect.addEventListener('change', function() {
        var sel = subDistrictSelect.options[subDistrictSelect.selectedIndex];
        zipcodeInput.value = (sel && sel.dataset.zipcode) ? sel.dataset.zipcode : '';
      });
    }
  },
};
