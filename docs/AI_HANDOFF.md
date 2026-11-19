# AI Handoff — สถานะร่วมของโครงการ HDMS_PN

> อัปเดต: 19 พฤศจิกายน 2026 · แหล่งความจริงของ main คือ `origin/main` (บน `origin/main` ล่าสุดผ่าน PR #50 `7c2e6be` รวม `UPDATE-130` แก้ CRLF และรัน migration Backfill แถว `F-6bc2ee64-1ad6-412f-bf1b-bcc2033ad844` บน Production เรียบร้อยแล้ว 23/23 แถว; ดำเนินการเก็บกวาดกิ่งที่ merge/closed แล้วทั้งหมด 32 กิ่งบน origin และ 9 กิ่งบน local รวมทั้งปิด Dependabot PR #27 และลบกิ่งออก; อยู่ระหว่างเตรียม PR สำหรับ `UPDATE-131` ปรับแต่ง `.github/dependabot.yml` ป้องกันการอัปเกรดข้าม Major Version) พร้อมมาตรฐาน AI Workflow Optimization (`UPDATE-115`), สถานะจราจร 5 ค่าพร้อมคำนวณอัตโนมัติและแยก 2 ฝั่งบนถนน ≥ 4 ช่องจราจร (`UPDATE-114`), และการเชื่อม Event↔Detour ครบทุกหน้ารายละเอียด (`UPDATE-109`–`UPDATE-113`, B-023). ข้อมูลในไฟล์นี้มีไว้ให้ Codex, Gemini, Claude และ AI อื่นเริ่มงานจากฐานเดียวกัน

## ก่อนเริ่มงานทุกครั้ง

1. อ่าน `AGENTS.md` แล้วอ่านไฟล์นี้ทั้งหมด
2. รัน `git fetch origin`; ตรวจ `origin/main`, branch ปัจจุบัน และ `git status --short` ก่อนแก้ไฟล์
3. ห้ามเขียนทับไฟล์ที่มีการแก้ค้างอยู่ และห้ามแก้จาก SHA เก่าหรือจากรายงานเก่าโดยไม่เทียบกับ `origin/main`
4. อ่านเอกสารตามงาน: `docs/ARCHITECTURE.md`, `docs/UI_CONTRACT.md`, `docs/PLAYBOOKS.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`; ใช้ `docs/CHANGELOG.md`, `SUPPLEMENTAL_RULES.md` และ `DECISION_LOG.md` แบบค้นคำ (`grep`) เท่านั้น

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

- **งานที่กำลังทำ / เป้าหมาย:** ปรับแต่ง `.github/dependabot.yml` ป้องกันไม่ให้รวมการอัปเกรดข้าม Major Version (`UPDATE-131`)
- **Git Branch & Commit SHA:** `chore/dependabot-ignore-major`
- **ไฟล์ที่แก้ไขแล้ว:** `.github/dependabot.yml`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **สิ่งที่ทำสำเร็จ:**
  - ปิด Dependabot PR #27 และลบกิ่งรีโมต `dependabot/npm_and_yarn/dependencies-534e62a8e0` ออกจาก GitHub
  - ปรับปรุง `.github/dependabot.yml` ให้จำกัดกลุ่มการอัปเดตเฉพาะ minor/patch และเพิ่ม `ignore` สำหรับ `version-update:semver-major`
- **สิ่งที่ยังไม่สำเร็จ / ติดขัด:** ไม่มี
- **ผลทดสอบล่าสุด:** ผ่าน R6 (`lint`, `typecheck`, `build:pages`)
- **ขั้นตอนถัดไป:** Push กิ่ง `chore/dependabot-ignore-major`, เปิด PR และ Merge เข้า `main`
