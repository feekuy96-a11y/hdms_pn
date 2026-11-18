# CHANGELOG.md — บันทึกงานใหม่ (แทนการเพิ่มใน SUPPLEMENTAL_RULES.md)

### [UPDATE-118] 2026-11-18 แยกโมดูลย่อยของ `GisDataImportTab.tsx` (B-005)
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`, `components/admin/tabs/gis-import-helpers.ts` (ใหม่), `components/admin/tabs/GisUploadMappingPanel.tsx` (ใหม่), `components/admin/tabs/HighwaySpecificationsTableSection.tsx` (ใหม่), `docs/{CHANGELOG,BACKLOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **`gis-import-helpers.ts` (75 บรรทัด):** ย้าย pure functions สำหรับแปลงหลัก กม. (`kilometerPostMeters`, `formatKilometerPost`), ผิวทาง/ช่องจราจร (`normalizeSurface`, `normalizeLanes`), คำนวณระยะทาง (`calculateDistanceKm`), และ Web Worker simplification (`previewLines`, `simplifyInWorker`, `lineCoordinates`)
  2. **`GisUploadMappingPanel.tsx` (324 บรรทัด):** แยกส่วนอัปโหลดไฟล์ GIS, Dual-Color Preview Inspection, การจับคู่ฟิลด์ข้อมูลโครงข่าย (GIS Attribute Mapping), ตารางตัวอย่าง 5 สายทางแรก, และสไลเดอร์ Douglas-Peucker
  3. **`HighwaySpecificationsTableSection.tsx` (457 บรรทัด):** แยกตารางรายการทางหลวงและคุณสมบัติทางวิศวกรรม พร้อมตัวกรอง ค้นหา ส่งออก และแถวย่อย Child Branches (ลดขนาด `GisDataImportTab.tsx` จาก 2,006 → 1,306 บรรทัด โดยคง DOM structure และ accessible name เดิมทุกจุด)
- **ตรวจแล้ว:** `npm run lint` (`0` warnings), `npx tsc --noEmit --incremental false` (`0` errors), และ `npm run build:pages` (`6/6` static pages)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Push ขึ้น `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-117] 2026-11-18 แยกโมดูลย่อยส่วนที่ 1 (`HighwayIdentificationSection.tsx`) และ `buildDetourMetaPayload` จาก `MapManagementTab.tsx` พร้อมอัปเดตสถานะเผยแพร่ใน `AI_HANDOFF.md`
- **ไฟล์:** `components/admin/tabs/HighwayIdentificationSection.tsx` (ใหม่), `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/map-management-helpers.ts`, `docs/{AI_HANDOFF,CHANGELOG,BACKLOG}.md`
- **การแก้ไข:**
  1. **อัปเดตสถานะเผยแพร่ล่าสุดใน `docs/AI_HANDOFF.md`:** ปรับเลข commit อ้างอิงส่วนหัวและหมวดสถานะเผยแพร่ล่าสุดจาก `d656d12` เป็น `3beabf5` (`UPDATE-116`, CI run `44331866679` / Deploy Pages run `44331865436` สำเร็จ, HTTP 200) เพื่อป้องกันความสับสนของ AI ที่รับงานต่อ
  2. **แยกส่วนที่ 1 และฟังก์ชันสร้าง `detour_meta` (`MapManagementTab.tsx` ลดจาก 2,460 → 2,118 บรรทัด):** แยก UI ฟอร์มส่วนที่ 1 "ข้อมูลสายทางและพื้นที่" (Parent Event, หมู่บ้าน/จุดสังเกต, Smart Search ทางหลวง, ช่วง กม. Linear Referencing, และการตั้งค่าทางเลี่ยง) ออกเป็น `components/admin/tabs/HighwayIdentificationSection.tsx` (364 บรรทัด) และย้ายตรรกะสร้าง `detour_meta` ออกเป็น `buildDetourMetaPayload` ใน `map-management-helpers.ts` โดยคง DOM structure และ accessible name เดิมทุกประการ
- **ตรวจแล้ว:** `npm run lint` (`0` warnings), `npm run typecheck` (`0` errors), `npm run build:pages` (`6/6` static pages), และ Playwright E2E บน `PLAYWRIGHT_STATIC=1` (`flood-form-rules`, `admin-menus`, `smoke`)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Push ขึ้น `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-116] 2026-11-18 แยกโมดูลย่อยจาก `LongdoGisMap.tsx` และ `MapManagementTab.tsx` (B-005)
- **ไฟล์:** `components/map/LongdoGisMap.tsx`, `components/map/longdo-map-popups.ts` (ใหม่), `components/map/MapLegendOverlay.tsx` (ใหม่), `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/map-management-helpers.ts` (ใหม่), `components/admin/tabs/RouteGeometryEditorSection.tsx` (ใหม่), `components/admin/tabs/FloodSituationSection.tsx` (ใหม่), `docs/{CHANGELOG,BACKLOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **`LongdoGisMap.tsx` (2,713 → 1,846 บรรทัด):** ย้ายตัวช่วย pure functions และ Popup HTML builders ไปไว้ที่ `components/map/longdo-map-popups.ts` (675 บรรทัด, คง re-export `isFloodLineVisibleOnCurrentMap`) และแยก UI แถบสถานะ/Legend/Modal รูปจุดทางเข้าออกไปเป็น `components/map/MapLegendOverlay.tsx` (360 บรรทัด)
  2. **`MapManagementTab.tsx` (3,297 → 2,460 บรรทัด):** ย้าย pure helpers ไปไว้ที่ `components/admin/tabs/map-management-helpers.ts` (132 บรรทัด, คง re-export `buildDetourRoutingParams`), แยกส่วนที่ ๒ แนวเส้นบนแผนที่และ A-B/B-A Inspector ออกเป็น `RouteGeometryEditorSection.tsx` (535 บรรทัด), และแยกส่วนที่ ๓ สถานการณ์น้ำและมาตรการออกเป็น `FloodSituationSection.tsx` (569 บรรทัด) โดยคง DOM structure, label และ accessible name เดิมครบทุกจุด
- **ตรวจแล้ว:** `npm run lint` (`0` warnings), `npm run typecheck` (`0` errors), `npm run build:pages` (`6/6` static pages), และ Playwright E2E บน `PLAYWRIGHT_STATIC=1` (`smoke`, `admin-menus`, `flood-form-rules`, `detour-navigation` — `38 passed`, `18 skipped` สำหรับเคส desktop-only บน mobile project)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Push ขึ้น `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-114] 2026-11-18 ปรับชื่อสถานะจราจร 5 ค่าและคำนวณอัตโนมัติตามระดับน้ำ แยกวาดเส้น/กรอกระดับน้ำ 2 ฝั่งบนถนน ≥ 4 ช่องจราจร และกรองรายการทางหลวงเฉพาะจากโครงข่าย DB
- **ไฟล์:** `lib/traffic-presentation.ts`, `lib/detour-navigation.ts`, `lib/flood-event-schema.ts`, `lib/highway-schema.ts`, `app/page.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `tests/e2e/flood-form-rules.spec.ts` (ใหม่), `tests/e2e/admin-menus.spec.ts`, `tests/e2e/detour-navigation.spec.ts`, `docs/{CHANGELOG,UI_CONTRACT}.md`
- **การแก้ไข:**
  1. **ปรับข้อความสถานะ `LIGHT_VEHICLES_ONLY` และคำนวณอัตโนมัติ (`lib/traffic-presentation.ts`, `lib/detour-navigation.ts`, `lib/flood-event-schema.ts`, `app/page.tsx`, `MapManagementTab.tsx`, `IncidentRegistryTab.tsx`):** เปลี่ยนข้อความของ `LIGHT_VEHICLES_ONLY` จาก `"รถเล็กผ่านได้"` เป็น `"รถทุกชนิดผ่านได้แต่ไม่สะดวก"` ตรงกันทั้งระบบ (R1) และเพิ่ม `deriveTrafficStatusFromWaterLevel` เลือกสถานะแนะนำอัตโนมัติตามระดับน้ำ (`0` → `PASSABLE`, `1–25` → `LIGHT_VEHICLES_ONLY`, `26–35` → `WARNING` หรือ `ONE_LANE` เมื่อส่วนถนนที่ได้รับผลกระทบไม่ใช่ `ALL_LANES`, `36+` → `CLOSED`) โดยยังแก้ dropdown เองได้ทั้งในฟอร์มหลัก อัปเดตด่วน และแบ่งช่วง
  2. **ท่วมทั้งสองฝั่งจราจรบนทางหลวงตั้งแต่ 4 ช่องจราจรขึ้นไป (`MapManagementTab.tsx`, `lib/highway-schema.ts`):** รวมโหมดเข้ากับปุ่ม `"↔️ ท่วมทั้งสองฝั่งจราจร"` (ถอดปุ่ม `"⚡ บันทึก ๒ ทิศทาง"` ที่ซ้ำซ้อนออก) เมื่อสายทางที่เลือกมี ≥ 4 ช่องจราจรหรือมีคันทางแยกฝั่ง (`A_TO_B` + `B_TO_A`) สามารถสลับแก้ไขแนวเส้น `ขาไป (A → B)` / `ขากลับ (B → A)` ได้ทั้งโหมดตามแนวถนน (Linear Referencing แยก branch + Road Snapping) และดัดเส้นอิสระ พร้อมแยกส่วนถนนที่ได้รับผลกระทบ ระดับน้ำ และสถานะจราจรฝั่งขาไป/ขากลับ (ส่วนถนน `< 4` ช่องจราจรใช้เส้นเดี่ยวและระดับน้ำชุดเดียว)
  3. **Dropdown หมายเลขทางหลวงเฉพาะจากโครงข่าย (`lib/highway-schema.ts`, `MapManagementTab.tsx`):** ปรับ `getAvailableHighwayRoutes` ให้ดึงข้อมูลจาก `systemData.highwayLayers` เท่านั้น (ไม่ปน `floodRoutes`/`mitigationProjects`), ตัด `(ขาไป...)` / `(ขากลับ...)` / `(ส่วนที่...)` / `ตอน `, ยุบรวมช่วง `กม.เริ่มต้น - กม.สิ้นสุด` ให้แสดงตอนควบคุมละ 1 รายการ (เช่น `ทล.42 - ดอนยาง - บ้านดี · 103+200 - 104+850`), และเพิ่ม `role="listbox"` / `role="group"` เพื่อการเข้าถึง
- **ตรวจแล้ว:** `npm run check:deploy` (`eslint --max-warnings=0`, `tsc --noEmit`, `build:pages`) และ Playwright E2E บน `PLAYWRIGHT_STATIC=1` (`flood-form-rules`, `admin-menus`, `detour-navigation`, `smoke`, `public-route-sheet`, `compact-card-detour-accordion`) พร้อมตรวจสอบโครงสร้าง `highwayLayers` จริงจาก `getPublicSystemDataAction` แบบอ่านอย่างเดียว
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit บนสาขาใหม่ เปิด PR รอ CI ผ่านแล้ว Merge ขึ้น `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-113] 2026-11-18 แก้ป๊อปอัปแอดมินตกขอบหน้าจอ เปิดใช้เครื่องมือแก้เส้นขากลับ (B → A) ครบทั้งโหมดตามแนวถนนและดัดเส้นอิสระ ปรับปุ่ม `ขาไป (A → B)` / `ขากลับ (B → A)` และเพิ่มหมุดภาพทางเข้าทางเลี่ยง (จุด A / จุด B) บนแผนที่
- **ไฟล์:** `supabase/migrations/20261118000300_detour_point_photos_media_promotion.sql` (ใหม่), `supabase/functions/hdms-api/index.ts`, `app/actions/doh-actions.ts`, `db/default-data.ts`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/DetourAdviceSection.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `components/map/LongdoGisMap.tsx`, `app/page.tsx`, `tests/e2e/compact-card-detour-accordion.spec.ts`, `docs/{CHANGELOG,UI_CONTRACT}.md`
- **การแก้ไข:**
  1. **แก้ป๊อปอัปแอดมินลอยตกขอบล่าง (`AdminConsole.tsx`):** ถอด `[contain:layout_style_paint]` ออกจาก `.doh-form` ที่มี `overflow-y-auto` เพื่อให้ Modal `fixed inset-0` ยึดกลางหน้าจอ Viewport เสมอแม้เลื่อนรายการลงมาด้านล่าง
  2. **แก้เส้นขากลับ `B → A` ได้ครบทั้งโหมดตามแนวถนนและดัดเส้นอิสระ (`MapManagementTab.tsx`, `LongdoGisMap.tsx`):** แสดงสวิตช์ `ขาไป (A → B)` / `ขากลับ (B → A)` ในกรอบแก้ไขแนวเส้นสำหรับทางเลี่ยง 2 ทิศทางทั้ง 2 โหมด, ปลดล็อกปุ่ม `ขากลับ (B → A)` ให้กดได้ทันที (คัดลอกแนวเส้นย้อนทิศตั้งต้นอัตโนมัติเมื่อยังไม่มีเส้นแยก), และผูกปุ่มเครื่องมือทั้งหมด (`แตะจุดกลางเส้นเพื่อเพิ่มจุด`, `+ เพิ่มจุดดัดเส้น`, `ย้อนกลับ`, `คืนค่าแนวเดิม`, `ลากจุดดัด`, `+ เพิ่มจุดดัดอิสระ`, `ลบจุดดัด`, `ทำซ้ำ`) เข้ากับทิศทางที่เลือก
  3. **มาตรฐานข้อความปุ่มทิศทางเดียวกันทุกหน้า:** ใช้ `ขาไป (A → B)` / `ขากลับ (B → A)` (และ `ทั้ง ๒ ทิศทาง`) ตรงกันทั้งหน้าประชาชน, แผนที่, และแอดมิน
  4. **หมุดจุดพ้อยท์แสดงภาพทางเข้าทางเลี่ยง จุดเริ่มต้น A และจุดสิ้นสุด B (`MapManagementTab.tsx`, `DetourManagementTab.tsx`, `LongdoGisMap.tsx`, `app/page.tsx`, `hdms-api`, SQL `20261118000300`):** เพิ่มการแนบภาพและคำอธิบายทางเข้าจุดเริ่มต้น A (ฝั่งขาไป `A → B`) และจุดสิ้นสุด B (ฝั่งขากลับ `B → A` สำหรับผู้มาจากอีกฝั่ง) บันทึกลง `detour_meta.start_point_photo` / `end_point_photo` ผ่าน `uploadExternalMediaAction` (`ownerType: "DETOUR"`), วาดหมุด `📷 A` และ `📷 B` บนแผนที่ที่คลิกดูภาพพร้อมขยายเต็มจอและกดนำทางไปยังจุดทางเข้าได้ทันที
- **ตรวจแล้ว:** `npm run check:deploy` และ Playwright E2E บน `PLAYWRIGHT_STATIC=1`
- **ลำดับ Deploy & ย้อนกลับ:** 1) รัน SQL `20261118000300` → 2) Deploy Edge Function `hdms-api` → 3) Merge PR เข้า `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-112] 2026-11-18 ปรับสวิตช์ทิศทางเป็นมาตรฐานเดียวกัน ลดข้อมูลซ้ำซ้อนบนการ์ดทางเลี่ยง ดึงระยะทางจากแนวเส้นจริง เพิ่มช่องกรอกเวลาเดินทาง แก้บั๊กพิมพ์ข้อความในหน้าแอดมิน และย่อเก็บช่วงย่อยเริ่มต้น
- **ไฟล์:** `components/ui/DirectionSwitch.tsx` (ใหม่), `components/ui/use-modal-accessibility.ts`, `components/AdviceText.tsx`, `lib/gis-utils.ts`, `lib/detour-presentation.ts`, `components/admin/tabs/DetourAdviceSection.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `app/page.tsx`, `components/map/LongdoGisMap.tsx`, `tests/e2e/{compact-card-detour-accordion,admin-dialog-keyboard,admin-shared-dialog-keyboard,admin-menus,event-detour-links-admin}.spec.ts`, `docs/{CHANGELOG,UI_CONTRACT}.md`
- **การแก้ไข:**
  1. **สวิตช์ทิศทางมาตรฐานเดียว (`DirectionSwitch.tsx` + `LongdoGisMap.tsx`):** แก้สัญลักษณ์ขากลับจาก `⇄ B → A` เป็น `← B → A` (`→ A → B` / `← B → A` แบบกะทัดรัด และ `→ ขาไป (A → B)` / `← ขากลับ (B → A)` แบบละเอียด พร้อม `⇄ ทั้ง ๒ ทิศทาง` ในแท็บแก้ไข) ด้วย Segmented Switch รางเดียวเหมือนกันทุกหน้า
  2. **ลดข้อมูลซ้ำซ้อนและแสดงปุ่มลัดบนการ์ดทางเลี่ยง (`app/page.tsx`, `AdviceText.tsx`):** ลบกล่องเตือนสีส้ม `⚠️` ที่ซ้ำซ้อนออก, ซ่อนบรรทัดสรุประยะทาง/เวลาในข้อความ `AdviceText` เมื่ออยู่ร่วมกับกล่องสรุป 2 คอลัมน์, ซ่อนแถวระยะทาง/เวลาที่ส่วนหัวเมื่อกางการ์ดออกเพื่อแสดงเฉพาะกล่อง 2 คอลัมน์ด้านล่าง (ทางเลือก A), และย้ายปุ่ม `นำทาง` กับ `ดูตำแหน่งบนแผนที่` ออกมาแสดงบนการ์ดทุกรายการทันทีโดยไม่ต้องกางก่อน
  3. **ระยะทางจากเส้นจริง + เวลาเดินทางจากแอดมิน (`lib/detour-presentation.ts`, `DetourAdviceSection.tsx`, `MapManagementTab.tsx`, `DetourManagementTab.tsx`, `LongdoGisMap.tsx`):** ให้ `getDetourTimelinePresentation` ดึงระยะทางจาก `calculatePolylineRoadDistanceKm(polyCoords)` เป็นหลัก, และเพิ่มช่องกรอก "เวลาโดยประมาณ (นาที)" แยกขาไป/ขากลับในฝั่งแอดมินเพื่อบันทึกลง `detour_meta` (`forward_duration_min`/`reverse_duration_min` และ `*_s`) โดยไม่ต้องแก้ schema DB
  4. **แก้บั๊กพิมพ์ข้อความในหน้าแอดมิน (`use-modal-accessibility.ts`, `lib/gis-utils.ts`):** เก็บ `onClose` ใน `useRef` และจำกัด `useEffect` ให้โฟกัสเฉพาะจังหวะเปิด Modal (`[isOpen]`) แก้บั๊กแย่งโฟกัสกลับปุ่มปิด `X` ทุกครั้งที่พิมพ์ 1 ตัวอักษร; และเพิ่ม `extractDirectionalAdviceForEdit`/`composeDirectionalAdvice` ไม่ตัดช่องว่างหรือการขึ้นบรรทัดใหม่ขณะพิมพ์ในโหมดแยกทิศทาง
  5. **ย่อเก็บช่วงย่อยเป็นค่าเริ่มต้น (`IncidentRegistryTab.tsx`):** เปลี่ยนเป็น `expandedEvents` เริ่มว่าง (`isCollapsed = !expandedEvents.has(ev.eventId)`) พร้อมเพิ่ม `aria-expanded` และ `aria-label` บนปุ่มกาง/ย่อ
- **ตรวจแล้ว:** `npm run check:deploy` (lint 0 warnings, typecheck 0 errors, build:pages 6/6 static pages) และ Playwright E2E ที่เกี่ยวข้องบน `PLAYWRIGHT_STATIC=1` (`smoke`, `compact-card-detour-accordion`, `public-route-sheet`, `admin-dialog-keyboard`, `admin-shared-dialog-keyboard`, `admin-menus`, `detour-navigation`)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องรัน SQL หรือ Deploy Edge Function (`detour_meta` เป็น JSONB เดิม) → Merge PR ขึ้น `main` เพื่อ Deploy เว็บ GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-111] 2026-11-18 กู้คืนทางเลี่ยงที่ถูกซ่อนจากจุดน้ำท่วมที่ถูกลบ ล้างข้อมูลค้างหลังลบ และเปลี่ยนฟอร์ม/รายการหน้าเว็บให้ใช้ข้อมูล DB จริง
- **ไฟล์:** `supabase/migrations/20261118000200_sync_deleted_events_and_detour_visibility.sql` (ใหม่), `supabase/functions/hdms-api/index.ts`, `lib/hdms-api.ts`, `lib/highway-schema.ts`, `lib/constants.ts`, `db/default-data.ts`, `components/admin/tabs/SystemSettingsTab.tsx`, `components/admin/tabs/GovernorProjectsTab.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md`
- **การแก้ไข:**
  1. **SQL Migration (`20261118000200`):** ล้าง `flood_id_ref` ที่ชี้ไปยังจุดน้ำท่วมที่ถูกลบ (`F-14ab47e0...`) ให้เป็น `NULL` เพื่อกู้คืนทางเลี่ยงใช้งานจริง 2 เส้น (`D-7dc93ad2...`, `D-e954426a...`) ที่ถูกซ่อน, ล้างแถวค้างใน `doh_event_segments`/`doh_event_detour_links`/`doh_flood_events`, อัปเดต trigger `trg_doh_sync_flood_event_segment` และเพิ่ม `trg_doh_sync_detour_delete` ซิงก์การลบ/กู้คืน, และเพิ่ม `doh_detour_has_active_event_link` ให้ RLS `doh_detour_deleted_visibility` และ `doh_get_public_system_data_display_rpc` รองรับความสัมพันธ์ M2M จริง
  2. **Edge & Data Access:** กรอง `eventSegments`/`floodEvents`/`eventDetourLinks` ของ Admin ให้ตัดเหตุการณ์หรือทางเลี่ยงที่ถูกลบออกใน `hdms-api/index.ts`; ตัดโค้ด mutation ที่เข้าไม่ถึง (~140 บรรทัด) ใน `executeDirectAction` (`lib/hdms-api.ts`) โดยคงอ่าน fallback 4 actions ครบตามสัญญา `public-fallback-contract.spec.ts`
  3. **ตัดข้อมูลจำลอง Hardcode (คง `OfficialReportDispatchModal.tsx` ตามคำสั่งเจ้าของ):** เพิ่ม `getAvailableHighwayRoutes` ใน `lib/highway-schema.ts` จาก DB (`highwayLayers`, `floodRoutes`, `mitigationProjects`) ใช้ร่วมกันใน `GovernorProjectsTab` และ `MapManagementTab` (พร้อม `<datalist>` รายชื่อสำนักงานจริงจาก DB), เปลี่ยน `INITIAL_SYSTEM_DATA.offices` เป็น `[]`, ให้ `SystemSettingsTab` แสดง empty state แทนสำนักงานจำลอง, และลบชุดข้อมูลจำลองที่ไม่ได้ใช้ (`DOH_SUBDIVISIONS`, `HIGHWAY_ROUTES`, `TRAFFIC_STATUS`, `OFFICIAL_PATTANI_HIGHWAYS`, `DEFAULT_DOH_OFFICES`) ใน `lib/constants.ts`
- **ตรวจแล้ว:** รัน SQL migration `20261118000200`, Deploy Edge `hdms-api`, `npm run check:deploy` และ E2E ที่เกี่ยวข้อง
- **ลำดับ Deploy & ย้อนกลับ:** 1) รัน SQL `20261118000200` → 2) Deploy Edge `hdms-api` → 3) Merge PR เข้า `main`

### [UPDATE-109] 2026-11-18 แสดงผลความสัมพันธ์เหตุการณ์ ↔ ทางเลี่ยงครบทุกหน้ารายละเอียด รองรับ 2 ทิศทาง สถานะใช้งาน/ไม่ใช้งาน และแสดงช่วง กม.
- **ไฟล์:** `supabase/migrations/20261118000100_event_detour_both_directions.sql` (ใหม่), `supabase/functions/hdms-api/index.ts`, `db/default-data.ts`, `lib/flood-event-schema.ts`, `lib/event-detour-links.ts`, `components/admin/EventDetourLinkModal.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `components/admin/OfficialReportDispatchModal.tsx`, `app/page.tsx`, `components/map/LongdoGisMap.tsx`, `playwright.config.ts`, `tests/e2e/event-detour-links-admin.spec.ts`, `docs/*`
- **การแก้ไข:**
  1. **SQL Migration (`20261118000100`):** ขยาย CHECK constraint และฟังก์ชัน `doh_replace_event_detour_links` ให้รองรับ `BOTH` (`event_direction`) และ `TWO_WAY` (`detour_direction`), ป้องกันผูก `BOTH` ซ้ำกับทิศทางเดี่ยวใน `(event_id, detour_id)` เดียวกัน, ป้องกันทางเลี่ยงวันเวย์ถูกเลือกเป็น `TWO_WAY`, และรองรับช่วงน้ำท่วมเดิมที่เป็น `UNKNOWN` ให้บันทึก `RECOMMENDED` ได้
  2. **Edge Function `hdms-api`:** รองรับ `BOTH`/`TWO_WAY` ใน `replaceEventDetourLinksAction`, แนบ `eventDetourLinks`, `eventSegments` และ `floodEvents` ใน `getSystemDataAction` และ `getPublicSystemDataAction` (โดยกรองเฉพาะรายการ active และตัด `WITHDRAWN`/`UNAVAILABLE`/Draft ออก 100% ในฝั่งประชาชน), และช่วยผูก link เริ่มต้นเมื่อสร้างทางเลี่ยงใหม่จากหน้าจัดการแผนที่
  3. **Admin Link Modal (`EventDetourLinkModal.tsx`):** ลดตัวเลือกสถานะเหลือ `"ใช้งาน"` (ค่าเริ่มต้น) / `"ไม่ใช้งาน"`, เพิ่มตัวเลือก `๒ ทิศทาง` และดึงค่าเริ่มต้นทิศทางจากข้อมูลน้ำท่วมกับทางเลี่ยงที่บันทึกไว้จริง, แสดงช่วง `กม.เริ่มต้น - กม.สิ้นสุด` ในตัวเลือกเหตุการณ์ทั้ง 2 โหมด, และสั่ง `onDataRefresh()` ทันทีหลังบันทึกสำเร็จ
  4. **หน้ารายละเอียดทุกจุด + ส่งออก + รายงาน (Admin & Citizen + Map):** รวมศูนย์ตัวช่วย `getLinkedDetoursForFlood` และ `getLinkedEventsForDetour` ใน `lib/event-detour-links.ts` (แสดงผลตามแนวทาง A+B ทั้ง `RECOMMENDED` และ `PENDING` พร้อม fallback กับ `flood_id_ref`) เชื่อมเข้า `IncidentRegistryTab`, `DetourManagementTab` (รวมส่งออก CSV `handleExportCSV`), `OfficialReportDispatchModal` (แบบรายงานเสนอผู้ว่าฯ), `app/page.tsx` และ `LongdoGisMap.tsx`
  5. **Playwright config (`playwright.config.ts`):** จำกัด `workers: 2` บน Windows local (ไม่จำกัดบน Linux CI) เพื่อป้องกันปัญหาเปิด 6 Chrome พร้อมกันจน timeout 30s
- **ตรวจแล้ว:** `npm run check:deploy` (`eslint` 0 warnings, `tsc --noEmit` 0 errors, `node scripts/build-pages.mjs` 6/6 static pages), Edge Function TypeScript transpile (0 diagnostics), และ Playwright `event-detour-links-admin.spec.ts` + `smoke.spec.ts` (14/14 Desktop + Mobile) พร้อม regression E2E บน CI
- **ลำดับ Deploy & ย้อนกลับ:** 1) รัน SQL `20261118000100_event_detour_both_directions.sql` → 2) Deploy Edge Function `hdms-api` → 3) Deploy เว็บ (GitHub Pages); ย้อนกลับเว็บด้วย `git revert`, ย้อน Edge เป็น v19 และย้อน SQL ตามคอมเมนต์หัว migration

### [UPDATE-110] 2026-11-18 ลดขั้นตอนซ้ำใน GitHub Actions CI/Deploy (`ci.yml`, `deploy.yml`) และกำหนดแนวทาง E2E ในเครื่องเฉพาะส่วนที่แก้
- **ไฟล์:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `docs/PLAYBOOKS.md`, `docs/CHANGELOG.md`
- **การแก้ไข:**
  1. ปรับ `.github/workflows/ci.yml` และ `.github/workflows/deploy.yml` ให้ตัดรอบ `npm run build` (server mode) + `npm run test:e2e` รอบแรกออก เหลือเฉพาะ `lint` → `typecheck` → `build:pages` (`BASE_PATH=/hdms_pn`) → `test:e2e` (`PLAYWRIGHT_STATIC=1`) รอบเดียว (เดิมใน run `44228006155` รอบ server ใช้ `14s + 84s = 98s` ซ้ำซ้อนกับรอบ static export `12s + 80s`; หลังปรับใน PR #40 run `44230289840` เหลือเวลารวม `230s` ลดลง `94s`)
  2. บันทึกแนวทางรัน E2E ในเครื่องแบบประหยัดเวลาใน `docs/PLAYBOOKS.md` (`PLAYWRIGHT_STATIC=1` เฉพาะไฟล์ที่เกี่ยวกับงาน + `smoke.spec.ts` แบบขนาน)
- **ตรวจแล้ว:** `npm run check:deploy`, `smoke.spec.ts` (`8 passed` ใน `25.9s` แบบขนานบน `PLAYWRIGHT_STATIC=1`) และ GitHub Actions `CI` (`run 44230289840` ผ่าน)
- **ย้อนกลับ:** revert commit นี้ใน GitHub เพื่อคืนรอบ server-mode E2E

### [UPDATE-108] 2026-11-18 ยกระดับการดึงพื้นที่และคำนวณทางเลี่ยงแบบ Hybrid (Google Maps Platform Tier 1 + Hardened OSRM/Local)
- **ไฟล์:** `supabase/functions/hdms-api/index.ts`, `lib/hdms-api.ts`, `app/actions/doh-actions.ts`, `lib/area-lookup.ts`, `lib/gis-data.ts`, `lib/gis-utils.ts`, `lib/detour-navigation.ts`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `tests/e2e/hybrid-google-maps.spec.ts` (ใหม่), `docs/*`
- **การแก้ไข:**
  1. เพิ่ม read-only proxy ใน Edge Function `hdms-api`: `reverseGeocodeGoogleAction` (Geocoding API v4 `languageCode=th&regionCode=TH`) และ `computeGoogleDetourRouteAction` (Routes API v2 `computeRoutes` พร้อม `via: true` waypoints และ `X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1`) โดยไม่ฝัง `GOOGLE_MAPS_API_KEY` ในฝั่งเบราว์เซอร์ และคืน `{ configured: false, available: false }` เมื่อยังไม่ตั้งค่าคีย์
  2. อัปเกรด `lib/area-lookup.ts` และ `lib/gis-data.ts`: จัดลำดับ Google Geocoding proxy → Longdo → Nominatim → local, ลด `NEARBY_REUSE_METERS` จาก 150 ม. เป็น 35 ม. พร้อมกันข้ามเขตอำเภอ/ตำบล, เพิ่ม single-flight initial probe + circuit breaker 5 นาทีเมื่อยังไม่ตั้งคีย์, ตัดป้ายเทศบาลที่ไม่ใช่ชื่อตำบลจริง (`NON_TAMBON_TOWN_LABELS` เช่น `town: "ปัตตานี"`, `"ยะหริ่ง"`), ปรับขอบเขตสี่เหลี่ยมใน อ.เมืองปัตตานี ไม่ให้ซ้อนกันและขยายรูปหลายเหลี่ยม อ.เมืองปัตตานี / อ.หนองจิก ให้ครอบคลุมตำบลจริงครบทั้ง 22 ตำบลอ้างอิง
  3. อัปเกรด `lib/gis-utils.ts` และ `lib/detour-navigation.ts`: เพิ่ม `decodeGooglePolyline`, `computeGoogleRouteHybrid` และ `selectRouteCornerWaypoints` (Douglas-Peucker คงลำดับต้นทาง→ปลายทาง สำหรับทั้ง `sampleWaypointsForGoogleMaps` ≤ 8 จุด และ `generateAutoDetourAdvice`); ปรับ `findNearestHighwayFromLayers` ให้ใช้ `extractFeaturesFromGeoJson` อ่าน `feature.properties.route_no`/`route_name` (รองรับโครงสร้าง single-layer `MAIN_HIGHWAY` ของ Production), วัดระยะตั้งฉากจริง (`pointToSegmentDistanceMeters`) ที่ระยะตัด 35 ม. และคงรหัสทางหลวงชนบท (`ปน.`, `ยล.`, `นธ.`, `สข.`) ไม่เปลี่ยนเป็น `ทล.`; ปรับ OSRM fallback ให้รองรับ `end of road` (สามแยกตัว T), `continue`, `off ramp`, `new name` และคงช่วง `depart` ของ leg กลางเส้นทาง (`>= 35` ม.) โดยไม่ตัดขั้นตอนเลี้ยวสั้น < 30 ม.
  4. เชื่อม `MapManagementTab.tsx` และ `DetourManagementTab.tsx` ให้ส่งจุดดัด `draftWaypoints` / `draftReverseWaypoints` เข้า `generateAutoDetourAdvice` และใช้ `computeGoogleRouteHybrid` เป็น Tier 1 ใน `triggerDualRoadSnapping` (คงตรวจทับซ้อนจุดปิดจราจร + fallback OSRM ทันที)
- **ตรวจแล้ว:** `npm run check:deploy` (`npm run lint` 0 warnings, `npm run typecheck` 0 errors, `npm run build:pages` 6/6 static pages); TypeScript transpile check บน Edge `hdms-api` (0 diagnostics); ตรวจศูนย์ลับใน static bundle (`out/_next/static/**/*.js` ไม่พบ key/secret); Playwright E2E 7 ชุด (`hybrid-google-maps`, `detour-navigation`, `admin-menus`, `admin-dialog-keyboard`, `public-route-sheet`, `public-fallback-contract`, `smoke` บน `PLAYWRIGHT_STATIC=1`) ผ่าน **58 passed, 0 failed** (20 skipped ตามเงื่อนไข desktop/mobile viewport)
- **ย้อนกลับ:** revert commit/PR บน GitHub และ deploy Edge Function v19 เดิม (ไม่เปลี่ยนแปลง schema ฐานข้อมูล; เมื่อยังไม่ตั้ง `GOOGLE_MAPS_API_KEY` ระบบสลับใช้ Longdo/Nominatim/Hardened OSRM โดยอัตโนมัติ)

### [UPDATE-107] 2026-11-18 เพิ่มหน้าต่าง Admin จัดการความสัมพันธ์เหตุการณ์ ↔ ทางเลี่ยง (Many-to-Many) ผ่าน Atomic API
- **ไฟล์:** `components/admin/EventDetourLinkModal.tsx` (ใหม่), `lib/event-detour-links.ts`, `db/default-data.ts`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `tests/e2e/event-detour-links-admin.spec.ts` (ใหม่), `docs/*`
- **การแก้ไข:**
  1. สร้าง `EventDetourLinkModal` รองรับ 2 มุมมอง: **จัดการตามเหตุการณ์ (1 เหตุการณ์ → หลายทางเลี่ยง)** และ **ผูกตามทางเลี่ยง (1 ทางเลี่ยง → หลายเหตุการณ์)** พร้อมกำหนดทิศทางเหตุการณ์/ทางเลี่ยง, จัดลำดับ, ตั้งสถานะคำแนะนำ (`PENDING`/`RECOMMENDED`/`UNAVAILABLE`/`WITHDRAWN`), ตรวจเงื่อนไข `RECOMMENDED` ล่วงหน้า และบันทึกผ่าน `replaceEventDetourLinksAction` ด้วย `expectedVersion` + `operationId` แล้วเรียก `getEventDetourLinksAction` โหลดกลับมายืนยันจากฐานข้อมูลจริงทันที
  2. เพิ่มปุ่ม `"จัดการทางเลี่ยงเชื่อมโยง"` บนการ์ดเหตุการณ์ใน `IncidentRegistryTab.tsx` และปุ่ม `"จัดการความสัมพันธ์ (หลายจุด)"` / `"ผูกหลายเหตุการณ์"` ใน `DetourManagementTab.tsx`
  3. คงฟอร์มเดิม (`upsertRouteAction` / `flood_id_ref`) แยกต่างหากพร้อมข้อความแจ้งเตือน เพื่อไม่ให้ฟอร์ม legacy เขียนทับความสัมพันธ์หลายเหตุการณ์ และยังไม่เปิด cutover หน้าประชาชน
- **ตรวจแล้ว:** `npm run lint` (0 warnings), `npm run typecheck` (0 errors), `npm run build:pages` (6/6 static pages), Playwright E2E `event-detour-links-admin.spec.ts` และ `admin-dialog-keyboard.spec.ts` บน `desktop-chromium` + `mobile-chromium` (`PLAYWRIGHT_STATIC=1`) ผ่านครบ; ตรวจ Production DB แบบอ่านอย่างเดียวพบ `trg_doh_sync_flood_event_segment` ทำงานแล้ว
- **ย้อนกลับ:** revert commit นี้ได้ทันที (ไม่เปลี่ยนฐานข้อมูลหรือ Edge Function; หน้าประชาชนยังคงใช้ legacy `flood_id_ref`)

### [UPDATE-106b] 2026-11-18 Sync future Flood saves into Event–Detour foundation (apply Production แล้ว)
- **สาเหตุ:** migration แรก backfill เฉพาะข้อมูลเดิม; Edge legacy `upsertRouteAction` สร้าง/แก้ `doh_flood_routes.direction_meta.eventId` ได้ แต่ไม่ได้เพิ่มแถวใน `doh_flood_events` และ `doh_event_segments`. หากทำ Admin editor ก่อนจะแก้ relationship ของ event ที่เพิ่งสร้างไม่ได้ (`EVENT_NOT_FOUND`).
- **การแก้ไขที่เตรียม:** เพิ่ม migration `20261117192000_sync_flood_event_segments.sql` เป็น `AFTER INSERT OR UPDATE OF direction_meta` trigger. Trigger สร้าง event master เมื่อจำเป็น, คงลำดับเดิมเมื่อแก้ segment เดิม, lock event row ก่อนจัดลำดับ segment ใหม่ และไม่แตะ legacy fields.
- **ยังไม่ apply/deploy:** ต้องให้ PR ผ่านก่อน apply Production แล้วตรวจว่า insert/update flood route สร้างหรืออัปเดต membership ได้ใน transaction ที่ rollback. ระหว่างนี้ห้ามเปิด Admin editor ใหม่.
- **ย้อนกลับ:** drop trigger และ function ตามหัว migration; schema/link ที่มีอยู่และ legacy save path ยังทำงานเหมือนเดิม.

### [UPDATE-106] 2026-11-18 Deploy Edge compatibility API สำหรับ Event–Detour
- **ไฟล์/ลำดับเผยแพร่:** Production migration `20261117135032_event_detour_relationships.sql` → Edge `hdms-api` v19 → เว็บจาก commit `2b5ca1c` (PR #34).
- **การเปลี่ยนแปลง:** deploy action `getEventDetourLinksAction` และ `replaceEventDetourLinksAction`. Edge ตรวจ input ทั้งชนิด, ขนาด, ทิศทาง, ลำดับ และ review version; PostgreSQL RPC ยังคงเป็นจุดเดียวที่รับประกันธุรกรรม, optimistic version และ idempotency.
- **ตรวจแล้ว:** CI run `44154481908` และ Deploy Pages run `44154482123` สำเร็จ; หน้า Pages ตอบ HTTP 200; Edge v19 เป็น `ACTIVE`; read smoke test ผ่าน HTTP 200 (`eventId`, `version`, `links` ถูกต้อง) และ Supabase function log บันทึก POST 200. ไม่ได้เรียก mutation บนข้อมูล Production.
- **ขอบเขต/ย้อนกลับ:** หน้าประชาชนและ Admin ยังใช้ legacy fields จึงไม่มีข้อมูลหายจากการ deploy นี้. ย้อน Edge ได้โดย deploy source v18 ก่อนหน้า; ย้อนเว็บด้วย `git revert 2b5ca1c`; ไม่ย้อน schema โดยอัตโนมัติ เพราะต้องประเมินข้อมูลที่สร้างผ่าน action ใหม่ก่อน.

### [IN PROGRESS] 2026-11-18 Apply Production foundation และเตรียม Edge compatibility API สำหรับ Event–Detour
- **ไฟล์:** `supabase/migrations/20261117135032_event_detour_relationships.sql` (apply แล้ว), `supabase/functions/hdms-api/index.ts`, `app/actions/doh-actions.ts`, `lib/event-detour-links.ts`, `docs/AI_HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`
- **ฐานข้อมูล Production:** เจ้าของอนุมัติ migration แล้ว; หลัง apply ตรวจ read-back ได้ 18 events, 18 segments, 13 links (12 `PENDING`, 1 `WITHDRAWN`, 0 `RECOMMENDED`) และไม่มี geometry revision ที่ผิดรูปแบบ. สิทธิ์ RPC ยังจำกัดให้ `service_role` เท่านั้น; `anon` และ `authenticated` เรียกไม่ได้.
- **ชั้น Edge:** action อ่าน/แทนที่รายการแบบ atomic (`getEventDetourLinksAction`, `replaceEventDetourLinksAction`) ถูก deploy เป็น v19 แล้ว; ยังไม่มีหน้า Admin/หน้า Public อ่าน schema ใหม่ จึงยังไม่เปลี่ยนข้อมูลหรือการแสดงผลที่ใช้งานจริง.
- **ย้อนกลับ:** ก่อน UI cutover สามารถ rollback schema ตามหัว migration (drop trigger/function/table/column ใหม่ในลำดับย้อนกลับ) โดยไม่ลบ `flood_id_ref` หรือ `detour_meta`; ส่วน source Edge/web revert commit นี้ได้. ห้าม rollback schema หากมีข้อมูลที่ถูกสร้างผ่าน editor รุ่นใหม่โดยไม่ export/ประเมินก่อน.

### [UPDATE-105] 2026-11-18 อัปเดตสถานะ Public Fallback (ปิด B-019), ซิงก์ docs/AI_HANDOFF.md และปิด KI-014
- **ไฟล์:** `docs/AI_HANDOFF.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`, `docs/CHANGELOG.md`
- **การแก้ไข:**
  1. ปิดรายการ B-019 ใน `docs/BACKLOG.md` และ KI-014 ใน `docs/KNOWN_ISSUES.md` หลัง PR #32 และ PR #33 (commit `866eb93`) ผ่าน CI run `44104409978` และ Deploy GitHub Pages run `44104409962` สำเร็จ
  2. อัปเดต `docs/AI_HANDOFF.md` ให้บันทึกแหล่งความจริงของ `origin/main` และ GitHub Pages ล่าสุดเป็น commit `866eb93` (HTTP 200) เพื่อให้ AI ทุกค่าย (Codex, Gemini, Claude) ซิงก์ฐานข้อมูลตรงกัน
  3. ปรับสถานะรายการ B-023 ใน `docs/AI_HANDOFF.md` ว่า DB migration และ data contract รวมเข้า `main` ผ่าน PR #32 แล้ว แต่ยังไม่ apply บน Production DB
- **ย้อนกลับ:** revert commit นี้ได้ทันที (เอกสารเท่านั้น ไม่แก้โค้ดระบบ, ฐานข้อมูล หรือ Edge Function)

### [UPDATE-104] 2026-11-17 ปรับสคริปต์ build:pages ให้เป็น Cross-Platform ผ่าน Node.js
- **ไฟล์:** `package.json`, `scripts/build-pages.mjs` (ใหม่), `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`, `docs/CHANGELOG.md`
- **การแก้ไข:**
  1. สร้าง `scripts/build-pages.mjs` รัน Next.js static export build (`NEXT_OUTPUT=export`) ผ่าน `process.execPath` โดยตรง พร้อมดึงค่า fallback จาก `.github/hdms-public.json` เมื่อรันในเครื่องที่ไม่ได้ตั้งค่า environment variables
  2. ปรับ `package.json` สคริปต์ `build:pages` จาก `NEXT_OUTPUT=export next build` เป็น `node scripts/build-pages.mjs` ทำให้คำสั่ง `npm run build:pages` และ `npm run check:deploy` รันได้สมบูรณ์ทั้งบน Windows (CMD/PowerShell) และ Linux/CI โดยไม่ต้องพึ่ง external dependencies
- **ย้อนกลับ:** revert commit นี้ได้ทันที (ไม่แก้ SQL, Edge Function หรือข้อมูลจริง)

### [IN PROGRESS] 2026-11-17 รักษาขอบเขตข้อมูล Public เมื่อ Edge ใช้งานไม่ได้
- **ไฟล์:** `lib/hdms-api.ts`, `app/actions/doh-actions.ts`, `tests/e2e/public-fallback-contract.spec.ts`, `docs/*`
- **สาเหตุ:** direct fallback ใน browser และ compatibility fallback ของ `getPublicSystemDataAction()` เคยย้อนกลับไป RPC/payload ฝั่ง Admin ได้ เมื่อ Edge ล่มหรือเป็นรุ่นเก่า ซึ่งขัดกับ public wrapper ที่ตั้งใจกรอง Draft/inactive ไว้แล้ว.
- **การแก้ไข:** fallback แบบ network เรียกได้เฉพาะ `doh_get_public_system_data_display_rpc()`; ถ้า RPC สาธารณะใช้ไม่ได้ให้ Query แสดง Error/Retry แทน และตัด fallback จาก public action ไป `getSystemDataAction()` ออก.
- **ตรวจแล้ว:** Playwright `public-fallback-contract.spec.ts` ผ่าน desktop และ mobile (4/4): เมื่อ abort Edge request มีเฉพาะ request ไป public RPC และไม่มี request ไป RPC ฝั่ง Admin; เมื่อ Edge รุ่นเก่าตอบ `Unknown operation` ระบบ retry เฉพาะ public action และแสดง Error/Retry โดยไม่เรียก full Admin action.
- **CI stability:** หลัง merge ครั้งแรก CI พบ assertion Error/Retry flaky เพราะ React Query backoff ใช้เวลามากกว่า default 5 วินาทีบน runner; เพิ่ม timeout test เป็น 15 วินาทีตามพฤติกรรม retry จริง และรัน regression ซ้ำผ่าน 4/4 ในเครื่อง.
- **สถานะ:** ปิดแล้ว (2026-11-17) — รวมเข้า main ผ่าน PR #32 และ PR #33 (commit `866eb93`), CI run `44104409978` และ Deploy Pages run `44104409962` สำเร็จแล้ว (ดู [UPDATE-105]).

### [IN PROGRESS] 2026-11-17 Event–Detour many-to-many
- เจ้าของอนุมัติ Phase 2 และการพัฒนาความสัมพันธ์กลางแล้ว; branch `codex/event-detour-links` ซิงก์กับ `origin/main` `4ab9737`.
- เพิ่ม `lib/event-detour-links.ts` เป็นสัญญาข้อมูลร่วมที่ parse input runtime อย่างปลอดภัย แยกทิศทางเหตุการณ์จากทิศทาง Geometry และตรวจลำดับ/ความสัมพันธ์ซ้ำ/เงื่อนไขก่อนแนะนำ.
- สร้าง migration ใหม่ `supabase/migrations/20261117135032_event_detour_relationships.sql`: event master, segment membership, many-to-many links, operation history, optimistic version/idempotency RPC, conservative one-time legacy backfill, และ geometry revision ที่ลดสถานะ `RECOMMENDED` เป็น `PENDING` เมื่อแนวทางเลี่ยงเปลี่ยน.
- ตรวจบน PostgreSQL 16 แยกแล้ว: apply migration และ rerun ผ่าน; backfill ไม่สร้างซ้ำ, full replacement เป็น atomic, retry ด้วย operation ID เดิมคืนผลเดิม, version conflict/ลำดับขาด/direction mismatch/revision เก่าถูกปฏิเสธ, และ `service_role` เรียก RPC ได้ ขณะที่ `anon`/`authenticated` ไม่มีสิทธิ์ execute. การแก้ `reverse_waypoints_json` เพิ่ม `geometry_revision` และลด `RECOMMENDED` เป็น `PENDING` แล้ว.
- ยังไม่ apply migration บน Production, ยังไม่มี Edge action/reader ใหม่, UI, public payload cutover หรือ deploy; ระบบจริงยังใช้ `flood_id_ref` และ `detour_meta.event_orders` เดิมทั้งหมด.

### [UPDATE-103] 2026-11-17 เอกสารส่งต่องานร่วม (AI Handoff) และปรับไฟล์กติกาตัวชี้ให้ตรงกับ AGENTS.md
- **ไฟล์:** `docs/AI_HANDOFF.md` (ใหม่), `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `SUPPLEMENTAL_RULES.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`, `docs/CHANGELOG.md`
- **การแก้ไข:**
  1. เพิ่ม `docs/AI_HANDOFF.md` เป็นสถานะกลางของ `origin/main` ล่าสุด (`361f7da`): สรุปสถานะ deploy, สิ่งที่ห้ามทำย้อนกลับ (รวมถึง `lib/traffic-presentation.ts` และ Container Queries ในหน้าแอดมิน), งานค้างที่มีหลักฐาน และขั้นตอนส่งงานร่วมกันระหว่าง AI ทุกค่าย
  2. ปรับ `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `CLAUDE.md` และหัวไฟล์ `SUPPLEMENTAL_RULES.md` ให้ชี้ไปที่ `AGENTS.md` และ `docs/AI_HANDOFF.md` โดยตรง ยกเลิกคำสั่งเก่าที่บังคับอ่าน `SUPPLEMENTAL_RULES.md` ทั้งไฟล์หรืออ้างอิง Server Actions / Better Auth
- **ย้อนกลับ:** revert commit นี้ได้ทันที (ไม่เปลี่ยนโค้ดระบบ, ฐานข้อมูล, Edge Function หรือข้อมูลจริง)

### [UPDATE-102] 2026-11-17 ปรับปรุงการ์ดทะเบียนเหตุการณ์แอดมิน รวมศูนย์สถานะจราจร และแก้บั๊กการยืนยันสถานะ
- **ไฟล์:** `lib/traffic-presentation.ts`, `lib/flood-event-schema.ts`, `app/page.tsx`, `components/map/LongdoGisMap.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `app/globals.css`, `tests/e2e/admin-menus.spec.ts`, `docs/UI_CONTRACT.md`, `docs/CHANGELOG.md`
- **การแก้ไข:**
  1. **รวมศูนย์สถานะจราจร (R1):** สร้าง `lib/traffic-presentation.ts` (`getTrafficPresentation`, `TRAFFIC_STATUS_OPTIONS`, `formatRelativeUpdateTime`) ใช้ร่วมกันทั้งหน้าประชาชน แผนที่ (`LongdoGisMap.tsx`) และแอดมิน (`IncidentRegistryTab.tsx`, `MapManagementTab.tsx`)
  2. **แก้บั๊ก "รอตรวจสอบสถานะ" และเพิ่มตรวจข้อมูลไม่ครบถ้วน:**
     - แก้ไข `IncidentRegistryTab.tsx` (เรียก `getDetailedTrafficPresentation` ผิดตำแหน่งอาร์กิวเมนต์), `handleSubmitQuickUpdate` (อัปเดต `direction_meta.trafficStatusDetail` และ `status_verified: true`), `handleSplitSegment`, และ `mapTrafficStatusToDetail` (แก้กรณี `LIGHT_VEHICLES_ONLY` เคยถูกแมปเป็น `NO_SMALL_VEHICLES`)
     - นำตัวเลือก `"รอตรวจสอบสถานะ"` ออกจาก dropdown ของแอดมิน (บันทึกแล้วถือว่าตรวจสอบแล้ว) และเพิ่ม `getFloodCompletenessIssues()` เพื่อแสดงป้ายแจ้งเตือน `"⚠️ ข้อมูลไม่ครบ"` เฉพาะเมื่อมีช่องข้อมูลที่ยังไม่กรอก/ไม่ระบุจริง
  3. **ซ่อนรหัสเหตุการณ์และขนาดภาพ:** ซ่อน badge `FL-...` และช่องกรอกรหัสเหตุการณ์ออกจาก UI ปกติ (คง `eventId`/`eventCode` เบื้องหลัง), ลบข้อความ `≤300KB` / ขนาดไฟล์ / เปอร์เซ็นต์บีบอัดออก และเปลี่ยนคำ `"ส่วนผิวทาง"` / `"ส่วนของถนนที่ได้รับผลกระทบ"` เป็น `"เส้นทางที่ได้รับผลกระทบ"`
  4. **ไอคอนและ Responsive Layout (ทางเลือก A):** ปรับไอคอนเหตุการณ์น้ำท่วมใน `IncidentRegistryTab.tsx` ให้ใช้คลื่นสีขาวบนพื้นสีเส้นน้ำท่วมตรงกับแผนที่จริง, เพิ่มเวลาอัปเดตล่าสุดกับผู้รายงาน, และใช้ CSS Container Query (`.doh-incident-container` / `.doh-incident-segment` / `.doh-incident-actions`) ใน `app/globals.css` ให้การ์ดเรียงบน-ล่างและปุ่มห่อบรรทัดได้อัตโนมัติทุกขนาดพาเนลที่ปรับย่อ-ขยายโดยไม่ทับข้อความหรือล้นขอบ
- **ย้อนกลับ:** revert commit นี้ได้ทันที (ไม่แก้ SQL, Edge Function หรือข้อมูลจริงในฐานข้อมูล)

### [UPDATE-101] 2026-11-17 แก้ Escape ของหน้าต่างสถานะ Admin
- **ไฟล์:** `components/ui/use-modal-accessibility.ts`.
- **สาเหตุ:** Escape รับเฉพาะเมื่อเหตุการณ์ bubble ถึง dialog จึงปิดหน้าต่างสถานะไม่สม่ำเสมอในการทดสอบและบางตำแหน่ง focus.
- **การแก้ไข:** ดัก Escape ระดับหน้าต่างแบบ capture เฉพาะขณะที่ modal เปิด และคง Tab focus trap กับการคืน focus เดิมไว้.
- **ตรวจแล้ว:** E2E กรณีเปิด/ปิดสถานะทางเลี่ยง และชุด keyboard modal ทั้ง desktop/mobile ผ่าน.


---

> ประวัติเก่ากว่า [UPDATE-100] ถูกย้ายไปเก็บที่ docs/CHANGELOG_ARCHIVE.md เพื่อลดขนาดไฟล์และประหยัดโควตาในการอ่าน
