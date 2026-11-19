# AI Handoff — สถานะร่วมของโครงการ HDMS_PN

> อัปเดต: 19 พฤศจิกายน 2026 · แหล่งความจริงของ main คือ `origin/main` (ฐานล่าสุดก่อนรอบนี้คือ `0be5f8c` รวม `B-025` / `UPDATE-134`–`136` ครบถ้วน; รอบนี้ปิด **Phase 0 (`UPDATE-137`)** และบันทึกกติกาถาวรปรับโครงสร้างหน้าแอดมิน 5 เฟสไว้ที่ `docs/ADMIN_ROADMAP.md`) พร้อมมาตรฐาน AI Workflow Optimization (`UPDATE-115`), สถานะจราจร 5 ค่าพร้อมคำนวณอัตโนมัติและแยก 2 ฝั่งบนถนน ≥ 4 ช่องจราจร (`UPDATE-114`), และการเชื่อม Event↔Detour ครบทุกหน้ารายละเอียด (`UPDATE-109`–`UPDATE-113`, B-023). ข้อมูลในไฟล์นี้มีไว้ให้ Codex, Gemini, Claude และ AI อื่นเริ่มงานจากฐานเดียวกัน

## ก่อนเริ่มงานทุกครั้ง

1. อ่าน `AGENTS.md` แล้วอ่านไฟล์นี้ทั้งหมด
2. รัน `git fetch origin`; ตรวจ `origin/main`, branch ปัจจุบัน และ `git status --short` ก่อนแก้ไฟล์
3. ห้ามเขียนทับไฟล์ที่มีการแก้ค้างอยู่ และห้ามแก้จาก SHA เก่าหรือจากรายงานเก่าโดยไม่เทียบกับ `origin/main`
4. อ่านเอกสารตามงาน: `docs/ARCHITECTURE.md`, `docs/UI_CONTRACT.md`, `docs/PLAYBOOKS.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`, `docs/ADMIN_ROADMAP.md`; ใช้ `docs/CHANGELOG.md`, `docs/archive/SUPPLEMENTAL_RULES.md` และ `DECISION_LOG.md` แบบค้นคำ (`grep`) เท่านั้น

## สถานะเผยแพร่ล่าสุด

- GitHub Pages: `https://feekuy96-a11y.github.io/hdms_pn/` ตอบ HTTP 200 หลัง deploy commit `3beabf5` (`UPDATE-116`)
- Deploy run `44331865436` (`#154`) และ CI run `44331866679` (`#172`) สำเร็จ: lint, typecheck, production build, static Pages build และ Playwright E2E ผ่านครบ
- ห้ามอ้างว่า deploy สำเร็จจาก local build เพียงอย่างเดียว; ต้องยืนยัน workflow ของ commit ที่จะเผยแพร่

## สิ่งที่เพิ่งเปลี่ยนและห้ามทำย้อนกลับโดยไม่ตั้งใจ

- สถานะจราจร 5 ค่าใช้ `lib/traffic-presentation.ts` (`getTrafficPresentation`, `TRAFFIC_STATUS_OPTIONS`, `formatRelativeUpdateTime`) เป็นแหล่งความจริงเดียวทั้งหน้าประชาชน แผนที่ (`LongdoGisMap.tsx`) และแอดมิน (R1)
- การ์ดทะเบียนเหตุการณ์แอดมิน (`IncidentRegistryTab.tsx`) และฟอร์มมาตรฐาน (`MapManagementTab.tsx`) ซ่อนรหัส `FL-...` จาก UI ปกติ, ใช้ CSS Container Queries (`.doh-incident-container`) รองรับการย่อขยายแผงซ้าย, ตัดตัวเลือก `"รอตรวจสอบสถานะ"` ออกจาก dropdown (บันทึกแล้วถือว่าตรวจสอบแล้ว `status_verified: true`), และแสดงป้าย `"⚠️ ข้อมูลไม่ครบ"` จาก `getFloodCompletenessIssues()` เฉพาะเมื่อข้อมูลขาด
- หน้าประชาชน: แท็บน้ำท่วม/ทางเลี่ยงและตัวกรองสถานะกรอง **เฉพาะรายการ**; แผนที่คงแสดงเส้นน้ำท่วมและทางเลี่ยงที่เปิดใช้งานทั้งหมด จนผู้ใช้ปิด layer เอง
- การ fallback ของหน้าประชาชนต้องเรียกได้เฉพาะ `doh_get_public_system_data_display_rpc()`; หาก wrapper หรือ Edge ใช้ไม่ได้ต้องแสดง Error/Retry ห้าม fallback ไป `getSystemDataAction()` หรือ RPC ฝั่ง Admin
- คำอธิบายสัญลักษณ์แผนที่เริ่มแบบพับ; ไอคอนน้ำท่วมใช้สีพื้นตามสีเส้นและคลื่นสีขาวตรงกันทั้งแผนที่และทะเบียนแอดมิน; ทางเลี่ยงใช้สีตามเส้นจาก map style
- `/admin` ต้องเรียก `getSystemDataAction()` เพื่อให้เห็นรายการ inactive/Draft ที่ต้องเปิดกลับได้; หน้าประชาชนใช้ข้อมูล public เท่านั้น
- Modal ของ Admin ใช้ `useModalAccessibility`: Escape ปิดได้ทุกตำแหน่ง focus, Tab ถูกกักใน modal และเมื่อปิดต้องคืน focus เดิม
- ระหว่างแก้ vertex ของแนวเส้น ให้มีเฉพาะลูกศรของแนวร่างที่กำลังแก้; ห้ามวาดลูกศรตกแต่งของเส้นอื่นซ้ำระหว่างลาก
- ถอด dependency ที่ไม่ใช้แล้ว: `better-auth`, `flatpickr`, `pg`, `@types/pg`; ห้ามเพิ่มกลับหากไม่มี runtime import และเหตุผลชัดเจน

## ขอบเขตและข้อห้ามร่วม

- เว็บ production เป็น static export บน GitHub Pages. ห้ามเพิ่ม Server Action, API route, middleware หรือ server-only runtime
- คง `/admin` แบบไม่ต้องล็อกอินตามข้อกำหนดเจ้าของ; อย่าหยุดงานเพื่อถามเรื่องนี้ซ้ำ. ไม่ทำให้สิทธิ์หรือฐานข้อมูลอ่อนลงเพิ่มเติม
- SQL ใช้ migration ใหม่ที่ idempotent เท่านั้น. Production DB เป็น read-only สำหรับ AI เว้นแต่เจ้าของอนุมัติการเขียนชัดเจน
- ไม่เปลี่ยน Edge Function, secret, RLS, workflow CI/CD หรือ production data โดยไม่มีขอบเขตและแผนย้อนกลับที่ชัดเจน
- ห้ามเปลี่ยน accessible name, role, label หรือ placeholder ที่ E2E อ้างถึงโดยไม่แก้ test ใน commit เดียวกัน

## งานค้างที่มีหลักฐาน

1. เก็บ Chrome Performance trace/Task Manager จากเครื่องเจ้าหน้าที่จริงเมื่อแก้เส้นที่มีปัญหา RAM/CPU; อย่าลด `MAX_VERTEX_HANDLES` หรือเพิ่ม Web Worker โดยไม่มี measurement (B-005, KI-012)
2. Apps Script outbox: ต้องยืนยันว่า Edge secret ชี้ไป URL `/exec` ของ Apps Script รุ่นมี idempotency แล้วจึง deploy Edge v18 ใหม่ (B-022)
3. OSRM สาธารณะไม่มี SLA (B-008); เพิ่ม Google Routes v2 (`computeRoutes`) และ Geocoding v4 proxy เป็น Tier 1 ใน Edge `hdms-api` แล้ว (เปิดใช้เมื่อตั้ง `GOOGLE_MAPS_API_KEY` ใน Supabase Edge Secrets; มิฉะนั้นตัดวงจรอัตโนมัติไป OSRM/Nominatim/local) และคง `server/routing-service.mjs` / Docker/OSRM local ไว้เป็นทางเลือก LAN ห้ามลบเป็น cleanup
4. ข้อจำกัด waypoint ของ Google Maps ยังมีอยู่ (B-013); `sampleWaypointsForGoogleMaps` อัปเกรดเป็นคัดจุดหักเลี้ยวสำคัญ (Douglas-Peucker ≤ 8 จุดเรียงตามเส้นทาง) และต้องคงการใช้ฟังก์ชันนี้เสมอ
5. ความสัมพันธ์ Flood Event ↔ Detour แบบหลายต่อหลาย: migration `20261117135032_event_detour_relationships.sql`, trigger `20261117192000_sync_flood_event_segments.sql` (`trg_doh_sync_flood_event_segment`), และ migration `20261118000100_event_detour_both_directions.sql` ถูก apply เข้า Supabase Production ครบถ้วนแล้ว (ปิด B-023 ใน `UPDATE-122`); Edge Function `hdms-api` v23 และหน้าเว็บ GitHub Pages ทำงานร่วมกันสมบูรณ์แล้ว.

## วิธีส่งงานร่วมกัน

- ทำงานบน branch จาก `origin/main` ใหม่, รัน `npm run check:deploy` และ E2E เฉพาะส่วนที่แก้
- สร้าง PR; รอ CI ผ่านก่อน merge. หลัง merge ตรวจ Pages workflow และ URL จริง
- ทุกงานอัปเดต `docs/CHANGELOG.md`; อัปเดต `BACKLOG`/`KNOWN_ISSUES` เมื่อสถานะงานค้างหรือข้อจำกัดเปลี่ยน; ปรับไฟล์นี้เมื่อมีการเปลี่ยนกติกากลางหรือสถานะ deploy

## AI Handoff Template (สำหรับส่งต่อข้าม Codex / Gemini / Claude / Antigravity)

> **ข้อควรระวัง:** AI ที่รับงานต่อ **ต้องตรวจ `git status` และ `git diff` จริงเสมอ** ห้ามเชื่อเฉพาะข้อความส่งต่อ

- **งานที่กำลังทำ / เป้าหมาย:** บันทึกกติกาถาวรปรับโครงสร้างหน้าแอดมิน (`docs/ADMIN_ROADMAP.md`) และปิด **Phase 0 (`UPDATE-137`)** ครบชุด (`B-002` ล็อก `.mcp.json` read-only, `B-003` ผูก `deploy.yml` รอ `CI` ด้วย `workflow_run`, `B-006` ย้าย `SUPPLEMENTAL_RULES.md` ไป `docs/archive/`, ซิงก์ `PRODUCTION.md` และเอกสารอ้างอิงทั้งหมด)
- **Git Branch & Commit SHA:** `main` (ฐาน `origin/main` ก่อน push รอบนี้คือ `0be5f8c` ซึ่งรวม `UPDATE-136` แล้ว)
- **ไฟล์ที่แก้ไขแล้ว (รอบ `UPDATE-137`):** `docs/ADMIN_ROADMAP.md` (ใหม่), `.mcp.json`, `.github/workflows/deploy.yml`, `PRODUCTION.md`, `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `docs/{ARCHITECTURE,PLAYBOOKS,BACKLOG,KNOWN_ISSUES,AI_HANDOFF,CHANGELOG}.md`, `docs/archive/SUPPLEMENTAL_RULES.md` (ย้ายจากรากรีโป)
- **สิ่งที่ทำสำเร็จ:**
  - บันทึกแผนปรับโครงสร้างหน้าแอดมิน 5 เฟสและกติกาควบคุมความเสี่ยงเป็นเอกสารหลักถาวร (`docs/ADMIN_ROADMAP.md`) พร้อมอ้างอิงจาก `AGENTS.md` และไฟล์ตัวชี้ทุกตัว
  - ปิด `B-002`: ล็อก `.mcp.json` ด้วย `read_only=true` และจำกัดเฉพาะฟีเจอร์อ่าน (`docs,database,debugging,development`)
  - ปิด `B-003`: ปรับ `.github/workflows/deploy.yml` ให้รอ `CI` ผ่านผ่าน `workflow_run` (`head_sha`) พร้อมคง `workflow_dispatch` และไม่รัน Playwright ซ้ำซ้อน
  - ปิด `B-006`: ย้าย `SUPPLEMENTAL_RULES.md` ไป `docs/archive/SUPPLEMENTAL_RULES.md` และอัปเดตลิงก์ครบทุกไฟล์
  - ซิงก์ `PRODUCTION.md` ให้ตรงกับสถานะจริง (`B-001` ยอมรับความเสี่ยงชั่วคราว, `npm run check:deploy`, `PLAYWRIGHT_STATIC=1`)
- **สิ่งที่ยังไม่สำเร็จ / ติดขัด:** ไม่มี (พร้อมเข้าสู่ **Phase 1** ตาม `docs/ADMIN_ROADMAP.md`)
- **ผลทดสอบล่าสุด:** `npm run check:deploy` (`eslint --max-warnings=0`, `tsc --noEmit`, `build:pages` 6/6) + ตรวจไวยากรณ์ JSON/YAML ของ `.mcp.json` และ `.github/workflows/deploy.yml` ผ่าน
- **ขั้นตอนถัดไป:** เริ่ม **Phase 1** ใน `docs/ADMIN_ROADMAP.md` (ยืนยัน Edge Production `B-014` + สกัด RPC snapshot, ตั้ง secrets `B-022`/`B-008`, ร่าง migration DB Audit Trail `doh_admin_audit_log` และ Ledger Retention `B-024`)
