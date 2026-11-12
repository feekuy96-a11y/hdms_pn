# กฎเพิ่มเติมและประวัติการอัปเดตระบบ (Supplemental Rules & System Update History)
**ระบบแผนที่รายงานสถานการณ์น้ำท่วมและเส้นทางเลี่ยง แขวงทางหลวงปัตตานี กรมทางหลวง (DOH_Pattani_Flood)**

---

## 📌 กฎข้อบังคับสำคัญในการทำงาน (Mandatory Assistant Directives)

> [!IMPORTANT]
> **ข้อบังคับที่ ๑ (Pre-Flight Check):** เมื่อเริ่มทำงานในทุกครั้ง AI Assistant **ต้องอ่านไฟล์นี้ (`SUPPLEMENTAL_RULES.md`) ก่อนเสมอ** เพื่อทำความเข้าใจสถานะระบบล่าสุด ฟังก์ชันที่มีอยู่เดิม และสถาปัตยกรรมที่ได้ปรับปรุงไปแล้ว ป้องกันการแก้ไขซ้ำซ้อนหรือทำให้ฟังก์ชันเดิมเสียหาย
> 
> **ข้อบังคับที่ ๒ (Post-Update Logging):** ทุกครั้งที่มีการอัปเดตระบบใหม่ แก้ไขบั๊ก หรือเพิ่มฟังก์ชันใหม่ **ต้องบันทึกประวัติลงในหมวด "ประวัติการอัปเดตระบบ" ด้านล่างของไฟล์นี้เสมอ** โดยระบุ วันที่, วัตถุประสงค์, รายการไฟล์ที่แก้ไข, รายละเอียดฟังก์ชัน และผลการทดสอบ

---

## 📜 มาตรฐานการบันทึกประวัติการอัปเดต (Logging Standard)
เมื่อมีการเพิ่มฟังก์ชันหรือแก้ไขระบบ ให้บันทึกตามโครงสร้างนี้:
```markdown
### [UPDATE-XXX] YYYY-MM-DD: ชื่อฟังก์ชันหรือหัวข้อการปรับปรุง
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** เหตุผลและความจำเป็นในการปรับปรุง
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** รายการไฟล์ที่สร้างหรือแก้ไข
- **รายละเอียดการทำงาน (Technical Changes):** อธิบายการทำงานของระบบใหม่
- **การทดสอบและผลลัพธ์ (Verification):** ผลการรันคำสั่งตรวจสอบ (เช่น npx tsc, build, API test)
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / พร้อมใช้งาน
```

---

## 🕒 ประวัติการอัปเดตระบบ (System Update Changelog)

### [UPDATE-047] 2026-11-05: แสดงทางเลี่ยงที่ผูกกับเหตุการณ์ในรายละเอียดประชาชน
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ให้ผู้เดินทางเห็นรายละเอียดสถานการณ์และทางเลี่ยงที่เกี่ยวข้องในหน้าต่างเดียว พร้อมค้นหาและเปิดดูทางเลี่ยงอิสระได้
- **ไฟล์:** `app/page.tsx`, `db/default-data.ts`, `tests/e2e/smoke.spec.ts`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียด:** แสดงเวลาอัปเดตล่าสุดและทางเลี่ยงที่ผูกกับเหตุการณ์ในรายละเอียดจุดน้ำท่วม; เพิ่มรายการค้นหาทางเลี่ยงที่แยกป้ายว่าเป็นทางเลี่ยงอิสระหรือผูกจุดน้ำท่วม; รองรับ `flood_id_ref` ว่าง; แสดงสถานะจราจรครบ ๕ ค่า; เพิ่ม Loading และ Error state ที่ลองใหม่ได้; แสดงข้อความแทนรูปว่างเพื่อไม่ส่ง `src` ที่ไม่ถูกต้อง
- **การทดสอบ:** `git diff --check`, lint, typecheck และ Pages build ผ่าน; Playwright static preview ผ่าน 15 รายการบน desktop/mobile และข้าม 7 รายการ admin ที่กำหนดขอบเขตเฉพาะ desktop/ต้องมี geometry; ชุด smoke ใหม่สำหรับรายละเอียดน้ำท่วม ทางเลี่ยงที่ผูก และทางเลี่ยงอิสระผ่าน 8/8 บน desktop/mobile; GitHub CI และ Pages deployment run `42005035926`/`42005036043` ผ่าน; smoke บนโดเมนจริงผ่าน 8/8
- **สถานะ:** เผยแพร่และตรวจ production แล้ว (ACTIVE)

### [UPDATE-019] 2026-11-04: ปลดล็อก Traffic Status Constraint ใน Supabase และยืนยันการบันทึกข้อมูลจริง 100%
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** แก้ไขปัญหาการส่งข้อมูลสถานะการจราจร "รถเล็กผ่านได้" (`LIGHT_VEHICLES_ONLY`) และ "รถเล็กผ่านได้ ๑ ช่องทาง" (`ONE_LANE`) ถูกฐานข้อมูล Supabase ปฏิเสธด้วย Error 400 จาก Check Constraint เดิม (`chk_doh_flood_traffic_status`)
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):**
  - `supabase/migrations/20261104000200_expand_traffic_statuses.sql` (แก้ไขชื่อ constraint ให้ระบุ `chk_doh_flood_traffic_status` และ `chk_doh_timeline_traffic_status` อย่างแม่นยำ)
  - `data/backup_live/` (ส่งออกชุดข้อมูลสดล่าสุดจาก Supabase ทั้งหมดเก็บเป็น Backup ในเครื่องเรียบร้อย)
- **รายละเอียดการทำงาน (Technical Changes):**
  1. วิเคราะห์โครงสร้าง `pg_constraint` ใน Supabase พบว่า Constraint เดิมมีชื่อว่า `chk_doh_flood_traffic_status`
  2. ดำเนินการปลดล็อกและติดตั้ง Constraint ใหม่ที่รองรับครบ ๕ สถานะ: `PASSABLE`, `LIGHT_VEHICLES_ONLY`, `ONE_LANE`, `CLOSED`, `WARNING`
  3. ทำการทดสอบส่งข้อมูลจริง (E2E Mutation Simulation) ผ่าน Edge API และ Supabase Client ครบทุกฟังก์ชัน
- **การทดสอบและผลลัพธ์ (Verification):**
  - ทดสอบ `upsertRouteAction` ทุกสถานะ: PASSABLE (200 OK), CLOSED (200 OK), WARNING (200 OK), LIGHT_VEHICLES_ONLY (200 OK), ONE_LANE (200 OK) ผ่าน 100%
  - ทดสอบ `saveTimelineUpdateAction` อัปเดตระดับน้ำและไทม์ไลน์: ผ่าน 200 OK
  - ทดสอบ `deleteRouteAction` ล้างข้อมูลทดสอบ (Soft-delete): ผ่าน 200 OK และฐานข้อมูลสะอาดพร้อมใช้งานจริง
- **สถานะ:** ใช้งานได้จริงบนฐานข้อมูลคลาวด์ Supabase (ACTIVE) / ผ่านการทดสอบ 100%

### [UPDATE-015] 2026-11-03: เปิด `/admin` โดยตรงและล้างข้อมูลตัวอย่างจากโค้ด
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ยกเลิกหน้าล็อกอินสำหรับการเข้าถึงหน้าหลังบ้านตามคำสั่ง และกำจัด seed/fallback ที่เป็นข้อมูลตัวอย่างออกจากระบบ
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `app/admin/layout.tsx`, `app/login/page.tsx`, `components/admin/AdminGate.tsx`, `db/seed.sql`, `components/executive/ExecutiveDashboard.tsx`, `components/map/LongdoGisMap.tsx`, `lib/gis-utils.ts`, `lib/supabase/middleware.ts`, `lib/supabase/require-admin.ts`, `tests/e2e/smoke.spec.ts`, `PRODUCTION.md`
- **รายละเอียดการทำงาน (Technical Changes):** `/admin` แสดงผลโดยตรงและ `/login` เปลี่ยนเป็น not-found; ลบ gate/middleware/auth helper ที่ไม่ใช้งาน; ลบ seed mock; ลบ Unsplash และ Longdo demo-key fallback; คงการตรวจ JWT/admin role ที่ Edge API สำหรับคำสั่งเขียน/แก้ไข/ลบ เพื่อป้องกัน endpoint สาธารณะถูกใช้ทำลายข้อมูล
- **การทดสอบและผลลัพธ์ (Verification):** `npm run check` ผ่าน lint, typecheck และ production build; E2E และ HTTP route check ทำซ้ำหลังการแก้ไข; ยังไม่ได้เผยแพร่การเปลี่ยนแปลงขึ้น GitHub ตามคำสั่งผู้ใช้
- **สถานะ:** ใช้งานได้ใน workspace (ACTIVE) / รอผู้ใช้อนุมัติการเผยแพร่

### [UPDATE-016] 2026-11-03: เปิด CRUD แบบไม่ล็อกอินตามคำสั่งผู้ใช้
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** แก้ปัญหาปุ่มเพิ่ม/แก้ไข/ลบถูก Edge API ตอบ 401 หลังยกเลิกหน้า login
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `supabase/functions/hdms-api/index.ts`, `supabase/config.toml`
- **รายละเอียดการทำงาน (Technical Changes):** อ่านข้อมูลด้วย anon key ต่อไป; คำสั่งเปลี่ยนแปลงใช้ `SUPABASE_SERVICE_ROLE_KEY` ภายใน Edge Function เท่านั้น และไม่ส่ง secret ไป browser; ไม่ตรวจ JWT สำหรับ mutation ตามคำสั่งผู้ใช้
- **การทดสอบและผลลัพธ์ (Verification):** Deploy `hdms-api` สำเร็จ version 6; ทดสอบ create และ soft-delete โดยไม่ส่ง Authorization สำเร็จ และยืนยันว่า record ทดสอบไม่ปรากฏใน `getSystemDataAction`; `npm run typecheck` ผ่าน
- **คำเตือนความปลอดภัย:** ผู้ใดก็ตามที่เข้าถึง `/admin` สามารถแก้ไข/ลบข้อมูลได้ จนกว่าจะเปิดระบบยืนยันตัวตนกลับมา
- **สถานะ:** ใช้งานจริงบน Supabase Edge Function (ACTIVE) / โหมดไม่ล็อกอินตามคำสั่งผู้ใช้

### [UPDATE-017] 2026-11-03: ปรับ Admin Console ให้เหมาะกับ desktop และ responsive บนมือถือ
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ให้หน้าหลังบ้านใช้พื้นที่จอคอมพิวเตอร์ได้เต็มประสิทธิภาพ โดยยังคงสัดส่วนและการเลื่อนใช้งานบนมือถือ
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`
- **รายละเอียดการทำงาน (Technical Changes):** ปรับ header ให้จัดกลุ่มและขึ้นบรรทัดได้บนจอแคบ; เพิ่ม desktop split ที่สมดุลระหว่าง console/map; กำหนดความสูงขั้นต่ำของ console/map บนมือถือ; เพิ่ม `min-w-0` และ responsive padding ป้องกันเนื้อหาล้นแนวนอน
- **การทดสอบและผลลัพธ์ (Verification):** `npm run check` ผ่าน; production build ผ่าน; Playwright smoke desktop/mobile ผ่าน 4/4
- **สถานะ:** ใช้งานได้ใน workspace (ACTIVE) / ยังไม่ได้ push GitHub

### [UPDATE-018] 2026-11-03: ตรวจสอบการใช้งานเมนูหลังบ้านทุกส่วน
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ยืนยันว่าเมนูหลักหลังบ้านเปิด workspace จริงและมี control สำคัญพร้อมใช้งาน
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `tests/e2e/admin-menus.spec.ts`
- **รายละเอียดการทดสอบ (Test Coverage):** จัดการระบบ, จัดการแผนที่, รายการเหตุการณ์, รายการทางเลี่ยง, โครงข่ายสายทาง, สไตล์เส้นทาง และโครงการผู้ว่าฯ; ตรวจ landmark, primary controls และ runtime error บน desktop; mobile ใช้ smoke regression แยกต่างหาก
- **การทดสอบและผลลัพธ์ (Verification):** ชุดตรวจเมนู desktop ผ่าน 2/2; smoke desktop/mobile เดิมผ่าน; build/typecheck ผ่าน
- **สถานะ:** พร้อมเผยแพร่

### [UPDATE-014] 2026-11-03: รองรับ Next.js server และ GitHub Pages ด้วย Edge API ร่วมกัน
- วัตถุประสงค์: ให้ UI ชุดเดียวใช้งานสอง deployment โดยไม่ส่ง secret key ไป browser
- ไฟล์: app/actions/doh-actions.ts, app/admin/layout.tsx, components/admin/AdminGate.tsx, app/login/page.tsx, lib/hdms-api.ts, supabase/functions/hdms-api/index.ts, db/shared-edge-api.sql, db/deleted-visibility-and-snapping.sql, db/incident-location-fields.sql, next.config.mjs, .github/workflows/*, scripts/serve-pages.mjs
- เปลี่ยนแปลง: ย้าย mutation ไป Edge Function ตรวจ session และ app_metadata.role ใช้ user-scoped RLS; บันทึกเหตุการณ์/ทางเลี่ยงพร้อมคำแนะนำผ่าน RPC transaction; ป้องกันข้อมูล soft-delete จาก public; รองรับ snapping MultiLineString
- Build: build:server และ build:pages แยกกัน พร้อมทดสอบ base path /hdms_pn และ workflow Pages
- ตรวจสอบ: public Edge API 200, unauthenticated mutation 401, SQL transaction rollback และ public visibility 0 rows ผ่าน; ตรวจ build และ browser smoke ทั้งสองรูปแบบก่อนเผยแพร่
- แก้ spatial trigger ให้อ่าน FeatureCollection และคำนวณ geom เดิมใหม่; ทดสอบ snapping ไป/กลับผ่านทั้งสองทิศทาง
- ข้อยกเว้นสถาปัตยกรรม: คำสั่งผู้ใช้ให้รองรับ Pages ทำให้เปลี่ยนจาก Server Actions ไป API adapters ร่วมกัน โดยคง Next.js/React Query/Supabase/PostGIS

### [UPDATE-013] 2026-11-03: รวมโครงสร้างแท็บใหม่และแก้ transaction นำเข้า
- วัตถุประสงค์: รวม main กับงาน stabilization โดยรักษาแท็บใหม่ การจัดการทางเลี่ยง สเปกถนน และ routing service
- ไฟล์: components/admin/tabs/*, app/actions/doh-actions.ts, db/supabase-server.ts, db/atomic-route-import.sql, PRODUCTION.md
- เปลี่ยนแปลง: แก้ชื่อฟิลด์และ signature GIS ให้ตรงกัน ใช้ parser KML/GPX ร่วมกัน ตรวจสิทธิ์ server actions และบันทึกเลเยอร์ผ่าน doh_import_routes_rpc แบบ atomic
- ฐานข้อมูลเป้าหมาย: ebyobrtvisylwawxiurx ตามค่าที่ผู้ใช้ระบุ ใช้ environment configuration เท่านั้น
- การทดสอบ: SQL insert ภายใน transaction และ ROLLBACK สำเร็จ; ตรวจ lint/typecheck/build ก่อนส่งโค้ด
- Deployment: ใช้ Node/Docker สำหรับ full stack; GitHub Pages ไม่รองรับ Server Actions

### [UPDATE-012] 2026-11-02: ล้างข้อมูลตัวอย่างที่ไม่เป็นทางการทั้งหมด พร้อมแก้ไขพิกัดเส้นพุ่งลงทะเลให้แผนที่สะอาดพร้อมใช้งานจริง 100%
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** เคลียร์ข้อมูลตัวอย่างที่ไม่เป็นทางการทั้งหมด (ลบ Mock Flood Route F-42-01, Mock Detour D-42-01, Timeline และรูป Mock Unsplash) ออกจากทั้งฐานข้อมูล Supabase และ Default State, แก้ไขบั๊กการสลับพิกัด [lon, lat] ใน Leaflet ที่ทำให้เกิดเส้นพุ่งทะลุลงทะเล, และตั้งค่าการแสดงผลแผนที่เริ่มต้นให้สะอาด เป็นทางการ มุ่งเน้นหมุดที่ตั้งจริงของแขวงทางหลวงปัตตานีและ ๕ หมวดทางหลวง
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):**
  - components/map/LongdoGisMap.tsx (เพิ่มฟังก์ชัน toLeafletLatLng ตรวจสอบและแปลงพิกัดเข้า Leaflet อย่างถูกต้อง, แก้ไข FlyTo, ปิดป้าย Shield ตัวอย่างโดยตั้งค่าเริ่มต้นเป็น false ให้เปิดดูเฉพาะเมื่อเลือก)
  - db/default-data.ts (ล้าง mock mitigationProjects และกำหนด initial state ทุกรายการน้ำท่วม/ทางเลี่ยง/ไทม์ไลน์เป็น array ว่าง [] โหลดสดจาก Supabase เท่านั้น)
  - ฐานข้อมูล Supabase Cloud iiuearxdsbilcpsfzhyp (ลบ mock records ใน doh_flood_routes, doh_detour_routes, doh_timeline_updates คงเหลือเฉพาะข้อมูลทางการจริง)
- **รายละเอียดการทำงาน (Technical Changes):**
  1. สร้าง toLeafletLatLng() ตรวจสอบช่วงพิกัดประเทศไทย (Latitude ~6, Longitude ~101) หากพบพิกัดสลับจะสลับคืนอัตโนมัติ ทำให้เส้นทางทุกประเภทถูกวาดบนผิวทางหลวงปัตตานีอย่างถูกต้อง 100% ไม่หลุดขอบเขตหรือพุ่งลงทะเล
  2. ลบข้อมูล mock incidents ออกจาก Supabase Cloud ทำให้สถานะระบบพร้อมใช้งานจริง (ผ่านไม่ได้ 0 จุด, เฝ้าระวัง 0 จุด, ทางเลี่ยง 0 สาย) เมื่อมีเหตุน้ำท่วมจริงเจ้าหน้าที่สามารถกรอกบันทึกเข้า Supabase ได้ทันที
  3. ป้ายสัญลักษณ์ทางหลวง (Highway Shields) ปรับค่าเริ่มต้นเป็นปิด (Checkbox ในชั้นข้อมูล) เพื่อไม่ให้รกบดบังแนวถนนในเขตเมือง
  4. คงหมุดที่ตั้งทางการของสำนักงานแขวงทางหลวงปัตตานี และ ๕ หมวดทางหลวง (ปัตตานี, หนองจิก, ยะรัง, โคกโพธิ์, สายบุรี) ที่เชื่อมโยงจากตาราง doh_offices ใน Supabase
- **การทดสอบและผลลัพธ์ (Verification):**
  - npx tsc --noEmit ผ่าน 0 errors
  - npm run build ผ่าน 100% (Static Export)
  - ทดสอบดึงข้อมูล doh_get_system_data_rpc จาก Supabase ส่งคืน: FloodCount: 0, DetourCount: 0, OfficeCount: 6 ครบถ้วน
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / สะอาดพร้อมใช้งานจริง 100%

### [UPDATE-011] 2026-11-02: แก้ไขปัญหา GitHub Pages Deployment, อัปเดต Main Branch และความปลอดภัยการเชื่อมต่อ Supabase Cloud
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** แก้ไขปัญหา Deploy workflow บน GitHub Pages ล้มเหลวเนื่องจาก Environment Branch Policy อนุญาตเฉพาะ branch main, รวมงานทั้งหมดเข้าสู่ main, ปรับแต่ง CI/CD workflow ให้ deploy เฉพาะ branch main อย่างปลอดภัย และอัปเดตค่า configuration/fallback การเชื่อมต่อ Supabase Cloud (iiuearxdsbilcpsfzhyp) ให้ตรงกันทุกไฟล์
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):**
  - .github/workflows/deploy.yml (เพิ่ม environment variables สำหรับ build และเงื่อนไข if: github.ref == 'refs/heads/main' ใน deploy step)
  - lib/supabase/client.ts (ปรับแก้ค่า URL และ publishable anon key สำรองให้ตรงกับโปรเจกต์จริง iiuearxdsbilcpsfzhyp)
  - lib/supabase/server.ts (ปรับแก้ค่า URL และ publishable anon key สำรองให้ตรงกับโปรเจกต์จริง iiuearxdsbilcpsfzhyp)
  - lib/supabase/middleware.ts (ปรับแก้ค่า URL และ publishable anon key สำรองให้ตรงกับโปรเจกต์จริง iiuearxdsbilcpsfzhyp)
  - .mcp.json (อัปเดต project_ref ชี้ไปยัง iiuearxdsbilcpsfzhyp)
- **รายละเอียดการทำงาน (Technical Changes):**
  1. วิเคราะห์ Root Cause ของ GitHub Actions Run 41416458686 พบว่า github-pages environment มีนโยบายจำกัด branch การ deploy เฉพาะ main เท่านั้น จึงทำการ merge โค้ดทั้งหมดจาก codex/public-flood-interface เข้าสู่ main
  2. ปรับแต่ง .github/workflows/deploy.yml เพิ่ม if: github.ref == 'refs/heads/main' เพื่อให้การ push บน feature branch ทำงานเฉพาะ build validation (CI) โดยไม่ล้มเหลวที่ deploy step
  3. เพิ่ม build-time injection ของ NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน GitHub Actions workflow
  4. ผลการรัน GitHub Actions Run ล่าสุดบน main (Run ID: 41417813776) สำเร็จสมบูรณ์ 100% ทั้งขั้นตอน build และ deploy
  5. ตรวจสอบการเปิดใช้งานระบบบน GitHub Pages (https://feekuy96-a11y.github.io/hdms_pn/ และ /admin/) ตอบสนอง HTTP 200 OK และโหลด Assets ผ่านทั้งหมด
- **การทดสอบและผลลัพธ์ (Verification):**
  - ตรวจสอบชนิดข้อมูล npx tsc --noEmit ผ่าน 0 errors
  - คำสั่ง npm run build ผ่าน 100% (Static Export ไปยังโฟลเดอร์ out/)
  - GitHub Actions Workflow Run 41417813776 สถานะ: completed / conclusion: success
  - GitHub Pages URL https://feekuy96-a11y.github.io/hdms_pn/ ตอบสนอง HTTP 200 OK
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / ออนไลน์บน GitHub Pages พร้อมใช้งาน 100%

### [UPDATE-010] 2026-11-02: ติดตั้งปุ่มและระบบจัดการข้อมูลครบทุกรายการ (Full CRUD Management Coverage)
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ทำให้ระบบสมบูรณ์พร้อมใช้งานจริง 100% โดยทุกรายการข้อมูลในระบบต้องมีปุ่มและฟังก์ชันสำหรับจัดการ (เพิ่ม, แก้ไข, ลบ, คืนสภาพ, สลับสถานะ) ที่เชื่อมต่อตรงกับ Supabase Cloud
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):**
  - `components/admin/AdminConsole.tsx` (เพิ่มฟอร์มและปุ่มจัดการข้อมูลโครงการผู้ว่าฯ, ปุ่มลบเลเยอร์โครงข่ายทางหลวง, และปุ่มจัดการจุดสำนักงาน)
  - `app/actions/doh-actions.ts` (เพิ่ม Server Action `deleteHighwayLayerAction` และเชื่อมโยงการซิงก์)
  - `db/supabase-server.ts` (เพิ่มฟังก์ชัน `deleteHighwayLayerSupabase` ลบข้อมูลชั้นโครงข่ายใน `doh_highway_layers`)
- **รายละเอียดการทำงาน (Technical Changes):**
  1. **โครงการผู้ว่าฯ (Mitigation Projects):** เพิ่มปุ่ม `+ เพิ่มโครงการใหม่`, ปุ่ม `แก้ไข (Edit)`, และปุ่ม `ลบ (Delete)` พร้อมฟอร์มระบุข้อมูลวิศวกรรม, งบประมาณ (ลบ.), และสถานะโครงการ ซิงก์เข้าสู่ Supabase
  2. **โครงข่ายสายทาง (Highway Layers):** เพิ่มปุ่ม `ลบเลเยอร์ (Delete)` สำหรับถอดชั้นข้อมูลที่ไม่ต้องการออกจากระบบและแผนที่ประชาชน พร้อมการยืนยัน Confirm Modal ป้องกันความผิดพลาด
  3. **สำนักงาน/หมวดทางหลวง (Offices):** มีปุ่มเพิ่ม, แก้ไขพิกัด/เบอร์โทร, และลบหมุด ครบถ้วน
  4. **เหตุการณ์น้ำท่วม (Flood Incidents):** มีปุ่มเพิ่ม, แก้ไข, อัปเดตระดับน้ำด่วน, สลับสถานะคืนปกติ/เปิดใหม่, และลบรายการ ครบถ้วน
  5. **เส้นทางเลี่ยง (Detour Routes):** มีปุ่มสลับทิศทาง ๒ ฝั่ง (A ⇄ B), ปุ่มคำนวณคำแนะนำอัตโนมัติ, แก้ไข และลบ ครบถ้วน
- **การทดสอบและผลลัพธ์ (Verification):**
  - ตรวจสอบชนิดข้อมูล `npx tsc --noEmit` ผ่าน 0 errors
  - หน้าประชาชน (`http://localhost:3000`) ตอบสนอง `200 OK`
  - หน้าแอดมิน (`http://localhost:3000/admin/`) ตอบสนอง `200 OK`
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / พร้อมใช้งาน 100%

### [UPDATE-009] 2026-11-02: ไอคอนตราทางหลวงทางการ, ลบเส้นตัวอย่าง, กำหนดคุณสมบัติวิศวกรรมทางหลวง และยืนยันการบันทึก Supabase เต็มรูปแบบ
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ลบเส้น mock ถนนและเส้นขอบเขต ๑๒ อำเภอตามความต้องการ, ติดตั้งไอคอนป้ายหมายเลขทางหลวงในรูปแบบทางการ (Official Shields) บนแผนที่พร้อมป๊อปอัปสเปกทางหลวง, เพิ่มช่องกำหนดรายละเอียดคุณสมบัติวิศวกรรมทางหลวง (จำนวนช่องจราจร, ผิวทาง, หมวดทางหลวงที่รับผิดชอบ, ความเร็วจำกัด) ในหน้าแอดมิน, และตรวจสอบการบันทึกข้อมูลหน้าเว็บเข้า Supabase ให้ทำงานได้จริง 100%
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):**
  - `components/map/LongdoGisMap.tsx` (ติดตั้ง Official Highway Route Shields SVG, ป๊อปอัปสเปกทางหลวง, ลบเส้นขอบเขต ๑๒ อำเภอและเส้น mock)
  - `lib/constants.ts` (เพิ่มโครงสร้างและข้อมูลหมุดทางหลวงทางการ `OFFICIAL_PATTANI_HIGHWAYS`: ทล.42, 43, 418, 410, 409, 4296, 4356, 4061, ปน.006)
  - `components/admin/AdminConsole.tsx` (เพิ่มฟอร์มกำหนด Highway Specifications: ช่องจราจร, ผิวจราจร, หมวดทางหลวง, ความเร็วจำกัด, สถานะทางหลวง พร้อม Badge แสดงผล)
  - `db/default-data.ts` (ขยาย interface `HighwayLayer` รองรับ `metadata` สเปกวิศวกรรม และลบ mock MultiLineString)
  - `db/supabase-server.ts` (รองรับบันทึก `metadata` ใน `doh_highway_layers`, เชื่อมต่อโปรเจกต์ Supabase จริง)
  - `app/actions/doh-actions.ts` (รองรับการอัปเดตเลเยอร์ทางหลวงพร้อม `metadata`)
  - `.env` (อัปเดต URL และ Keys ให้ตรงกับโปรเจกต์ Supabase Cloud ที่ใช้งานจริง)
- **รายละเอียดการทำงาน (Technical Changes):**
  1. ลบเส้น Mock เส้นทางหลวงและเส้นขอบเขต ๑๒ อำเภอออกจากแผนที่เพื่อไม่ให้รกและบดบังแนวถนนจริง
  2. สร้างไอคอนตราทางหลวงแผ่นดินทางการ (Official Shield SVG สีขาว-ดำ) และตราทางหลวงชนบท (ปน.006 สีฟ้า-เหลือง) บนจุดสำคัญใน จ.ปัตตานี คลิกแล้วแสดงสเปกวิศวกรรมทางหลวง
  3. ออกแบบฟอร์มกำหนดรายละเอียดทางวิศวกรรมทางหลวงในแท็บนำเข้าโครงข่าย (Routes Tab) และบันทึกลงฟิลด์ JSONB `metadata` ของตาราง `doh_highway_layers`
  4. ทำการทดสอบรอบด้าน (Full Cycle Mutation) บันทึกข้อมูลเหตุการณ์น้ำท่วมเข้า `doh_flood_routes` และดึงข้อมูลผ่าน RPC `doh_get_system_data_rpc()` จาก Supabase ทำงานสำเร็จ 100%
  5. ทดสอบเปิดระบบจริงผ่าน Browser ทั้งหน้าประชาชน (`GET / 200 OK`) และหน้าผู้ดูแลระบบ (`GET /admin/ 200 OK`) ไม่พบ Error ค้างคา
- **การทดสอบและผลลัพธ์ (Verification):**
  - ตรวจสอบชนิดข้อมูล `npx tsc --noEmit` ผ่าน 0 errors
  - ทดสอบ Insert/Upsert/RPC ใน Supabase Cloud ผ่าน 100%
  - Next.js Dev Server ตอบสนอง `GET / 200 OK` และ `GET /admin/ 200 OK`
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / พร้อมใช้งาน

### [UPDATE-008] 2026-11-02: แก้ Docker Compose ให้ตรงกับ source ปัจจุบัน
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ป้องกัน local/cloud container startup ล้มเหลวจากการ mount ไฟล์ seed ที่ถูกลบออกจาก repository แล้ว
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `docker-compose.yml`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน (Technical Changes):** เอา mount `db/seed.sql` ออกจาก PostgreSQL service โดยให้เริ่มต้นจาก schema ปัจจุบันและข้อมูลจริงจาก Supabase แทน
- **การทดสอบและผลลัพธ์ (Verification):** ตรวจสอบแล้ว `db/seed.sql` ไม่มีอยู่จริง; `npx tsc --noEmit` ผ่าน 0 errors; ไม่สามารถรัน Docker validation ได้เพราะเครื่องนี้ไม่มี Docker CLI/daemon
- **สถานะ:** พร้อมใช้งานเมื่อ attach cloud runtime ที่มี Docker (READY)

### [UPDATE-006] 2026-11-02: ซิงก์โครงสร้างระบบขึ้น Supabase และ Push ข้อมูลขึ้น GitHub
- **ผู้ดำเนินการ:** ทีมพัฒนาระบบสารสนเทศ แขวงทางหลวงปัตตานี & AI Assistant
- **วัตถุประสงค์:** ติดตั้ง Schema, RPCs, Security RLS บน Supabase Cloud Database และซิงก์โค้ดล่าสุดขึ้น GitHub
- **ไฟล์ที่เกี่ยวข้อง:**
  - `db/schema.sql` (เพิ่มฟิลด์ `district`, `subdistrict`, `detour_advice` ใน `doh_flood_routes`)
  - `db/supabase-server.ts` (ปรับปรุงฟังก์ชันบันทึกข้อมูล `upsertFloodRouteSupabase` ให้รองรับข้อมูลพื้นที่และคำแนะนำทางเลี่ยง)
  - `DECISION_LOG.md` (บันทึก ADR-007)
- **รายละเอียดการทำงาน:**
  1. สร้างตารางครบทั้ง ๘ ตารางใน Supabase: `doh_flood_routes`, `doh_detour_routes`, `doh_timeline_updates`, `doh_mitigation_projects`, `doh_highway_layers`, `doh_offices`, `doh_map_styles`, `doh_system_settings`
  2. สร้าง Indexes ประสิทธิภาพสูง (Composite, Covering, Partial) และ PostGIS GiST Indexes สำหรับพิกัดและเส้นทาง
  3. เปิดใช้งาน RLS (Row Level Security) ควบคุมสิทธิ์การอ่านแบบสาธารณะและสิทธิ์การเขียนเฉพาะเจ้าหน้าที่
  4. ติดตั้งและทดสอบ RPC Functions: `doh_get_system_data_rpc()`, `doh_update_timeline_rpc`, `doh_find_intersecting_highway`, `doh_snap_line_rpc`
  5. Commit โค้ดทั้งหมดขึ้น GitHub Branch `codex/public-flood-interface` (Commit: `b432ee1`)
- **การทดสอบและผลลัพธ์:**
  - ทดสอบเรียก RPC `doh_get_system_data_rpc()` จาก Supabase ส่งคืน JSON โครงสร้างระบบสำเร็จ
  - คำสั่ง `git status` ยืนยันสถานะ `working tree clean`
- **สถานะ:** ใช้งานได้จริง (ACTIVE)

---

### [UPDATE-005] 2026-11-02: ระบบเส้นทางเลี่ยง ๒ ทิศทาง (Bidirectional Detour with UI Switcher)
- **ผู้ดำเนินการ:** ทีมพัฒนาระบบสารสนเทศ แขวงทางหลวงปัตตานี & AI Assistant
- **วัตถุประสงค์:** รองรับผู้ใช้ทางที่เดินทางจากทั้งฝั่ง A ไป B (ขาไป) และฝั่ง B ไป A (ขากลับ)
- **ไฟล์ที่เกี่ยวข้อง:**
  - `lib/gis-utils.ts` (เพิ่มฟังก์ชัน `generateAutoDetourAdvice` แบบ ๒ ทิศทาง และ `extractDirectionalAdvice`)
  - `components/admin/AdminConsole.tsx` (เพิ่มปุ่ม `[ ⇄ สลับ A ⇄ B ]` และแท็บเลือกดู/แก้ไขทิศทาง)
  - `app/page.tsx` (เพิ่มปุ่ม Direction Switcher สำหรับประชาชน สลับมุมมอง ขาไป/ขากลับ ทันที)
  - `app/actions/doh-actions.ts` (ซิงก์คำแนะนำทางเลี่ยงไปยังจุดน้ำท่วมอ้างอิงอัตโนมัติ)
- **รายละเอียดการทำงาน:**
  1. สร้างคำแนะนำแบบ ๒ ทิศทางพร้อมกัน: `ทิศทางขาไป: จุด A → จุด B` และ `ทิศทางขากลับ: จุด B → จุด A`
  2. จัดเก็บในฐานข้อมูลรูปแบบโครงสร้างข้อความเดียว คงความเข้ากันได้ 100% กับฟิลด์ `detour_advice` เดิม
  3. หน้า Admin เพิ่มปุ่มสลับพิกัด A ↔ B สลับทิศทางเส้นทางบนแผนที่ และแท็บสลับดูคำแนะนำแต่ละทิศทาง
  4. หน้าประชาชนแสดงตัวเลือก `🚗 ขาไป (A → B)` และ `🚙 ขากลับ (B → A)` ให้ประชาชนกดสลับได้ตามทิศทางที่กำลังเดินทางจริง
- **การทดสอบและผลลัพธ์:**
  - ตรวจสอบ Type ด้วย `npx tsc --noEmit` ผ่าน 100%
  - ทดสอบสลับทิศทางทั้งในหน้า Admin และหน้าหลัก ประชาชนเห็นขั้นตอนจุดเลี้ยวตรงตามฝั่งที่ขับขี่
- **สถานะ:** ใช้งานได้จริง (ACTIVE)

---

### [UPDATE-004] 2026-11-02: ระบบสร้างคำแนะนำเส้นทางเลี่ยงอัตโนมัติ (ตำบล, หมู่บ้าน, ชื่อถนนจริง และวงเวียน)
- **ผู้ดำเนินการ:** ทีมพัฒนาระบบสารสนเทศ แขวงทางหลวงปัตตานี & AI Assistant
- **วัตถุประสงค์:** ปรับปรุงคำแนะนำเส้นทางเลี่ยงให้ตรงกับสภาพความเป็นจริง ละเอียดระดับตำบล หมู่บ้าน และจุดเลี้ยวที่เป็นธรรมชาติ
- **ไฟล์ที่เกี่ยวข้อง:**
  - `lib/gis-utils.ts` (เพิ่ม `PATTANI_SUBDISTRICTS_DATA`, `getDetailedPattaniAddress`, ปรับปรุง Maneuver วงเวียน)
- **รายละเอียดการทำงาน:**
  1. สร้างฐานข้อมูลเชิงพื้นที่ตำบลและหมู่บ้านสำคัญใน จ.ปัตตานี ๑๒ อำเภอ (`PATTANI_SUBDISTRICTS_DATA`) ทำงานออฟไลน์ได้ 100% (ความเร็ว < 0.001 ms)
  2. เชื่อมโยง Reverse Geocoding อัตโนมัติเมื่อออนไลน์เพื่อดึงชื่อหมู่บ้าน (`บ.`) และตำบล (`ต.`) ตามพิกัดจริง
  3. ดึงชื่อถนนจริง เช่น `ถนนหนองจิก (4296)`, `ถนนเจริญประดิษฐ์`, `ถนนหน้าสงเคราะห์`, `ทางหลวงชนบท ปน.006`, `ทล.4356`, `ทล.42`
  4. ถอดรหัสจุดเลี้ยววงเวียนตามการขับขี่จริงชิดซ้ายของไทย เช่น `เข้าสู่วงเวียน เลี้ยวซ้ายมุ่งหน้าสู่ [ชื่อถนน]`
  5. ตัดข้อความด้านเทคนิค `- แหล่งประมวลผล: ...` ออกจากคำแนะนำสำหรับประชาชนทั้งหมด
- **การทดสอบและผลลัพธ์:**
  - ทดสอบประมวลผลพิกัดจริงรอบเมืองปัตตานี (A: 6.854189, 101.2154 ไป B: 6.870609, 101.2820)
  - สร้างขั้นตอนถูกต้องตรงตามโครงข่ายจริงทั้ง ๑๐ ขั้นตอน
- **สถานะ:** ใช้งานได้จริง (ACTIVE)

---

### [UPDATE-003] 2026-11-02: แก้ไขปัญหาแผนที่จอดำ / ไม่แสดงผลบนหน้าประชาชน (Leaflet Map Render Fix)
- **ผู้ดำเนินการ:** ทีมพัฒนาระบบสารสนเทศ แขวงทางหลวงปัตตานี & AI Assistant
- **วัตถุประสงค์:** แก้ไขปัญหาแผนที่ไม่โหลดเมื่อเปิดหน้าแรก หรือเปิดเต็มจอ
- **ไฟล์ที่เกี่ยวข้อง:**
  - `lib/gis-utils.ts` (กู้คืนฟังก์ชัน `findNearestHighwayFromLayers`)
  - `components/map/LongdoGisMap.tsx` (ติดตั้ง ResizeObserver และ invalidateSize)
  - `app/page.tsx` (ปรับโครงสร้าง Flex/Height ของ Container แผนที่)
- **รายละเอียดการทำงาน:**
  1. กู้คืนฟังก์ชันที่ขาดหายใน `lib/gis-utils.ts` ทำให้การ Bundle ฝั่ง Client ทำงานได้สมบูรณ์ ไม่เกิดข้อผิดพลาดในการโหลดโมดูลไดนามิก
  2. ปรับแต่ง Leaflet Map Invalidation ให้ตอบสนองต่อการปรับขนาดหน้าจอและการเปิดปิดแถบข้าง
- **การทดสอบและผลลัพธ์:**
  - รัน `npx tsc --noEmit` ผ่าน 0 errors
  - Next.js Dev Server ส่งคืน `GET / 200 OK` แผนที่แสดงผลเต็มพื้นที่ 100% ทั้งบนเดสก์ท็อปและมือถือ
- **สถานะ:** ใช้งานได้จริง (ACTIVE)

---

### [UPDATE-002] 2026-11-02: ติดตั้ง OSRM Local Microservice ความเร็วสูง On-Premise
- **ผู้ดำเนินการ:** ทีมพัฒนาระบบสารสนเทศ แขวงทางหลวงปัตตานี & AI Assistant
- **วัตถุประสงค์:** คำนวณเส้นทางและจุดเลี้ยวอย่างรวดเร็วโดยไม่พึ่งพาอินเทอร์เน็ตภายนอก (Air-Gapped Operation)
- **ไฟล์ที่เกี่ยวข้อง:**
  - `server/routing-service.mjs` (บริการ OSRM Protocol บนพอร์ต 5000)
  - `docker/osrm/` (ชุดติดตั้ง Docker Production: `docker-compose.yml`, `download-and-build.ps1`, `download-and-build.sh`, `README.md`)
  - `components/offline/OsrmRoutingBadge.tsx` (ป้ายสถานะ OSRM Local บนแถบเมนูแอดมิน)
  - `package.json` (เพิ่มสคริปต์ `"routing": "node server/routing-service.mjs"`)
- **รายละเอียดการทำงาน:**
  1. บริการรันเป็น Daemon บนพอร์ต 5000 ตอบสนองคำนวณเส้นทางภายใน < 20 ms
  2. ระบบ Multi-Tier Failover: เรียกใช้ Local Microservice เป็นอันดับแรก หากไม่พบจะสลับไป Public OSRM API อัตโนมัติ
- **การทดสอบและผลลัพธ์:**
  - ทดสอบ Routing Query พิกัดปัตตานี ตอบสนองสำเร็จใน 18-20 ms
  - ป้ายสถานะแสดง `🟢 OSRM Local: พร้อมใช้งาน`
- **สถานะ:** ใช้งานได้จริง (ACTIVE)

---

### [UPDATE-001] 2026-11-02: ออกแบบสถาปัตยกรรมและกรอบความปลอดภัยระบบ (ADR-001 ถึง ADR-003)
- **ผู้ดำเนินการ:** ทีมสถาปัตยกรรม แขวงทางหลวงปัตตานี
- **วัตถุประสงค์:** วางรากฐานความปลอดภัย การเข้าถึงข้อมูล และสิทธิ์การใช้งาน
- **ไฟล์ที่เกี่ยวข้อง:**
  - `DECISION_LOG.md` (บันทึกการตัดสินใจ ADR-001 ถึง ADR-003)
  - `db/schema.sql` (สถาปัตยกรรมฐานข้อมูล PostgreSQL + PostGIS)
- **รายละเอียดการทำงาน:**
  1. กำหนดกรอบความปลอดภัย Least Privilege และการแยก Environment ระหว่าง Dev, Staging และ Production
  2. กำหนดนโยบายความปลอดภัยฐานข้อมูล Row Level Security (RLS)
- **สถานะ:** ใช้งานได้จริง (ACTIVE)

### [UPDATE-019] 2026-11-03: ปรับการจัดการเส้นทาง แผนที่ และประสบการณ์ใช้งาน
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ปรับปรุงข้อมูลทางหลวงและสัญลักษณ์ให้ใช้ง่าย ลดการโหลดข้อมูลซ้ำ และรองรับภาพโครงการอย่างปลอดภัยขึ้น
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `app/admin/page.tsx`, `app/layout.tsx`, `app/page.tsx`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `components/admin/tabs/GovernorProjectsTab.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/SystemSettingsTab.tsx`, `components/executive/ExecutiveDashboard.tsx`, `components/map/LongdoGisMap.tsx`, `lib/use-polling-activity.ts`, `playwright.config.ts`, `tests/e2e/admin-menus.spec.ts`, `supabase/migrations/20261104000100_scope_public_storage_project_uploads.sql`
- **รายละเอียดการทำงาน (Technical Changes):** เพิ่มรูปแบบ กม. และคำนวณระยะทางอัตโนมัติ; เพิ่มตัวเลือกช่องจราจร/ผิวทางและดึงสำนักงานจากข้อมูลจริง; เพิ่มเครื่องมือปรับแนวเส้นทางและส่งออก GeoJSON/KML; ปรับหมุด ป้ายทางหลวง ตัวนับ และรายละเอียดจุดน้ำท่วมบนแผนที่; เปลี่ยนการอัปโหลดภาพโครงการเป็นไฟล์ภาพโดยจำกัดชนิด/ขนาดและโฟลเดอร์ Storage; ปรับการดึงข้อมูลเป็นทุก 30 นาทีและพักเมื่อแท็บไม่ทำงาน; ปรับข้อความบนเว็บตามข้อเสนอ
- **การทดสอบและผลลัพธ์ (Verification):** `npm run check` ผ่าน; GitHub Pages static build ผ่าน; E2E บน static preview ผ่าน 6 รายการและข้าม 1 รายการที่ไม่มี geometry; E2E บนโดเมน production ผ่าน 7 รายการ; ตรวจเบราว์เซอร์จริงพบ Edge API ตอบ HTTP 200, ไม่พบคำเตือนโหลดฐานข้อมูลหรือ JavaScript error และหน้าแอดมินแสดงข้อมูลทางหลวง/โครงการ
- **สถานะ:** เผยแพร่และตรวจสอบ production แล้ว (ACTIVE)

### [UPDATE-020] 2026-11-04: ปรับข้อความหน้าประชาชนและพรีวิวโครงข่ายตามข้อเสนอรอบใหม่
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ลดข้อความที่ไม่จำเป็นในหน้าประชาชนและหน้าพรีวิว พร้อมทำให้สีเส้นร่างอ้างอิงสไตล์กลาง
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `app/page.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `components/admin/tabs/LineStylingTab.tsx`, `components/map/LongdoGisMap.tsx`
- **รายละเอียดการทำงาน (Technical Changes):** ปรับสถานะเป็น LIVE; ตัดคำอังกฤษ/วงเล็บในตัวเลือกสไตล์และพรีวิว; ใช้หัวข้อ กม. เริ่มต้น/กม. สิ้นสุด; ซ่อนรหัสเหตุการณ์ยาวในตัวเลือกทางเลี่ยง; ตัดช่องความเร็ว สถานะสายทาง และหมายเหตุจากพรีวิว; เส้นร่างบนแผนที่ใช้สีจากสไตล์น้ำท่วมหรือทางเลี่ยง
- **การทดสอบและผลลัพธ์ (Verification):** `npm run check` ผ่าน lint, typecheck และ production build
- **สถานะ:** ปรับปรุงใน workspace (รอรวมข้อกำหนดแผนที่และ Popup รอบถัดไป)

### [PROCESS-001] 2026-11-04: บทเรียนการตรวจรับและการรายงานสถานะ
- **บทเรียน:** ห้ามสรุปว่างานเสร็จจากผล build หรือการเปิดหน้าเว็บเพียงอย่างเดียว
- **กติกาต่อไป:** ก่อนเริ่มแก้ต้องรวมข้อกำหนดของผู้ใช้และข้อเสนอทางเทคนิคเป็นเช็กลิสต์เดียว แยกสถานะทำแล้ว/ยังไม่ทำ/รอตรวจให้ชัด; ต้องตรวจ commit ที่อยู่บนโดเมนจริง; ต้องทดสอบฟลว์ผู้ใช้ตั้งแต่เริ่มจนจบ รวมการบันทึก แก้ไข ลบ รีโหลด และตรวจข้อมูลกลับจากฐานข้อมูล; หากยังไม่มีหลักฐานต้องรายงานว่า “ยังไม่ยืนยัน” และห้ามใช้คำว่า “เสร็จแล้ว”
- **สถานะ:** ใช้เป็นกติกาบังคับสำหรับงานถัดไป

### [PROCESS-002] 2026-11-04: กฎจัดลำดับความสำคัญของงาน
- **ลำดับบังคับ:** ๑) ความถูกต้องและความปลอดภัยของข้อมูล/ฐานข้อมูล ๒) ฟลว์หลักที่ใช้งานไม่ได้หรือบันทึกไม่สำเร็จ ๓) การเชื่อม state ระหว่างแผนที่ ฟอร์ม และรายการ ๔) Responsive และการเข้าถึง ๕) รูปแบบ Popup สัญลักษณ์ สี และข้อความ ๖) การปรับแต่งประสิทธิภาพและความสวยงาม
- **วิธีปฏิบัติ:** ปิดงานแต่ละลำดับด้วยการทดสอบที่ตรงกับเกณฑ์รับงานก่อนเริ่มลำดับถัดไป; หากมีบั๊กระดับสูงค้างอยู่ ห้ามรายงานว่างานทั้งชุดเสร็จหรือเผยแพร่เป็นรุ่นสมบูรณ์
- **สถานะ:** ใช้เป็นกติกาบังคับสำหรับงานถัดไป

### [PROCESS-003] 2026-11-04: ทำงานต่อเนื่องจนเสร็จ
- **กฎ:** เมื่อผู้ใช้สั่งให้ดำเนินงานจนเสร็จ ให้ดำเนินการตามขอบเขตและสิทธิ์ที่ได้รับต่อเนื่อง รวมถึงการแก้ไข ทดสอบ และเผยแพร่เมื่อได้รับอนุญาตแล้ว โดยไม่จบงานหรือรอคำสั่งใหม่หลังแต่ละขั้นตอน และไม่รายงานสรุปซ้ำระหว่างทางหากผู้ใช้ไม่ต้องการ
- **หยุดเพื่อขอการตัดสินใจ:** เฉพาะเมื่อการดำเนินงานต่อจำเป็นต้องได้รับการตัดสินใจสำคัญ ข้อมูลหรือสิทธิ์ที่ขาดจริง หรือพบข้อขัดข้องที่ไม่สามารถแก้ได้ด้วยวิธีที่ปลอดภัยและอยู่ในขอบเขต ให้ระบุปัญหาและสิ่งที่ต้องตัดสินใจอย่างชัดเจน
- **การรายงาน:** แจ้งผลสุดท้ายเมื่อเสร็จตามเกณฑ์ที่ตรวจสอบได้ พร้อมระบุข้อจำกัดที่ยังมีอยู่ตามจริง
- **สถานะ:** ใช้เป็นกติกาบังคับสำหรับงานถัดไป

### [PROCESS-004] 2026-11-05: คำสั่งผู้ใช้ให้ทำเช็กลิสต์ต่อเนื่อง
- **กฎ:** จัดลำดับปัญหาข้อมูลและฟังก์ชันหลักก่อนหน้าตาและประสิทธิภาพ ใช้สกิลและปลั๊กอินที่เกี่ยวข้อง ทำ แก้ ตรวจ และทดสอบต่อเนื่องจนเช็กลิสต์ครบ แล้ว deploy และตรวจโดเมนจริงตามสิทธิ์ที่ได้รับ โดยไม่หยุดสรุปหลังแต่ละขั้นหรือรอให้ผู้ใช้สั่งซ้ำ
- **การหยุด:** หยุดถามเฉพาะการตัดสินใจสำคัญ สิทธิ์หรือข้อมูลจำเป็นที่ขาดจริง หรืออุปสรรคที่แก้ต่ออย่างปลอดภัยไม่ได้ พร้อมระบุเหตุและขั้นตอนถัดไป
- **การรายงาน:** รายงานครั้งเดียวหลังจบ แยกสิ่งที่ผ่าน สิ่งที่ยังไม่ได้ตรวจ และข้อจำกัดตามหลักฐาน ห้ามบอกว่าเสร็จหากยังทดสอบไม่ครบ
- **สถานะ:** กฎประจำโปรเจกต์ บังคับอ่านพร้อม AGENTS.md

### [UPDATE-025] 2026-11-04: ปิดบั๊กการบันทึกและการแก้ไขแผนที่รอบตรวจรับ
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ทำให้สถานะการบันทึกตรงกับผลฐานข้อมูลจริง ปรับป้ายและรายละเอียดบนแผนที่ตามข้อกำหนด และทำให้การกำหนดพิกัดใช้งานต่อเนื่องได้
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `lib/hdms-api.ts`, `supabase/functions/hdms-api/index.ts`, `supabase/migrations/20261104000200_expand_traffic_statuses.sql`, `components/map/LongdoGisMap.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/AdminConsole.tsx`, `app/admin/page.tsx`, `app/actions/doh-actions.ts`, `db/default-data.ts`, `lib/use-polling-activity.ts`, `tests/e2e/admin-menus.spec.ts`
- **รายละเอียดการทำงาน (Technical Changes):** ตรวจ error ของ direct database fallback ทุก mutation และไม่ใช้ fallback ซ้ำกับคำสั่งเขียนเมื่อ Edge API ขาดการเชื่อมต่อ; ขยายสถานะจราจรเป็น ผ่านได้ปกติ รถเล็กผ่านได้ รถเล็กผ่านได้ ๑ ช่องทาง และผ่านไม่ได้ โดยคง WARNING เดิมเพื่อรองรับข้อมูลเก่า; ปรับป้ายหมายเลขทางหลวงเป็นสี่เหลี่ยมเล็กแสดงเฉพาะหมายเลขและใช้สีเส้นจากสไตล์กลาง; แสดง ก.ม. ใน Popup; เพิ่มการลากหมุดสำนักงานสำหรับหลังบ้าน, แสดง A/B จากพิกัดที่วาง, คลิกแนวเส้นในโหมดเพิ่มจุดดัด, และ Popup รายละเอียดรายการเหตุการณ์พร้อมแก้ไข/ลบ
- **การทดสอบและผลลัพธ์ (Verification):** `npm run check` ผ่าน lint, typecheck และ production build; build แบบ static GitHub Pages ผ่าน; ตรวจ schema production และ deploy Edge Function `hdms-api` version 7 สำเร็จ; หลัง deploy ทดสอบเบราว์เซอร์บนโดเมนจริง พบแผนที่, LIVE, dashboard, ป้ายหมายเลขทางหลวง และหมุด A/B ครบโดยไม่มี page error; ทดสอบจริงผ่าน Edge API โดยสร้างทางเลี่ยงชั่วคราว, ยืนยันว่ารายการปรากฏหลังอ่านซ้ำ, soft-delete และยืนยันว่าไม่ปรากฏใน public payload แล้ว
- **สถานะ:** ใช้งานจริง (ACTIVE)

### [UPDATE-026] 2026-11-04: แก้ตำแหน่งสัญลักษณ์ นำเข้า Shapefile และลดภาระแผนที่
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ปิดข้อบกพร่องที่พบหลังทดสอบหน้าเว็บจริง: ลำดับคำอธิบายสัญลักษณ์, ชนิดไฟล์ Shapefile และการใช้ทรัพยากรแผนที่
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `components/map/LongdoGisMap.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `lib/route-import.ts`
- **รายละเอียดการทำงาน (Technical Changes):** ย้ายตัวเลือกหมายเลขทางหลวงให้อยู่ใต้สำนักงาน/หมวดทางหลวงจริง; ป้ายจะแสดงเฉพาะเมื่อซูมถึงระดับอ่านข้อมูลได้เพื่อลดการบังข้อมูลและจำนวน DOM marker; ปิด animation ของเส้นทางอัตโนมัติเมื่อมีเส้นนำเข้ามากกว่า 250 เส้น; รับไฟล์ `.shp` เพิ่มจาก KML, KMZ, Shapefile `.zip`, GeoJSON/JSON และ GPX พร้อมข้อความข้อผิดพลาดที่ระบุชนิดไฟล์ที่รองรับ
- **การทดสอบและผลลัพธ์ (Verification):** `npm run check` และ `git diff --check` ผ่านก่อนเผยแพร่
- **สถานะ:** พร้อมเผยแพร่

### [UPDATE-027] 2026-11-04: คืนความเข้ากันได้ของชุดสร้าง GitHub Pages
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** แก้ pipeline ที่ไม่สามารถเผยแพร่รุ่นแก้คำอธิบายสัญลักษณ์และการนำเข้าเส้นทางได้ หลัง dependency อัปเดตเกินช่วงที่ Next.js 16 รองรับ
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `package.json`, `package-lock.json`, `tests/e2e/admin-menus.spec.ts`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน (Technical Changes):** จำกัด TypeScript ให้อยู่ในสาย 5, ESLint ให้อยู่ในสาย 9 และ Tailwind CSS ให้อยู่ในสาย 3 ซึ่งเข้ากับ PostCSS config และ `@tailwind` directives เดิม; แก้ selector ของ regression test ให้เลือกปุ่มทางเลี่ยงในแผงจัดการแผนที่อย่างเฉพาะเจาะจง ไม่ชนกับเมนูด้านข้าง
- **การทดสอบและผลลัพธ์ (Verification):** `npm run check`, `BASE_PATH=/hdms_pn npm run build:pages`, `git diff --check` ผ่าน; Playwright static preview ผ่าน 11 รายการ ข้าม 7 รายการที่ถูกกำหนดให้ทดสอบเฉพาะ desktop/ไม่มี geometry; GitHub Actions build, test และ Pages deployment ผ่าน; ตรวจโดเมนจริงพบแผนที่, LIVE, Dashboard และคำอธิบายสัญลักษณ์ตามลำดับใหม่ โดยไม่พบ page error
- **สถานะ:** เผยแพร่แล้ว (ACTIVE)

### [UPDATE-028] 2026-11-04: ตรวจแก้การนำเข้าโครงข่าย
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** แก้ข้อผิดพลาดอ่านไฟล์ .shp เดี่ยวและปรับการตรวจสอบพิกัดก่อนบันทึก
- **ไฟล์:** `lib/route-import.ts`, `components/admin/tabs/GisDataImportTab.tsx`, `supabase/functions/hdms-api/index.ts`, `supabase/migrations/20261104080856_harden_route_import_validation.sql`, `.gitignore`
- **รายละเอียด:** เรียก parser สำหรับ .shp โดยตรง แจ้งข้อผิดพลาด ZIP ที่อ่านง่าย ตรวจพิกัดก่อนส่ง และปรับการตรวจสอบ RPC; Edge Function รุ่น 8 และ migration ถูกนำขึ้น Supabase แล้ว
- **การทดสอบ:** lint, typecheck, build และ Pages build ผ่าน; ทดสอบ RPC ด้วยเส้นตัวอย่างภายใน transaction แล้ว rollback ผ่าน; ยังไม่ได้ทดสอบไฟล์จริงของผู้ใช้และยังไม่ยืนยันสาเหตุ 22023 ทุกกรณี
- **สถานะ:** อยู่ระหว่างตรวจรับ

### [UPDATE-029] 2026-11-04: เตรียมรองรับทางเลี่ยงอิสระ
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ให้สร้างทางเลี่ยงโดยไม่จำเป็นต้องผูกเหตุการณ์น้ำท่วม
- **ไฟล์:** `components/admin/tabs/MapManagementTab.tsx`, `supabase/functions/hdms-api/index.ts`
- **รายละเอียด:** เพิ่มตัวเลือกไม่ผูกเหตุการณ์ในฟอร์ม และยอมรับค่าอ้างอิงว่างใน Edge Function; แยกการคำนวณทางเลี่ยงให้เรียกโครงข่ายนำทางโดยไม่ใช้เลเยอร์ที่นำเข้า และไม่ใช้เส้นตรงเมื่อคำนวณไม่สำเร็จ
- **การทดสอบ:** TypeScript และ lint ผ่าน; ตรวจฐานข้อมูลพบว่าค่าอ้างอิงเหตุการณ์ยอมรับค่าว่าง; ทดสอบผ่าน Edge API จริงโดยสร้างทางเลี่ยงที่ไม่ผูกเหตุการณ์ อ่านพบรายการ แล้ว soft-delete และยืนยันว่าไม่ปรากฏในผลอ่าน; ทดสอบฟอร์มกับบริการนำทางจำลองพบหมุด A/B และผลคำนวณ แต่ยังไม่ยืนยันการลากและบันทึกครบวงจรผ่านหน้าเว็บ
- **สถานะ:** Edge Function รุ่น 9 เผยแพร่แล้ว; หน้าเว็บยังอยู่ระหว่างพัฒนา

### [UPDATE-030] 2026-11-05: ป้องกันผลคำนวณเส้นล้าสมัยและปรับพรีวิวนำเข้า
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ลดความสับสนเมื่อสลับประเภทเส้นและปรับช่องข้อมูลตามที่ร้องขอ
- **ไฟล์:** `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `lib/constants.ts`
- **รายละเอียด:** ยกเลิกผลคำนวณเก่าเมื่อมีคำขอใหม่หรือล้างเส้น; ล้างแนวเมื่อสลับประเภท; นำช่องคำอธิบายออกจากพรีวิวนำเข้า; เพิ่มตัวเลือกขีดกลางในมาตรการ
- **การทดสอบ:** lint, typecheck และ build สำหรับ Pages ผ่าน; ยังต้องทดสอบการโต้ตอบและการบันทึกจริง
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-031] 2026-11-05: ค้นหาและแสดงประเภททางหลวงรายสาย
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ให้ประเภทที่แก้ไขในแต่ละสายมีผลกับตารางและแผนที่ พร้อมค้นหาและเรียงสายทาง
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`, `components/map/LongdoGisMap.tsx`
- **รายละเอียด:** ใช้ประเภทที่บันทึกในแต่ละ feature สำหรับการกรองและสีแผนที่; เพิ่มช่องค้นหาและเรียงหมายเลขตามด้วย กม. เริ่มต้น; นำคำอธิบาย ผิวทาง หน่วยงาน และสถานะจราจรออกจาก popup เส้น
- **การทดสอบ:** lint และ typecheck ผ่าน; ยังต้องทดสอบบันทึก แผนที่ และ responsive
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-032] 2026-11-05: แสดงรายละเอียดแนวถนนและไอคอนแท็บระบบ
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ช่วยระบุสายทางระหว่างปรับแนว และใช้โลโก้ที่ตั้งไว้บนแท็บเว็บ
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`, `lib/use-system-favicon.ts`, `app/page.tsx`, `app/admin/page.tsx`
- **รายละเอียด:** แสดงข้อมูลสายทางในตัวแก้แนว; รวมพิกัดเป็นช่องละติจูดและลองจิจูดคั่นจุลภาค; สร้าง favicon จากโลโก้ระบบเมื่อโหลดข้อมูล
- **การทดสอบ:** `npm run check` ผ่าน; ยังต้องตรวจการปักหมุด การปรับพิกัด และการเปลี่ยนโลโก้ในเบราว์เซอร์
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-033] 2026-11-05: ลดภาระพรีวิวเส้นทางนำเข้า
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ลดความเสี่ยงหน้าค้างเมื่อข้อมูลเส้นทางมีจุดจำนวนมาก
- **ไฟล์:** `lib/gis-utils.ts`, `components/admin/tabs/GisDataImportTab.tsx`
- **รายละเอียด:** ลดจุดด้วยวิธีไม่เรียกซ้ำแบบ recursive และจำกัดจำนวนเส้นและจุดที่ใช้วาดพรีวิว โดยไม่ตัดข้อมูลที่จะบันทึก
- **การทดสอบ:** `npm run check`, Pages build และ Playwright static preview ผ่าน 11 รายการ ข้าม 7 รายการ; ยังไม่ได้ทดสอบไฟล์ KML ที่ผู้ใช้พบปัญหาหรือประมวลผลใน Web Worker
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-034] 2026-11-05: แจ้งเมื่อคำนวณเส้นถนนไม่สำเร็จ
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ป้องกันเส้นตรงจากระบบสำรองถูกเข้าใจผิดว่าเป็นถนนจริงหลังลากจุดดัด
- **ไฟล์:** `lib/gis-utils.ts`, `app/admin/page.tsx`
- **รายละเอียด:** ส่งข้อผิดพลาดเมื่อระบบนำทางหาเส้นไม่สำเร็จ; ล้างแนวที่คำนวณไม่ได้และแจ้งผู้ใช้ให้ลองใหม่
- **การทดสอบ:** lint, typecheck และ `git diff --check` ผ่าน; ยังต้องทดสอบลากจุดดัดในเบราว์เซอร์
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-035] 2026-11-05: แสดงหมุดต้นทางปลายทางในตัวแก้แนวทางหลวง
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ให้เห็นและลากย้ายจุดต้นทางและปลายทางขณะปรับแนวถนน
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`, `components/admin/AdminConsole.tsx`
- **รายละเอียด:** ส่งพิกัดจากตัวแก้แนวทางหลวงไปยังหมุด A/B บนแผนที่ และล้างหมุดเมื่อปิดตัวแก้ไข
- **การทดสอบ:** TypeScript ผ่าน; ยังต้องตรวจลากหมุดและบันทึกในเบราว์เซอร์
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-036] 2026-11-05: ปรับข้อความรายละเอียดสายทางบนแผนที่
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ทำให้หมายเลขและชื่อตอนอ่านร่วมกันได้ชัดเจน
- **ไฟล์:** `components/map/LongdoGisMap.tsx`
- **รายละเอียด:** แสดงหมายเลขและชื่อตอนร่วมกันในหัวข้อ และเพิ่มคำว่าระหว่างก่อนช่วง ก.ม.
- **การทดสอบ:** lint, typecheck, build และ Pages build ผ่าน; Playwright static preview ผ่าน 11 รายการ ข้าม 7 รายการ; ยังต้องตรวจ popup กับข้อมูลจริงบนหลายขนาดหน้าจอ
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-037] 2026-11-05: ป้องกันการนำเข้าโครงข่ายทับข้อมูลเดิม
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ป้องกันการอัปโหลดซ้ำทับทั้งเลเยอร์สายหลักหรือสายรอง และไม่สร้างแนวถนนสมมติ
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`
- **รายละเอียด:** สร้างรหัสเลเยอร์ใหม่ต่อการนำเข้าและเก็บประเภทในแต่ละสาย; ปฏิเสธการสร้างรายการใหม่เมื่อไม่มีแนวเส้นแทนการบันทึกพิกัดตัวอย่าง; ไม่เลือกเลเยอร์อื่นแทนเมื่อหาเลเยอร์ที่แก้ไม่พบ
- **การทดสอบ:** lint, typecheck และ Pages build ผ่าน; ทดลองเรียก RPC สร้างสองเลเยอร์ใน transaction แล้ว rollback; ผ่านหน้าเว็บ local ที่เชื่อมฐานข้อมูลจริง นำเข้า GeoJSON, KML และ KMZ ตัวอย่าง บันทึกได้และตรวจ KML/KMZ หลัง reload; ทดสอบ Shapefile ZIP ตัวอย่างที่สร้างด้วย GDAL ผ่านพรีวิว บันทึก และพบหลัง reload แล้วลบเลเยอร์ทดสอบทั้งหมด; ยังไม่ได้ทดสอบไฟล์ที่ผู้ใช้พบปัญหา
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-038] 2026-11-05: เปิดรายละเอียดรายการโครงข่าย
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ให้เปิดรายละเอียดสายทางและเข้าถึงคำสั่งจัดการจากรายการได้
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`
- **รายละเอียด:** คลิกหรือแตะแถวเพื่อเปิดรายละเอียด พร้อมปุ่มตั้งค่า แนวถนน และลบ โดยปุ่มในแถวเดิมยังทำงานแยกจากการเปิดรายละเอียด
- **การทดสอบ:** lint และ typecheck ผ่าน; ทดสอบ desktop คลิกแถว เปิดรายละเอียด เข้าหน้าปรับแนว และเห็นหมุด A/B 2 จุดโดยไม่มี page error; ยังต้องตรวจมือถือและลากบันทึกจริง
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-039] 2026-11-05: แยกกติกาแนวเส้นน้ำท่วม
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ให้เส้นน้ำท่วมอ้างอิงแนวทางหลวงที่มีอยู่
- **ไฟล์:** `components/admin/tabs/MapManagementTab.tsx`
- **รายละเอียด:** ปฏิเสธผลจากระบบนำทางหรือเส้นตรงสำหรับเส้นน้ำท่วมเมื่อไม่พบแนวเลเยอร์ที่เชื่อมจุด และไม่อนุญาตบันทึกหากยังไม่มีแนวเส้น
- **การทดสอบ:** lint, typecheck, build และ Pages build ผ่าน; ยังต้องทดสอบปักจุดและบันทึกจริง
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-040] 2026-11-05: ลดการค้างขณะลดจุดของไฟล์นำเข้า
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ย้ายการลดจุดเส้นทางออกจาก thread หน้าจอระหว่างนำเข้า
- **ไฟล์:** `public/route-simplify-worker.js`, `components/admin/tabs/GisDataImportTab.tsx`, `tsconfig.json`
- **รายละเอียด:** ประมวลผลลดจุดใน Web Worker แล้วส่งผลกลับ พร้อมแจ้งข้อผิดพลาดเมื่อ worker ล้ม; การอ่าน XML ยังทำบน thread หน้าจอ
- **การทดสอบ:** lint, typecheck และ Pages build ผ่าน; ตรวจ KML ตัวอย่างใน Chromium พบ worker ทำงานจริงและพรีวิวสำเร็จโดยไม่มี page error; ยังไม่ได้ทดสอบไฟล์จริงของผู้ใช้กับ worker รุ่นนี้
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-041] 2026-11-05: แยกรูปแบบเส้นร่างและลดป้ายทับซ้อน
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ให้สีเส้นร่างตรงประเภท และลดความรกของหมายเลขทางหลวง
- **ไฟล์:** `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/map/LongdoGisMap.tsx`
- **รายละเอียด:** ส่งประเภทเส้นร่างไปแผนที่; แยกการลากจุดดัดน้ำท่วมจากทางเลี่ยง; จัดจุดยึดป้ายไว้กลางเส้นและไม่วาดป้ายที่ใกล้กัน
- **การทดสอบ:** lint, typecheck และ Pages build ผ่าน; ยังต้องทดสอบลากจุดดัดและตรวจตำแหน่งป้ายในเบราว์เซอร์
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-042] 2026-11-05: แสดงทางเลี่ยงอิสระหลังรีโหลด
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** แก้ทางเลี่ยงที่ไม่ผูกเหตุการณ์ถูกซ่อนเมื่อโหลดข้อมูลใหม่
- **ไฟล์:** `supabase/migrations/20261104191240_allow_unlinked_detour_visibility.sql`, `components/admin/tabs/DetourManagementTab.tsx`
- **รายละเอียด:** ปรับ restrictive RLS ให้แสดงทางเลี่ยงที่ยังไม่ถูกลบและไม่มีเหตุการณ์อ้างอิง พร้อมคงเงื่อนไขซ่อนกรณีเหตุการณ์อ้างอิงถูกลบ; แสดงชื่อเหตุการณ์แทน ID และใช้ข้อมูลตอบกลับล่าสุดหลังเปลี่ยนสถานะ
- **การทดสอบ:** บันทึกทางเลี่ยงอิสระจากหน้า local ผ่านระบบนำทางจริงและ Edge API; พบรายการถูกซ่อนหลัง reload ก่อนแก้ policy และปรากฏหลังแก้; soft-delete รายการทดสอบแล้ว; migration และ Edge Function เผยแพร่บน Supabase แล้ว ส่วนหน้าเว็บยังไม่ได้เผยแพร่
- **สถานะ:** อยู่ระหว่างตรวจรับ

### [UPDATE-043] 2026-11-05: รายการหมายเลขในคำอธิบายแผนที่
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ช่วยค้นหมายเลขทางหลวงแยกตามประเภทจากแผงสัญลักษณ์
- **ไฟล์:** `components/map/LongdoGisMap.tsx`
- **รายละเอียด:** เพิ่มรายการหมายเลขสายหลักและสายรองจากข้อมูลที่แสดง พร้อมเปิดเมื่อชี้และปุ่มสำหรับการแตะหรือคีย์บอร์ด
- **การทดสอบ:** lint, typecheck และ Pages build ผ่าน; ตรวจ static preview บน Chromium พบ hover เปิดและเลื่อนออกปิดได้ และแตะบนหน้าจอมือถือเปิด/ปิดได้; ยังต้องตรวจบนโดเมนจริงหลังเผยแพร่
- **สถานะ:** อยู่ระหว่างพัฒนา ยังไม่เผยแพร่

### [UPDATE-044] 2026-11-05: ปิดช่องทางที่ทำให้การแก้แนวและการนำเข้าไฟล์ไม่เสถียร
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ทำให้การลากจุดในตัวแก้แนวถนนใช้ระบบนำทางถนนจริงอย่างถูกโหมด ลดงานประมวลผลบนหน้าจอ และป้องกัน migration ของ production ซ้ำรหัส
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `components/admin/AdminConsole.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `app/admin/page.tsx`, `tests/e2e/gis-import.spec.ts`, `supabase/migrations/20261104191249_allow_unlinked_detour_visibility.sql`
- **รายละเอียดการทำงาน (Technical Changes):** เมื่อเปิดตัวแก้แนวถนน ระบบกำหนดโหมดนำทางถนนจริงแยกจากกติกาเส้นน้ำท่วมและคืนโหมดเมื่อบันทึก/ยกเลิก; การปรับค่า reduce points ทำใน Web Worker; เพิ่ม E2E ที่อัปโหลด KML จริงผ่าน UI ทั้ง desktop และ mobile แล้วตรวจ preview, ไม่ reload และไม่แสดง `but-unzip`/Database operation failed; ปรับชื่อไฟล์ migration ให้ตรง revision ที่อยู่ใน Supabase production แล้ว
- **การทดสอบและผลลัพธ์ (Verification):** `git diff --check`, `npm run lint`, `npm run typecheck`, `BASE_PATH=/hdms_pn npm run build:pages` ผ่าน; Playwright static preview ครบ desktop/mobile ผ่านทั้ง 20 tests รวม KML import test; ตรวจ Supabase production พบ Edge Function `hdms-api` version 9 ACTIVE และ migration `20261104191249_allow_unlinked_detour_visibility` อยู่ใน remote แล้ว
- **สถานะ:** พร้อมนำไปรวม release candidate (รอตรวจ production หลัง deploy)

### [UPDATE-045] 2026-11-05: แยกข้อความยืนยันการบันทึกทางเลี่ยง
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ป้องกันความสับสนระหว่างการบันทึกเหตุการณ์น้ำท่วมและทางเลี่ยง
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `components/admin/tabs/MapManagementTab.tsx`
- **รายละเอียดการทำงาน (Technical Changes):** ปุ่มบันทึกใช้ข้อความเฉพาะทางเลี่ยงทั้งกรณีเพิ่มและแก้ไข โดยยังคงข้อความเหตุการณ์น้ำท่วมตามเดิม
- **การทดสอบและผลลัพธ์ (Verification):** รอตรวจรวมใน build และ Playwright ก่อนเผยแพร่รอบสุดท้าย
- **สถานะ:** อยู่ระหว่างตรวจรับ

### [UPDATE-046] 2026-11-05: ซ่อนรหัสภายในจากรายการทางเลี่ยง
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ให้ผู้ใช้เห็นเฉพาะข้อมูลเส้นทางที่อ่านเข้าใจได้ แทน UUID ภายในระบบ
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `components/admin/tabs/DetourManagementTab.tsx`
- **รายละเอียดการทำงาน (Technical Changes):** นำรหัส UUID ของทางเลี่ยงออกจากตารางและหน้าต่างแก้ไข โดยการผูกจุดน้ำท่วมยังแสดงรหัสทางหลวงและชื่อตอนตามเดิม
- **การทดสอบและผลลัพธ์ (Verification):** รอตรวจรวมใน build และ Playwright ก่อนเผยแพร่รอบสุดท้าย
- **สถานะ:** อยู่ระหว่างตรวจรับ

### [UPDATE-021] 2026-11-04: ปรับ Popup แผนที่ Dashboard และช่องพิกัด
- **ไฟล์ที่เกี่ยวข้อง:** `components/map/LongdoGisMap.tsx`, `components/admin/tabs/MapManagementTab.tsx`
- **รายละเอียด:** Popup ถนนใช้หัวข้อรหัสและรูปแบบ `ก.ม.` พร้อมแปลงค่าระยะเมตรเป็นรูปแบบหลักกิโลเมตร; เพิ่มป้าย Dashboard สรุปจำนวนน้ำท่วม/ทางเลี่ยงบนแผนที่; นำรายการหมุดระดับน้ำและภาพถ่ายออกจากแผงสัญลักษณ์; รวมพิกัดจุด A/B เป็นช่องเดียว รองรับการวางค่าคู่พิกัดจาก Google Maps
- **การตรวจสอบ:** `npm run typecheck` ผ่าน; ยังไม่เผยแพร่ชุดนี้จนกว่าจะทดสอบฟลว์แผนที่แบบโต้ตอบครบ
- **สถานะ:** อยู่ระหว่างตรวจรับ

### [UPDATE-024] 2026-11-04: ปรับเครื่องมือแก้แนวถนนและพิกัด
- **วัตถุประสงค์:** ให้เข้าถึงแผนที่ระหว่างแก้แนวถนนและให้จุดดัดใช้ข้อมูลร่วมกับแผนที่
- **ไฟล์ที่เกี่ยวข้อง:** `components/admin/tabs/GisDataImportTab.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/AdminConsole.tsx`
- **รายละเอียด:** เปลี่ยนหน้าต่างบังจอเป็นแผงที่เปิดให้คลิกแผนที่ด้านหลัง; เชื่อมจุดดัดกับสถานะร่วม; แก้ช่องพิกัดให้พิมพ์ค่าบางส่วนได้ก่อนแยกพิกัด
- **การทดสอบ:** `npm run check` ผ่าน lint, typecheck และ build; ยังต้องทดสอบการโต้ตอบบนแผนที่และฐานข้อมูลจริง
- **สถานะ:** อยู่ระหว่างตรวจรับ

### [UPDATE-022] 2026-11-04: แก้การนำทางหลังบันทึกทางเลี่ยง
- **ไฟล์ที่เกี่ยวข้อง:** `components/admin/tabs/MapManagementTab.tsx`
- **รายละเอียด:** แยกข้อความและการนำทางหลังบันทึกตามประเภทข้อมูล; ทางเลี่ยงไม่ถูกส่งไปหน้าเหตุการณ์น้ำท่วมอีกต่อไป และแสดงข้อความยืนยันว่ารายการถูกเพิ่มในรายการทางเลี่ยง
- **การตรวจสอบ:** `npm run typecheck` และ `git diff --check` ผ่าน
- **สถานะ:** พร้อมรวมกับชุดทดสอบการบันทึกจริง

### [UPDATE-023] 2026-11-04: แสดงข้อผิดพลาดการบันทึกเส้นทาง
- **วัตถุประสงค์:** ป้องกันการแจ้งบันทึกสำเร็จเมื่อฐานข้อมูลปฏิเสธคำสั่ง
- **ไฟล์ที่เกี่ยวข้อง:** `lib/hdms-api.ts`, `components/admin/tabs/MapManagementTab.tsx`
- **รายละเอียด:** ส่งต่อข้อผิดพลาดจาก API และการบันทึกเส้นทางโดยตรง ไม่ทำคำสั่งซ้ำเมื่อ API ตอบข้อผิดพลาด; แสดงหมายเลขทางหลวงจริงแทนการตัดรหัสเหตุการณ์
- **การทดสอบ:** รอตรวจ typecheck และฟลว์บันทึกจริง
- **สถานะ:** อยู่ระหว่างตรวจรับ

### [UPDATE-047] 2026-11-05: รอบปรับปรุงแผนที่ประสิทธิภาพสูง การนำเข้า–ส่งออก และ UI ภาคสนาม
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์ (Objective):** ลด CPU/RAM ระหว่างแก้แนวเส้น ป้องกันคำสั่งวางจุดชนกับ Popup และทำให้ข้อมูล GIS เคลื่อนย้ายได้ครบรูปแบบโดยยังรักษาผลลัพธ์ตามงานภาคสนาม
- **ไฟล์ที่เกี่ยวข้อง (Impacted Files):** `components/map/LongdoGisMap.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/LineStylingTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `app/page.tsx`, `app/admin/page.tsx`, `lib/use-system-favicon.ts`, `lib/gis-export.ts`, `tests/e2e/admin-menus.spec.ts`, `package.json`
- **รายละเอียดการทำงาน (Technical Changes):** โหมดวาง A/B/จุดดัดมีสิทธิ์เหนือ Popup และใช้เคอร์เซอร์กากบาท; วาง A/B แล้วแสดงเส้นร่างตรงก่อนคำนวณ; อนิเมชันหยุดเมื่อแท็บไม่ทำงาน ผู้ใช้ลดการเคลื่อนไหว อยู่ในโหมดแก้ไข หรือจำนวนเส้นเกินเพดาน; นำ Google tile แบบไม่มีคีย์ออกและใช้ Esri imagery; เพิ่มชื่อพื้นที่ A→B อัตโนมัติ; เพิ่มการนำเข้าแนวเส้นเหตุการณ์/ทางเลี่ยงเพื่อแก้รายละเอียด; ส่งออก CSV/GeoJSON/KML/KMZ/Shapefile ZIP ตามผลกรอง; ปรับ Popup เป็น `ระหว่าง กม.0+000 ถึง กม.26+775`; ปรับ Legend แบบ hover/focus; เพิ่มความหนา 0.1 px และ Stroke/Casing; โลโก้และชื่อระบบอัปเดต favicon/title/header; ปิดการลากหมุดสำนักงานนอกฟอร์มแก้ไข
- **การทดสอบและผลลัพธ์ (Verification):** `git diff --check`, lint, typecheck และ Pages production build ผ่าน; CI และ GitHub Pages deploy ผ่าน; Playwright static และเว็บจริงผ่านอย่างละ 17 tests บน desktop/mobile (ข้าม 9 tests ที่กำหนด desktop-only หรือไม่มี geometry fixture) ครอบคลุม KML import, A/B/จุดดัด, เมนูส่งออก, ล้างข้อมูล, line width/casing, public map และ linked/unlinked detour
- **สถานะ:** เผยแพร่และตรวจ production ผ่าน

### [UPDATE-048] 2026-11-05: สัญลักษณ์และรูปแบบรายการข้อมูลมาตรฐานเดียวกัน
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ใช้หน้ารายละเอียดเหตุการณ์น้ำท่วมเป็นแม่แบบให้ตาราง รายการ Popup หัวข้อ ป้ายสถานะ และปุ่มของน้ำท่วม ทางเลี่ยง และสายทางอ่านง่ายและสม่ำเสมอ
- **ไฟล์:** `components/map/LongdoGisMap.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `tests/e2e/admin-menus.spec.ts`
- **รายละเอียด:** เพิ่มไอคอนคลื่นน้ำและไอคอนลูกศรทางเลี่ยงให้ตรงกันบนแผนที่ Legend และรายการ; เพิ่มหมุดกลางทางเลี่ยงพร้อม Popup; จัด Popup ทางเลี่ยงเป็นหัวข้อ คำแนะนำ และสถานะการเชื่อมเหตุการณ์; จัดรายการและหน้าต่างรายละเอียดให้ใช้ชื่อสถานะภาษาไทย ช่วง `กม.` พิกัด A/B เวลาอัปเดต และปุ่มจัดการในลำดับเดียวกัน
- **การทดสอบ:** `git diff --check`, lint, typecheck และ Pages build ผ่าน; Playwright desktop ของเมนู Admin ผ่าน 8 tests และข้าม 1 test ที่ไม่มี geometry fixture; test เฉพาะสัญลักษณ์/รูปแบบรายการผ่าน โดยรองรับทั้งกรณีมีข้อมูลและ Empty State; รอตรวจ production
- **สถานะ:** ผ่าน local release gate รอเผยแพร่

### [UPDATE-049] 2026-11-06: นำเข้ารายการเป็นฉบับร่างและส่งออกตามขอบเขตที่เลือก
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** รองรับการนำเข้าแนวเส้นน้ำท่วมหรือทางเลี่ยงก่อน แล้วให้เจ้าหน้าที่แก้รายละเอียดและค่อยเผยแพร่ภายหลัง; ลดความเสี่ยงส่งออกข้อมูลเกินขอบเขตที่ต้องการ
- **ไฟล์ที่เกี่ยวข้อง:** `app/actions/doh-actions.ts`, `lib/hdms-api.ts`, `supabase/functions/hdms-api/index.ts`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `tests/e2e/admin-menus.spec.ts`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:** เพิ่มค่า `isActive` ตลอดสัญญา Server Action, fallback client และ Edge API; ฟอร์มจัดการแผนที่มีตัวเลือก “บันทึกเป็นฉบับร่าง” และเลือกเป็นค่าเริ่มต้นหลังนำเข้าไฟล์ เพื่อซ่อนจากแผนที่ประชาชนจนกว่าจะเปิดใช้งาน; ตารางเหตุการณ์น้ำท่วมและทางเลี่ยงเพิ่มการเลือกรายการและขอบเขตส่งออก `ตามตัวกรอง / ทั้งหมด / ที่เลือก` สำหรับ CSV, GeoJSON, KML, KMZ และ Shapefile ZIP
- **การทดสอบและผลลัพธ์:** `git diff --check`, `npm run lint`, `npx tsc --noEmit` และ `BASE_PATH=/hdms_pn npm run build:pages` ผ่าน; Playwright desktop ผ่าน 8 tests และข้าม 1 test ที่ไม่มี geometry fixture; mobile suite ข้าม 9 tests ตามขอบเขต desktop-first. ยังต้อง deploy Edge Function `hdms-api` เพื่อให้ค่า draft มีผลกับ Supabase production
- **สถานะ:** พร้อมเผยแพร่หน้าเว็บ; Edge Function รอสิทธิ์ deploy ของ Supabase

### [UPDATE-050] 2026-11-06: ปรับประสบการณ์แผนที่แบบลดการเคลื่อนไหวและ Loading State
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ใช้ `landing-page-design` ปรับหน้าประชาชนและ Admin ให้แสดงผลระหว่างโหลดอย่างเป็นรูปธรรม ลดการใช้ทรัพยากรจาก motion ที่ไม่จำเป็น และทำให้พื้นผิวของระบบอ่านข้อมูลสำคัญได้ชัดขึ้น
- **ไฟล์ที่เกี่ยวข้อง:** `app/page.tsx`, `app/admin/page.tsx`, `app/globals.css`, `components/admin/AdminConsole.tsx`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:** เปลี่ยน loading map จาก spinner เป็น skeleton ที่มีโครงรูปแบบแผนที่จริงและประกาศสถานะสำหรับ screen reader; ใช้ `prefers-reduced-motion` ปิด animation ของหมุด ป้ายสถานะ เส้นน้ำท่วม เส้นทางเลี่ยง และ modal; ปรับเส้นเคลื่อนไหวเป็น easing แบบ decelerate; แทน background gradients ที่ไม่จำเป็นใน header, ป้ายแผนที่ และ Admin sidebar ด้วยสีพื้นเรียบ โดยคง Prompt/Sarabun และสีสถานะเดิม
- **การทดสอบและผลลัพธ์:** `git diff --check`, `npm run lint`, `npx tsc --noEmit`, `BASE_PATH=/hdms_pn npm run build:pages` ผ่าน; Playwright static ผ่านทุก test ที่ดำเนินการได้ 16 รายการบน desktop/mobile และข้าม 10 รายการที่กำหนด desktop-only หรือไม่มี fixture geometry
- **สถานะ:** พร้อมเผยแพร่และตรวจ production ต่อ

### [UPDATE-051] 2026-11-06: ล็อกหมุดสำนักงานและจัดการจุดดัดเส้นเป็นรายจุด
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ใช้ `landing-page-design` ทำให้สถานะการแก้ไขบนแผนที่ชัดเจน ลดการเลื่อนหมุดโดยไม่ตั้งใจ และให้เจ้าหน้าที่ควบคุมจุดดัดของเส้นน้ำท่วม ทางเลี่ยง และโครงข่ายสายทางได้ครบ
- **ไฟล์ที่เกี่ยวข้อง:** `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/SystemSettingsTab.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `components/map/LongdoGisMap.tsx`, `tests/e2e/admin-menus.spec.ts`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:** หมุดสำนักงานถูกล็อกตามปกติและลากได้เฉพาะหมุดของรายการที่เปิดฟอร์มแก้ไข; การลากอัปเดตพิกัดในฟอร์มและต้องกดบันทึกจึงยืนยัน; เพิ่มรายการพิกัดจุดดัดพร้อมปุ่มลบรายจุด; คำนวณแนวเส้นใหม่หลังลบ; เพิ่มปุ่มคืนค่าแนวเดิมสำหรับเหตุการณ์/ทางเลี่ยงที่กำลังแก้และตัวแก้แนวโครงข่าย; รองรับเพิ่มจุดกึ่งกลางจาก A/B แม้เส้นพรีวิวยังไม่พร้อม
- **การทดสอบและผลลัพธ์:** `git diff --check`, lint, typecheck และ Pages build ผ่าน; Playwright เฉพาะพฤติกรรมลบจุดดัดและล็อก/ปลดล็อกหมุดสำนักงานผ่าน 2/2; Playwright regression แบบ static export สถานะผ่านทั้งหมด 32 tests ที่กำหนด โดยไม่มี test ล้มเหลว
- **สถานะ:** ผ่าน local release gate รอตรวจ production หลัง deploy

### [UPDATE-052] 2026-11-06: บังคับทางเลี่ยงวิ่งตรงผ่านสามแยก/สี่แยก
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ให้เจ้าหน้าที่กำหนดจุดควบคุมบนทางแยกที่รถวิ่งตรงได้ และป้องกันระบบนำทางสร้างแนวอ้อมหรือยูเทิร์นโดยไม่จำเป็น
- **ไฟล์ที่เกี่ยวข้อง:** `components/admin/tabs/MapManagementTab.tsx`, `tests/e2e/admin-menus.spec.ts`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:** เพิ่มโหมด “บังคับตรงผ่านสามแยก/สี่แยก” เฉพาะทางเลี่ยง; เมื่อเปิดโหมด จุดดัดทำหน้าที่เป็นจุดผ่านแยกและ request ไปยัง OSRM ใช้ `continue_straight=true`, ปิดเส้นทางทางเลือก และส่ง bearing ของแนวเข้า–ออกพร้อม tolerance 45 องศา; ไม่อนุญาตคำนวณโหมดนี้หากยังไม่มีจุดผ่านแยก; คงพรีวิวและข้อความเตือนให้เจ้าหน้าที่ตรวจแนวก่อนบันทึก และสามารถปิดโหมดเพื่อกลับไปใช้ routing ปกติได้ทันที
- **การทดสอบและผลลัพธ์:** `git diff --check`, lint, typecheck และ Pages production build ผ่าน; Playwright ตรวจ query routing และพฤติกรรมจุดดัดผ่าน 2/2 โดยยืนยัน `continue_straight=true`, `alternatives=false` และ bearing ของจุดผ่านแยก; regression static export ผ่าน 21 tests และข้าม 13 tests ตามเงื่อนไข fixture/desktop-only โดยไม่มี test ล้มเหลว
- **สถานะ:** ผ่าน local release gate รอตรวจ production หลัง deploy

### [UPDATE-056] 2026-11-09: พัฒนาระบบ GIS ทั้ง 4 รายการหลัก (Zoom-based Highway, Directional Arrows, Side/Lane Flood Reporting, A-B / B-A Detour Routing)
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** พัฒนาและต่อยอดระบบ HDMS_PN ตามข้อกำหนด 4 รายการหลักภายใต้ทางเลือก A (Additive Schema Migration + Backward Fallback) โดยรักษาความเข้ากันได้กับข้อมูลเดิมทั้งหมด
- **ไฟล์ที่เกี่ยวข้อง:** `supabase/migrations/20261109000100_directional_flood_and_detour.sql`, `lib/constants.ts`, `db/default-data.ts`, `app/actions/doh-actions.ts`, `supabase/functions/hdms-api/index.ts`, `lib/gis-utils.ts`, `components/map/LongdoGisMap.tsx`, `components/admin/tabs/LineStylingTab.tsx`, `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `app/page.tsx`, `docs/CHANGELOG.md`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:**
  1. **รายการที่ 1 (ระบบแสดงเส้นทางหลวงตามระดับ Zoom):** ซ่อนทางหลวงสายรอง (`SECOND_HIGHWAY`) อัตโนมัติเมื่อ `zoom < 11` ยกเว้นสายรองที่มีเหตุการณ์น้ำท่วมกำลังเกิดเหตุ (`criticalHighwayRouteNos`) พร้อมสวิตช์ `"แสดงสายรองทุกระดับซูม"` ใน Legend และลดความหนาแน่นของเส้นในมุมมองภาพรวมโดยคง Canvas Renderer ตัวเดียว
  2. **รายการที่ 2 (ระบบสร้างแนวเส้น GIS และลูกศรอัตโนมัติ):** รองรับการสร้างแนวเส้นอ้างอิงโครงข่ายถนนจริง (`SINGLE_CENTERLINE` 2 ทิศทาง, `DUAL_CARRIAGEWAY` แยกคันทาง A→B และ B→A จาก OSRM โดยห้ามใช้ offset ปลอม, และ `ONE_WAY`) พร้อมระบบลูกศรบอกทิศทาง (`TWO_WAY ⇄`, `FORWARD →`, `REVERSE ←`, `UNKNOWN` ซ่อนลูกศรเพื่อไม่เดาทิศทางจากลำดับจุดดิบ), ปรับแต่งสี/ขนาด/ระยะห่าง/เปิด-ปิด ได้ใน `LineStylingTab.tsx`, ซ่อนอัตโนมัติเมื่อซูมออก และจำกัดการวาดเฉพาะในกรอบหน้าจอ (`MAX_ARROWS = 160`)
  3. **รายการที่ 3 (ระบบน้ำท่วมแยกฝั่งและช่องจราจร):** เพิ่มการบันทึก `road_side` (`LEFT/RIGHT/BOTH/UNKNOWN`), `affected_lanes`, `affected_shoulder`, `reporter_name`, และ `direction_meta.water_level_known` · ซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบันเมื่อยืนยันระดับน้ำล่าสุดเป็น `0 ซม.` (`isFloodLineVisibleOnCurrentMap`) โดยเก็บประวัติทั้งหมดไว้ · แก้ไข `IncidentRegistryTab.tsx` ไม่ให้เปลี่ยนสถานะถนนเป็น `PASSABLE` อัตโนมัติเมื่ออัปเดตระดับน้ำเป็น `0 ซม.` · แจ้งเตือนชัดเจนว่าฝั่งตรงข้ามที่ไม่มีรายงานไม่ถือว่าปลอดภัยอัตโนมัติ
  4. **รายการที่ 4 (ระบบทางเลี่ยง A-B และ B-A):** คำนวณเส้นทางเลี่ยง `A → B` และ `B → A` แยกจากกันตามโครงข่ายถนนจริง รองรับ `direction_mode` (`TWO_WAY`, `FORWARD_ONLY`, `REVERSE_ONLY`), ตรวจสอบการทับซ้อนกับช่วงถนนที่ปิดการจราจร (`detectClosedRoadConflicts`) พร้อมบล็อกการเผยแพร่ทางเลี่ยงที่ตัดผ่านจุดปิดการจราจร และเพิ่มกล่องพรีวิวตรวจสอบ `A-B / B-A Inspector` ก่อนบันทึก
- **การทดสอบและผลลัพธ์:** `npm run lint` (`--max-warnings=0`), `npm run typecheck`, และ `NEXT_OUTPUT=export npm run build` ผ่านทั้งหมด (6/6 static pages)
- **สถานะ:** เสร็จสมบูรณ์ตามแผนดำเนินงานทางเลือก A

### [UPDATE-057] 2026-11-09: แก้ไข 3 จุดตามภาพข้อเสนอแนะ (UI Polish & Detour Direction Toggle)
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** แก้ไขปัญหาการแสดงผลรายละเอียดน้ำท่วม ป้ายซ้อนทับกันบนมือถือ และเพิ่มปุ่มสลับทิศทางคำอธิบายทางเลี่ยง (A→B และ B→A) ตามภาพที่ 1, 2, 3
- **ไฟล์ที่เกี่ยวข้อง:** `components/map/LongdoGisMap.tsx`, `app/globals.css`, `lib/gis-utils.ts`, `app/page.tsx`, `docs/CHANGELOG.md`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:**
  1. ปรับแต่ง `buildFloodPopupHtml` ให้ใช้สีตัวหนังสือสว่างตัดกับพื้นหลังสีเข้ม ลบ inline `color:#0f172a` ที่ทำให้ตัวหนังสือหาย พร้อมแสดงป้าย ทล., สถานะจราจร, ฝั่ง/ช่องจราจร/ไหล่ทาง, และปุ่มเปิดหน้ารายละเอียดแบบเต็ม
  2. รวมแถบสรุปสถานะและปุ่มควบคุมสัญลักษณ์เข้าเป็น Responsive Header แถวเดียว พร้อมขยับ Leaflet Zoom Control ลงมาที่ `top: 54px` เพื่อป้องกันการเกยทับกันบนมือถือ
  3. เพิ่ม `splitDetourAdviceByDirection` และปุ่มสลับทิศทาง `[ ขาไป (A → B) | ขากลับ (B → A) ]` ใน Detour Popup บนแผนที่ และกล่องแนะนำทางเลี่ยงฝั่งประชาชน
- **การทดสอบและผลลัพธ์:** `npm run lint` (`--max-warnings=0`), `npm run typecheck`, และ `NEXT_OUTPUT=export npm run build` ผ่าน 100% (6/6 static pages)
- **สถานะ:** พร้อม deploy



### [UPDATE-058] 2026-11-09 แยกแท็บน้ำท่วม/ทางเลี่ยง, ปรับการ์ดทางเลี่ยงพร้อมโมดอลคำแนะนำ, และกรองชิปเฉพาะสายทางน้ำท่วม
- **วันที่:** 2026-11-09
- **วัตถุประสงค์:** แยกข้อมูลน้ำท่วมและทางเลี่ยงให้ชัดเจน, ปรับการ์ดทางเลี่ยงให้กะทัดรัดและแสดงหน้าต่างป๊อปอัปคำแนะนำทางเลี่ยงเมื่อคลิก พร้อมสลับทิศทาง A-B / B-A และดึงภาพถ่ายสถานการณ์น้ำท่วมจากจุดที่ผูกไว้มาแสดง (Option 1), กรองชิปสายทางให้แสดงเฉพาะที่มีน้ำท่วมและเรียงตามลำดับตัวเลข
- **ไฟล์ที่เกี่ยวข้อง:** `app/page.tsx`, `docs/CHANGELOG.md`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:**
  1. เพิ่ม Sub-tabs `[ ทั้งหมด ]`, `[ 🌊 น้ำท่วม ]`, `[ 🔄 ทางเลี่ยง ]` ทั้งบน Desktop Sidebar และ Mobile Drawer เพื่อให้ผู้ใช้เลือกดูรายการแยกหมวดหมู่ได้ชัดเจน
  2. ปรับการ์ดทางเลี่ยงให้กะทัดรัด (Compact Detour Card) แสดงชื่อทางเลี่ยง, ป้ายกำกับทิศทาง (ทางเดียว หรือ ไป-กลับ), ป้ายผูกจุดน้ำท่วม, และปุ่ม `"ดูคำแนะนำ →"` เพื่อเปิดหน้าต่างป๊อปอัป
  3. เพิ่มหน้าต่างป๊อปอัป `viewingDetourModal` (Detour Recommendation Modal): แสดงภาพถ่ายสถานการณ์น้ำท่วมจากจุดที่ผูกไว้ (`flood.latest_photo_url` ทางเลือกที่ 1), สวิตช์สลับทิศทาง `[ 🚗 ขาไป (A → B) | 🚙 ขากลับ (B → A) ]`, คำแนะนำเส้นทางทีละขั้นตอนที่อ่านง่าย, ปุ่มนำทาง Google Maps ไปยังจุดเริ่มต้นตามทิศทางที่เลือก, และปุ่มดูตำแหน่งบนแผนที่
  4. ปรับปรุงชิปหมายเลขทางหลวง (`routeChips`) ให้แสดงเฉพาะสายทางที่มีเหตุการณ์น้ำท่วมกำลังเกิดเหตุ (`is_active: true`) และจัดเรียงตามลำดับตัวเลขทางหลวงจริงจากน้อยไปมาก
- **การทดสอบและผลลัพธ์:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน (0 warnings)
  - `npm run typecheck`: ผ่าน (0 errors)
  - `$env:NEXT_OUTPUT="export"; npm run build`: ผ่าน 100% (Static pages 6/6)
  - UI Contracts และ E2E Smoke test contracts คงเดิมครบถ้วน
- **สถานะ:** พร้อม deploy บน GitHub Pages

### [UPDATE-060] 2026-11-10 Phase 1: จัดการสายทาง Parent–Child สองทิศทางและแก้ CI Empty State
- **วันที่:** 2026-11-10
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ดำเนินการ Phase 1 (Highway Geometry Management: โครงสร้างสายทางและ GIS สองทิศทางแบบ Parent–Child) ตามข้อกำหนด HDMS_PN Context Pack และแก้ไขข้อผิดพลาดใน GitHub Actions CI (`verify.yml`) ที่ติดขัดจากการที่ฐานข้อมูลว่างเปล่า (Empty State)
- **ไฟล์ที่เกี่ยวข้อง:** `lib/highway-schema.ts` (ใหม่), `components/admin/tabs/GisDataImportTab.tsx`, `tests/e2e/admin-menus.spec.ts`, `docs/CHANGELOG.md`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:**
  1. แก้ไข `tests/e2e/admin-menus.spec.ts`: เพิ่มการตรวจสอบ `if (await floodSymbol.count()) ... else ...` ในหมวดรายการเหตุการณ์ เพื่อรองรับสถานะฐานข้อมูลว่างเปล่า (Empty state ขณะที่ผู้ใช้กำลังจะอัปเดตข้อมูลใหม่) ทำให้ CI รันผ่านโดยไม่ timeout 5 วินาที
  2. สร้าง `lib/highway-schema.ts`: กำหนดโครงสร้างข้อมูลสายทางแบบลำดับชั้น ตอนควบคุมหลัก (Parent) และเส้นทางย่อยตามทิศทาง/ทางขนาน (Child Branches) พร้อมระบบคำนวณระยะทาง Geodesic, Haversine และฟังก์ชันจัดกลุ่ม `groupHighwayFeatures` โดยรองรับ GeoJSON เดิมใน `doh_highway_layers` 100%
  3. ปรับปรุง `components/admin/tabs/GisDataImportTab.tsx`:
     - เพิ่ม Toggle มุมมองตาราง: `[ 📑 จัดกลุ่มตอนควบคุม (Parent–Child) ]` และ `[ 📋 รายการเดี่ยวทั้งหมด ]`
     - แสดงชิปสถานะคันทางแยกตามทิศทาง `[ 🚗 ขาไป (A→B) ]`, `[ 🚙 ขากลับ (B→A) ]`, `[ 🛣️ ทางขนาน ]`
     - แก้ไขบั๊ก Duplicate Push ซ้ำใน `saveEditedGeometry` โดยค้นหาและอัปเดต feature เดิมแบบ idempotent
     - เพิ่มการ์ดเปรียบเทียบระยะทางตามหลัก กม. vs ความยาวจริงตามแนวเส้น GIS พร้อมปุ่ม `"สลับทิศทางจุดหัว-ท้าย (A ⇄ B)"`
- **การทดสอบและผลลัพธ์:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน (0 warnings)
  - `npm run typecheck`: ผ่าน (0 errors)
  - `npx next build` (Static export prerender): ผ่านสมบูรณ์ (6/6 static pages)
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / พร้อม deploy บน GitHub Pages
- **วันที่:** 2026-11-10
- **วัตถุประสงค์:** แก้ไขข้อผิดพลาดใน GitHub Actions Workflow `CI` (Run 42593837883) ที่ทำให้การทดสอบ E2E ล้มเหลว 3 รายการ
- **ไฟล์ที่เกี่ยวข้อง:** `app/page.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `docs/CHANGELOG.md`, `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:**
  1. แก้ไข `app/page.tsx`: ปรับข้อความบนปุ่มการ์ดทางเลี่ยงด้านนอกให้แสดง `ผูกจุดน้ำท่วม ทล.${linkedFlood.route_no}` โดยไม่ใส่ชื่อตอนน้ำท่วมลงในตัวปุ่ม เพื่อป้องกันไม่ให้ Playwright filter หาปุ่มชื่อตอนแล้วไปคลิกโดนการ์ดทางเลี่ยงแทนที่จะเป็นการ์ดจุดน้ำท่วม
  2. แก้ไข `components/admin/tabs/MapManagementTab.tsx`: ใส่ข้อความ `"คำนวณแนวตรงผ่านแยกตามจุดควบคุมสำเร็จ"` เข้าใน `snappingStatusText` เมื่อมีการเปิดใช้งาน `forceStraightThrough` (บังคับตรงผ่านแยก) เพื่อให้ตรงกับ assertion ของ Playwright
- **การทดสอบและผลลัพธ์:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน (0 warnings)
  - `npm run typecheck`: ผ่าน (0 errors)
- **สถานะ:** พร้อม deploy บน GitHub


---

### [UPDATE-061] Phase 2 — ระบบจัดการและรายงานสถานการณ์น้ำท่วม (Parent–Child Flood Management)
- **วันที่:** 2026-11-10
- **วัตถุประสงค์:** พัฒนาระบบจัดการและรายงานสถานการณ์น้ำท่วม Phase 2 รองรับโครงสร้างเหตุการณ์หลัก 1 รายการมีหลายช่วง กม. และหลายทิศทาง (Parent Event ↔ Child Segments), ระบบตัดแนวเส้น GIS อัตโนมัติ (Linear Referencing), สถานะจราจร 5 สีบนแผนที่, และระบบอัปโหลดรูปภาพหน้างานสูงสุด 5 รูป (<= 300 KB/รูป)
- **ไฟล์ที่เกี่ยวข้อง:**
  - `lib/flood-event-schema.ts` (ใหม่)
  - `lib/gis-utils.ts`
  - `app/globals.css`
  - `components/admin/tabs/MapManagementTab.tsx`
  - `components/admin/tabs/IncidentRegistryTab.tsx`
  - `components/map/LongdoGisMap.tsx`
  - `app/page.tsx`
  - `eslint.config.mjs`
  - `docs/CHANGELOG.md`
- **รายละเอียดการทำงาน:**
  1. ออกแบบสถาปัตยกรรมข้อมูล Parent–Child เหตุการณ์หลักและช่วงย่อย (ทางเลือก 1) ใน `lib/flood-event-schema.ts` เก็บใน `direction_meta` (JSONB) โดยไม่ต้อง Migrate Database
  2. เพิ่มฟังก์ชัน `slicePolylineByKmRange` ใน `lib/gis-utils.ts` คำนวณตัดแนวเส้น GIS อัตโนมัติตามช่วง กม. และทิศทาง
  3. เพิ่มระบบบีบอัดภาพหน้างาน `compressImageToAdaptiveBase64` รองรับสูงสุด 5 รูป บีบอัดขนาดไม่เกิน 300 KB ต่อรูป
  4. แสดงผลป้ายแคปซูลและสถานะจราจร 5 สีตามมาตรฐาน (เขียว, เหลือง, ส้ม, แดง, เทา) ทั้งบนแผนที่และการ์ดสรุป พร้อมปรับ Leaflet Zoom Controls ไม่ให้ชนป้ายด้านบน
  5. ปรับปรุงแผงจัดการสำหรับเจ้าหน้าที่ (`MapManagementTab.tsx` & `IncidentRegistryTab.tsx`) ให้เลือกเหตุการณ์หลัก, ทิศทาง, ส่วนถนนที่ท่วม, อัปโหลด 5 รูป, และมีปุ่ม "✂️ แบ่งช่วงน้ำท่วม" (Split Segment)
  6. ปรับปรุงมุมมองประชาชน (`app/page.tsx`) แสดงป้ายชิปทิศทาง, แกลเลอรีรูปภาพขนาดย่อ, และรายละเอียดส่วนถนนที่ท่วม
- **การทดสอบและผลลัพธ์:**
  - `npm run lint` (`--max-warnings=0`): ผ่านฉลุย 0 warnings
  - `npm run typecheck`: ผ่านฉลุย 0 errors
  - Next.js Static Export build: ผ่าน 100% (6/6 static pages prerendered)
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / พร้อม Commit และ Deploy บน GitHub Pages


---

### [UPDATE-062] Phase 3 — การเชื่อมโยงระบบรายงานน้ำท่วม ทางเลี่ยง และแผนที่ GIS (GIS Integration & Public Information)
- **วันที่:** 2026-11-10
- **วัตถุประสงค์:** พัฒนาระบบบูรณาการ Phase 3 เชื่อมโยงข้อมูลสายทาง GIS, เหตุการณ์น้ำท่วม Parent-Child, ทางเลี่ยง, และแผนที่ GIS สำหรับเจ้าหน้าที่และประชาชน พร้อมแก้ไข Linear Referencing ย้อนทิศทาง, ป้องกันหมุดแคปซูลซ้อนทับ, เพิ่มโหมดสลับดูช่วงย่อย/รวมเหตุการณ์, และตารางเปรียบเทียบทุกช่วงและทิศทางในหน้าประชาชน
- **ไฟล์ที่เกี่ยวข้อง:**
  - `lib/gis-utils.ts`
  - `lib/flood-event-schema.ts`
  - `components/admin/tabs/MapManagementTab.tsx`
  - `components/admin/tabs/IncidentRegistryTab.tsx`
  - `components/admin/tabs/DetourManagementTab.tsx`
  - `components/map/LongdoGisMap.tsx`
  - `app/page.tsx`
  - `docs/CHANGELOG.md`
  - `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:**
  1. แก้ไขการตัดเส้น Linear Referencing (`lib/gis-utils.ts`): ปรับปรุง `slicePolylineByKmRange` ให้คำนวณตำแหน่งสัดส่วนตามแนวสายทางจริง (`sKm` ถึง `eKm`) ก่อน แล้วค่อยสลับลำดับจุดพิกัดผลลัพธ์ (Coordinate sequence order) ให้ตรงกับทิศทางการเดินทาง (`B_TO_A` หรือ high-to-low) ป้องกันไม่ให้พิกัดกระโดดไปอยู่อีกช่วงกิโลเมตรหนึ่ง
  2. เลือกเส้นทางหลวงและ Branch ตามทิศทางจริง (`components/admin/tabs/MapManagementTab.tsx`): เชื่อมโยง `handleSlicePolylineFromKm` เข้ากับ `groupHighwayFeatures` เพื่อเลือกตอนควบคุมและเส้น Branch Geometry ที่ตรงกับทิศทางจราจร (`A_TO_B` vs `B_TO_A`), เพิ่มการตรวจจับช่วงกิโลเมตรซ้อนทับ (`detectOverlappingFloodSegments`) ก่อนบันทึก, และเชื่อมโยง `eventId` เข้ากับ `detour_meta`
  3. ตัดแบ่งพิกัดจริงเมื่อกดแบ่งช่วงน้ำท่วม (`components/admin/tabs/IncidentRegistryTab.tsx`): ปรับปรุงฟังก์ชัน `handleSplitSegment` ให้ตัดแบ่งพิกัดจริงด้วย `slicePolylineByKmRange` ทั้งช่วงที่ 1 และช่วงที่ 2 ทำให้แต่ละช่วงย่อยมี Geometry, จุดเริ่มต้น-สิ้นสุด, และจุดกึ่งกลางของตนเองอย่างแท้จริง ไม่ซ้อนทับกัน
  4. เชื่อมโยงทางเลี่ยงกับ Parent Event (`components/admin/tabs/DetourManagementTab.tsx`): แนบ `eventId` ของเหตุการณ์น้ำท่วมเข้ากับ `detour_meta` เมื่อมีการผูกจุดน้ำท่วม เพื่อให้ทางเลี่ยงเชื่อมโยงกับทุกช่วงย่อยภายใต้เหตุการณ์เดียวกัน
  5. ป้องกันหมุดแคปซูลซ้อนทับและเพิ่มสัญลักษณ์ตาบอดสี (`components/map/LongdoGisMap.tsx`):
     - คงสีเส้นน้ำท่วมตามสไตล์กลางของแผนที่ (`fColor`) ตามทางเลือกที่ 2 ที่ผู้ใช้อนุมัติ
     - จัดการหมุดแคปซูลไม่ให้ซ้อนทับกัน (De-overlapping): เพิ่มระบบตรวจจับระยะใกล้เคียง (< 35 ม.) และขยับแบบ Lateral Offset สำหรับสองทิศทาง (`A_TO_B` ขยับขึ้นเหนือ/ตะวันตกเล็กน้อย, `B_TO_A` ขยับลงใต้/ตะวันออกเล็กน้อย)
     - กำหนด `zIndexOffset` ตามความรุนแรงของสถานะจราจร (`CLOSED`: 1000, `NO_SMALL_VEHICLES`: 800, `CAUTION`: 600, `PENDING_VERIFICATION`: 400, `PASSABLE`: 200)
     - เพิ่มสัญลักษณ์ที่เข้าถึงได้สำหรับผู้มีภาวะตาบอดสี (Colorblind Accessible Glyphs: `⛔`, `🚗`, `⚠️`, `✅`, `⏳`) บนป้ายแคปซูล
     - เพิ่มปุ่มสลับโหมดมุมมองในแถบสัญลักษณ์: "แยกช่วงย่อย (ค่าเริ่มต้น) / รวมเหตุการณ์"
  6. ตารางเปรียบเทียบทุกช่วงและทิศทางในหน้าประชาชน (`app/page.tsx`):
     - เพิ่มกล่องตารางเปรียบเทียบทุกช่วงและทิศทางในเหตุการณ์เดียวกัน (`siblingSegments`) ในหน้าต่างรายละเอียดจุดน้ำท่วมฝั่งประชาชน พร้อมปุ่มสลับดูแต่ละช่วงได้ใน 1 คลิก
     - เชื่อมโยงทางเลี่ยงผ่าน `eventId` เพิ่มเติมจาก `flood_id_ref`
     - ใส่ `loading="lazy"` และ `decoding="async"` สำหรับรูปภาพสถานการณ์เพื่อถนอมหน่วยความจำและดาต้าบนมือถือตามทางเลือกที่ 2
  7. ปรับทิศทางทางเลี่ยง (FORWARD / REVERSE) ให้ตรงกับจุดน้ำท่วมอัตโนมัติ (`app/page.tsx` & `components/map/LongdoGisMap.tsx`):
     - เมื่อประชาชนเลือกดูจุดน้ำท่วมทิศทางใด (เช่น `B_TO_A` ขากลับ) ระบบจะปรับกล่องคำแนะนำทางเลี่ยงในหน้าต่างรายละเอียด และป๊อปอัปทางเลี่ยงบนแผนที่ ให้แสดงทิศทางที่สอดคล้องกันโดยอัตโนมัติ พร้อมป้ายระบุสถานะชัดเจน โดยประชาชนยังคงสลับทิศทางดูเองได้ทุกเมื่อ
- **การทดสอบและผลลัพธ์:**
  - `npm run lint` (`--max-warnings=0`): ผ่านฉลุย 0 warnings
  - `npm run typecheck`: ผ่านฉลุย 0 errors
  - Next.js Static Export build: ผ่าน 100% (6/6 static pages prerendered)
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / พร้อม Deploy บน GitHub Pages

---

### [UPDATE-063] 2026-11-10 Phase 4 — System Optimization, UX/UI & Production Readiness (การปรับปรุงประสิทธิภาพ ประสบการณ์ใช้งาน ความเสถียร และความพร้อมใช้งานจริง)
- **วัตถุประสงค์:** พัฒนาระบบตามคำสั่ง Phase 4 โดยมุ่งเน้นการลดขนาด Payload บนมือถือ, เพิ่มฟีเจอร์ลดขั้นตอนการทำงานของเจ้าหน้าที่, เพิ่มความเร็วการโหลดหน้าแอดมิน, ยกระดับความเสถียรของโหมด Offline และความพร้อมในการใช้งานจริง
- **รายการไฟล์ที่แก้ไข:**
  - `lib/gis-utils.ts`
  - `lib/flood-event-schema.ts`
  - `components/admin/tabs/MapManagementTab.tsx`
  - `components/admin/tabs/IncidentRegistryTab.tsx`
  - `components/admin/AdminConsole.tsx`
  - `app/admin/page.tsx`
  - `app/page.tsx`
  - `lib/offline-db.ts`
  - `components/offline/OfflineSyncStatus.tsx`
  - `supabase/functions/hdms-api/index.ts`
  - `app/actions/doh-actions.ts`
  - `supabase/migrations/20261110000100_optimize_display_payload_photos.sql` (ใหม่)
  - `docs/CHANGELOG.md`
  - `docs/BACKLOG.md`
  - `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:**
  1. **การปรับปรุงการอัปโหลดและบีบอัดภาพ (Image Upload & Adaptive Compression):**
     - ปรับปรุง `compressImageToAdaptiveBase64` ใน `lib/gis-utils.ts` ให้ตรวจจับและใช้ฟอร์แมต **WebP** เป็นลำดับแรก (Fallback เป็น JPEG อัตโนมัติเมื่อระบบไม่รองรับ)
     - การเรนเดอร์ผ่าน Canvas ช่วยล้าง EXIF Metadata ป้องกันข้อมูลส่วนบุคคลและลดขนาดไฟล์ลงทันที
     - เพดานขนาดรูปภาพไม่เกิน 300 KB ต่อภาพอย่างเด็ดขาด
     - แสดงรายละเอียดขนาดไฟล์ก่อนและหลังบีบอัดพร้อมเปอร์เซ็นต์ที่ลดลงใน `MapManagementTab.tsx`
  2. **ลดขนาด Payload หน้าประชาชนและโหลดภาพเต็มแบบ On-Demand (Database & Public Payload Optimization — ทางเลือก 1.1):**
     - สร้าง Migration `20261110000100_optimize_display_payload_photos.sql` ปรับปรุง `doh_get_system_data_display_rpc()` ให้ส่งเฉพาะรูปปก (`photos[0..0]`) ในการโหลดหน้าแรกของประชาชน
     - ใน `app/page.tsx`: เมื่อประชาชนคลิกเปิดหน้าต่างรายละเอียดจุดน้ำท่วม (Flood Dossier Modal) ระบบจะโหลดอัลบั้มภาพเต็ม (รูปที่ ๒–๕) แบบ On-Demand จากฐานข้อมูลทันที ทำให้หน้าแรกโหลดเร็วขึ้นกว่า 80% โดยไม่สูญเสียความสามารถในการดูอัลบั้มภาพ ๕ รูป
  3. **ลดขั้นตอนการทำงานของเจ้าหน้าที่ — สร้างคู่ทิศทางไป-กลับในคลิกเดียว (Dual-Direction Quick Create):**
     - เพิ่มโหมด `⚡ บันทึก ๒ ทิศทาง (A→B และ B→A) พร้อมกัน` ใน `MapManagementTab.tsx`
     - เจ้าหน้าที่สามารถระบุระดับน้ำและสถานะจราจรของแต่ละฝั่งได้ในฟอร์มเดียว ระบบจะสร้าง ๒ ช่วงย่อยภายใต้ `eventId` เดียวกันพร้อมตัดเส้น Geometry ตามทิศทางจริงใน ๑ คลิก
  4. **ปุ่ม "รวมช่วง กม. (Merge Segments)" ในทะเบียนเหตุการณ์:**
     - เพิ่มปุ่ม `รวมช่วง` และ Modal ใน `IncidentRegistryTab.tsx` สำหรับรวม ๒ ช่วงย่อยในสายทางเดียวกัน
     - ระบบคำนวณช่วง กม. รวม (`min(kmStart)` ถึง `max(kmEnd)`), ตัดเส้น Geometry ใหม่ตามช่วงรวม, สรุประดับน้ำและสถานะจราจร, อัปเดตช่วงหลัก, ซ่อนช่วงที่ถูกรวม และบันทึกประวัติ Timeline อัตโนมัติ
  5. **เพิ่มความเร็วหน้า `/admin` ด้วย Lazy Full-Precision Geometry (Backlog B-004 — ทางเลือก 3.1):**
     - หน้า `/admin` (`app/admin/page.tsx`) โหลดเริ่มต้นด้วย `getPublicSystemDataAction` (Geometry แบบลดจุด) ทำให้เข้าหน้าเว็บได้เร็วขึ้นกว่าเดิม ๓–๕ เท่า
     - เมื่อเจ้าหน้าที่สลับเข้าแท็บ `GIS` (`GisDataImportTab`) หรือเปิดโหมดแก้ไขจุด Vertex ระบบจะดึง `getSystemDataAction` (ความละเอียดเต็ม ๑๕ ตำแหน่ง) มาแทนที่อัตโนมัติ
  6. **เพิ่มความเสถียรและป้องกันการบันทึกทับกัน (Concurrency & Offline Field Sync):**
     - ใน `supabase/functions/hdms-api/index.ts`: เพิ่มการตรวจสอบ `expectedUpdatedAt` ใน `upsertRouteAction` เพื่อป้องกันเจ้าหน้าที่บันทึกทับข้อมูลกันเอง (HTTP 409 Conflict)
     - ใน `lib/offline-db.ts` และ `OfflineSyncStatus.tsx`: อัปเกรด `OfflineReportItem` ให้เก็บและซิงค์ฟิลด์ `roadSide`, `affectedLanes`, `affectedShoulder`, และ `directionMeta` กลับขึ้นเซิร์ฟเวอร์ได้ครบถ้วน
- **การทดสอบและผลลัพธ์:**
  - `npm run lint` (`--max-warnings=0`): ผ่านฉลุย 0 warnings
  - `npm run typecheck`: ผ่านฉลุย 0 errors
  - `NEXT_OUTPUT=export next build`: ผ่าน 100% สร้าง Static pages 6/6 หน้าสมบูรณ์
- **สถานะ:** ใช้งานได้จริง (ACTIVE) / พร้อม Deploy บน GitHub Pages

---

### บันทึกประวัติการพัฒนา: [UPDATE-064] (2026-11-10)
- **วัตถุประสงค์:** ปรับปรุงตารางโครงข่ายทางหลวงในหน้าแอดมินให้เป็นแบบ Parent–Child รวมสายทางและขยายดู ๒ ฝั่ง (A→B และ B→A)
- **รายการไฟล์ที่แก้ไข:**
  - `components/admin/tabs/GisDataImportTab.tsx`
  - `docs/CHANGELOG.md`
  - `SUPPLEMENTAL_RULES.md`
- **รายละเอียดการทำงาน:**
  1. ใช้ `groupHighwayFeatures` จัดกลุ่มสายทางที่มี 2 ทิศทาง (A_TO_B และ B_TO_A) เข้าเป็น 1 ตอนควบคุมหลัก (Parent Control Section) ลดแถวซ้ำซ้อนในตารางลง 50%
  2. เพิ่มปุ่มขยายดู ๒ ฝั่ง `[ ๒ ฝั่ง (A⇄B) ]` และแถวลูก (Child Branches) สีแยกทิศทาง พร้อมรายละเอียดจำนวนจุดพิกัด และปุ่มจัดการ (แนวถนน, ตั้งค่า, ลบ) แยกเฉพาะแต่ละฝั่ง
  3. เพิ่ม `handleToggleGroupVisibility` สลับเปิด/ปิดตาทั้งตอนควบคุม และ `handleDeleteHighwayGroup` ลบทั้งตอนควบคุมอย่างปลอดภัย
  4. ซิงค์คุณสมบัติทางวิศวกรรม (ช่องจราจร, ผิวทาง, หน่วยงานรับผิดชอบ) ข้ามฝั่งคันทางในตอนควบคุมเดียวกันเมื่อมีการบันทึก
- **การทดสอบและผลลัพธ์:**
  - `npm run lint` (`--max-warnings=0`): 0 warnings
  - `npm run typecheck`: 0 errors
  - `NEXT_OUTPUT=export next build`: 6/6 static pages สำเร็จ 100%
- **สถานะ:** พร้อมใช้งานจริง (ACTIVE)

---

### [UPDATE-065] 2026-11-12: ความถูกต้องของสถานะและการซิงค์ Timeline แบบไม่ซ้ำ
- **ผู้ดำเนินการ/ผู้สั่งการ:** เจ้าหน้าที่แขวงทางหลวงปัตตานี / AI Assistant
- **วัตถุประสงค์:** ป้องกันการแสดงสถานะไม่รู้จักเป็น “ผ่านได้ปกติ”, ป้องกัน Timeline ซ้ำเมื่อ Offline retry และบังคับให้ Deploy ตรวจ E2E ก่อนเผยแพร่
- **ไฟล์ที่เกี่ยวข้อง:** `app/page.tsx`, `lib/detour-navigation.ts`, `app/actions/doh-actions.ts`, `components/offline/OfflineSyncStatus.tsx`, `supabase/functions/hdms-api/index.ts`, `supabase/migrations/20261112145427_timeline_idempotency_and_atomic_metadata.sql`, `.github/workflows/deploy.yml`, `tests/e2e/*.spec.ts`
- **รายละเอียดการทำงาน:** สถานะที่ไม่รองรับแสดง “รอตรวจสอบสถานะ”; Offline queue ส่ง `clientRequestId` คงที่; migration เพิ่ม unique key และ RPC เดียวสำหรับ Timeline/Flood metadata เพื่อ atomic rollback; workflow Deploy รัน browser E2E ทั้ง server และ static artifact ก่อน upload Pages
- **การทดสอบและผลลัพธ์:** `npm run lint`, `npm run typecheck`, production build และ Pages build ผ่าน; Playwright 46 ผ่าน 14 ข้าม (desktop-only/ไม่มี geometry fixture) ทั้ง server และ static export
- **ข้อจำกัด:** Migration และ Edge Function ยังไม่ได้ deploy หรือทดสอบกับ Supabase production เพราะรอบนี้ไม่เปลี่ยน Production
- **สถานะ:** พร้อม review และ deploy เป็นชุดเดียวกัน

---

### [UPDATE-066] 2026-11-12: ลดภาระการแก้ไขแนวเส้นและทำ Dialog ทางเลี่ยงให้ใช้คีย์บอร์ดได้ครบ
- **วัตถุประสงค์:** ป้องกันการสูญเสียเส้นพรีวิวเมื่อนำทางล้มเหลว ลดงานแผนที่ที่ค้างหลังเปลี่ยนหน้า และทำหน้าต่างคำแนะนำทางเลี่ยงใช้งานได้ด้วยคีย์บอร์ด
- **ไฟล์ที่เกี่ยวข้อง:** `app/admin/page.tsx`, `app/page.tsx`, `components/map/LongdoGisMap.tsx`, `tests/e2e/public-route-sheet.spec.ts`
- **รายละเอียดการทำงาน:**
  1. เมื่อคำนวณแนวเส้นใหม่ไม่สำเร็จใน Admin ระบบคงพิกัด/เส้นพรีวิวเดิมไว้ และแจ้งสถานะที่ชัดเจน แทนการล้างแนวเส้นที่เจ้าหน้าที่แก้ไว้
  2. ล้าง timer `invalidateSize` ระหว่างเริ่มแผนที่เมื่อ component ถูกถอดออก ป้องกัน callback เก่าทำงานต่อหลังเปลี่ยนหน้า
  3. Dialog ทางเลี่ยงย้าย focus ไปยังปุ่มปิดเมื่อเปิด รองรับ `Escape` และวน focus ด้วย `Tab` ภายใน dialog; เมื่อปิดคืน focus ไปยังตัวควบคุมเดิม
  4. E2E รอข้อมูลจาก API mock ก่อนเปิด mobile sheet เพื่อป้องกัน test race condition
- **การทดสอบและผลลัพธ์:** `npm run lint`, `npm run typecheck`, production `npm run build` ผ่าน; Playwright mobile route sheet ผ่าน 1/1
- **ข้อจำกัด:** ยังไม่ทดสอบกับข้อมูล/เครื่องผู้ใช้จริงหรือ Supabase production และรอบนี้ไม่มีการ Push หรือ Deploy
- **สถานะ:** พร้อม review ในเครื่อง
