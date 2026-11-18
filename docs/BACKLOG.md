# BACKLOG.md — ทะเบียนข้อค้นพบและข้อเสนอ

กติกา: AI ทุกตัวต้องลงรายการที่พบแต่ยังไม่แก้ที่นี่ (ID ต่อเนื่อง `B-0xx`) แต่ละรายการมี หลักฐาน · ผลกระทบ · ทางเลือก · คำแนะนำ · สถานะ (`เปิด` / `กำลังทำ` / `ปิด (วันที่, ลิงก์ CHANGELOG)` / `ยอมรับความเสี่ยง (ใครอนุมัติ, วันที่)`)
ก่อนเริ่มงานให้ค้นรายการที่เกี่ยวข้อง และห้ามตัดสินใจแทนเจ้าของในรายการที่ต้อง "ถามก่อน"

| ID | ระดับ | เรื่อง | สถานะ |
|---|---|---|---|
| B-001 | **วิกฤต** | Edge Function เขียนข้อมูลด้วย service role โดยไม่ตรวจสิทธิ์ผู้เรียก | ยอมรับความเสี่ยง (เจ้าของระบบ, 2026-11-16) |
| B-002 | สูง | `.mcp.json` ให้ AI เข้าถึง Supabase production พร้อมสิทธิ์ฐานข้อมูล ขัด ADR-001 | เปิด (ต้องตัดสินใจ) |
| B-003 | สูง | Deploy ไม่รอ CI/e2e และเจ้าของ push ตรงเข้า main | เปิด (ต้องตัดสินใจ) |
| B-004 | กลาง | หน้าแอดมินยังโหลด GeoJSON ทางหลวงเต็มความละเอียดทุกครั้ง | ปิด (2026-11-10, ดู UPDATE-063) |
| B-005 | กลาง | ไฟล์ใหญ่เกิน: `GisDataImportTab.tsx` (~2k บรรทัด), `MapManagementTab.tsx` (ลดจาก 3,297 → 2,460), `LongdoGisMap.tsx` (ลดจาก 2,713 → 1,846) | ปิดบางส่วน (2026-11-18, ดู UPDATE-116: แยก popups/overlay/section โมดูลย่อยแล้ว; เหลือ telemetry เครื่องจริง) |
| B-006 | กลาง | `SUPPLEMENTAL_RULES.md` ~120 KB ถูกบังคับให้อ่านทุกเซสชัน | ปิดบางส่วน (ยกเลิกบังคับใน AGENTS.md, GEMINI.md, .cursorrules, .windsurfrules และหัวไฟล์แล้วใน UPDATE-103; เหลือย้ายไฟล์เก่า) |
| B-007 | ต่ำ | โค้ดค้างที่ไม่อยู่ใน path จริง (better-auth, supabase-server, routing-service, Docker Postgres) | ปิด (ลบไฟล์ค้างแล้วใน UPDATE-065) |
| B-008 | กลาง | พึ่ง OSRM สาธารณะ (`router.project-osrm.org`) ไม่มี SLA | กำลังทำ (เพิ่ม Google Routes API proxy เป็น Tier 1 ก่อน OSRM; รอ deploy Edge + ตั้ง secret `GOOGLE_MAPS_API_KEY`) |
| B-009 | ต่ำ | `npm run check` ไม่ได้ build แบบ Pages (ที่ใช้ deploy จริง) | ปิด (2026-11-16, UPDATE-095) |
| B-010 | กลาง | อ่านข้อมูลสาธารณะทุกครั้งโดน DB (ไม่มีแคช) ช่วงคนเข้าเยอะ | ปิด (เพิ่ม GET & Cache-Control ใน UPDATE-065) |
| B-011 | กลาง | e2e ยังไม่ครอบคลุมฟีเจอร์ใหม่ (ตัวแก้ไขเส้นอิสระ, แถบสรุป, bottom sheet) | ปิดบางส่วน (เพิ่ม detour-navigation.spec.ts 12 ข้อใน UPDATE-066) |
| B-012 | ต่ำ | `reactStrictMode: false` ซ่อนบั๊ก cleanup ของ effect | ปิด (2026-11-16, UPDATE-096) |
| B-013 | ต่ำ | ข้อจำกัด Google Maps Universal URL Waypoints ไม่เกิน 8-9 จุด | ปิดบางส่วน (อัปเกรด `sampleWaypointsForGoogleMaps` เป็นคัดจุดหักเลี้ยว Douglas-Peucker ≤ 8 จุดตามลำดับเส้นทางจริง) |
| B-014 | **วิกฤต** | Edge Function Production v9 ไม่ส่งค่าฝั่งถนน/ช่องจราจร/ทิศทางไปยัง DB (ตรวจอ่านอย่างเดียว 2026-11-11) | เปิด: แก้ source แล้ว ต้อง Security Review + deploy และทดสอบ staging |
| B-015 | สูง | Phase 6 ยังไม่ผ่าน Build/E2E/CRUD integration บน staging เพราะ dependencies ในสภาพแวดล้อมทดสอบไม่ครบ | ปิด (2026-11-11, ดู UPDATE-070: Playwright E2E 46 passed, lint 0 warnings, typecheck 0 errors, build:pages 6/6 ผ่านสมบูรณ์) |
| B-016 | กลาง | ตราครุฑทางการสำหรับป้ายทางหลวงยังไม่มี Asset ที่ผ่านอนุมัติ | เปิด |
| B-017 | ต่ำ | รัน Playwright ในเครื่องโดยไม่ build พร้อม public config ทำให้หน้า public ค้าง Loading และ test ที่ mock Edge Function ล้ม | ปิด (2026-11-12, UPDATE-074) |
| B-018 | กลาง | Modal รายละเอียด/แก้ไขใน Admin ยังไม่ใช้ focus trap และ Escape กลางครบทุกตัว | ปิด (2026-11-16, UPDATE-093) |
| B-019 | สูง | Public API ส่ง Draft/inactive payload แม้หน้าเว็บจะกรองไม่แสดง | ปิด (2026-11-17, ดู PR #32, PR #33 และ Deploy Pages 44104409962) |
| B-020 | กลาง | ย้ายรูปหลักฐานและรูปโครงการไป Google Drive พร้อมส่งสำเนารายงานไป Sheets | ปิด (2026-11-16, ดู CHANGELOG: Google Drive media และ Google Sheets reporting) |
| B-021 | กลาง | ตั้ง schedule อิสระสำหรับคิวส่ง Drive/Sheets และหน้าตรวจงานที่ `failed` | ปิด (2026-11-16) — Cron, Edge v17 และหน้า Admin deploy แล้ว; Production read + live browser ผ่าน |
| B-022 | สูง | Apps Script Web App ที่ใช้งานจริงอาจยังเป็น source เวอร์ชันก่อน idempotency/stale-write guard | กำลังทำ (Web App ยืนยันแล้ว; เหลือเปลี่ยน Edge secret URL) |
| B-023 | สูง | Cutover ความสัมพันธ์ Flood Event ↔ Detour หลายต่อหลายจาก legacy field | กำลังทำ (UI Cutover + Migration 20261118000100 + Edge + E2E ผ่านแล้ว; รอ Apply SQL → Deploy Edge → Deploy เว็บ) |
| B-024 | กลาง | Event–Detour operation ledger ไม่มีนโยบาย retention/archival | เปิด |

## B-022 [สูง] Publish Apps Script source สำหรับ outbox idempotency
- **หลักฐาน:** Web App URL ใหม่ตอบ JSON, ปฏิเสธคำขอไม่มี secret, และการเรียก `uploadMedia` ซ้ำด้วย `operationId` เดียวกันคืน Drive `mediaId` เดิม; ลบไฟล์ QA หลังทดสอบสำเร็จ. Edge `hdms-api` v18 และ migration atomic promotion อยู่ Production แล้ว.
- **ผลกระทบ:** หาก network timeout หลัง Apps Script สร้างรูปสำเร็จ worker อาจ retry แล้วเกิดไฟล์ Drive ซ้ำได้; REPORT เก่าจากคิวที่ช้าอาจเขียนทับข้อมูลที่ใหม่กว่าใน Google Sheets.
- **ทางเลือก:** A) ตั้ง `APPS_SCRIPT_WEB_APP_URL` ใน Supabase Edge secrets ให้เป็น URL ใหม่ แล้ว deploy Edge v18 ซ้ำ · B) ใช้ URL เดิมต่อชั่วคราว. 
- **คำแนะนำ:** A เพราะ URL ใหม่พิสูจน์ idempotency ของ MEDIA แล้ว.
- **สถานะ:** กำลังทำ (2026-11-16) — การเชื่อมต่อ Supabase ในเซสชันนี้ไม่มีเครื่องมือเปลี่ยน Edge secret; ต้องตั้งค่าหนึ่งครั้งใน Dashboard หรือ Supabase CLI ที่ authenticated.

## B-023 [สูง] Cutover ความสัมพันธ์ Flood Event ↔ Detour หลายต่อหลาย
- **หลักฐาน:** โค้ดจริงยังอ้าง `flood_id_ref` และ `detour_meta.event_orders` ใน `app/page.tsx`, `LongdoGisMap.tsx`, `DetourManagementTab.tsx`, รายงาน และ export; การเรียงลำดับเดิมบันทึกทีละรายการจึงมีความเสี่ยง partial write. Migration `20261117135032_event_detour_relationships.sql` ผ่าน PostgreSQL 16 แยก: backfill แบบครั้งเดียว, optimistic version, idempotency, rollback เมื่อ validation ล้ม, geometry revision (รวม `reverse_waypoints_json`) และ RLS/role grant. ตรวจ schema Production แบบอ่านอย่างเดียวแล้วว่าคอลัมน์/ชนิดข้อมูลที่ migration พึ่งพาตรงกับ `doh_flood_routes`/`doh_detour_routes` จริง.
- **ผลกระทบ:** หากสลับ reader หรือ UI ก่อนมี compatibility layer อาจทำให้ detour หายจากประชาชน/แอดมิน หรือสถานะแนะนำชี้ geometry ที่ถูกแก้แล้ว.
- **ทางเลือก:** A) ทำ Edge read wrapper + atomic write action + compatibility reader แล้วค่อยทำ UI และ public cutover; B) ย้าย UI ตรงไปใช้ schema ใหม่; C) คง legacy model ต่อไป.
- **คำแนะนำ:** A เพราะคง `flood_id_ref` เดิมไว้จนทดสอบ migration, Edge, public draft filtering, split event และ mobile/desktop regression ครบ.
- **สถานะ:** กำลังทำ (2026-11-18) — ใน `UPDATE-109` เพิ่ม migration `20261118000100_event_detour_both_directions.sql` (รองรับ `BOTH`/`TWO_WAY` + `UNKNOWN` segment compatibility), ปรับ Edge `hdms-api` ให้ส่ง `eventDetourLinks`/`eventSegments`/`floodEvents` (กรอง Draft/Withdrawn ออกจาก Public), ปรับ `EventDetourLinkModal` ให้มีเฉพาะสถานะ `"ใช้งาน"`/`"ไม่ใช้งาน"`, ทิศทาง `2 ทิศทาง` ตามค่าบันทึกจริง และแสดงช่วง `กม.เริ่มต้น - กม.สิ้นสุด` พร้อมเชื่อมหน้ารายละเอียดฝั่ง Admin (`IncidentRegistryTab`, `DetourManagementTab`), ประชาชน (`app/page.tsx`) และแผนที่ (`LongdoGisMap.tsx`) ครบแล้ว; เหลือ Apply SQL → Deploy Edge Function → Deploy เว็บขึ้น main และตรวจบน Production จริง.

## B-024 [กลาง] Event–Detour operation ledger ต้องมี retention/archival policy
- **หลักฐาน:** `doh_event_detour_operations` เก็บ request/before/result JSONB ทุกครั้งเพื่อ idempotency และ audit แต่ migration ยังไม่มีนโยบายเก็บรักษา/ย้ายออก. หากมีการจัดลำดับบ่อย ตารางและ index `created_at` จะโตไม่จำกัด.
- **ผลกระทบ:** ระยะยาวอาจเพิ่ม storage, backup time และต้นทุน query ทั้งที่ไม่เกี่ยวกับการใช้งานปัจจุบัน.
- **ทางเลือก:** A) ตั้ง retention ตามระยะเวลาที่หน่วยงานกำหนดแล้ว archive เป็นไฟล์/ตาราง audit; B) partition รายเดือน; C) เก็บถาวรทั้งหมด.
- **คำแนะนำ:** A โดยกำหนดระยะเวลาที่ตรวจสอบย้อนหลังได้ก่อน และทำ worker/migration แยกพร้อม dry-run count; ห้ามลบ audit history อัตโนมัติโดยไม่มีนโยบายเจ้าของ.
- **สถานะ:** เปิด — ไม่ขัดขวาง database foundation หรือ public cutover ระยะแรก.

## B-018 [กลาง] Keyboard focus ของ Admin dialog — ปิดแล้ว
- **หลักฐานก่อนปิด:** `useModalAccessibility` ครอบ dialog ใน Incident Registry, Detour Management, GIS route dialogs, Animated status และ Official report. ค้น `role="dialog"` ใน `components/admin`, `components/ui`, `app/admin` แล้วไม่พบ dialog ที่อยู่นอก hook นี้.
- **การตรวจ:** `npm run test:e2e:local -- tests/e2e/admin-dialog-keyboard.spec.ts tests/e2e/gis-dialog-keyboard.spec.ts tests/e2e/admin-shared-dialog-keyboard.spec.ts --project=desktop-chromium --project=mobile-chromium --workers=1` ผ่าน 5 / ข้าม 5 (desktop-only workflow ตาม test guard) โดยยืนยัน Escape, Tab wrap และคืน focus.
- **สถานะ:** ปิด (2026-11-16, UPDATE-093).

## B-005 [กลาง] ประสิทธิภาพตัวแก้แนวเส้น — ตรวจ stress test เพิ่ม
- **หลักฐาน:** Playwright headless สร้าง Highway LineString 1,200 จุดใน Admin freeform editor: canvas overlay คงที่ `1`, handle ถูกจำกัดที่ `401` (400 จุดใน viewport + endpoint), midpoint handle ไม่ถูกสร้างเมื่อเกินเพดาน. ลากหนึ่ง handle 20 ช่วงใช้เวลารวม 645 ms และจำนวน canvas/handle คงเดิมหลังลาก.
- **ผลกระทบ:** ไม่พบการสร้าง canvas/layer ซ้ำจากการลากจุดตามอาการ RAM พุ่งเดิม. ผลนี้เป็น synthetic lab test ไม่ใช่การวัด RAM/CPU หรือ field performance ของเครื่องเจ้าหน้าที่.
- **ทางเลือก:** A) เก็บ telemetry ใน browser/เครื่องจริงก่อนปรับเพิ่ม · B) ลด `MAX_VERTEX_HANDLES` ต่ำกว่า 400 สำหรับเครื่องสเปกต่ำ · C) ย้าย geometry simplification ไป Web Worker.
- **คำแนะนำ:** A ก่อน เพราะ current guard ทำงานแล้ว และการลด handle อาจทำให้แก้เส้นยากโดยยังไม่มีหลักฐานว่าเครื่องจริงเกินเพดาน.
- **สถานะ:** ปิดบางส่วน (2026-11-16, UPDATE-094).

## B-020 [กลาง] Google Drive media และ Google Sheets reporting
- **หลักฐาน:** รูปเหตุการณ์เดิมถูกเก็บเป็น Base64 ใน `direction_meta`; รูปโครงการเดิมอัปโหลดไป Supabase Storage โดยตรง.
- **การแก้ไข:** เพิ่ม Drive upload/delete ผ่าน `hdms-api`, เปลี่ยนสองฟอร์มให้เก็บ URL, ลบไฟล์ Drive ชดเชยเมื่อการบันทึก DB ล้มก่อนมี reference และเพิ่ม Apps Script ที่ upsert รายงานด้วย idempotency key.
- **การตรวจและปิดงาน:** Apps Script และ Edge Production ผ่าน upload/read/sync/delete; เหตุการณ์จริง `F-4b5bfca3-dff9-4ef8-baa3-07fa0614081b` แสดงรูปบนเว็บและมีแถวรายงานใน Sheets; Edge normalize URL เก่าไป Google CDN; CI และ GitHub Pages ที่ commit `55eff28` ผ่าน.
- **สถานะ:** ปิด (2026-11-16).

---

## B-019 [สูง] Public API ต้องไม่ส่ง Draft/inactive payload
- **หลักฐาน:** ทดสอบ Production วันที่ 2026-11-13 ด้วยรายการ QA Draft พบว่า `getPublicSystemDataAction` ส่งรายการ `is_active=false` กลับมา แม้ `app/page.tsx` และ `LongdoGisMap.tsx` จะกรองก่อนวาด จึงไม่เห็นใน UI.
- **ผลกระทบ:** ผู้เรียก API โดยตรงเข้าถึงรายละเอียดเหตุการณ์ที่เจ้าหน้าที่ตั้งใจเก็บเป็น Draft ได้ และดาวน์โหลด payload ใหญ่เกินจำเป็น.
- **แนวทางแก้:** เพิ่ม `doh_get_public_system_data_display_rpc()` เป็น wrapper ของ display RPC เพื่อคง Admin payload เดิม พร้อมตัด flood/detour/timeline ที่ inactive หรือเชื่อมกับ Draft; Edge Function เรียก wrapper นี้เฉพาะ `getPublicSystemDataAction` และตอบ 503 แทนการ fallback ไป payload เต็ม.
- **การตรวจเดิม:** deploy SQL ก่อน Edge Function v11 แล้วทดสอบ Production วันที่ 2026-11-13 ด้วย flood/detour QA: Admin อ่าน Draft ได้; Public API และ UI ไม่พบ Draft/detour ที่ผูก; เมื่อเปิดใช้งาน Public พบทั้งคู่; หลัง soft delete Public ไม่พบทั้งคู่. ลบ QA ออกจาก DB แล้ว ตรวจคงเหลือ `0`.
- **Regression ที่พบ 2026-11-17:** เมื่อ Edge network failure `lib/hdms-api.ts` เคย fallback ไป `doh_get_system_data_display_rpc()` แล้ว `doh_get_system_data_rpc()`; และ compatibility branch ใน `app/actions/doh-actions.ts` เคย fallback ไป `getSystemDataAction()`. ทั้งสอง path สามารถข้าม public wrapper ได้.
- **การแก้ source:** fallback เรียกเฉพาะ `doh_get_public_system_data_display_rpc()` และ error/retry เมื่อ wrapper ใช้ไม่ได้; Playwright desktop/mobile ยืนยันไม่มี request ไป Admin RPC ระหว่าง Edge outage.
- **สถานะ:** ปิด (2026-11-17) — รวมเข้า main ผ่าน PR #32 และ PR #33 (commit `866eb93`); CI run `44104409978` และ Deploy GitHub Pages run `44104409962` สำเร็จ.

## B-017 [ต่ำ] คำสั่ง E2E ในเครื่องไม่เตรียม public build configuration — ปิดแล้ว
- **หลักฐาน:** `tests/e2e/public-route-sheet.spec.ts` ล้มที่ข้อความ `จุดเฝ้าระวังน้ำท่วม 2 จุด` เมื่อรันจาก clone ที่ไม่มี `.env.local`; `next build` ฝังค่า `NEXT_PUBLIC_*` ตอน build แล้ว `npm run start` ไม่รับค่าใหม่ภายหลัง. เมื่อ build โดยใช้ค่าจาก `.github/hdms-public.json` แล้วทดสอบซ้ำ ผลผ่าน 1/1.
- **ผลกระทบ:** นักพัฒนาใหม่อาจเข้าใจผิดว่า UI หรือการ mock พัง ทั้งที่เป็นขั้นตอนเตรียม test; CI ไม่กระทบเพราะ workflow เขียนค่า public config ลง `GITHUB_ENV` ก่อน build.
- **ทางเลือก:** A) เพิ่ม script E2E กลางที่อ่าน `.github/hdms-public.json` แล้ว build/test ด้วย environment เดียวกับ CI; B) บังคับให้สร้าง `.env.local` จาก `.env.example`; C) คงคู่มือคำสั่งมือ.
- **การแก้ไข:** ใช้ทางเลือก A ผ่าน `npm run test:e2e:local`; script อ่าน public configuration, `npm run build`, แล้วส่งต่อ argument ให้ Playwright โดยไม่สร้างหรือบันทึก `.env.local`.

## B-001 [วิกฤต] Edge Function เขียนข้อมูลโดยไม่ตรวจสิทธิ์
- **การตัดสินใจ 2026-11-16:** เจ้าของระบบกำหนดให้ข้ามระบบล็อกอิน/ตรวจตัวตน และให้คง `/admin` แบบไม่ต้องล็อกอิน ความเสี่ยงนี้ได้รับการยอมรับตามคำสั่งโดยตรง; ไม่ให้ AI หยุดถามเรื่องนี้ซ้ำจนกว่าเจ้าของจะเปลี่ยนข้อกำหนด.
- **หลักฐาน:** `supabase/functions/hdms-api/index.ts` — ทุก action ที่ไม่ใช่ read ใช้ `SUPABASE_SERVICE_ROLE_KEY` และไม่มีโค้ดตรวจ token/บทบาท (ค้น `getUser`/`app_metadata` ไม่พบ) · `supabase/config.toml`: `verify_jwt = false` พร้อมคอมเมนต์ว่าตั้งใจให้ `/admin` ไม่ต้อง login · `PRODUCTION.md` เขียนตรงข้าม (อ้างว่าตรวจ JWT และบทบาท) **(ต้องยืนยันกับฟังก์ชันที่ deploy จริง)**
- **ผลกระทบ:** URL ของฟังก์ชันเปิดเผยในไฟล์ JS สาธารณะ ผู้ใดก็ส่ง POST เพื่อเปลี่ยนสถานะจราจร (เช่น ตั้งว่า "ผ่านได้ปกติ" ทั้งที่น้ำท่วม), ลบ/แก้เส้นทางหลวง, ลบเหตุการณ์ได้ ในช่วงน้ำท่วมจริง ข้อมูลผิดอาจทำให้ประชาชนเดินทางเข้าพื้นที่อันตราย CORS ไม่ใช่การควบคุมสิทธิ์
- **ทางเลือก:**
  - **A (แนะนำ)** ให้เจ้าหน้าที่ไม่กี่คน login ด้วย Supabase Auth (อีเมล+รหัสผ่าน) · ตั้ง `app_metadata.role = admin/doh_admin` · Edge Function ตรวจ token + บทบาทก่อนทุก mutation แล้วจึงใช้ service role · หน้า `/admin` เพิ่มฟอร์ม login (ไม่ต้องเปลี่ยน UI อื่น) — ผลต่อผู้ใช้: ต้องกรอกรหัสครั้งเดียวต่อเซสชัน
  - **B** รหัสผ่านร่วม (passcode) ตรวจฝั่ง server แล้วออก token อายุสั้น — ทำเร็วกว่า แต่รหัสร่วมรั่วง่ายและตรวจสอบย้อนหลังไม่ได้ว่าใครแก้
  - **C** คงเดิมแต่ลดความเสียหาย: เปิด Point-in-Time Recovery/สำรองข้อมูลรายวัน + ตาราง audit log (trigger) + rate limit + แจ้งเตือนเมื่อสถานะเปลี่ยนผิดปกติ — ไม่หยุดการโจมตี แต่กู้คืนได้
  - **D** ยอมรับความเสี่ยงเป็นลายลักษณ์อักษร (ต้องให้เจ้าของลงชื่อใน `docs/CHANGELOG.md`)
- **คำแนะนำ:** A + C ทำคู่กัน; ถ้ายังไม่พร้อม A ให้ทำ C ทันทีเป็นขั้นต่ำ
- **ข้อเสนอแนะการยืนยัน:** เปิด Supabase Dashboard → Edge Functions → `hdms-api` ดูโค้ดที่ deploy จริง ว่ามี `getUser`/ตรวจบทบาทหรือไม่ (อย่าทดสอบด้วยการลบข้อมูลจริง)
- **ข้อห้ามชั่วคราว:** AI ห้ามเพิ่ม action เขียน/ลบใหม่ใน Edge Function จนกว่ารายการนี้จะปิดหรือเจ้าของยอมรับความเสี่ยง (AGENTS §4)

## B-002 [สูง] AI เข้าถึง production ผ่าน MCP
- **หลักฐาน:** `.mcp.json` ใส่ `project_ref` ของ production พร้อมฟีเจอร์ `database,functions,branching` · ADR-001: production อ่านอย่างเดียวเป็นค่าเริ่มต้น
- **ผลกระทบ:** เครื่องมือ AI ที่โหลดไฟล์นี้อาจรัน SQL เขียน/ลบบน production ได้ถ้าไม่มีสิทธิ์จำกัดฝั่ง Supabase
- **ทางเลือก:** A) ใช้ MCP แบบอ่านอย่างเดียว (พารามิเตอร์ `read_only=true` ตามเอกสาร Supabase MCP — **ตรวจเอกสารปัจจุบันก่อนใช้**) · B) ชี้ไป branch/โปรเจกต์ dev แล้วให้ AI ทดลองที่นั่น · C) นำ `database` ออกจาก `features` · D) คงเดิม (ไม่แนะนำ)
- **คำแนะนำ:** A ทันที + B ระยะยาว; ผมไม่แก้ `.mcp.json` ให้เอง เพราะอาจกระทบวิธีที่เจ้าของใช้งานอยู่

## B-003 [สูง] Deploy ไม่ผูกกับ CI และ push ตรง main
- **หลักฐาน:** `ci.yml` (lint, typecheck, build, e2e ×2) กับ `deploy.yml` (lint, typecheck, build:pages) ทำงานคู่ขนานเมื่อ push main; deploy ไม่รัน e2e · ADR-001: ห้าม direct push main แต่ประวัติ commit ("Update page.tsx") แสดงว่าทำผ่านหน้าเว็บ · เหตุการณ์จริง: ไฟล์ที่วางผิดทำให้ build แดงต่อเนื่อง 3 รอบ
- **ผลกระทบ:** UI ที่พังแต่ lint/build ผ่านขึ้นเว็บจริงได้ · ช่วงน้ำท่วมแก้ผิดที่เดียวทำให้เว็บล่ม
- **ทางเลือก:**
  - **A (แนะนำ)** ให้ `deploy.yml` รันหลัง `CI` สำเร็จเท่านั้น (`on: workflow_run` + ตรวจ `conclusion == 'success'`, checkout `head_sha`) และเก็บ `workflow_dispatch` ไว้ใช้ฉุกเฉิน
  - **B** ใช้ Pull Request + branch protection (ต้อง CI เขียวก่อน merge) — ปลอดภัยสุดแต่ต้องปรับวิธีทำงานของเจ้าของ
  - **C** เพิ่ม e2e แบบ static เข้า `deploy.yml` โดยตรง (ช้าลง ~2–3 นาที และ e2e ที่ไม่เสถียรจะขวางการ deploy ฉุกเฉิน)
  - **D** คงเดิม
- **คำแนะนำ:** A + ขั้นต่ำเสมอ: commit ผ่าน "Create a new branch" แล้วดูผล CI ก่อน merge (ไม่ต้องเปลี่ยน workflow) · ผมไม่แก้ pipeline เอง เพราะแก้แล้วทดสอบไม่ได้ในที่นี้และ pipeline ตอนนี้แดงอยู่
- **ร่างสำหรับ A (ยังไม่ใช้งาน):** ใน `deploy.yml` เปลี่ยน trigger เป็น `workflow_run: { workflows: ["CI"], types: [completed], branches: [main] }` + `workflow_dispatch`; เพิ่ม `if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'` ที่ job `build`; ใส่ `ref: ${{ github.event.workflow_run.head_sha || github.sha }}` ใน `actions/checkout`

## B-004 [กลาง] หน้าแอดมินโหลดข้อมูลครบและไม่ซ่อนรายการ `is_active = false`
- **สถานะ:** แก้แล้ว (2026-11-17, ดู `UPDATE-099`) — `getPublicSystemDataAction` ถูกจำกัดเฉพาะข้อมูล active ของประชาชนตั้งแต่ `20261113091500` จึงปรับหน้า `/admin` (`app/admin/page.tsx`) ให้เรียก `getSystemDataAction()` โดยตรงเพื่อให้เห็นทั้งรายการที่เปิดใช้งานและปิดชั่วคราวครบถ้วน (ขนาด payload จริงบน production วัดได้ 375.6 KB, 356 ms; หากต้องลด geometry บน `/admin` ในอนาคตให้แยก action เฉพาะสำหรับ Admin Display แทนการใช้ `getPublicSystemDataAction`)
- **หลักฐาน:** `app/admin/page.tsx`, `tests/e2e/admin-menus.spec.ts`

## B-005 [กลาง] ไฟล์ใหญ่เกินไป — ปิดบางส่วน (2026-11-13, ดู `UPDATE-090`)
- **หลักฐานก่อนปรับปรุง:** `GisDataImportTab.tsx` 2,445 บรรทัด (คำนวณ `allHighwayFeatures` และ `matchingHighwayFeatures` ซ้ำทุก render, คำนวณ `joinCandidates` ทุกครั้งที่ลากจุดกลางเส้น, และรวม JSX ของ 3 modal/panel ไว้ในไฟล์เดียว), `MapManagementTab.tsx` 2,832 บรรทัด (แปลงพรีวิว `<AdviceText />` สดทุก keystroke), และ `AdminConsole.tsx` นำเข้าทั้ง 7 แท็บแบบ static bundle เดียว
- **การแก้ไขที่ทำแล้ว (`UPDATE-090`):**
  1. แยก `components/admin/tabs/GisHighwayModals.tsx` (`HighwaySpecsEditModal`, `HighwayRouteDetailModal`, `HighwayGeometryEditorPanel`) ลดขนาด `GisDataImportTab.tsx` จาก **2,445 → 2,005 บรรทัด (-440 บรรทัด / -18.0%)**
  2. แยก `components/admin/tabs/DetourAdviceSection.tsx` (`React.memo` + `useDeferredValue`) ลดขนาด `MapManagementTab.tsx` จาก **2,832 → 2,626 บรรทัด (-206 บรรทัด / -7.3%)**
  3. ใช้ `next/dynamic` (`ssr: false`) แยก chunk ของ 6 แท็บรองใน `AdminConsole.tsx` พร้อมใส่ `[contain:layout_style_paint]` บนพื้นที่ `.doh-form`
  4. Memoize `allHighwayFeatures` + `matchingHighwayFeatures` + `useDeferredValue(routeSearch)`, จำกัด dependency ของ `joinCandidates` เฉพาะพิกัดปลายเส้น 2 จุด และใส่ `content-visibility: auto; contain-intrinsic-size: auto 600px` บนส่วนตารางทางหลวงด้านล่าง
- **ผลตรวจ:** `npm run lint` (0 warnings), `npm run typecheck` (0 errors), `next build` (static export 6/6 หน้า), และ Playwright E2E **59 passed, 0 failed** (27 skipped ตามเงื่อนไข viewport)
- **สิ่งที่เหลือสำหรับอนาคต (เมื่อต้องการแยกเพิ่ม):** แยกส่วนตารางทางหลวง (`GisHighwaySpecsTable`) และฟอร์มย่อยของโหมดจุดน้ำท่วมใน `MapManagementTab.tsx` ใน PR ถัดไปโดยยึดชุดทดสอบ E2E เดียวกัน

## B-006 [กลาง] `SUPPLEMENTAL_RULES.md`
- แก้แล้ว: `AGENTS.md` ให้ค้นด้วย grep ไม่อ่านทั้งไฟล์ และประวัติใหม่ลง `docs/CHANGELOG.md`; ใน `UPDATE-103` ได้ปรับ `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `CLAUDE.md` และหัวไฟล์ `SUPPLEMENTAL_RULES.md` ให้ชี้ไปที่ `AGENTS.md` และ `docs/AI_HANDOFF.md` ครบทุกตัวแล้ว
- เหลือ: ย้ายไฟล์ไป `docs/archive/` + ปรับลิงก์ (ต้องแก้ไฟล์ใหญ่ ควรทำแยกครั้ง)

## B-007 [ต่ำ] โค้ดค้าง — ปิดบางส่วน
- **ถอดแล้ว:** `lib/auth.ts` (better-auth) และ `db/supabase-server.ts` รวมทั้ง dependencies `better-auth`, `flatpickr`, `pg`, `@types/pg` ที่ค้นทั้งรีโปแล้วไม่มีโค้ดหรือสคริปต์นำเข้า
- **คงไว้:** `server/routing-service.mjs` **ไม่ใช่โค้ดค้าง** เป็นบริการ OSRM ในเครื่อง/LAN ที่เป็น Tier 1 ของ `fetchOsrmWithFailover` (ผ่าน `NEXT_PUBLIC_OSRM_LOCAL_URL`) จึงคงไว้และห้ามลบ
- **ยังเหลือ:** บริการ Postgres ใน `docker-compose.yml` ที่ตัวแอปไม่ใช้ · ข้อความ Server Actions/Docker ที่เก่าใน `DESIGN.md`/`MANUAL.md`

## B-008 [กลาง] OSRM สาธารณะ — ลดความเสี่ยงแล้ว + เพิ่ม Hybrid Google Routes Tier 1
- ตัวสร้างเส้นเกาะถนนของหน้าจัดการแผนที่มีสำรองหลายชั้น (`computeGoogleRouteHybrid` via `hdms-api` → `fetchOsrmWithFailover` / `snapRouteAction` → เส้นตรง)
- **แก้แล้วใน `lib/osrm-client.ts`:** แคช 30 นาที, รวมคำขอซ้ำ, retry 1 ครั้งเฉพาะความล้มเหลวชั่วคราว, เว้น ≥ 1 วินาทีต่อ public server, ตัดวงจร Tier 1 60 วินาที, `getOsrmFailureHint()` ทำให้ข้อความ error บอกให้สลับเป็นโหมด "วาด/แก้ไขอิสระ"
- **แก้เพิ่มในรอบ Hybrid Google Maps (`UPDATE-108`):** เพิ่ม Edge proxy `computeGoogleDetourRouteAction` + `reverseGeocodeGoogleAction` เป็น Tier 1 (ทำงานเมื่อตั้ง secret `GOOGLE_MAPS_API_KEY` ใน Supabase Edge Secrets; เมื่อยังไม่ตั้งจะตัดวงจร 5 นาทีและสลับใช้ Longdo/Nominatim/Hardened OSRM โดยอัตโนมัติ)
- **ยังไม่ทำ:** deploy Edge `hdms-api` + ตั้งค่า `GOOGLE_MAPS_API_KEY` บน Production และ self-host OSRM ข้อมูลประเทศไทย (`server/routing-service.mjs` เป็นจุดเริ่มต้นที่มีอยู่แล้ว)

## B-009 [ต่ำ] สคริปต์ตรวจไม่ตรง deploy
- เพิ่ม `"check:deploy": "npm run lint && npm run typecheck && npm run build:pages"` ใน `package.json` แล้ว. คำสั่งนี้ตรงกับ validation ก่อน deploy ของ GitHub Pages.
- ใน `UPDATE-104` ปรับ `build:pages` ให้รันผ่าน `node scripts/build-pages.mjs` ขจัดข้อจำกัด POSIX syntax เพื่อให้รันได้สมบูรณ์ทั้งบน Windows และ Linux.
- **ตรวจ:** `npm run check:deploy` ผ่านบน Windows และ CI.
- **สถานะ:** ปิด (2026-11-16, UPDATE-095 / ปรับปรุง UPDATE-104).

## B-010 [กลาง] การอ่านข้อมูลสาธารณะ — ปรับแนวทาง
- **สิ่งที่พบและแก้ได้จริง:** ฝั่งเว็บขยายโหลดตอนระบบมีปัญหา — ปรับแล้ว: ห่วงโซ่สำรองไปใช้ action เดิมเฉพาะเมื่อ server ตอบ "Unknown operation" เท่านั้น (`app/actions/doh-actions.ts`, `HdmsHttpError` ใน `lib/hdms-api.ts`) และ retry เหลือ 2 ครั้งพร้อมหน่วงแบบสุ่ม (`QueryProvider.tsx`)
- **ก่อนตัดสินใจทำแคช ให้วัด:** Supabase Dashboard → Reports → API และ Database ในช่วงที่เปิดให้ประชาชนใช้จริง ถ้า CPU < 50% และไม่มี timeout ไม่ต้องทำ

## B-011 [กลาง] ช่องว่างของ e2e
- เพิ่ม: เพิ่ม/ลบ/ลากจุด และเชื่อม/ตัดเส้นในโหมดอิสระ · แถบสรุปสถานการณ์และการเรียงตามความรุนแรง · bottom sheet รายละเอียดบนมือถือ · เมนูแอดมินแบบแถบไอคอนที่จอ 1280px

## B-012 [ต่ำ] `reactStrictMode: false`
- เปิดเฉพาะ dev เพื่อจับ effect/listener ที่ cleanup ไม่ครบ; production static export ใช้ `NODE_ENV=production` จึงไม่เปลี่ยน runtime ของประชาชนหรือ Admin.
- **ตรวจ:** `npm run check:deploy` ผ่าน; ตรวจ config production ได้ค่า `false`.
- **สถานะ:** ปิด (2026-11-16, UPDATE-096).

## บันทึกเพิ่ม B-015 / Phase 6 Public UI (2026-11-11)
- มี Playwright test ใหม่ `tests/e2e/public-route-sheet.spec.ts` สำหรับหน้ารายการมือถือและหน้ารายละเอียดทางเลี่ยง โดยยังไม่ได้รันจริงเพราะ `npm ci` ดึงแพ็กเกจไม่สำเร็จ (`EAI_AGAIN`); ต้องรัน E2E สองโหมด + ตรวจการล้นจอ 360/412/1280px ก่อน production.
- ยังไม่รวม React Detour Detail Component เข้ากับ Leaflet HTML Popup แบบเรียกใช้ Component เดียวกันจริง (ดู KI-006); ป้องกันการรีแฟคเตอร์เสี่ยงใน PATCH นี้.
