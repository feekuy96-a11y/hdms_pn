# AI Handoff — สถานะร่วมของโครงการ HDMS_PN

> สำหรับ Codex, Gemini, Claude และ AI ที่มารับช่วงงาน ข้อมูลด้านล่างยืนยัน ณ 26 พฤศจิกายน 2026 เวลา 08:37 น. (ไทย) เป็นภาพรวม ณ เวลาตรวจ ไม่ใช่การรับประกันว่า `main` หรือเว็บจริงยังอยู่ที่รุ่นเดิม

## ล่าสุดที่ตรวจยืนยันแล้ว

- **ขึ้นเว็บจริง: [PR #75](https://github.com/feekuy96-a11y/hdms_pn/pull/75)** ปรับ UX/UI มือถือและเดสก์ท็อปทั้งหน้าประชาชนและแอดมิน โดยใช้ข้อมูลและเครื่องมือ GIS เดิม เปิดใช้งานบน [GitHub Pages](https://feekuy96-a11y.github.io/hdms_pn/) จาก commit `4f20c1aa6ca8e78ce60c8083f5dc8f781c9d2699` · [CI หลัง merge](https://github.com/feekuy96-a11y/hdms_pn/actions/runs/45733163296) และ [Pages deploy](https://github.com/feekuy96-a11y/hdms_pn/actions/runs/45733743176) ผ่านแล้ว
- **ขึ้นเว็บจริง: [PR #76](https://github.com/feekuy96-a11y/hdms_pn/pull/76)** กรณีสร้างทางเลี่ยงสำเร็จแต่ผูกเหตุการณ์ไม่ได้ ให้ลองใหม่ด้วยรหัสทางเลี่ยงและรูป A/B เดิม โดยใช้วิธีอัปโหลดเดิม; Edge `hdms-api` v26 และหน้าเว็บปล่อยแล้ว และ #75 คงแพตช์นี้ไว้
- **สิ่งที่ตรวจบนเว็บรุ่นนี้:** ทั้งสองหน้าเปิดได้และอ่านข้อมูลประชาชนจริง; เพิ่มจุด ลบเฉพาะเส้นที่เลือก และลองผูกทางเลี่ยงซ้ำผ่านบนหน้าเว็บที่ปล่อยด้วยข้อมูลทดสอบ ไม่ได้เขียนข้อมูล production หรือทดสอบอัปโหลดและสิทธิ์บัญชีเจ้าหน้าที่จริง
- **เอฟเฟกต์และการนำทาง:** เว็บจริงแสดงแถบน้ำท่วมสว่าง–จางและไฮไลต์วิ่งบนทางเลี่ยง; แบบ C มีให้เลือกแต่ไม่ใช่ค่าที่เว็บจริงเลือกอยู่ ส่วนปุ่ม Google Maps ในคำแนะนำและจุด A/B ให้ลิงก์เดียวกันทั้งสองทิศในเส้นตัวอย่างที่ตรวจ โดยยังไม่ยืนยันผลในแอป Google Maps บนมือถือจริง
- **ผล QA ที่พบ:** ที่จอ 320×568 เมื่อขยายข้อความ 150% หน้าคำแนะนำทางเลี่ยงมีพื้นที่อ่านแคบ และเมนูแอดมินบางป้ายทับหรือล้น; พบข้อความทางเลี่ยงคอนทราสต์ต่ำในธีมสว่างด้วย ยังไม่มีการเปลี่ยนเว็บจากผลตรวจนี้

## ก่อนเริ่มงานทุกครั้ง

1. อ่าน `AGENTS.md` และหัวข้อ «ล่าสุดที่ตรวจยืนยันแล้ว» ด้านบน แล้วอ่านส่วนอื่นเฉพาะที่เกี่ยวข้อง
2. รัน `git fetch origin`; ตรวจ `origin/main`, branch ปัจจุบัน และ `git status --short` ก่อนแก้ไฟล์
3. ห้ามเขียนทับไฟล์ที่มีการแก้ค้างอยู่ และห้ามแก้จาก SHA เก่าหรือจากรายงานเก่าโดยไม่เทียบกับ `origin/main`
4. อ่านเอกสารตามงาน: `docs/ARCHITECTURE.md`, `docs/UI_CONTRACT.md`, `docs/PLAYBOOKS.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`, `docs/ADMIN_ROADMAP.md`; ใช้ `docs/archive/history/CHANGELOG.md`, `docs/archive/history/SUPPLEMENTAL_RULES.md` และ `docs/archive/history/DECISION_LOG.md` แบบค้นคำ (`grep`) เท่านั้น

## สิ่งที่เพิ่งเปลี่ยนและห้ามทำย้อนกลับโดยไม่ตั้งใจ

- สถานะจราจร 5 ค่าใช้ `lib/traffic-presentation.ts` (`getTrafficPresentation`, `TRAFFIC_STATUS_OPTIONS`, `formatRelativeUpdateTime`) เป็นแหล่งความจริงเดียวทั้งหน้าประชาชน แผนที่ (`LongdoGisMap.tsx`) และแอดมิน (R1)
- การ์ดทะเบียนเหตุการณ์แอดมิน (`IncidentRegistryTab.tsx`) และฟอร์มมาตรฐาน (`MapManagementTab.tsx`) ซ่อนรหัส `FL-...` จาก UI ปกติ, ใช้ CSS Container Queries (`.doh-incident-container`) รองรับการย่อขยายแผงซ้าย, ตัดตัวเลือก `"รอตรวจสอบสถานะ"` ออกจาก dropdown (บันทึกแล้วถือว่าตรวจสอบแล้ว `status_verified: true`), และแสดงป้าย `"⚠️ ข้อมูลไม่ครบ"` จาก `getFloodCompletenessIssues()` เฉพาะเมื่อข้อมูลขาด
- หน้าประชาชน: ชิปสายทางแยกตามแท็บ (น้ำท่วมใช้ `ทล.` ของเหตุ active; ทางเลี่ยงใช้สายที่ผูกเหตุหรือ `ปน.`/`ปน.ถ.` ของทางเลี่ยงอิสระ). ตัวกรองคงแสดงทุกเส้นบนแผนที่ แต่เส้นที่ไม่ตรงลด opacity เหลือ 25% และมีป้ายล้างตัวกรอง เพื่อไม่ซ่อนข้อมูลความปลอดภัย
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

## บันทึกจากรอบก่อนหน้า

> เป็นข้อมูลย้อนหลัง ไม่ใช่คำสั่งให้เริ่มงานหรือ deploy ใหม่ ให้ตรวจสถานะกับต้นทางก่อนนำไปใช้

- UPDATE-144 (2026-11-20): ปิด Roadmap 3.2 จาก source `origin/main` @ `ce105ab`; 4.2 แยก coverage ที่มีแล้วจาก flake/1280px/draft recovery และ regression ที่ยังรอ โดยยังไม่ได้รัน tests รอบนี้; พักงาน auth/login 4.3 ตามคำสั่งเจ้าของ

1. เก็บ Chrome Performance trace/Task Manager จากเครื่องเจ้าหน้าที่จริงเมื่อแก้เส้นที่มีปัญหา RAM/CPU; อย่าลด `MAX_VERTEX_HANDLES` หรือเพิ่ม Web Worker โดยไม่มี measurement (B-005, KI-012)
2. Apps Script outbox: ต้องยืนยันว่า Edge secret ชี้ไป URL `/exec` ของ Apps Script รุ่นมี idempotency แล้วจึง deploy Edge v18 ใหม่ (B-022)
3. OSRM สาธารณะไม่มี SLA (B-008); เพิ่ม Google Routes v2 (`computeRoutes`) และ Geocoding v4 proxy เป็น Tier 1 ใน Edge `hdms-api` แล้ว (เปิดใช้เมื่อตั้ง `GOOGLE_MAPS_API_KEY` ใน Supabase Edge Secrets; มิฉะนั้นตัดวงจรอัตโนมัติไป OSRM/Nominatim/local) และคง `server/routing-service.mjs` / Docker/OSRM local ไว้เป็นทางเลือก LAN ห้ามลบเป็น cleanup
4. ข้อจำกัด waypoint ของ Google Maps ยังมีอยู่ (B-013); `sampleWaypointsForGoogleMaps` อัปเกรดเป็นคัดจุดหักเลี้ยวสำคัญ (Douglas-Peucker ≤ 8 จุดเรียงตามเส้นทาง) และต้องคงการใช้ฟังก์ชันนี้เสมอ
5. ความสัมพันธ์ Flood Event ↔ Detour แบบหลายต่อหลาย: migration `20261117135032_event_detour_relationships.sql`, trigger `20261117192000_sync_flood_event_segments.sql` (`trg_doh_sync_flood_event_segment`), และ migration `20261118000100_event_detour_both_directions.sql` ถูก apply เข้า Supabase Production ครบถ้วนแล้ว (ปิด B-023 ใน `UPDATE-122`); Edge Function `hdms-api` v23 และหน้าเว็บ GitHub Pages ทำงานร่วมกันสมบูรณ์แล้ว.

## วิธีส่งงานร่วมกัน

- ทำงานบน branch จาก `origin/main` ใหม่, รัน `npm run check:deploy` และ E2E เฉพาะส่วนที่แก้
- สร้าง PR; รอ CI ผ่านก่อน merge. หลัง merge ตรวจ Pages workflow และ URL จริง
- ทุกงานอัปเดต `docs/archive/history/CHANGELOG.md`; อัปเดต `BACKLOG`/`KNOWN_ISSUES` เมื่อสถานะงานค้างหรือข้อจำกัดเปลี่ยน; ปรับไฟล์นี้เมื่อมีการเปลี่ยนกติกากลางหรือสถานะ deploy

## รูปแบบสรุปเมื่อส่งต่อ

- สิ่งที่เปลี่ยน: [สรุปหนึ่งบรรทัดต่อเรื่อง พร้อม PR หรือ commit]
- ตรวจแล้ว: [สิ่งที่ตรวจจริง พร้อมลิงก์ CI/deploy ถ้ามี]
- ข้อจำกัด: [สิ่งสำคัญที่ยังไม่ยืนยัน]
