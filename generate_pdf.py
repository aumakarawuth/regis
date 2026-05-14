"""
generate_pdf.py — สร้าง PDF ใบสมัคร วทจ.
ใช้ Pillow วาดข้อความลงบนภาพฟอร์ม แล้วรวมเป็น PDF
พร้อมเพิ่มหน้าเอกสารแนบพร้อมตราสำเนาถูกต้อง
"""
from PIL import Image, ImageDraw, ImageFont
import os, io
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pypdf import PdfWriter, PdfReader

# ---- Font ----
THAI_FONT_PATH = '/usr/share/fonts/truetype/tlwg/Garuda.ttf'
THAI_FONT_BOLD_PATH = '/usr/share/fonts/truetype/tlwg/Garuda-Bold.ttf'

W, H = 2480, 3508   # A4 @ 300 dpi

def get_font(size):
    try:
        return ImageFont.truetype(THAI_FONT_PATH, size)
    except:
        return ImageFont.load_default()

def get_font_bold(size):
    try:
        return ImageFont.truetype(THAI_FONT_BOLD_PATH, size)
    except:
        return get_font(size)

# =============================================
# ฟังก์ชัน: วาดข้อความบนหน้าฟอร์ม (พิกเซล)
# =============================================
def draw_text(draw, text, x, y, size=48, color=(0,0,0), bold=False):
    font = get_font_bold(size) if bold else get_font(size)
    draw.text((x, y), str(text), font=font, fill=color)

def draw_checkbox(draw, x, y, checked=True, size=36):
    """วาดกากบาทหรือว่างเปล่า"""
    if checked:
        font = get_font_bold(size)
        draw.text((x, y), '/', font=font, fill=(0,0,0))

# =============================================
# สร้างภาพฟอร์ม ปวช. หน้า 1
# =============================================
def fill_pvch_front(student):
    img = Image.open('/mnt/user-data/uploads/ใบสม_คร_ปวช_หน_า_N_0.png').copy()
    draw = ImageDraw.Draw(img)

    # ---- แถวบนสุด ----
    # "นาย/น.ส./นาง ......... ห้อง .......... รอบ ............"
    full_name = f"{student['prefix']}{student['firstName']} {student['lastName']}"
    draw_text(draw, full_name, 370, 68, size=52)

    round_label = {'morning':'เช้า', 'afternoon':'บ่าย', 'dual':'ทวิภาคี'}.get(student.get('studyRound',''), '')
    draw_text(draw, round_label, 2140, 68, size=52)

    # รหัสประจำตัว (กล่องขวา)
    id_card = student.get('idCard', '')
    id_digits = id_card.replace('-','').replace(' ','')
    # กล่องรหัส 13 ช่อง ~ x=1480, y=130, กว้างช่องละ ~55px
    for i, ch in enumerate(id_digits[:13]):
        draw_text(draw, ch, 1492 + i*66, 130, size=46)

    # ทุนสัณห์ / กู้ยศ / อื่น (แถว 2)
    scholarship = student.get('scholarship', '')
    if scholarship == 'พรนิมิตร':
        draw_text(draw, '/', 182, 132, size=52)
    elif scholarship == 'กู้ยศ':
        draw_text(draw, '/', 370, 132, size=52)

    # =====================
    # ส่วนที่ 1 ของฟอร์มหลัง (ไม่มีบนหน้านี้ — หน้านี้คือปก)
    # =====================
    return img

# =============================================
# สร้างภาพฟอร์ม ปวช. หน้า 2 (ฟอร์มกรอก)
# =============================================
def fill_pvch_back(student):
    img = Image.open('/mnt/user-data/uploads/ใบสม_คร_ปวช_หล_ง_N_0.png').copy()
    draw = ImageDraw.Draw(img)

    # ---- วันที่สมัคร ----
    apply_date = student.get('applyDate', '').split('T')[0]
    parts = apply_date.split('-')
    if len(parts) == 3:
        y_be = int(parts[0]) + 543
        draw_text(draw, f"{parts[2]}/{parts[1]}/{y_be}", 530, 210, size=50)

    # ---- รอบ เช้า/บ่าย/ทวิภาคี ----
    rd = student.get('studyRound', '')
    if rd == 'morning':
        draw_text(draw, '/', 1375, 210, size=52)
    elif rd == 'afternoon':
        draw_text(draw, '/', 1490, 210, size=52)
    elif rd == 'dual':
        draw_text(draw, '/', 1640, 210, size=52)

    # ---- ข้อ 1: ชื่อ นามสกุล วัน/เดือน/ปีเกิด ----
    draw_text(draw, student.get('firstName', ''), 385, 298, size=50)
    draw_text(draw, student.get('lastName', ''), 1050, 298, size=50)
    birth = student.get('birthDate', '').split('T')[0]
    bparts = birth.split('-')
    if len(bparts) == 3:
        y_be = int(bparts[0]) + 543
        draw_text(draw, f"{bparts[2]}/{bparts[1]}/{y_be}", 1900, 298, size=50)

    # Mr/Miss/Mrs (ภาษาอังกฤษ)
    prefix_en = {'นาย':'Mr.', 'นาง':'Mrs.', 'นางสาว':'Miss.', 'เด็กชาย':'Master', 'เด็กหญิง':'Miss'}.get(student.get('prefix',''), 'Mr.')
    first_en = student.get('firstNameEn', student.get('firstName',''))
    last_en = student.get('lastNameEn', student.get('lastName',''))
    draw_text(draw, f"{prefix_en} {first_en} {last_en}", 410, 350, size=48)

    # เลขบัตร ปชช.
    id_digits = student.get('idCard','').replace('-','').replace(' ','')
    for i, ch in enumerate(id_digits[:13]):
        draw_text(draw, ch, 1492 + i*66, 350, size=46)

    # สัญชาติ เชื้อชาติ ศาสนา น้ำหนัก ส่วนสูง หมู่โลหิต
    draw_text(draw, student.get('nationality','ไทย'), 430, 402, size=46)
    draw_text(draw, student.get('ethnicity','ไทย'), 670, 402, size=46)
    draw_text(draw, student.get('religion','พุทธ'), 900, 402, size=46)
    draw_text(draw, student.get('weight',''), 1110, 402, size=46)
    draw_text(draw, student.get('height',''), 1290, 402, size=46)
    draw_text(draw, student.get('bloodType',''), 1550, 402, size=46)

    # ---- ข้อ 2: สาขา ----
    branch = student.get('branchName', '')
    branch_map = {
        'การบัญชี': (230, 452),
        'การตลาด': (480, 452),
        'ภาษาต่างประเทศธุรกิจบริการ': (700, 452),
        'ธุรกิจค้าปลีก': (1090, 452),
        'เทคโนโลยีธุรกิจดิจิทัล': (218, 508),
        'เทคโนโลยีสารสนเทศ': (570, 508),
        'ดิจิทัลกราฟิก': (880, 508),
        'การท่องเที่ยว': (1070, 508),
    }
    if branch in branch_map:
        draw_text(draw, '/', branch_map[branch][0]-28, branch_map[branch][1], size=52)

    # location (กทม/ต่างจังหวัด) — ค่า default กทม.
    draw_text(draw, '/', 1340, 452, size=52)  # กทม

    # ---- ข้อ 3: จบการศึกษา ----
    old_school = student.get('oldSchool','')
    draw_text(draw, old_school, 430, 570, size=46)

    addr_sub = student.get('addrSubDistrict','')
    addr_dist = student.get('addrDistrict','')
    addr_prov = student.get('addrProvince','')
    draw_text(draw, addr_sub, 320, 622, size=46)
    draw_text(draw, addr_dist, 820, 622, size=46)
    draw_text(draw, addr_prov, 1500, 622, size=46)

    edu = student.get('education','ม.3')
    if 'ม.3' in edu:
        draw_text(draw, '/', 218, 676, size=52)
    elif 'ปวช' in edu.lower():
        draw_text(draw, '/', 420, 702, size=52)

    # ---- ข้อ 4: ที่อยู่ ----
    detail = student.get('addrDetail','')
    draw_text(draw, detail, 320, 790, size=46)
    draw_text(draw, addr_sub, 320, 842, size=46)
    draw_text(draw, addr_dist, 750, 842, size=46)
    draw_text(draw, addr_prov, 1330, 842, size=46)
    draw_text(draw, student.get('addrZipcode',''), 1920, 842, size=46)
    draw_text(draw, student.get('phone',''), 360, 896, size=46)

    # ---- ส่วนที่ 2: บิดา/มารดา/ผู้ปกครอง ----
    parents = student.get('parents', [])
    father = next((p for p in parents if p.get('type') == 'father'), {})
    mother = next((p for p in parents if p.get('type') == 'mother'), {})
    guardian = student.get('guardian', {})

    # บิดา
    if father:
        draw_text(draw, father.get('firstName',''), 470, 1012, size=46)
        draw_text(draw, father.get('lastName',''), 940, 1012, size=46)
        draw_text(draw, father.get('occupation',''), 1340, 1012, size=46)
        draw_text(draw, father.get('phone',''), 1960, 1012, size=46)
        fid = father.get('idCard','').replace('-','').replace(' ','')
        for i, ch in enumerate(fid[:13]):
            draw_text(draw, ch, 1492 + i*66, 1064, size=46)

    # มารดา
    if mother:
        draw_text(draw, mother.get('firstName',''), 400, 1116, size=46)
        draw_text(draw, mother.get('lastName',''), 870, 1116, size=46)
        draw_text(draw, mother.get('occupation',''), 1290, 1116, size=46)
        draw_text(draw, mother.get('phone',''), 1900, 1116, size=46)
        mid = mother.get('idCard','').replace('-','').replace(' ','')
        for i, ch in enumerate(mid[:13]):
            draw_text(draw, ch, 1492 + i*66, 1168, size=46)

    # ผู้ปกครอง
    if guardian:
        gname = f"{guardian.get('prefix','')} {guardian.get('firstName','')} {guardian.get('lastName','')}"
        draw_text(draw, gname, 580, 1222, size=46)
        draw_text(draw, guardian.get('occupation',''), 1400, 1222, size=46)
        draw_text(draw, guardian.get('relation',''), 340, 1276, size=46)
        draw_text(draw, guardian.get('phone',''), 680, 1276, size=46)
        draw_text(draw, guardian.get('address',''), 1100, 1276, size=46)

    # ---- ลายเซ็น ผู้สมัคร (ชื่อ) ----
    full_name = f"({student.get('prefix','')}{student.get('firstName','')} {student.get('lastName','')})"
    draw_text(draw, full_name, 360, 1620, size=46)

    return img

# =============================================
# สร้างภาพฟอร์ม ปวส. เหมือน ปวช. แต่เลือก template ต่างกัน
# =============================================
def fill_pvs_front(student):
    img = Image.open('/mnt/user-data/uploads/ใบสม_คร_ปวส_หน_า_N_0.png').copy()
    draw = ImageDraw.Draw(img)
    full_name = f"{student['prefix']}{student['firstName']} {student['lastName']}"
    draw_text(draw, full_name, 370, 68, size=52)
    id_digits = student.get('idCard','').replace('-','').replace(' ','')
    for i, ch in enumerate(id_digits[:13]):
        draw_text(draw, ch, 1492 + i*66, 130, size=46)
    round_label = {'morning':'เช้า','afternoon':'บ่าย','dual':'ทวิภาคี'}.get(student.get('studyRound',''),'')
    draw_text(draw, round_label, 2140, 68, size=52)
    return img

def fill_pvs_back(student):
    img = Image.open('/mnt/user-data/uploads/ใบสม_คร_ปวส_หล_งN_0.png').copy()
    draw = ImageDraw.Draw(img)

    apply_date = student.get('applyDate','').split('T')[0]
    parts = apply_date.split('-')
    if len(parts)==3:
        y_be = int(parts[0])+543
        draw_text(draw, f"{parts[2]}/{parts[1]}/{y_be}", 530, 210, size=50)

    rd = student.get('studyRound','')
    if rd=='morning': draw_text(draw, '/', 1375, 210, size=52)
    elif rd=='afternoon': draw_text(draw, '/', 1490, 210, size=52)
    elif rd=='dual': draw_text(draw, '/', 1640, 210, size=52)

    draw_text(draw, student.get('firstName',''), 385, 298, size=50)
    draw_text(draw, student.get('lastName',''), 1050, 298, size=50)
    birth = student.get('birthDate','').split('T')[0]
    bparts = birth.split('-')
    if len(bparts)==3:
        y_be = int(bparts[0])+543
        draw_text(draw, f"{bparts[2]}/{bparts[1]}/{y_be}", 1900, 298, size=50)
    id_digits = student.get('idCard','').replace('-','').replace(' ','')
    for i, ch in enumerate(id_digits[:13]):
        draw_text(draw, ch, 1492+i*66, 350, size=46)

    draw_text(draw, student.get('nationality','ไทย'), 430, 402, size=46)
    draw_text(draw, student.get('ethnicity','ไทย'), 670, 402, size=46)
    draw_text(draw, student.get('religion','พุทธ'), 900, 402, size=46)

    # สาขา ปวส. (แถวต่างจาก ปวช.)
    branch = student.get('branchName','')
    pvs_branches = {
        'การบัญชี': (230,452), 'การตลาด':(480,452),
        'เทคโนโลยีธุรกิจดิจิทัล':(218,508), 'เทคโนโลยีสารสนเทศ':(570,508),
        'ดิจิทัลกราฟิก':(880,508), 'การท่องเที่ยว':(1070,508),
        'ภาษาและการจัดการธุรกิจระหว่างประเทศ':(218,562),
        'การจัดการดูแลผู้สูงอายุ':(680,562), 'การจัดการสำนักงานดิจิทัล':(1020,562),
    }
    if branch in pvs_branches:
        x,y = pvs_branches[branch]
        draw_text(draw, '/', x-28, y, size=52)

    old_school = student.get('oldSchool','')
    draw_text(draw, old_school, 430, 638, size=46)

    addr_sub = student.get('addrSubDistrict','')
    addr_dist = student.get('addrDistrict','')
    addr_prov = student.get('addrProvince','')
    draw_text(draw, addr_sub, 320, 690, size=46)
    draw_text(draw, addr_dist, 820, 690, size=46)
    draw_text(draw, addr_prov, 1500, 690, size=46)

    detail = student.get('addrDetail','')
    draw_text(draw, detail, 320, 820, size=46)
    draw_text(draw, addr_sub, 320, 872, size=46)
    draw_text(draw, addr_dist, 750, 872, size=46)
    draw_text(draw, addr_prov, 1330, 872, size=46)
    draw_text(draw, student.get('addrZipcode',''), 1920, 872, size=46)
    draw_text(draw, student.get('phone',''), 360, 926, size=46)

    parents = student.get('parents',[])
    father = next((p for p in parents if p.get('type')=='father'), {})
    mother = next((p for p in parents if p.get('type')=='mother'), {})
    guardian = student.get('guardian',{})

    if father:
        draw_text(draw, father.get('firstName',''), 470, 1042, size=46)
        draw_text(draw, father.get('lastName',''), 940, 1042, size=46)
        draw_text(draw, father.get('occupation',''), 1340, 1042, size=46)
        draw_text(draw, father.get('phone',''), 1960, 1042, size=46)
        fid = father.get('idCard','').replace('-','').replace(' ','')
        for i, ch in enumerate(fid[:13]):
            draw_text(draw, ch, 1492+i*66, 1094, size=46)
    if mother:
        draw_text(draw, mother.get('firstName',''), 400, 1146, size=46)
        draw_text(draw, mother.get('lastName',''), 870, 1146, size=46)
        draw_text(draw, mother.get('occupation',''), 1290, 1146, size=46)
        draw_text(draw, mother.get('phone',''), 1900, 1146, size=46)
        mid = mother.get('idCard','').replace('-','').replace(' ','')
        for i, ch in enumerate(mid[:13]):
            draw_text(draw, ch, 1492+i*66, 1198, size=46)
    if guardian:
        gname = f"{guardian.get('prefix','')} {guardian.get('firstName','')} {guardian.get('lastName','')}"
        draw_text(draw, gname, 580, 1252, size=46)
        draw_text(draw, guardian.get('relation',''), 340, 1306, size=46)
        draw_text(draw, guardian.get('phone',''), 680, 1306, size=46)

    full_name = f"({student.get('prefix','')}{student.get('firstName','')} {student.get('lastName','')})"
    draw_text(draw, full_name, 360, 1650, size=46)

    return img

# =============================================
# สร้างหน้าเอกสารแนบ (สำเนาถูกต้อง)
# =============================================
def make_document_page(doc_image_b64_or_path, doc_label, student_name):
    """
    สร้างหน้า A4 สำหรับเอกสารแนบ 1 ชนิด
    - วางรูปเอกสารตรงกลาง
    - ตราสำเนาถูกต้องมุมล่างขวา
    - ชื่อนักเรียน + เส้นเซ็น
    """
    bg = Image.new('RGB', (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(bg)

    # หัวข้อเอกสาร
    font_title = get_font_bold(72)
    draw.text((W//2, 80), doc_label, font=font_title, fill=(0,0,0), anchor='mt')

    # วางรูปเอกสาร
    if isinstance(doc_image_b64_or_path, str) and os.path.exists(doc_image_b64_or_path):
        try:
            doc_img = Image.open(doc_image_b64_or_path).convert('RGB')
        except:
            doc_img = None
    elif isinstance(doc_image_b64_or_path, bytes):
        doc_img = Image.open(io.BytesIO(doc_image_b64_or_path)).convert('RGB')
    else:
        doc_img = None

    if doc_img:
        # Scale to fit
        max_w, max_h = W - 200, H - 600
        ratio = min(max_w / doc_img.width, max_h / doc_img.height)
        new_w = int(doc_img.width * ratio)
        new_h = int(doc_img.height * ratio)
        doc_img = doc_img.resize((new_w, new_h), Image.LANCZOS)
        x_off = (W - new_w) // 2
        bg.paste(doc_img, (x_off, 160))
        doc_bottom = 160 + new_h
    else:
        # Placeholder box
        draw.rectangle([100, 180, W-100, H-500], outline=(200,200,200), width=4)
        draw.text((W//2, (H-500+180)//2), '(ไม่มีรูปเอกสาร)', font=get_font(60), fill=(180,180,180), anchor='mm')
        doc_bottom = H - 500

    # ---- ตราสำเนาถูกต้อง (มุมล่างขวา) ----
    stamp_x = W - 800
    stamp_y = doc_bottom + 40
    # วงรี
    draw.ellipse([stamp_x-10, stamp_y-10, stamp_x+510, stamp_y+210], outline=(200,0,0), width=8)
    font_stamp = get_font_bold(68)
    draw.text((stamp_x + 250, stamp_y + 100), 'สำเนาถูกต้อง', font=font_stamp, fill=(200,0,0), anchor='mm')

    # เส้นเซ็นชื่อ + ชื่อ
    sig_y = stamp_y + 260
    draw.line([(stamp_x-10, sig_y), (stamp_x+510, sig_y)], fill=(0,0,0), width=3)
    font_name = get_font(52)
    draw.text((stamp_x + 250, sig_y + 20), f'({student_name})', font=font_name, fill=(0,0,0), anchor='mt')
    draw.text((stamp_x + 250, sig_y + 85), 'ผู้สมัคร', font=font_name, fill=(100,100,100), anchor='mt')

    return bg

# =============================================
# แปลง Pillow Image → PDF bytes
# =============================================
def image_to_pdf_bytes(img):
    buf = io.BytesIO()
    # Convert to RGB
    img_rgb = img.convert('RGB')
    img_rgb.save(buf, format='PDF', resolution=300)
    buf.seek(0)
    return buf.read()

# =============================================
# สร้าง PDF รวม
# =============================================
def generate_registration_pdf(student, docs_paths=None):
    """
    student: dict with all form data
    docs_paths: dict {doc_type: path_or_bytes}
    Returns: bytes of combined PDF
    """
    level = student.get('levelName', 'ปวช')
    is_pvs = 'ปวส' in level

    pages_bytes = []

    # ---- หน้าฟอร์ม ----
    if is_pvs:
        front_img = fill_pvs_front(student)
        back_img = fill_pvs_back(student)
    else:
        front_img = fill_pvch_front(student)
        back_img = fill_pvch_back(student)

    pages_bytes.append(image_to_pdf_bytes(front_img))
    pages_bytes.append(image_to_pdf_bytes(back_img))

    # ---- หน้าเอกสารแนบ ----
    student_name = f"{student.get('prefix','')}{student.get('firstName','')} {student.get('lastName','')}"

    doc_labels = {
        'id_card_front': 'สำเนาบัตรประจำตัวประชาชน (ด้านหน้า)',
        'id_card_back':  'สำเนาบัตรประจำตัวประชาชน (ด้านหลัง)',
        'house_reg':     'สำเนาทะเบียนบ้าน',
        'edu_cert_front':'สำเนาวุฒิการศึกษา (ด้านหน้า)',
        'edu_cert_back': 'สำเนาวุฒิการศึกษา (ด้านหลัง)',
        'payment_slip':  'หลักฐานการชำระเงิน',
    }

    if docs_paths:
        for doc_type, label in doc_labels.items():
            if doc_type in docs_paths and docs_paths[doc_type]:
                page_img = make_document_page(docs_paths[doc_type], label, student_name)
                pages_bytes.append(image_to_pdf_bytes(page_img))

    # ---- รวม PDF ด้วย pypdf ----
    writer = PdfWriter()
    for pdf_bytes in pages_bytes:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page in reader.pages:
            writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return out.read()


# =============================================
# TEST — สร้าง PDF ตัวอย่างด้วยข้อมูลจำลอง
# =============================================
if __name__ == '__main__':
    sample_pvch = {
        'levelName': 'ปวช.',
        'branchName': 'การบัญชี',
        'studyRound': 'morning',
        'applicationNo': 'APP-2568-0001',
        'applyDate': '2025-03-15T00:00:00',
        'prefix': 'นาย',
        'firstName': 'สมชาย',
        'lastName': 'ใจดี',
        'idCard': '1234567890123',
        'birthDate': '2009-05-20T00:00:00',
        'phone': '0891234567',
        'education': 'ม.3',
        'oldSchool': 'โรงเรียนมัธยมวัดหนองจอก',
        'nationality': 'ไทย',
        'ethnicity': 'ไทย',
        'religion': 'พุทธ',
        'weight': '55',
        'height': '165',
        'bloodType': 'O',
        'addrDetail': '123/4 ซอยประชาชื่น ถนนนวมินทร์',
        'addrSubDistrict': 'คลองจั่น',
        'addrDistrict': 'บางกะปิ',
        'addrProvince': 'กรุงเทพมหานคร',
        'addrZipcode': '10240',
        'parents': [
            {'type':'father','firstName':'สมศักดิ์','lastName':'ใจดี','occupation':'ค้าขาย','phone':'0812345678','idCard':'9876543210987'},
            {'type':'mother','firstName':'สมหญิง','lastName':'ใจดี','occupation':'แม่บ้าน','phone':'0823456789','idCard':'1111222233334'},
        ],
        'guardian': {
            'prefix':'นาย','firstName':'สมศักดิ์','lastName':'ใจดี',
            'phone':'0812345678','relation':'บิดา','occupation':'ค้าขาย',
        },
    }

    sample_pvs = {**sample_pvch, 'levelName': 'ปวส.', 'branchName': 'การบัญชี',
                  'education': 'ปวช.', 'applicationNo': 'APP-2568-0002',
                  'prefix': 'นางสาว', 'firstName': 'สมใจ', 'lastName': 'รักเรียน'}

    print("Generating ปวช. PDF...")
    pdf_pvch = generate_registration_pdf(sample_pvch)
    with open('/home/claude/ใบสมัคร_ปวช_ตัวอย่าง.pdf', 'wb') as f:
        f.write(pdf_pvch)
    print(f"  -> {len(pdf_pvch)//1024} KB")

    print("Generating ปวส. PDF...")
    pdf_pvs = generate_registration_pdf(sample_pvs)
    with open('/home/claude/ใบสมัคร_ปวส_ตัวอย่าง.pdf', 'wb') as f:
        f.write(pdf_pvs)
    print(f"  -> {len(pdf_pvs)//1024} KB")

    print("Done!")
