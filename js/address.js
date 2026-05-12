// ============================================
// address.js — จังหวัด / อำเภอ / ตำบล
// Optimized: โหลด provinces+districts ก่อน, subdistricts lazy
// ============================================

const Address = {
  provinces: [],
  _districts: {},
  _subdistricts: {},
  _provDistLoaded: false,
  _subLoaded: false,

  _basePath() {
    var scripts = document.querySelectorAll('script[src*="address"]');
    if (scripts.length) return scripts[scripts.length-1].src.replace(/\/[^/]+$/, '/');
    return location.href.replace(/\/[^/]*(\?.*)?$/, '/');
  },

  // โหลด provinces + districts พร้อมกัน (เล็ก รวดเร็ว)
  async _loadProvDist() {
    if (this._provDistLoaded) return;
    var base = this._basePath();
    var results = await Promise.all([
      fetch(base + 'data/provinces.json').then(function(r){ return r.json(); }),
      fetch(base + 'data/districts.json').then(function(r){ return r.json(); }),
    ]);
    this.provinces  = results[0];
    this._districts = results[1];
    this._provDistLoaded = true;
  },

  // โหลด subdistricts เฉพาะเมื่อต้องการ (lazy)
  async _loadSub() {
    if (this._subLoaded) return;
    var base = this._basePath();
    this._subdistricts = await fetch(base + 'data/subdistricts.json').then(function(r){ return r.json(); });
    this._subLoaded = true;
  },

  async loadProvinces() {
    await this._loadProvDist();
    return this.provinces;
  },

  async loadDistricts(provinceId) {
    await this._loadProvDist();
    return this._districts[String(provinceId)] || [];
  },

  async loadSubDistricts(provinceId, districtId) {
    await this._loadSub();
    return this._subdistricts[String(districtId)] || [];
  },

  populateSelect(selectEl, items, valueKey, labelKey, placeholder) {
    var html = '<option value="">' + placeholder + '</option>';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var zip = item.zipcode ? ' data-zipcode="' + item.zipcode + '"' : '';
      html += '<option value="' + item[valueKey] + '"' + zip + '>' + item[labelKey] + '</option>';
    }
    selectEl.innerHTML = html;
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

    // Preload subdistricts ใน background ขณะที่ user ยังเลือกจังหวัดอยู่
    setTimeout(function(){ self._loadSub(); }, 500);

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
