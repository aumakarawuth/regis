// ============================================
// camera.js — กล้อง + Smart Frame + Auto-capture
// ============================================

const Camera = {
  stream: null,
  currentCallback: null,
  currentDocType: null,
  canvas: null,
  ctx: null,
  _autoTimer: null,
  _autoCountdown: 0,
  _frameOk: false,

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

      <!-- Smart Frame -->
      <div id="camera-frame-wrap" style="
        position:absolute;inset:0;
        display:flex;align-items:center;justify-content:center;
        pointer-events:none;
      ">
        <div id="camera-frame" style="
          border:3px solid rgba(255,255,255,0.6);
          border-radius:12px;
          box-shadow:0 0 0 9999px rgba(0,0,0,0.45);
          transition:border-color 0.2s,box-shadow 0.2s;
          position:relative;
        ">
          <!-- มุมกรอบ -->
          <div class="cam-corner tl"></div>
          <div class="cam-corner tr"></div>
          <div class="cam-corner bl"></div>
          <div class="cam-corner br"></div>
          <!-- สถานะ -->
          <div id="cam-status" style="
            position:absolute;bottom:-36px;left:50%;transform:translateX(-50%);
            white-space:nowrap;color:#fff;font-size:13px;font-weight:600;
            text-shadow:0 1px 3px rgba(0,0,0,0.8);
          ">วางเอกสารในกรอบ</div>
          <!-- countdown -->
          <div id="cam-countdown" style="
            position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            font-size:72px;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.6);
            opacity:0;transition:opacity 0.2s;pointer-events:none;
          "></div>
        </div>
      </div>

      <!-- Controls — อยู่ต่ำพอดีไม่โดนบัตร -->
      <div id="camera-controls" style="
        position:absolute;bottom:0;left:0;right:0;
        padding:16px 24px 32px;
        background:linear-gradient(transparent,rgba(0,0,0,0.75));
        display:flex;align-items:center;justify-content:space-between;
      ">
        <button id="camera-cancel" style="
          background:rgba(255,255,255,0.15);border:none;color:#fff;
          padding:10px 20px;border-radius:50px;font-size:14px;font-weight:600;
          cursor:pointer;backdrop-filter:blur(4px);
        ">ยกเลิก</button>

        <button id="camera-shutter" style="
          width:70px;height:70px;border-radius:50%;
          background:#fff;border:5px solid rgba(255,255,255,0.4);
          cursor:pointer;transition:all 0.15s;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 4px 16px rgba(0,0,0,0.4);
        " aria-label="ถ่ายภาพ">
          <div style="width:52px;height:52px;border-radius:50%;background:#fff;
            border:2px solid #ddd;"></div>
        </button>

        <button id="camera-flip" style="
          background:rgba(255,255,255,0.15);border:none;color:#fff;
          padding:10px 20px;border-radius:50px;font-size:14px;font-weight:600;
          cursor:pointer;backdrop-filter:blur(4px);
        ">🔄 พลิก</button>
      </div>

      <style>
        #camera-overlay { position:fixed;inset:0;background:#000;z-index:8000;display:flex;flex-direction:column; }
        #camera-video { position:absolute;inset:0;width:100%;height:100%;object-fit:cover; }
        .cam-corner {
          position:absolute;width:20px;height:20px;border-color:inherit;border-style:solid;
        }
        .cam-corner.tl { top:-2px;left:-2px;border-width:3px 0 0 3px;border-radius:4px 0 0 0; }
        .cam-corner.tr { top:-2px;right:-2px;border-width:3px 3px 0 0;border-radius:0 4px 0 0; }
        .cam-corner.bl { bottom:-2px;left:-2px;border-width:0 0 3px 3px;border-radius:0 0 0 4px; }
        .cam-corner.br { bottom:-2px;right:-2px;border-width:0 3px 3px 0;border-radius:0 0 4px 0; }
        #camera-shutter:active { transform:scale(0.9); }
        #camera-shutter.disabled { opacity:0.4;cursor:not-allowed; }
        #camera-shutter.disabled:active { transform:none; }
      </style>
    `;
    document.body.appendChild(overlay);

    document.getElementById('camera-cancel').addEventListener('click', () => this.close());
    document.getElementById('camera-shutter').addEventListener('click', () => {
      if (this._frameOk) this.capture();
    });
    document.getElementById('camera-flip').addEventListener('click', () => this.flipCamera());

    this._facingMode = 'environment';
  },

  async open(docType, callback) {
    this.currentDocType = docType;
    this.currentCallback = callback;

    const overlay = document.getElementById('camera-overlay');
    const frame   = document.getElementById('camera-frame');

    // landscape สำหรับเอกสาร
    const isPortrait = false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (isPortrait) {
      frame.style.width  = Math.round(vw * 0.65) + 'px';
      frame.style.height = Math.round(vw * 0.65 * 1.42) + 'px';
    } else {
      frame.style.width  = Math.round(vw * 0.82) + 'px';
      frame.style.height = Math.round(vw * 0.82 * 0.63) + 'px';
    }

    overlay.classList.remove('hidden');
    await this._startStream();
    this._startFrameCheck();
  },

  async _startStream() {
    this._stopStream();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this._facingMode, width:{ideal:1920}, height:{ideal:1080} },
        audio: false,
      });
      document.getElementById('camera-video').srcObject = this.stream;
    } catch(err) {
      showToast('ไม่สามารถเข้าถึงกล้องได้', 'error');
      this.close();
    }
  },

  _stopStream() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  },

  flipCamera() {
    this._facingMode = this._facingMode === 'environment' ? 'user' : 'environment';
    this._startStream();
  },

  // ---- Smart Frame Check ----
  _startFrameCheck() {
    clearInterval(this._checkInterval);
    this._checkInterval = setInterval(() => this._checkFrame(), 200);
  },

  _checkFrame() {
    const video = document.getElementById('camera-video');
    if (!video || !video.videoWidth) return;

    // วาดภาพลง canvas เล็กๆ เพื่อวิเคราะห์
    const w = 160, h = 90;
    this.canvas.width = w; this.canvas.height = h;
    this.ctx.drawImage(video, 0, 0, w, h);

    const frame  = document.getElementById('camera-frame');
    const status = document.getElementById('cam-status');
    const shutter = document.getElementById('camera-shutter');
    const frameRect = frame.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();

    // คำนวณสัดส่วนของกรอบ vs หน้าจอ
    const frameRatio = (frameRect.width * frameRect.height) / (videoRect.width * videoRect.height);

    // วิเคราะห์ brightness ในกรอบ (เช็คว่ามีวัตถุ)
    const imgData = this.ctx.getImageData(
      Math.round(w * 0.1), Math.round(h * 0.1),
      Math.round(w * 0.8), Math.round(h * 0.8)
    );
    const brightness = this._avgBrightness(imgData);

    // เช็ค blur
    const blur = this._calcBlur();
    const isSharp = blur > 30;

    // เงื่อนไข: กรอบไม่เล็กเกิน/ใหญ่เกิน + ไม่มืด + คมชัดพอ
    const tooClose  = frameRatio > 0.85;
    const tooDark   = brightness < 40;
    const ok = !tooClose && !tooDark && isSharp;

    this._frameOk = ok;

    if (tooClose) {
      this._setFrameState('red',   '🔴 ถอยออกมาหน่อย', shutter, frame, false);
    } else if (tooDark) {
      this._setFrameState('yellow','💡 แสงน้อยเกินไป',  shutter, frame, false);
    } else if (!isSharp) {
      this._setFrameState('yellow','📷 ถือนิ่งๆ สักครู่', shutter, frame, false);
    } else {
      this._setFrameState('green', '✅ พร้อมถ่าย', shutter, frame, true);
      this._triggerAuto();
    }
  },

  _setFrameState(color, msg, shutter, frame, enabled) {
    const colors = { red:'#EF4444', yellow:'#F59E0B', green:'#10B981' };
    const c = colors[color] || '#fff';
    frame.style.borderColor = c;
    frame.style.boxShadow = `0 0 0 9999px rgba(0,0,0,0.45), 0 0 20px ${c}55`;
    document.querySelectorAll('.cam-corner').forEach(el => el.style.borderColor = c);
    document.getElementById('cam-status').textContent = msg;
    if (enabled) {
      shutter.classList.remove('disabled');
      shutter.style.opacity = '1';
    } else {
      shutter.classList.add('disabled');
      shutter.style.opacity = '0.4';
      this._cancelAuto();
    }
  },

  // Auto-capture เมื่อกรอบเขียวนาน 1.5 วิ
  _triggerAuto() {
    if (this._autoTimer) return; // กำลังนับอยู่แล้ว
    let count = 2;
    const countdown = document.getElementById('cam-countdown');
    const updateCount = () => {
      if (!this._frameOk) { this._cancelAuto(); return; }
      if (count <= 0) {
        this._cancelAuto();
        if (this._frameOk) this.capture();
        return;
      }
      countdown.textContent = count;
      countdown.style.opacity = '1';
      count--;
      this._autoTimer = setTimeout(updateCount, 700);
    };
    this._autoTimer = setTimeout(updateCount, 800);
  },

  _cancelAuto() {
    if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; }
    const countdown = document.getElementById('cam-countdown');
    if (countdown) { countdown.style.opacity = '0'; countdown.textContent = ''; }
  },

  capture() {
    clearInterval(this._checkInterval);
    this._cancelAuto();

    const video = document.getElementById('camera-video');
    const frame = document.getElementById('camera-frame');
    const vr = video.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();

    const scaleX = video.videoWidth / vr.width;
    const scaleY = video.videoHeight / vr.height;
    const cropX = (fr.left - vr.left) * scaleX;
    const cropY = (fr.top  - vr.top)  * scaleY;
    const cropW = fr.width  * scaleX;
    const cropH = fr.height * scaleY;

    this.canvas.width  = Math.min(cropW, 1600);
    this.canvas.height = this.canvas.width * (cropH / cropW);
    const scale = this.canvas.width / cropW;
    this.ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, this.canvas.width, this.canvas.height);

    const blur = this._calcBlur();
    const base64 = this.canvas.toDataURL('image/jpeg', 0.85);
    this.close();
    if (this.currentCallback) this.currentCallback({ base64, isBlurry: blur < 30, blurScore: blur });
  },

  _avgBrightness(imgData) {
    let sum = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
      sum += 0.299*imgData.data[i] + 0.587*imgData.data[i+1] + 0.114*imgData.data[i+2];
    }
    return sum / (imgData.data.length / 4);
  },

  _calcBlur() {
    const { width, height } = this.canvas;
    if (!width || !height) return 999;
    const imgData = this.ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const gray = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      gray[i>>2] = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
    }
    let sumSq = 0, sum = 0, n = 0;
    const step = 4; // sample ทุก 4 pixel ให้เร็วขึ้น
    for (let y = step; y < height-step; y += step) {
      for (let x = step; x < width-step; x += step) {
        const idx = y*width + x;
        const lap = -gray[idx-width]-gray[idx-1]+4*gray[idx]-gray[idx+1]-gray[idx+width];
        sum += lap; sumSq += lap*lap; n++;
      }
    }
    if (!n) return 999;
    const mean = sum/n;
    return sumSq/n - mean*mean;
  },

  close(hideOverlay = true) {
    clearInterval(this._checkInterval);
    this._cancelAuto();
    this._stopStream();
    if (hideOverlay) {
      const overlay = document.getElementById('camera-overlay');
      if (overlay) overlay.classList.add('hidden');
    }
  },

  pickFromGallery(callback) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const base64 = await this._fileToBase64(file);
      const compressed = await this._compressBase64(base64, 1600, 0.85);
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
        if (w > maxWidth) { h = h*maxWidth/w; w = maxWidth; }
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
  const label   = cardEl.querySelector('.doc-label');

  cardEl.addEventListener('click', () => {
    if (cardEl.classList.contains('has-file')) {
      if (!confirm('ต้องการเปลี่ยนรูปใหม่?')) return;
    }
    _showSourcePicker(docType, (result) => {
      _handlePhoto(cardEl, preview, label, result, docType, onFile);
    });
  });
}

function _showSourcePicker(docType, callback) {
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:fixed;inset:0;z-index:7000;background:rgba(0,0,0,0.4);display:flex;align-items:flex-end;';
  sheet.innerHTML = `
    <div style="width:100%;background:#fff;border-radius:16px 16px 0 0;padding:20px;">
      <p style="font-weight:700;margin-bottom:16px;text-align:center">เลือกรูปภาพ</p>
      <button id="btn-camera" class="btn btn-primary btn-full" style="margin-bottom:10px">📷 ถ่ายภาพอัตโนมัติ</button>
      <button id="btn-gallery" class="btn btn-outline btn-full" style="margin-bottom:10px">🖼️ เลือกจากแกลเลอรี่</button>
      <button id="btn-cancel-pick" class="btn btn-ghost btn-full">ยกเลิก</button>
    </div>`;
  document.body.appendChild(sheet);
  sheet.querySelector('#btn-camera').onclick  = () => { sheet.remove(); Camera.open(docType, callback); };
  sheet.querySelector('#btn-gallery').onclick = () => { sheet.remove(); Camera.pickFromGallery(callback); };
  sheet.querySelector('#btn-cancel-pick').onclick = () => sheet.remove();
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.remove(); });
}

function _handlePhoto(cardEl, preview, label, result, docType, onFile) {
  const { base64, isBlurry } = result;
  cardEl.querySelectorAll('.blur-warning').forEach(e => e.remove());
  if (isBlurry) {
    const warn = document.createElement('div');
    warn.className = 'blur-warning';
    warn.innerHTML = '⚠️ ภาพอาจเบลอ กรุณาตรวจสอบก่อนส่ง';
    cardEl.parentNode.insertBefore(warn, cardEl.nextSibling);
  }
  if (preview) { preview.src = base64; preview.classList.remove('hidden'); }
  if (label) label.textContent = isBlurry ? '⚠️ ภาพอาจเบลอ' : '✅ อัปโหลดแล้ว';
  cardEl.classList.add('has-file');
  if (onFile) onFile(docType, base64);
}
