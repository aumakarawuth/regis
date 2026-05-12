// ============================================
// address.js — จังหวัด / อำเภอ / ตำบล
// ============================================
// โหลดข้อมูลจาก GAS API หรือใช้ไฟล์ JSON สำรอง

const Address = {
  provinces: [],
  cache: {},   // { province_id: { districts: [...], subDistricts: { district_id: [...] } } }

  async loadProvinces() {
    if (this.provinces.length) return this.provinces;
    try {
      const res = await API.getProvinces();
      this.provinces = res.data || [];
    } catch {
      // Fallback: ตัวอย่างข้อมูลจริง (ควรโหลดจาก JSON ท้องถิ่น)
      this.provinces = PROVINCES_DATA;
    }
    return this.provinces;
  },

  async loadDistricts(provinceId) {
    if (this.cache[provinceId]) return this.cache[provinceId].districts || [];
    try {
      const res = await API.getDistricts(provinceId);
      if (!this.cache[provinceId]) this.cache[provinceId] = {};
      this.cache[provinceId].districts = res.data || [];
      return this.cache[provinceId].districts;
    } catch { return []; }
  },

  async loadSubDistricts(provinceId, districtId) {
    const key = `${provinceId}_${districtId}`;
    if (this.cache[key]) return this.cache[key];
    try {
      const res = await API.getSubDistricts(districtId);
      this.cache[key] = res.data || [];
      return this.cache[key];
    } catch { return []; }
  },

  // ---- Render Helpers ----
  populateSelect(selectEl, items, valueKey, labelKey, placeholder = '-- เลือก --') {
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item[valueKey];
      opt.textContent = item[labelKey];
      selectEl.appendChild(opt);
    });
    selectEl.disabled = items.length === 0;
  },

  // ผูก select cascade ทั้ง 3 ระดับ
  async bindAddressSelects(opts) {
    const {
      provinceSelect,   // el
      districtSelect,   // el
      subDistrictSelect,// el
      zipcodeInput,     // el (optional)
      prefix = '',      // สำหรับ prefix name ถ้ามีหลายชุด
    } = opts;

    // โหลดจังหวัด
    const provinces = await this.loadProvinces();
    this.populateSelect(provinceSelect, provinces, 'id', 'name', '-- เลือกจังหวัด --');

    // Reset ล่าง
    this.populateSelect(districtSelect, [], 'id', 'name', '-- เลือกอำเภอ/เขต --');
    this.populateSelect(subDistrictSelect, [], 'id', 'name', '-- เลือกตำบล/แขวง --');
    districtSelect.disabled = true;
    subDistrictSelect.disabled = true;

    // จังหวัด → อำเภอ
    provinceSelect.addEventListener('change', async () => {
      const provId = provinceSelect.value;
      if (!provId) {
        districtSelect.innerHTML = '<option value="">-- เลือกอำเภอ/เขต --</option>';
        districtSelect.disabled = true;
        subDistrictSelect.innerHTML = '<option value="">-- เลือกตำบล/แขวง --</option>';
        subDistrictSelect.disabled = true;
        return;
      }
      districtSelect.innerHTML = '<option value="">กำลังโหลด...</option>';
      const districts = await this.loadDistricts(provId);

      // กรุงเทพ → ใช้ label เขต/แขวง
      const isBangkok = provId === '10';
      this.populateSelect(
        districtSelect, districts, 'id', 'name',
        isBangkok ? '-- เลือกเขต --' : '-- เลือกอำเภอ --'
      );
      districtSelect.disabled = false;
      subDistrictSelect.innerHTML = isBangkok
        ? '<option value="">-- เลือกแขวง --</option>'
        : '<option value="">-- เลือกตำบล --</option>';
      subDistrictSelect.disabled = true;
    });

    // อำเภอ → ตำบล
    districtSelect.addEventListener('change', async () => {
      const provId = provinceSelect.value;
      const distId = districtSelect.value;
      if (!distId) {
        subDistrictSelect.innerHTML = '<option value="">-- เลือกตำบล/แขวง --</option>';
        subDistrictSelect.disabled = true;
        return;
      }
      subDistrictSelect.innerHTML = '<option value="">กำลังโหลด...</option>';
      const subs = await this.loadSubDistricts(provId, distId);

      const isBangkok = provId === '10';
      this.populateSelect(
        subDistrictSelect, subs, 'id', 'name',
        isBangkok ? '-- เลือกแขวง --' : '-- เลือกตำบล --'
      );
      subDistrictSelect.disabled = false;
    });

    // ตำบล → ดึงรหัสไปรษณีย์
    if (zipcodeInput) {
      subDistrictSelect.addEventListener('change', () => {
        const selected = subDistrictSelect.options[subDistrictSelect.selectedIndex];
        if (selected && selected.dataset.zipcode) {
          zipcodeInput.value = selected.dataset.zipcode;
        }
      });
    }
  },
};

// ---- ข้อมูลสำรอง (ตัวอย่าง — โหลดจาก GAS ในระบบจริง) ----
const PROVINCES_DATA = [
  { id: '10', name: 'กรุงเทพมหานคร' },
  { id: '11', name: 'สมุทรปราการ' },
  { id: '12', name: 'นนทบุรี' },
  { id: '13', name: 'ปทุมธานี' },
  { id: '14', name: 'พระนครศรีอยุธยา' },
  { id: '15', name: 'อ่างทอง' },
  { id: '16', name: 'ลพบุรี' },
  { id: '17', name: 'สิงห์บุรี' },
  { id: '18', name: 'ชัยนาท' },
  { id: '19', name: 'สระบุรี' },
  { id: '20', name: 'ชลบุรี' },
  { id: '21', name: 'ระยอง' },
  { id: '22', name: 'จันทบุรี' },
  { id: '23', name: 'ตราด' },
  { id: '24', name: 'ฉะเชิงเทรา' },
  { id: '25', name: 'ปราจีนบุรี' },
  { id: '26', name: 'นครนายก' },
  { id: '27', name: 'สระแก้ว' },
  { id: '30', name: 'นครราชสีมา' },
  { id: '31', name: 'บุรีรัมย์' },
  { id: '32', name: 'สุรินทร์' },
  { id: '33', name: 'ศรีสะเกษ' },
  { id: '34', name: 'อุบลราชธานี' },
  { id: '35', name: 'ยโสธร' },
  { id: '36', name: 'ชัยภูมิ' },
  { id: '37', name: 'อำนาจเจริญ' },
  { id: '38', name: 'บึงกาฬ' },
  { id: '39', name: 'หนองบัวลำภู' },
  { id: '40', name: 'ขอนแก่น' },
  { id: '41', name: 'อุดรธานี' },
  { id: '42', name: 'เลย' },
  { id: '43', name: 'หนองคาย' },
  { id: '44', name: 'มหาสารคาม' },
  { id: '45', name: 'ร้อยเอ็ด' },
  { id: '46', name: 'กาฬสินธุ์' },
  { id: '47', name: 'สกลนคร' },
  { id: '48', name: 'นครพนม' },
  { id: '49', name: 'มุกดาหาร' },
  { id: '50', name: 'เชียงใหม่' },
  { id: '51', name: 'ลำพูน' },
  { id: '52', name: 'ลำปาง' },
  { id: '53', name: 'อุตรดิตถ์' },
  { id: '54', name: 'แพร่' },
  { id: '55', name: 'น่าน' },
  { id: '56', name: 'พะเยา' },
  { id: '57', name: 'เชียงราย' },
  { id: '58', name: 'แม่ฮ่องสอน' },
  { id: '60', name: 'นครสวรรค์' },
  { id: '61', name: 'อุทัยธานี' },
  { id: '62', name: 'กำแพงเพชร' },
  { id: '63', name: 'ตาก' },
  { id: '64', name: 'สุโขทัย' },
  { id: '65', name: 'พิษณุโลก' },
  { id: '66', name: 'พิจิตร' },
  { id: '67', name: 'เพชรบูรณ์' },
  { id: '70', name: 'ราชบุรี' },
  { id: '71', name: 'กาญจนบุรี' },
  { id: '72', name: 'สุพรรณบุรี' },
  { id: '73', name: 'นครปฐม' },
  { id: '74', name: 'สมุทรสาคร' },
  { id: '75', name: 'สมุทรสงคราม' },
  { id: '76', name: 'เพชรบุรี' },
  { id: '77', name: 'ประจวบคีรีขันธ์' },
  { id: '80', name: 'นครศรีธรรมราช' },
  { id: '81', name: 'กระบี่' },
  { id: '82', name: 'พังงา' },
  { id: '83', name: 'ภูเก็ต' },
  { id: '84', name: 'สุราษฎร์ธานี' },
  { id: '85', name: 'ระนอง' },
  { id: '86', name: 'ชุมพร' },
  { id: '90', name: 'สงขลา' },
  { id: '91', name: 'สตูล' },
  { id: '92', name: 'ตรัง' },
  { id: '93', name: 'พัทลุง' },
  { id: '94', name: 'ปัตตานี' },
  { id: '95', name: 'ยะลา' },
  { id: '96', name: 'นราธิวาส' },
];
