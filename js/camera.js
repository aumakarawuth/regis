// ============================================
// camera.js — กล้อง + Crop + Compress + Blur
// ============================================

const Camera = {
  stream: null,
  currentCallback: null,
  currentDocType: null,
  canvas: null,
  ctx: null,

  init() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this._buildOverlay();
  },

  _buildOverlay() {
    if (document.getElementById('camera-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'camera-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <video id="camera-video" autoplay playsinline muted></video>
      <div id="camera-frame" class="camera-frame landscape"></div>
      <div class="camera-controls">
        <button id="camera-cancel" class="btn btn-ghost" style="color:#fff">ยกเลิก</button>
        <button id="camera-shutter" class="camera-shutter" aria-label="ถ่ายภาพ"></button>
        <button id="camera-flip" class="btn btn-ghost" style="color:#fff">🔄 พลิก</button>
      </div>
      <canvas id="camera-canvas" style="display:none"></canvas>
    `;
    document.body.appendChild(overlay);

    document.getElementById('camera-cancel').addEventListener('click', () => this.close());
    document.getElementById('camera-shutter').addEventListener('click', () => this.capture());
    document.getElementById('camera-flip').addEventListener('click', () => this.flipCamera());

    this._facingMode = 'environment'; // กล้องหลังก่อน
  },

  // เปิดกล้อง
  async open(docType, callback) {
    this.currentDocType = docType;
    this.currentCallback = callback;

    const overlay = document.getElementById('camera-overlay');
    const frame = document.getElementById('camera-frame');

    // landscape สำหรับเอกสาร, portrait สำหรับ selfie
    const isPortrait = ['id_card_front', 'id_card_back', 'house_reg', 'edu_cert', 'payment_slip'].includes(docType) === false;
    frame.className = `camera-frame ${isPortrait ? 'portrait' : 'landscape'}`;

    overlay.classList.remove('hidden');
    await this._startStream();
  },

  async _startStream() {
    this.close(false); // ปิด stream เดิมถ้ามี
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this._facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      document.getElementById('camera-video').srcObject = this.stream;
    } catch (err) {
      showToast('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาต', 'error');
      this.close();
    }
  },

  flipCamera() {
    this._facingMode = this._facingMode === 'environment' ? 'user' : 'environment';
    this._startStream();
  },

  capture() {
    const video = document.getElementById('camera-video');
    const frame = document.getElementById('camera-frame');

    // หา crop rect จาก frame
    const vr = video.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();

    // คำนวณ scale จาก video ต่อ element
    const scaleX = video.videoWidth / vr.width;
    const scaleY = video.videoHeight / vr.height;

    const cropX = (fr.left - vr.left) * scaleX;
    const cropY = (fr.top - vr.top) * scaleY;
    const cropW = fr.width * scaleX;
    const cropH = fr.height * scaleY;

    // วาดลง canvas
    this.canvas.width = Math.min(cropW, 1200);
    this.canvas.height = Math.min(cropH, 1200 * (cropH / cropW));

    const scale = this.canvas.width / cropW;
    this.ctx.drawImage(
      video,
      cropX, cropY, cropW, cropH,
      0, 0, this.canvas.width, this.canvas.height
    );

    // ตรวจสอบ blur
    const blurScore = this._calcBlur();
    const isBlurry = blurScore < 50;

    // Compress → base64
    const quality = 0.82;
    const base64 = this.canvas.toDataURL('image/jpeg', quality);

    this.close();

    if (this.currentCallback) {
      this.currentCallback({ base64, isBlurry, blurScore });
    }
  },

  // Laplacian variance — ยิ่งสูงยิ่งคมชัด
  _calcBlur() {
    const { width, height } = this.canvas;
    const imageData = this.ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const gray = [];
    for (let i = 0; i < data.length; i += 4) {
      gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // คำนวณ Laplacian
    let sum = 0, sumSq = 0;
    const w = width;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = -gray[idx - w - 1] - gray[idx - w] - gray[idx - w + 1]
                    - gray[idx - 1] + 8 * gray[idx] - gray[idx + 1]
                    - gray[idx + w - 1] - gray[idx + w] - gray[idx + w + 1];
        sum += lap;
        sumSq += lap * lap;
      }
    }
    const n = (width - 2) * (height - 2);
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    return variance; // > 50 = คมชัด
  },

  close(hideOverlay = true) {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (hideOverlay) {
      const overlay = document.getElementById('camera-overlay');
      if (overlay) overlay.classList.add('hidden');
    }
  },

  // ---- เลือกจากอัลบั้ม ----
  pickFromGallery(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const base64 = await this._fileToBase64(file);
      // compress
      const compressed = await this._compressBase64(base64, 1200, 0.82);
      callback({ base64: compressed, isBlurry: false, blurScore: 999 });
    });
    input.click();
  },

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  _compressBase64(base64, maxWidth, quality) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = base64;
    });
  },
};

// ---- Doc Upload Widget ----
function initDocUpload(cardEl, docType, onFile) {
  const preview = cardEl.querySelector('.doc-preview');
  const label = cardEl.querySelector('.doc-label');

  // ตัวเลือก: กล้อง หรือ แกลเลอรี่
  cardEl.addEventListener('click', () => {
    const hasFile = cardEl.classList.contains('has-file');
    if (hasFile) {
      // คลิกอีกครั้ง → ถามว่าจะเปลี่ยนไหม
      if (!confirm('ต้องการเปลี่ยนรูปใหม่?')) return;
    }
    _showSourcePicker(docType, (result) => {
      _handlePhoto(cardEl, preview, label, result, docType, onFile);
    });
  });
}

function _showSourcePicker(docType, callback) {
  // สร้าง bottom sheet เล็กๆ
  const sheet = document.createElement('div');
  sheet.style.cssText = `
    position:fixed;inset:0;z-index:7000;
    background:rgba(0,0,0,0.4);
    display:flex;align-items:flex-end;
  `;
  sheet.innerHTML = `
    <div style="width:100%;background:#fff;border-radius:16px 16px 0 0;padding:20px;">
      <p style="font-weight:700;margin-bottom:16px;text-align:center">เลือกรูปภาพ</p>
      <button id="btn-camera" class="btn btn-primary btn-full" style="margin-bottom:10px">📷 ถ่ายภาพ</button>
      <button id="btn-gallery" class="btn btn-outline btn-full" style="margin-bottom:10px">🖼️ เลือกจากแกลเลอรี่</button>
      <button id="btn-cancel-pick" class="btn btn-ghost btn-full">ยกเลิก</button>
    </div>
  `;
  document.body.appendChild(sheet);

  sheet.querySelector('#btn-camera').onclick = () => {
    sheet.remove();
    Camera.open(docType, callback);
  };
  sheet.querySelector('#btn-gallery').onclick = () => {
    sheet.remove();
    Camera.pickFromGallery(callback);
  };
  sheet.querySelector('#btn-cancel-pick').onclick = () => sheet.remove();
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.remove(); });
}

function _handlePhoto(cardEl, preview, label, result, docType, onFile) {
  const { base64, isBlurry } = result;

  // ลบ blur warning เก่า
  cardEl.querySelectorAll('.blur-warning').forEach(e => e.remove());

  if (isBlurry) {
    const warn = document.createElement('div');
    warn.className = 'blur-warning';
    warn.innerHTML = '⚠️ ภาพอาจเบลอ กรุณาตรวจสอบก่อนส่ง';
    cardEl.parentNode.insertBefore(warn, cardEl.nextSibling);
  }

  // แสดง preview
  if (preview) {
    preview.src = base64;
    preview.classList.remove('hidden');
  }
  if (label) label.textContent = isBlurry ? '⚠️ ภาพอาจเบลอ' : '✅ อัปโหลดแล้ว';
  cardEl.classList.add('has-file');

  // ส่งค่ากลับ
  if (onFile) onFile(docType, base64);
}
