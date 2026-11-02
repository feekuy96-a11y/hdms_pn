# OSRM Local Microservice สำหรับแขวงทางหลวงปัตตานี

ระบบบริการคำนวณโครงข่ายเส้นทางและทางเลี่ยงออฟไลน์ (Local Routing Engine) รองรับการประมวลผลความเร็วสูง (1-5 ms) โดยไม่ต้องพึ่งพาอินเทอร์เน็ตภายนอกและไม่มีข้อจำกัด Rate Limit

---

## 1. คุณสมบัติเด่น (Features)
- **High Performance:** ประมวลผลด้วย C++ MLD (Multi-Level Dijkstra) อัตราตอบสนอง 1-5 มิลลิวินาที
- **Air-Gapped & Offline Ready:** ทำงานได้ 100% แม้ระบบตัดขาดจากอินเทอร์เน็ตภายนอกในช่วงวิกฤตภัยพิบัติ
- **Turn-by-turn Navigation:** สกัดจุดเลี้ยว ชื่อถนน และหมายเลขทางหลวง (ทล.42, ทล.43, ทางหลวงชนบท ปน.2007) ครบถ้วน
- **Zero Cost / No Rate Limits:** ไม่จำกัดจำนวนครั้งในการยิงคำนวณแนวเส้นทาง

---

## 2. ความต้องการของระบบ (System Requirements)
- **CPU:** 2 vCPU ขึ้นไป
- **RAM:** 2 GB - 4 GB (สำหรับโครงข่ายถนนประเทศไทยทั้งประเทศ)
- **Disk:** พื้นที่ว่าง 3 GB
- **Software:** Docker & Docker Compose

---

## 3. วิธีการติดตั้งและเริ่มต้นใช้งาน (Installation)

### สำหรับ Windows (PowerShell):
```powershell
cd docker/osrm
.\download-and-build.ps1
```

### สำหรับ Linux / Ubuntu Server:
```bash
cd docker/osrm
chmod +x download-and-build.sh
./download-and-build.sh
```

---

## 4. ตรวจสอบการทำงาน (Healthcheck)
ทดสอบเรียกคำนวณเส้นทางผ่าน cURL หรือเบราว์เซอร์:
```bash
curl "http://localhost:5000/route/v1/driving/101.18,6.86;101.25,6.87?overview=full&geometries=geojson"
```
หากได้ JSON ตอบกลับพร้อมรหัส `"code": "Ok"` แสดงว่า Microservice พร้อมใช้งานแล้ว

---

## 5. การตั้งค่า Environment Variables ในเว็บแอป
ในไฟล์ `.env` ของโปรเจกต์:
```env
NEXT_PUBLIC_OSRM_LOCAL_URL=http://localhost:5000/route/v1/driving
NEXT_PUBLIC_OSRM_ROUTING_URL=https://router.project-osrm.org/route/v1/driving
```
เว็บแอปจะสลับไปเรียก `NEXT_PUBLIC_OSRM_LOCAL_URL` โดยอัตโนมัติ และหากปิดเครื่องหรือ Service หยุดทำงาน ระบบจะ Fallback ไปยัง Public API หรือ In-DB PostGIS โดยที่ระบบไม่หยุดชะงัก

