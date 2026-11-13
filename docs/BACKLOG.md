# BACKLOG.md — ทะเบียนข้อค้นพบและข้อเสนอ

กติกา: AI ทุกตัวต้องลงรายการที่พบแต่ยังไม่แก้ที่นี่ (ID ต่อเนื่อง `B-0xx`) แต่ละรายการมี หลักฐาน · ผลกระทบ · ทางเลือก · คำแนะนำ · สถานะ (`เปิด` / `กำลังทำ` / `ปิด (วันที่, ลิงก์ CHANGELOG)` / `ยอมรับความเสี่ยง (ใครอนุมัติ, วันที่)`)
ก่อนเริ่มงานให้ค้นรายการที่เกี่ยวข้อง และห้ามตัดสินใจแทนเจ้าของในรายการที่ต้อง "ถามก่อน"

| ID | ระดับ | เรื่อง | สถานะ |
|---|---|---|---|
| B-001 | **วิกฤต** | Edge Function เขียนข้อมูลด้วย service role โดยไม่ตรวจสิทธิ์ผู้เรียก | เปิด (ต้องตัดสินใจ) |
| B-002 | สูง | `.mcp.json` ให้ AI เข้าถึง Supabase production พร้อมสิทธิ์ฐานข้อมูล ขัด ADR-001 | เปิด (ต้องตัดสินใจ) |
| B-003 | สูง | Deploy ไม่รอ CI/e2e และเจ้าของ push ตรงเข้า main | เปิด (ต้องตัดสินใจ) |
| B-004 | กลาง | หน้าแอดมินยังโหลด GeoJSON ทางหลวงเต็มความละเอียดทุกครั้ง | ปิด (2026-11-10, ดู UPDATE-063) |
| B-005 | กลาง | ไฟล์ใหญ่เกิน: `GisDataImportTab.tsx` (~1.9k บรรทัด), `MapManagementTab.tsx` (~1.1k) | เปิด |
| B-006 | กลาง | `SUPPLEMENTAL_RULES.md` ~120 KB ถูกบังคับให้อ่านทุกเซสชัน | ปิดบางส่วน (ยกเลิกบังคับใน AGENTS.md; ยังไม่ได้ย้ายไฟล์) |
| B-007 | ต่ำ | โค้ดค้างที่ไม่อยู่ใน path จริง (better-auth, supabase-server, routing-service, Docker Postgres) | ปิด (ลบไฟล์ค้างแล้วใน UPDATE-065) |
| B-008 | กลาง | พึ่ง OSRM สาธารณะ (`router.project-osrm.org`) ไม่มี SLA | เปิด |
| B-009 | ต่ำ | `npm run check` ไม่ได้ build แบบ Pages (ที่ใช้ deploy จริง) | เปิด |
| B-010 | กลาง | อ่านข้อมูลสาธารณะทุกครั้งโดน DB (ไม่มีแคช) ช่วงคนเข้าเยอะ | ปิด (เพิ่ม GET & Cache-Control ใน UPDATE-065) |
| B-011 | กลาง | e2e ยังไม่ครอบคลุมฟีเจอร์ใหม่ (ตัวแก้ไขเส้นอิสระ, แถบสรุป, bottom sheet) | ปิดบางส่วน (เพิ่ม detour-navigation.spec.ts 12 ข้อใน UPDATE-066) |
| B-012 | ต่ำ | `reactStrictMode: false` ซ่อนบั๊ก cleanup ของ effect | เปิด |
| B-013 | ต่ำ | ข้อจำกัด Google Maps Universal URL Waypoints ไม่เกิน 8-9 จุด | เปิด (ใช้ sampleWaypointsForGoogleMaps บรรเทาแล้ว) |
| B-014 | **วิกฤต** | Edge Function Production v9 ไม่ส่งค่าฝั่งถนน/ช่องจราจร/ทิศทางไปยัง DB (ตรวจอ่านอย่างเดียว 2026-11-11) | เปิด: แก้ source แล้ว ต้อง Security Review + deploy และทดสอบ staging |
| B-015 | สูง | Phase 6 ยังไม่ผ่าน Build/E2E/CRUD integration บน staging เพราะ dependencies ในสภาพแวดล้อมทดสอบไม่ครบ | ปิด (2026-11-11, ดู UPDATE-070: Playwright E2E 46 passed, lint 0 warnings, typecheck 0 errors, build:pages 6/6 ผ่านสมบูรณ์) |
| B-016 | กลาง | ตราครุฑทางการสำหรับป้ายทางหลวงยังไม่มี Asset ที่ผ่านอนุมัติ | เปิด |

---

## B-001 [วิกฤต] Edge Function เขียนข้อมูลโดยไม่ตรวจสิทธิ์
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

## B-004 [กลาง] หน้าแอดมินยังโหลด GeoJSON เต็ม
- **สถานะ:** ปิดแล้ว (2026-11-10, ดู `UPDATE-063`) — หน้า `/admin` โหลดเริ่มต้นด้วย `getPublicSystemDataAction` (Geometry แบบลดจุด) และดึง `getSystemDataAction` ความละเอียดเต็มอัตโนมัติเฉพาะเมื่อเปิดแท็บ GIS หรือแก้ไขจุด Vertex
- **หลักฐาน:** `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`

## B-005 [กลาง] ไฟล์ใหญ่เกินไป — ตัดสินใจ: ยังไม่แยกตอนนี้
- **หลักฐาน:** `GisDataImportTab.tsx` ~1.9k บรรทัด (รวมโหมดตามถนน/อิสระ, ตัดและเชื่อมเส้น, modal คุณสมบัติ), `MapManagementTab.tsx` ~2.7k บรรทัด
- **ทำไมไม่แยกเลยตามที่ขอ:** ทั้งสองไฟล์มี state ที่พันกันมาก (ประวัติ undo/redo, เหตุการณ์จากแผนที่, ผล OSRM) และ e2e ยังไม่ครอบคลุมฟีเจอร์ใหม่ (B-011) การแยกโดยไม่มีตาข่ายทดสอบทำให้พังเงียบ ๆ ได้ ซึ่งขัดกับ R8 ของเรา
- **ทางเลือก:** A) เพิ่ม e2e ก่อน แล้วแยกทีละส่วนใน PR เล็ก ๆ (แนะนำ) · B) แยกเฉพาะฟังก์ชันล้วน (ไม่มี state) ไปไว้ใน `lib/` · C) เขียนใหม่ทั้งไฟล์ — ไม่แนะนำ
- **แผนที่ควรทำเมื่อพร้อม:** (1) เขียน e2e ให้ตัวแก้ไขเส้น (เพิ่ม/ลบ/ลากจุด, ตัด, เชื่อม, undo) และตัวสร้างคำแนะนำ (2) แยก `GeometryEditorPanel` พร้อม hook ประวัติ (`useEditHistory`) ออกจาก `GisDataImportTab` (3) แยกส่วน "คำแนะนำสำหรับประชาชน" ออกจาก `MapManagementTab` (4) ทุกขั้นต้องผ่าน e2e เดิมก่อนไปขั้นต่อไป
- **ตัวกระตุ้น:** เริ่มเมื่อ B-011 เสร็จ

## B-006 [กลาง] `SUPPLEMENTAL_RULES.md`
- แก้แล้ว: AGENTS.md ให้ค้นด้วย grep ไม่อ่านทั้งไฟล์ และประวัติใหม่ลง `docs/CHANGELOG.md`
- เหลือ: ย้ายไฟล์ไป `docs/archive/` + ปรับลิงก์ (ต้องแก้ไฟล์ใหญ่ ควรทำแยกครั้ง)

## B-007 [ต่ำ] โค้ดค้าง — ปิดบางส่วน
- **ถอดแล้ว:** `lib/auth.ts` (better-auth) และ `db/supabase-server.ts` — ค้นทั้งรีโปแล้วไม่มีโค้ด สคริปต์ หรือ Docker ใดนำเข้า
- **คงไว้:** `server/routing-service.mjs` **ไม่ใช่โค้ดค้าง** เป็นบริการ OSRM ในเครื่อง/LAN ที่เป็น Tier 1 ของ `fetchOsrmWithFailover` (ผ่าน `NEXT_PUBLIC_OSRM_LOCAL_URL`) จึงคงไว้และห้ามลบ
- **ยังเหลือ:** บริการ Postgres ใน `docker-compose.yml` ที่ตัวแอปไม่ใช้ · ข้อความ Server Actions/Docker ที่เก่าใน `DESIGN.md`/`MANUAL.md`

## B-008 [กลาง] OSRM สาธารณะ — ลดความเสี่ยงแล้ว
- ตัวสร้างเส้นเกาะถนนของหน้าจัดการแผนที่มีสำรอง 3 ชั้นอยู่แล้ว (`calculateRoadSnappedDualSource`: เส้นในระบบ → OSRM → เส้นตรง)
- **แก้แล้ว** ใน `lib/osrm-client.ts`: แคช 30 นาที, รวมคำขอซ้ำ, retry 1 ครั้งเฉพาะความล้มเหลวชั่วคราว, เว้น ≥ 1 วินาทีต่อ public server, ตัดวงจร Tier 1 60 วินาที, `getOsrmFailureHint()` ทำให้ข้อความ error บอกให้สลับเป็นโหมด "วาด/แก้ไขอิสระ"
- **ยังไม่ทำ:** self-host OSRM ข้อมูลประเทศไทย (ทางออกถาวร) — `server/routing-service.mjs` เป็นจุดเริ่มต้นที่มีอยู่แล้ว ตัดสินใจเมื่อมีโฮสต์ให้ใช้

## B-009 [ต่ำ] สคริปต์ตรวจไม่ตรง deploy
- เพิ่ม `"check:deploy": "npm run lint && npm run typecheck && npm run build:pages"` ใน `package.json` (ยังไม่ได้แก้ เพราะต้องอัปโหลดไฟล์เพิ่ม) จนกว่าจะเพิ่ม ให้ใช้คำสั่งเต็มตาม R6

## B-010 [กลาง] การอ่านข้อมูลสาธารณะ — ปรับแนวทาง
- **สิ่งที่พบและแก้ได้จริง:** ฝั่งเว็บขยายโหลดตอนระบบมีปัญหา — ปรับแล้ว: ห่วงโซ่สำรองไปใช้ action เดิมเฉพาะเมื่อ server ตอบ "Unknown operation" เท่านั้น (`app/actions/doh-actions.ts`, `HdmsHttpError` ใน `lib/hdms-api.ts`) และ retry เหลือ 2 ครั้งพร้อมหน่วงแบบสุ่ม (`QueryProvider.tsx`)
- **ก่อนตัดสินใจทำแคช ให้วัด:** Supabase Dashboard → Reports → API และ Database ในช่วงที่เปิดให้ประชาชนใช้จริง ถ้า CPU < 50% และไม่มี timeout ไม่ต้องทำ

## B-011 [กลาง] ช่องว่างของ e2e
- เพิ่ม: เพิ่ม/ลบ/ลากจุด และเชื่อม/ตัดเส้นในโหมดอิสระ · แถบสรุปสถานการณ์และการเรียงตามความรุนแรง · bottom sheet รายละเอียดบนมือถือ · เมนูแอดมินแบบแถบไอคอนที่จอ 1280px

## B-012 [ต่ำ] `reactStrictMode: false`
- เปิดเฉพาะ dev เพื่อจับ effect ที่ cleanup ไม่ครบ (ระวัง double-invoke กับโค้ดที่อ่าน event/โหลด Leaflet)

## บันทึกเพิ่ม B-015 / Phase 6 Public UI (2026-11-11)
- มี Playwright test ใหม่ `tests/e2e/public-route-sheet.spec.ts` สำหรับหน้ารายการมือถือและหน้ารายละเอียดทางเลี่ยง โดยยังไม่ได้รันจริงเพราะ `npm ci` ดึงแพ็กเกจไม่สำเร็จ (`EAI_AGAIN`); ต้องรัน E2E สองโหมด + ตรวจการล้นจอ 360/412/1280px ก่อน production.
- ยังไม่รวม React Detour Detail Component เข้ากับ Leaflet HTML Popup แบบเรียกใช้ Component เดียวกันจริง (ดู KI-006); ป้องกันการรีแฟคเตอร์เสี่ยงใน PATCH นี้.
