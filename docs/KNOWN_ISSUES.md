# KNOWN_ISSUES.md — ทะเบียนปัญหาที่ทราบ ข้อจำกัดทางเทคนิค และหลักฐานการทดสอบ

**ระบบ:** ศูนย์ข้อมูลน้ำท่วมและโครงข่ายทางหลวง แขวงทางหลวงปัตตานี (HDMS_PN)  
**Production URLs:** [https://feekuy96-a11y.github.io/hdms_pn/](https://feekuy96-a11y.github.io/hdms_pn/) (หน้าประชาชน) \| [https://feekuy96-a11y.github.io/hdms_pn/admin](https://feekuy96-a11y.github.io/hdms_pn/admin) (หน้าแอดมิน)  
**อัปเดตล่าสุด:** 2026-11-19 (`UPDATE-137`: วางกติกาถาวรและแผนโครงสร้างหน้าแอดมิน 5 เฟสใน `docs/ADMIN_ROADMAP.md`, ปิด Phase 0 — ล็อก `.mcp.json` read-only [B-002], ผูก `deploy.yml` รอ `CI` ด้วย `workflow_run` [B-003], ย้าย `SUPPLEMENTAL_RULES.md` เข้า archive [B-006], และซิงก์ `PRODUCTION.md` ให้ตรงโค้ดจริง)

> UPDATE-073: ปิดช่องว่างการแสดง Stroke/Casing ของแผนที่แล้ว โดย `LongdoGisMap` วาดเส้นฐานแบบ Canvas สำหรับน้ำท่วม ทางเลี่ยง และโครงข่ายสายทางเมื่อเปิดค่า Stroke/Casing; ผล lint, typecheck และ build:pages ผ่าน. ยังต้องตรวจภาพจริงหลังนำเว็บขึ้น GitHub Pages เพราะการทดสอบอัตโนมัติยืนยันการโหลดแผนที่และพฤติกรรม ไม่สามารถอ่านสีพิกเซลของ Canvas ได้อย่างน่าเชื่อถือ.

> UPDATE-090 / KI-014: ปิดการส่ง Draft จาก Public API และ Public fallback ฝั่ง browser แล้ว (PR #32, PR #33, Deploy Pages `44104409962`); `UPDATE-109` ยังคงกรอง `WITHDRAWN`/`UNAVAILABLE`/Draft ออกจาก `eventDetourLinks` ฝั่ง Public อย่างเข้มงวด.

> UPDATE-102/103: รวมศูนย์สถานะจราจร 5 ค่าไว้ที่ `lib/traffic-presentation.ts` (R1) พร้อมปรับการ์ดเหตุการณ์แอดมินด้วย CSS Container Queries; เพิ่ม `docs/AI_HANDOFF.md` และปรับ `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `CLAUDE.md` ให้ชี้สู่ `AGENTS.md` และ `docs/AI_HANDOFF.md` ตรงกันทั้งหมด.

---

## 1. สถานะงานแต่ละ Phase (Phase Status & Verification Matrix)

| Phase | ขอบเขตงาน | สถานะ | หลักฐานการทดสอบ |
|---|---|---|---|
| **Phase 1** | Core GIS Map, Public Dashboard, Traffic Presentation, Bottom Sheet & Mobile UI | **เสร็จสิ้น 100%** | `tests/e2e/smoke.spec.ts` (8/8 ผ่าน) |
| **Phase 2** | ทะเบียนเหตุการณ์น้ำท่วม (Incident Registry), แผนที่ดัดเส้นอิสระ (Line Editing), ประวัติระดับน้ำ | **เสร็จสิ้น 100%** | `tests/e2e/admin-menus.spec.ts`, `lib/line-edit.ts` unit tests |
| **Phase 3** | โครงข่ายทางหลวง GIS (Highway Network), Geometry ลดจุดเพื่อเว็บสาธารณะ, ตารางนำเข้า | **เสร็จสิ้น 100%** | `tests/e2e/gis-import.spec.ts`, `UPDATE-051` |
| **Phase 4** | แผนงานโครงการผู้ว่าฯ, การตั้งค่าระบบ, ป้ายแจ้งเตือนกลางเส้นทาง | **เสร็จสิ้น 100%** | `tests/e2e/governor-plans.spec.ts`, `UPDATE-054` |
| **Phase 5** | Adaptive GIS Markers, Popup Layout มาตรฐานสูง (ไม่ซ้อนกรอบ), นำทาง Google Maps ทางเลี่ยง, ตารางสายทาง & ทางเลี่ยง UX/UI, แก้จุดนำทางหลงเข้าจุดน้ำท่วม | **เสร็จสิ้น 100%** | `tests/e2e/detour-navigation.spec.ts` (12/12 ผ่าน), `tests/e2e/smoke.spec.ts` (8/8 ผ่าน), `npm run typecheck`, `npm run lint`, `NEXT_OUTPUT=export next build` (6/6 หน้า) |
| **Phase 6** | Shared Detour Detail Logic (`lib/detour-presentation.ts`), Compact Flood Marker 3 ระดับ, ป้องกันทิศทาง/ฝั่งถนนเดาเอง, E2E Suite ผ่านสมบูรณ์ | **เสร็จสิ้น 100% (Code & Staging)** | `tests/e2e/*.spec.ts` (46 passed, 14 skipped), `npm run lint`, `npm run typecheck`, `build:pages` ผ่าน 6/6 static pages; `UPDATE-070` |

---

## 2. ทะเบียนปัญหาที่ทราบและข้อจำกัดทางเทคนิค (Known Issues & Technical Constraints)

### KI-010: Google Sheets sync ยังไม่มี durable retry queue
- ปิดส่วน durable retry แล้วบน Production: `doh_external_jobs`, Edge worker v16, retry/backoff สูงสุด 8 ครั้ง และ Cron ปลุกทุก 2 นาทีผ่านการทดสอบจริง.
- ปิดข้อจำกัดด้านปฏิบัติการแล้ว: หน้า Admin แสดงงานที่ต้องติดตามสูงสุด 50 งาน งานสำเร็จล่าสุด 20 งาน และลองงาน `failed` ใหม่ได้; Edge v17 และเว็บ deploy แล้ว พร้อมตรวจ Production read และ live browser.

### KI-011: Edge secret ยังชี้ Apps Script URL เดิม
- Web App ใหม่ผ่านการทดสอบ `uploadMedia` ซ้ำด้วย operation ID เดียวกันแล้ว (คืนไฟล์เดิมและลบ QA file สำเร็จ). เหลือเปลี่ยน `APPS_SCRIPT_WEB_APP_URL` ใน Supabase Edge secrets แล้ว deploy `hdms-api` v18 ซ้ำ; เครื่องมือ Supabase ที่เชื่อมในเซสชันนี้ไม่มีสิทธิ์จัดการ secrets. ดู B-022.

### KI-012: ยังไม่มี field telemetry สำหรับ RAM/CPU ของตัวแก้แนวเส้น
- Lab test 1,200 จุดยืนยัน canvas เดียวและเพดาน 400 handle แต่ไม่สามารถรายงาน JS heap หรือ CPU บนเครื่องเจ้าหน้าที่จริงได้อย่างน่าเชื่อถือใน CI/headless. เก็บ Chrome Performance trace/Task Manager จากเครื่องที่เคยค้างก่อนเปลี่ยนเพดานหรือเพิ่ม Web Worker; ดู B-005.

### KI-013: ความสัมพันธ์ Event↔Detour หลายต่อหลาย — ปิดแล้ว (2026-11-19, UPDATE-122)
- Migration `20261117135032_event_detour_relationships.sql`, trigger `20261117192000_sync_flood_event_segments.sql` และ migration `20261118000100_event_detour_both_directions.sql` ถูก apply เข้า Supabase Production สำเร็จแล้ว (รองรับ `BOTH`/`TWO_WAY`, check constraints และฟังก์ชัน `doh_replace_event_detour_links` อัปเดตครบถ้วน)
- Edge Function `hdms-api` v23 แนบ `eventDetourLinks` พร้อมกรอง `WITHDRAWN`/Draft สำหรับ Public
- หน้ารายละเอียดทุกจุดใน Admin (`IncidentRegistryTab`, `DetourManagementTab`), ประชาชน (`app/page.tsx`) และแผนที่ (`LongdoGisMap.tsx`) เชื่อมโยงความสัมพันธ์ผ่าน `eventDetourLinks` ร่วมกับ fallback `flood_id_ref` ครบวงจรแล้ว. ดู B-023.

### KI-014: Public fallback patch เผยแพร่แล้ว — ปิดแล้ว
- รวมเข้า `main` ผ่าน PR #32 และ PR #33 (commit `866eb93`) Deploy GitHub Pages สำเร็จ (Run `44104409962`); fallback ฝั่ง browser ถูกจำกัดเฉพาะ public RPC หรือแสดง Error/Retry พร้อม regression test ผ่านครบ (ดู B-019).

### KI-001: ข้อจำกัดจำนวน Waypoints ของ Google Maps Direction URLs
- **รายละเอียด:** การสร้าง Universal URL สำหรับเปิด Google Maps นำทาง (`https://www.google.com/maps/dir/?api=1...`) มีข้อจำกัดความยาวของ URL query string หากใส่พิกัดจุดหักเลี้ยว (Waypoints) เกิน 8–9 จุด อาจทำให้เบราว์เซอร์หรือแอปพลิเคชัน Google Maps บนมือถือตัดทอน URL หรือไม่สามารถประมวลผลเส้นทางได้
- **การจัดการใน Phase 5 และ UPDATE-108:** ฟังก์ชัน [`sampleWaypointsForGoogleMaps`](file:///f:/DOH_Pattani_Flood/hdms_pn/lib/detour-navigation.ts) (ใช้ `selectRouteCornerWaypoints` ใน `lib/gis-utils.ts`) คัดเลือกจุดหักเลี้ยวสำคัญตามค่า Douglas-Peucker importance โดยคงลำดับเส้นทางไม่เกิน 8 จุด เพื่อไม่ให้ URL ตัดโค้งสำคัญระหว่างทาง
- **ข้อควรระวัง:** Google Maps คำนวณเส้นทางบนโครงข่ายถนนของ Google เอง จึงอาจมีความแตกต่างจาก Geometry ในระบบ HDMS ในช่วงถนนท้องถิ่นขนาดเล็กหากยังไม่เปิดใช้ Google Routes API proxy (`GOOGLE_MAPS_API_KEY`)

### KI-002: สถาปัตยกรรมเว็บแบบ Static Export (`NEXT_OUTPUT=export`)
- **รายละเอียด:** ระบบทำงานบน GitHub Pages เป็นเว็บ Static ทั้งหมด ห้ามมี Server Actions, dynamic SSR, หรือการอ่าน environment variables ฝั่ง Server ตอนรัน
- **ผลกระทบ:** ลิงก์นำทาง Google Maps และการคำนวณทิศทาง A → B / B → A ต้องถูกสร้างและตรวจสอบผ่าน Client Library ([`lib/detour-navigation.ts`](file:///f:/DOH_Pattani_Flood/hdms_pn/lib/detour-navigation.ts)) หรือประมวลผลล่วงหน้าแล้วเก็บใน JSONB `detour_meta` (ผ่าน `google_maps_url_forward` และ `google_maps_url_reverse`) ส่วนการเรียก Google Maps Geocoding/Routes Web Services ทำผ่าน Edge Function proxy `hdms-api` เท่านั้น

### KI-003: การพึ่งพา Public OSRM API โดยไม่มี SLA
- **รายละเอียด:** เมื่อยังไม่ตั้งค่า `GOOGLE_MAPS_API_KEY` บน Edge Function ระบบจะสลับมาใช้ `router.project-osrm.org` ซึ่งเป็นบริการสาธารณะ (และรองรับ `end of road` / `off ramp` / `continue` เพิ่มเติมแล้วใน `UPDATE-108`)
- **สถานะ:** บันทึกใน [`docs/BACKLOG.md`](file:///f:/DOH_Pattani_Flood/hdms_pn/docs/BACKLOG.md) รายการ B-008 มีการลดความถี่การเรียก, single-flight Google config probe และตัดวงจรเมื่อคีย์ยังไม่ถูกตั้งค่า

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

## 4. รายการงานที่ยังรอการดำเนินการ (Pending Backlog จาก BACKLOG.md และ `docs/ADMIN_ROADMAP.md`)

- **B-001 (วิกฤต — ยอมรับความเสี่ยงชั่วคราว 2026-11-16):** Edge Function เขียนข้อมูลด้วย service role โดยไม่ตรวจสิทธิ์ผู้เรียก (แผน Phase 1.3 เพิ่ม DB Audit Log และ Phase 4.3 เตรียม Opt-in Auth)
- **B-014 (วิกฤต — เปิด):** ยืนยันโค้ด Edge Function Production เทียบกับรีโปและสกัด schema snapshot (`docs/ADMIN_ROADMAP.md` Phase 1.1)
- **B-022 (สูง — กำลังทำ):** ตั้ง `APPS_SCRIPT_WEB_APP_URL` ใหม่ใน Supabase Edge Secrets แล้ว deploy Edge (`Phase 1.2`)
- **B-008 (กลาง — กำลังทำ):** ตั้ง `GOOGLE_MAPS_API_KEY` ใน Supabase Edge Secrets เพื่อเปิด Tier 1 Routing ลดการพึ่ง OSRM สาธารณะ (`Phase 1.2`)
- **B-024 (กลาง — เปิด):** เพิ่มนโยบาย retention/archival สำหรับตาราง `doh_event_detour_operations` (`Phase 1.4`)
- **B-005 (กลาง — ปิดบางส่วน):** เก็บ field telemetry เครื่องเจ้าหน้าที่จริง (`KI-012`) และแยกไฟล์ขนาดใหญ่ > 1,200 บรรทัด (`Phase 3 & 4.1`)
- **B-016 (กลาง — เปิด):** ตราครุฑทางการสำหรับป้ายทางหลวงยังรอไฟล์ Asset ที่ผ่านอนุมัติ (`Phase 4.4`)
- *(ปิดแล้วใน `UPDATE-137`: `B-002` ล็อก `.mcp.json` read-only, `B-003` ผูก `deploy.yml` รอ `CI`, `B-006` ย้าย `SUPPLEMENTAL_RULES.md` ไป `docs/archive/`)*



---

## อัปเดตหลักฐานใหม่: 2026-11-11 (Phase 6, ยังไม่ใช่ Release Verification)
แม้ตารางด้านบนบันทึก Phase 5 ว่า 100% ตามผลทดสอบเดิม แต่การตรวจ Production แบบอ่านอย่างเดียวพบว่าข้อมูลทางเลี่ยง 8 รายการมี `direction_mode=TWO_WAY` ทั้งหมด และน้ำท่วม 4 รายการมี `road_side=UNKNOWN` ทั้งหมด ขณะที่ `hdms-api` ที่ deploy ยังขาดการบันทึกฟิลด์ส่วนขยาย ดังนั้นผลทดสอบ Phase 5 ไม่รับรองการทำงานจริงของช่องข้อมูลเหล่านี้ โปรดอ้างอิง `docs/PHASE6_VALIDATION.md` และ `docs/BACKLOG.md` (B-014) ก่อน Deploy

### KI-006: Public Detour Detail และ Leaflet Popup Shared Presentation Logic (Phase 6 UPDATE-070)
- `app/page.tsx` เป็น React Bottom Sheet; `components/map/LongdoGisMap.tsx` สร้าง Leaflet Popup เป็น HTML string
- แก้ไขปัญหาความไม่สอดคล้องกันโดยสร้างโมดูลกลาง [`lib/detour-presentation.ts`](file:///f:/DOH_Pattani_Flood/hdms_pn/lib/detour-presentation.ts) สำหรับประมวลผล badge ทิศทาง, แยกขั้นตอน (Numbered steps), คำนวณระยะทาง และตรวจสอบทิศทางที่อนุญาตให้เดินทาง ทำให้ทั้งสองฝั่งแสดงผลตรงกัน 100%
- ผ่านการทดสอบ Playwright E2E (`tests/e2e/detour-navigation.spec.ts` และ `tests/e2e/public-route-sheet.spec.ts`) ทั้งบนเดสก์ท็อปและมุมมองมือถือ 360px/412px เรียบร้อยแล้ว
