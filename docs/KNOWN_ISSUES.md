# KNOWN_ISSUES.md — ทะเบียนปัญหาที่ทราบ ข้อจำกัดทางเทคนิค และหลักฐานการทดสอบ

**ระบบ:** ศูนย์ข้อมูลน้ำท่วมและโครงข่ายทางหลวง แขวงทางหลวงปัตตานี (HDMS_PN)  
**อัปเดตล่าสุด:** 2026-11-11 (Phase 5 Completion / UPDATE-066)

---

## 1. สถานะงานแต่ละ Phase (Phase Status & Verification Matrix)

| Phase | ขอบเขตงาน | สถานะ | หลักฐานการทดสอบ |
|---|---|---|---|
| **Phase 1** | Core GIS Map, Public Dashboard, Traffic Presentation, Bottom Sheet & Mobile UI | **เสร็จสิ้น 100%** | `tests/e2e/smoke.spec.ts` (8/8 ผ่าน) |
| **Phase 2** | ทะเบียนเหตุการณ์น้ำท่วม (Incident Registry), แผนที่ดัดเส้นอิสระ (Line Editing), ประวัติระดับน้ำ | **เสร็จสิ้น 100%** | `tests/e2e/admin-menus.spec.ts`, `lib/line-edit.ts` unit tests |
| **Phase 3** | โครงข่ายทางหลวง GIS (Highway Network), Geometry ลดจุดเพื่อเว็บสาธารณะ, ตารางนำเข้า | **เสร็จสิ้น 100%** | `tests/e2e/gis-import.spec.ts`, `UPDATE-051` |
| **Phase 4** | แผนงานโครงการผู้ว่าฯ, การตั้งค่าระบบ, ป้ายแจ้งเตือนกลางเส้นทาง | **เสร็จสิ้น 100%** | `tests/e2e/governor-plans.spec.ts`, `UPDATE-054` |
| **Phase 5** | Adaptive GIS Markers, Popup Layout มาตรฐานสูง (ไม่ซ้อนกรอบ), นำทาง Google Maps ทางเลี่ยง, ตารางสายทาง & ทางเลี่ยง UX/UI, แก้จุดนำทางหลงเข้าจุดน้ำท่วม | **เสร็จสิ้น 100%** | `tests/e2e/detour-navigation.spec.ts` (12/12 ผ่าน), `tests/e2e/smoke.spec.ts` (8/8 ผ่าน), `npm run typecheck`, `npm run lint`, `NEXT_OUTPUT=export next build` (6/6 หน้า) |

---

## 2. ทะเบียนปัญหาที่ทราบและข้อจำกัดทางเทคนิค (Known Issues & Technical Constraints)

### KI-001: ข้อจำกัดจำนวน Waypoints ของ Google Maps Direction URLs
- **รายละเอียด:** การสร้าง Universal URL สำหรับเปิด Google Maps นำทาง (`https://www.google.com/maps/dir/?api=1...`) มีข้อจำกัดความยาวของ URL query string หากใส่พิกัดจุดเลี้ยว (Waypoints) เกิน 8–9 จุด อาจทำให้เบราว์เซอร์หรือแอปพลิเคชัน Google Maps บนมือถือตัดทอน URL หรือไม่สามารถประมวลผลเส้นทางได้
- **การจัดการใน Phase 5:** ฟังก์ชัน [`sampleWaypointsForGoogleMaps`](file:///f:/DOH_Pattani_Flood/hdms_pn/lib/detour-navigation.ts) จะทำการ Downsample พิกัดจุดหักเลี้ยวตามระยะทาง (Chord distance) ให้เหลือไม่เกิน 8 จุดสำคัญ เพื่อรับประกันว่า Google Maps จะเปิดและนำทางตามแนวทางเลี่ยงได้อย่างแม่นยำและไม่เกิดข้อผิดพลาด URL ล้น
- **ข้อควรระวัง:** Google Maps คำนวณเส้นทางบนโครงข่ายถนนของ Google เอง จึงอาจมีความแตกต่างจาก Geometry ในระบบ HDMS ในช่วงถนนท้องถิ่นขนาดเล็ก

### KI-002: สถาปัตยกรรมเว็บแบบ Static Export (`NEXT_OUTPUT=export`)
- **รายละเอียด:** ระบบทำงานบน GitHub Pages เป็นเว็บ Static ทั้งหมด ห้ามมี Server Actions, dynamic SSR, หรือการอ่าน environment variables ฝั่ง Server ตอนรัน
- **ผลกระทบ:** ลิงก์นำทาง Google Maps และการคำนวณทิศทาง A → B / B → A ต้องถูกสร้างและตรวจสอบผ่าน Client Library ([`lib/detour-navigation.ts`](file:///f:/DOH_Pattani_Flood/hdms_pn/lib/detour-navigation.ts)) หรือประมวลผลล่วงหน้าแล้วเก็บใน JSONB `detour_meta` (ผ่าน `google_maps_url_forward` และ `google_maps_url_reverse`)

### KI-003: การพึ่งพา Public OSRM API โดยไม่มี SLA
- **รายละเอียด:** ฟังก์ชันคำนวณเส้นเกาะถนนในหน้าแอดมินใช้ `router.project-osrm.org` ซึ่งเป็นบริการสาธารณะ
- **สถานะ:** บันทึกใน [`docs/BACKLOG.md`](file:///f:/DOH_Pattani_Flood/hdms_pn/docs/BACKLOG.md) รายการ B-008 มีการลดความถี่การเรียกและข้ามเมื่อแท็บซ่อน

### KI-004: ข้อกำหนด Chromium Executable สำหรับการรัน Playwright E2E บน Windows
- **รายละเอียด:** บนระบบปฏิบัติการ Windows ที่ไม่มี `chrome-headless-shell.exe` ติดตั้งในแคชของผู้ใช้ Playwright จะแจ้งข้อผิดพลาดเมื่อเริ่มทำงาน
- **วิธีแก้:** กำหนด `$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"` ก่อนสั่งรันคำสั่ง `npx playwright test`

### KI-005: Leaflet Popup Wrapper Padding & Borders
- **รายละเอียด:** ค่าเริ่มต้นของ Leaflet เพิ่ม padding 13px และขอบโค้งสีขาวซ้อนกัน หากใน popup มีการ์ดด้านในจะเกิดปัญหา "กรอบซ้อนกรอบ (Double Framing)"
- **วิธีแก้:** เขียน CSS ทับ `.leaflet-popup-content-wrapper` ใน [`app/globals.css`](file:///f:/DOH_Pattani_Flood/hdms_pn/app/globals.css) ให้ `padding: 0` ขอบดำเข้มชั้นเดียว และจัดให้หัวเรื่อง รหัสทางหลวง และตอนควบคุม แสดงในบรรทัดเดียวกัน

---

## 3. หลักฐานการทดสอบเชิงประจักษ์ (Empirical Test Verification Evidence)

### 3.1 การตรวจ Static Analysis & Build Pipeline
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`) → **ผ่าน (0 errors)**
- **Lint:** `npm run lint` (`next lint --max-warnings=0`) → **ผ่าน (0 warnings, 0 errors)**
- **Static Export Build:** `$env:NEXT_OUTPUT="export"; npm run build` → **ผ่านสมบูรณ์**
  ```text
  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ○ /admin
  ├ ○ /admin/login
  ├ ○ /dashboard
  └ ○ /report
  + First Load JS shared by all: 104 kB
  ```

### 3.2 ผลการทดสอบ E2E Test Suite (Phase 5 & Regression)
1. **`tests/e2e/detour-navigation.spec.ts` (Phase 5 Suite):**
   - Step 1: Priority 1 (Official Approved URL Forward & Reverse) → **PASSED**
   - Step 2: Priority 2 (Geometry Construction with Origin, Destination, Waypoints) → **PASSED**
   - Step 3: Priority 3 (Reverse Direction B → A coordinate swapping) → **PASSED**
   - Step 4: Priority 4 (Closed-Road Conflict Warning & Navigation Blocking) → **PASSED**
   - Step 5: Proactive Finding #1 Fix (Flood Dossier modal navigates via Detour, NOT flood point) → **PASSED**
   - Step 6: 3-tier Zoom Adaptive Markers (Zoom 9 icon, Zoom 12 route badge, Zoom 15 full capsule) → **PASSED**
   - Step 7: GIS Popup Layout Standards (Single line header, no double frames, single-layer border) → **PASSED**
   - Step 8: Detour Management Mobile Card View & Turn-by-Turn Advice Viewer → **PASSED**
   - Step 9: Highway Management Filters (Search, Type, Office) & Sticky Columns → **PASSED**
   - รวม: **12 passed** (100%)

2. **`tests/e2e/smoke.spec.ts` (Phase 1–4 Regression Suite):**
   - Public view title & hotline button → **PASSED**
   - Leaflet map initialization & responsiveness → **PASSED**
   - Highway search & filtering → **PASSED**
   - Public flood detail bottom sheet → **PASSED**
   - Mobile 412px layout without horizontal overflow → **PASSED**
   - รวม: **8 passed** (100%)

---

## 4. รายการงานที่ยังรอการตัดสินใจ (Pending Backlog จาก BACKLOG.md)

- **B-001 (วิกฤต):** Edge Function เขียนข้อมูลด้วย service role โดยไม่ตรวจสิทธิ์ผู้เรียก (รอการตัดสินใจวางระบบ Auth หน้าแอดมิน)
- **B-002 (สูง):** `.mcp.json` ให้สิทธิ์ฐานข้อมูลระดับ Production
- **B-003 (สูง):** Pipeline การ Deploy ยังไม่บังคับรอ CI E2E ให้เสร็จสมบูรณ์
- **B-005 (กลาง):** การแยกไฟล์ขนาดใหญ่ในแอดมิน (`GisDataImportTab.tsx`, `MapManagementTab.tsx`)
- **B-008 (กลาง):** การรองรับ OSRM ทางเลือกหรือ Caching Proxy

