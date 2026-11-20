# docs/ADMIN_ROADMAP.md — แผน Roadmap และกติกาถาวรสำหรับปรับปรุงโครงสร้างฝั่งหน้าแอดมิน

> **สถานะ:** กติกาถาวรของโครงการ (อนุมัติโดยเจ้าของระบบ 2026-11-19 · อ้างอิงจาก `AGENTS.md`)  
> **ฐานโค้ดอ้างอิง:** `main` @ `0be5f8c` (`UPDATE-136`) → อัปเดต Phase 0 ใน `UPDATE-137`  
> **หลักการบังคับ:** ปรับปรุงแบบค่อยเป็นค่อยไป (**Incremental Strangler / Zero-Downtime**) ห้ามรื้อเขียนใหม่ทั้งระบบ (Big-Bang) เพื่อรักษาเสถียรภาพช่วงน้ำท่วมและคงสัญญา `tests/e2e` ครบทุกข้อ (`AGENTS.md` R1–R12)

---

## 1. กติกาถาวรควบคุมความเสี่ยงในการปรับโครงสร้าง (Mandatory Structural Safety Rules)

1. **หนึ่ง PR / หนึ่งขอบเขตงานชัดเจน:** ห้ามรวมงาน Refactor UI เข้ากับการเปลี่ยน Schema ฐานข้อมูลในรอบเดียวกัน
2. **ห้ามข้ามด่าน Stop-and-Ask (`AGENTS.md §4`):** การแก้ Production DB (`supabase/migrations/*`), Secrets บน Supabase, `.mcp.json`, `.github/workflows/*`, และการ push ตรง `main` ต้องได้รับอนุมัติจากเจ้าของระบบพร้อมแผนย้อนกลับทุกครั้ง
3. **ลำดับ Deploy มาตรฐานเสมอ (`R9`):** `SQL Migration` → `Edge Function (hdms-api)` → `Static Web (GitHub Pages)` โดยทุกขั้นต้อง backward-compatible กับเวอร์ชันก่อนหน้าอย่างน้อย 1 รอบ
4. **วัดผลเป็นตัวเลขจริงก่อน-หลัง (`R10`):**
   - งาน Payload: รายงานขนาด KB และ ms ของ `hdms-api`
   - งาน Performance: รายงานจำนวน `<canvas>` ใน `.leaflet-overlay-pane` (ต้องคงที่ = `1`) และขนาด JS chunk
   - งาน UI / a11y: รัน `npm run check:deploy` + `PLAYWRIGHT_STATIC=1 npm run test:e2e` + ตรวจ viewport `360px` และ `1280px` ทุกครั้ง
5. **ไม่ทำลายสัญญาหน้าประชาชน:** ทุกรอบการปรับปรุงฝั่งแอดมินต้องยืนยันว่า `getPublicSystemDataAction` ยังตัด Draft/Inactive และใช้ `geojson_display` เสมอ (`B-019`)

---

## 2. ฐานปัญหาเชิงโครงสร้างที่วัดได้จริง (Measured Baseline ณ 2026-11-19)

| มิติ | หลักฐานจริงจากโค้ด | ผลกระทบเชิงโครงสร้าง |
|---|---|---|
| **ขนาดและความซับซ้อนของ UI** | `MapManagementTab.tsx` (2,353 บรรทัด), `DetourManagementTab.tsx` (1,770), `LongdoGisMap.tsx` (1,749), `IncidentRegistryTab.tsx` (1,393), `EventDetourLinkModal.tsx` (1,306), `GisDataImportTab.tsx` (1,218) | แก้จุดเดียวกระทบหลายส่วน, React re-render กว้าง, บำรุงรักษายาก |
| **State & Prop-Drilling** | `app/admin/page.tsx` ถือ `useState` > 20 ตัวส่งผ่าน `AdminConsole.tsx` (620 บรรทัด) ↔ แผนที่; ยิง `window.dispatchEvent(new Event("resize"))` ทุกพิกเซลใน `moveWorkspaceDrag`; import `ExecutiveDashboard` ทั้งที่ตั้ง `HIDE_EXECUTIVE_VIEW_SWITCHER = true` และ import `createClient` โดยไม่ใช้ | แผนที่และแผงฟอร์มผูกแน่น (tight coupling), เกิด layout thrashing ตอนลากแบ่งแผง, JS bundle โตเกินจำเป็น |
| **Data Fetching & Concurrency** | Query เดียว `["dohAdminSystemData"]` โหลด full-res GIS layers ทั้งหมด (~375.6 KB+) ด้วย `staleTime: 0` และ `refetch()` ทั้งก้อนหลังแก้ 1 ฟิลด์; Optimistic locking (`expectedVersion`) มีเฉพาะ `doh_flood_events` ↔ `doh_event_detour_links` ยังไม่มีบน `doh_flood_routes`, `doh_detour_routes`, `doh_highway_layers` | เปลืองแบนด์วิดท์บนเน็ตมือถือภาคสนาม; เจ้าหน้าที่ 2 เครื่องแก้จุดเดียวกันพร้อมกันจะเขียนทับกันเงียบ ๆ (Silent Last-Write-Wins) |
| **Security & Governance** | `supabase/functions/hdms-api/index.ts` (1,035 บรรทัด) ใช้ `service_role` ทุก mutation (`verify_jwt = false`, `B-001` ยอมรับความเสี่ยงชั่วคราว); ยังขาด DB Audit Trail และ Rate-limit guard | หากเกิดการแก้ผิดพลาดหรือถูกรบกวน API จะตรวจสอบย้อนหลังและกู้ค่าเดิมได้ยาก |
| **External Dependencies & Drift** | ยืนยัน Edge Production v24 และบันทึก RPC snapshot แล้ว (ปิด `B-014`); เหลือตั้ง secret `APPS_SCRIPT_WEB_APP_URL` (`B-022`), `GOOGLE_MAPS_API_KEY` (`B-008`), และนโยบายเก็บล้าง `doh_event_detour_operations` (`B-024`) | เสี่ยงสร้างไฟล์ Drive ซ้ำเมื่อ timeout, พึ่ง OSRM สาธารณะที่ไม่มี SLA, ตาราง ledger โตไม่จำกัด |
| **CI/CD & Test Stability** | พบ E2E timing flake ใน `admin-dialog-keyboard.spec.ts:88` และ `public-route-sheet.spec.ts:224`; ช่องว่าง test `B-011` (แก้จุดอิสระ/ตัด-เชื่อมเส้น, แถบไอคอน 1280px, conflict 409) | เสี่ยง CI แดงเป็นช่วง ๆ และยังขาด regression coverage สำหรับงานแก้แนวเส้นลึก |

---

## 3. เมทริกซ์ 6 มิติ × 5 สภาพแวดล้อมของปัญหา

| สภาพแวดล้อมของปัญหา | มิติความเสี่ยงหลัก | เป้าหมายเชิงโครงสร้าง |
|---|---|---|
| **1. PC สำนักงาน (1280–1600px, RAM 4–8GB)** | Performance, State Coupling, GIS Canvas | แยก Cache ข้อมูลนิ่ง (`highwayLayers`, `offices`, `mapStyles`) ออกจากข้อมูลเปลี่ยนบ่อย; throttle resize; lazy-load คอมโพเนนต์ที่ซ่อน; เก็บ field telemetry (`KI-012`) |
| **2. ภาคสนามมือถือ/แท็บเล็ต (360–768px, เน็ตแกว่ง)** | Offline Resilience, Responsive UX, Payload | เพิ่ม Draft Auto-Save (IndexedDB/sessionStorage), ปรับปุ่มปฏิบัติการหลักที่ยัง `< 40px` เป็น `min-h-10`, เพิ่มตัวสลับ "ฟอร์ม / แผนที่" แบบ sticky บน `< lg` |
| **3. ช่วงวิกฤต (เจ้าหน้าที่หลายเครื่องพร้อมกัน)** | Concurrency, Data Integrity, Security | Optimistic Concurrency (`row_version` / `409 Conflict`), DB Audit Trail Trigger (`before/after`), Rate Limit/Validation Guard, Idempotency secret (`B-022`) |
| **4. ฝั่งเซิร์ฟเวอร์ & บริการภายนอก** | Backend Modularity, Schema Drift, SLA | แยกโมดูล `hdms-api/_shared/*`, สกัด Schema Snapshot ของ RPC จริง (`R4`), ตั้ง Secrets (`GOOGLE_MAPS_API_KEY`, `APPS_SCRIPT_WEB_APP_URL`), ทำ Ledger Retention Job (`B-024`) |
| **5. พัฒนา & ปล่อยเวอร์ชัน (Local / AI / CI)** | CI/CD, Test Stability, Governance | ผูก `deploy.yml` รอ `CI` (`B-003`), ล็อก `.mcp.json` read-only (`B-002`), แก้ E2E flake, ซิงก์เอกสารตรงโค้ดจริง (`B-006`) |

---

## 4. แผนดำเนินการ 5 เฟส (Phased Execution Roadmap)

### Phase 0: Release Hygiene & Guardrails — **ปิดแล้ว (`UPDATE-137`, 2026-11-19)**
- [x] `0.1` ปิดและ commit งาน `UPDATE-136` (`0be5f8c`)
- [x] `0.2` ล็อก `.mcp.json` เป็น `read_only=true` และจำกัดเฉพาะฟีเจอร์อ่าน (`B-002`)
- [x] `0.3` ปรับ `.github/workflows/deploy.yml` ให้รอ `CI` ผ่านด้วย `workflow_run` พร้อมคง `workflow_dispatch` สำหรับฉุกเฉิน และตัดการรัน Playwright ซ้ำ (`B-003`)
- [x] `0.4` ซิงก์ `PRODUCTION.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`, `docs/AI_HANDOFF.md` ให้ตรงโค้ดจริง และย้าย `SUPPLEMENTAL_RULES.md` ไป `docs/archive/SUPPLEMENTAL_RULES.md` (`B-006`)

### Phase 1: Security Depth & Ops Hardening — **กำลังดำเนินการ**
- [x] `1.1` ยืนยัน Edge Production (`hdms-api` v24, ACTIVE) และสกัด `pg_get_functiondef` ของ RPC จริงเก็บใน `docs/db-schema-snapshot.md` (`R4`, ปิด B-014)
- [ ] `1.2` ตั้งค่า Secrets บน Supabase Dashboard (`APPS_SCRIPT_WEB_APP_URL` ปิด `B-022`, `GOOGLE_MAPS_API_KEY` ปิด `B-008`) แล้ว re-deploy Edge
- [ ] `1.3` สร้าง migration `doh_admin_audit_log` + trigger เก็บ `before/after` บน `doh_flood_routes`, `doh_detour_routes`, `doh_highway_layers` (`B-001` ทางเลือก C) — *ร่างไฟล์ `supabase/migrations/20261119000300_admin_audit_log_and_ledger_retention.sql` แล้ว (UPDATE-138), รอเจ้าของ apply บน Production*
- [ ] `1.4` สร้าง migration + cron นโยบาย retention/archival สำหรับ `doh_event_detour_operations` และ `doh_external_jobs` ที่เสร็จแล้วเกิน 90 วัน (`B-024`) — *รวมอยู่ใน `20261119000300_admin_audit_log_and_ledger_retention.sql` แล้ว (UPDATE-138), รอเจ้าของ apply บน Production*
- [ ] `1.5` แยก `supabase/functions/hdms-api/index.ts` เป็น `_shared/{validation,google-proxy,outbox,event-detour,handlers}.ts` + basic rate-limit/size guard + Deno unit tests

### Phase 2: Data Layer & Concurrency Architecture
- [x] `2.1` แยก Admin Query เป็น 2 ระดับ: `["dohAdminStaticGis"]` (`staleTime: 10m`) และ `["dohAdminOperational"]` (`staleTime: 0`) พร้อม 1-RTT initial bootstrap และ read-only actions `getAdminOperationalDataAction`/`getAdminStaticGisDataAction` (*ทำแล้วใน UPDATE-140 — ลด refetch payload จาก 458.2 KB เหลือ 165.2 KB (-63.9%) เมื่อ deploy Edge*)
- [ ] `2.2` ขยาย Optimistic Concurrency (`row_version` + `409 Conflict` UI) ไปยัง `doh_flood_routes`, `doh_detour_routes`, `doh_highway_layers`
- [ ] `2.3` เพิ่ม Lightweight Version-Poll / Realtime Banner แจ้งเมื่อมีเจ้าหน้าที่อื่นอัปเดตข้อมูลโดยไม่ล้างฟอร์มที่กำลังพิมพ์
- [x] `2.4` เพิ่ม Draft Auto-Save (`localStorage` + `map-draft-storage.ts`) พร้อมปุ่มกู้คืนร่างและล้างอัตโนมัติหลังบันทึกสำเร็จใน `MapManagementTab` (*ทำแล้วใน UPDATE-141*)

### Phase 3: Frontend State & Modular Refactoring
- [ ] `3.1` แยก State 20+ ตัวจาก `app/admin/page.tsx` เป็น Scoped Contexts/Hooks (`MapInteractionContext`, `AdminLayoutState`, `useToastQueue`)
- [x] `3.2` แก้ `resize` storm ด้วย `scheduleMapResize`/`requestAnimationFrame`, ย้าย `ExecutiveDashboard` เป็น `next/dynamic` และลบ import `createClient` แล้ว — ตรวจ source `app/admin/page.tsx` บน `origin/main` @ `ce105ab`; ไม่ใช่ผลวัด performance รอบใหม่
- [ ] `3.3` แตกไฟล์ > 1,200 บรรทัด (`MapManagementTab`, `DetourManagementTab`, `IncidentRegistryTab`, `EventDetourLinkModal`) ให้แต่ละไฟล์ ≤ ~800 บรรทัด โดยคง DOM/E2E selector ครบ 100% (`R7`)
- [ ] `3.4` ปรับปุ่มปฏิบัติการหลักที่ยัง `< 40px` (`พับแผง` และชั้นฐาน `ui.tsx`/`page.tsx` *ทำแล้วใน UPDATE-139*; เหลือปุ่ม `เส้นน้ำท่วม`/`ทางเลี่ยง`, Combobox `หมายเลขทางหลวง`, `วิเคราะห์คำแนะนำ`) และเพิ่ม Sticky Switch "ฟอร์ม / แผนที่" สำหรับ `< lg` (*ทำแล้วใน UPDATE-139*)

### Phase 4: Field Observability, E2E Stability & Auth Readiness
- [ ] `4.1` เพิ่ม `?debugPerf=1` telemetry mode เก็บตัวเลข canvas/handles/API/memory บนเครื่องเจ้าหน้าที่จริง (`B-005` / `KI-012`)
- [ ] `4.2` E2E stability และ coverage (`B-011`) — มี source tests บางส่วนแล้ว แต่ยังไม่ปิดทั้งรายการ:
  - [x] ปรับ public detour popup เป็น `focus()` + `press("Enter")` ใน `tests/e2e/public-route-sheet.spec.ts` (commit `ce105ab`); ยังไม่ยืนยันความเสถียรจากการรันซ้ำในรอบนี้
  - [ ] ตรวจและแก้ timing flake ของ `tests/e2e/admin-dialog-keyboard.spec.ts` พร้อมหลักฐานการรัน
  - [x] มี coverage เพิ่ม/ลบ/ตัด/เชื่อมจุดและ undo/redo ใน `tests/e2e/gis-geometry-operations.spec.ts`; การบันทึกและ error อยู่ใน `gis-geometry-save.spec.ts` (ตรวจ source เท่านั้น)
  - [x] มี coverage 409 Conflict ของ Event–Detour ใน `tests/e2e/event-detour-links-admin.spec.ts`; ไม่ครอบคลุม concurrency ของ 3 ตารางใน Phase 2.2
  - [ ] ตรวจ/เพิ่ม coverage แถบไอคอนที่ viewport 1280px
  - [ ] เพิ่ม coverage draft recovery (กู้คืน/ลบร่าง/ล้างหลังบันทึกสำเร็จ)
  - [ ] รัน regression ที่เกี่ยวข้องและยืนยันเสถียรภาพก่อนปิด 4.2
- [ ] `4.3` เตรียม Auth-Ready Switch (`REQUIRE_ADMIN_AUTH` env flag + `_shared/auth.ts` + `app/login/page.tsx`) สำหรับเปิดใช้เมื่อเจ้าของระบบเปลี่ยนนโยบาย `B-001` — พักไว้ตามคำสั่งเจ้าของ
- [ ] `4.4` นำ Asset ตราครุฑทางการที่ผ่านอนุมัติมาใช้งานจริง (`B-016`)
