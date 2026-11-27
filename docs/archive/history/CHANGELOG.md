# CHANGELOG.md — บันทึกงานใหม่ (แทนการเพิ่มใน docs/archive/SUPPLEMENTAL_RULES.md)

### 2026-11-26 คงหมุดเมื่อไม่ทราบระดับน้ำและรายงานผลบันทึกแยกฝั่ง
- ใช้กฎเดียวกันระหว่างหมุด รายการ รายละเอียด และโหมดโฟกัส แยก 0 ที่ยืนยันแล้วออกจากไม่ทราบ และเขียน flag ทั้งสองชื่อให้ตรงกับค่าของแต่ละฝั่งจากแอดมิน
- แยกกรณีฝั่งซ้ายถูกปฏิเสธ บันทึกฝั่งขวาค้าง และยังไม่ทราบผล; ลองใหม่เฉพาะฝั่งขวาที่ถูกปฏิเสธด้วยข้อมูลเดิม ส่วนกรณีไม่ทราบผลต้องตรวจทะเบียนก่อน ไม่ส่งซ้ำอัตโนมัติ
- การเขียนยังไม่ใช่ transaction เดียว ไม่เปลี่ยน Edge, schema หรือข้อมูลเดิมในชุดนี้; ปล่อยเฉพาะเว็บ ย้อนกลับได้ด้วย revert

### 2026-11-26 ใช้หมุดคลื่นน้ำแบบเดียวกันในโหมดรวมเหตุการณ์และแยกช่วง
- แสดงหมุดคลื่นอย่างเดียวเมื่อซูมออก แสดงเลขสายทางเมื่อซูมกลาง และแสดงระดับน้ำกับจำนวนช่วงในโหมดรวมเมื่อซูมเข้า โดยไม่เปลี่ยนการจัดกลุ่ม พิกัด หรือสถานะเดิม
- เปลี่ยนเฉพาะไอคอนเมื่อซูมเพื่อคงป๊อปอัปที่เปิดอยู่; ปล่อยเฉพาะเว็บและย้อนกลับได้ด้วยการ revert ชุดแก้

### 2026-11-27 จัดโครงสร้างโมดูลแผนที่ร่วมและคู่มือทดสอบ
- หน้าประชาชนและแอดมินเรียกตัวโหลดแผนที่เดียว; แยกการวาดโฟกัสกับแถบโฟกัสโดยคงปุ่มเฉพาะหน้าและข้อมูลเดิม
- เพิ่มคู่มือไฟล์/เทสต์ของปุ่ม เลเยอร์ ป๊อปอัป สถานะ และโฟกัส; ลดการกดซ้ำของเทสต์พฤติกรรมร่วม แต่ยังตรวจการเชื่อมต่อและพื้นที่กดทั้งสองหน้า ไม่เปลี่ยนฐานข้อมูล

### 2026-11-26 ปรับหน้าตาป๊อปอัปหมุดทางเลี่ยง A/B
- จัดส่วนหัวและปุ่ม A/B ให้กระชับ ตามด้วยภาพ 1:1 พื้นที่ คำอธิบาย และไทม์ไลน์แบบบรรทัด พร้อมการแสดงผลตามธีมประชาชน
- คงลิงก์และลำดับปุ่มเดิม การขยายภาพ จุดที่เลือก และทิศทางเดินทาง ไม่แตะป๊อปอัปที่เปิดจากเส้นทางเลี่ยงหรืองานแอดมิน; ปล่อยเฉพาะเว็บและย้อนกลับได้ด้วยการ revert

### 2026-11-26 แจ้งเตือนเมื่อภาพเต็มจอโหลดช้าและให้ลองใหม่
- ตัวดูภาพเต็มจอร่วมของน้ำท่วมและจุดทางเลี่ยง A/B แยกสถานะโหลดช้าออกจากโหลดไม่สำเร็จ พร้อมปุ่มลองโหลดอีกครั้งโดยไม่ต้องปิดหน้าต่างหรือเปลี่ยน URL ภาพ
- คงการปิดและคืนโฟกัสไปที่รูปเดิม ไม่เปลี่ยนไฟล์แนบ รูปย่อ เส้นทาง หรือฐานข้อมูล; ปล่อยเฉพาะเว็บและย้อนกลับด้วยการ revert ชุดแก้

### 2026-11-26 แยกคู่สีคำแนะนำทางเลี่ยงในธีมสว่าง
- จับคู่สีพื้นกับสีข้อความในแผงคำแนะนำ ลำดับขั้นและระยะทาง พร้อมแยกสถานะปุ่มขาไป/ขากลับให้ชัดในธีมสว่าง
- ไม่เปลี่ยนธีมมืด แผนที่สถานะจราจร หรือข้อมูลทางเลี่ยง; ปล่อยเฉพาะเว็บและย้อนกลับด้วยการ revert

### 2026-11-26 จัดลำดับป๊อปอัปน้ำท่วมและเปิดภาพเต็มจอ
- จัดรูปและสถานะก่อนข้อมูลพื้นที่และระดับน้ำในป๊อปอัปประชาชน; แยกภาพประกอบเมื่อไม่มีรูปกับข้อความเมื่อโหลดภาพไม่สำเร็จ
- เปิดรูปจากป๊อปอัป รายละเอียดน้ำท่วม และจุดทางเลี่ยง A/B ในตัวดูภาพเดียวกัน; ปิดแล้วคืนโฟกัสและคงจุด/ทิศทางเดิม
- ป๊อปอัปจุด A/B ใช้แนวภาพและไทม์ไลน์จากหน้ารายละเอียดทางเลี่ยง พร้อมสีเน้นหัวการ์ด จุดที่เลือก และไอคอนเปิดรูปขนาดเต็ม โดยรูปย่อเต็มกรอบ 1:1 เฉพาะในป๊อปอัปจุด A/B; หน้ารายละเอียดที่เปิดจากเส้นทางเลี่ยงคงเดิม
- ตรวจลิงก์ Google Maps จากคำแนะนำและหมุด A/B ให้ตรงตามทิศทาง และให้ Tab ในหน้าติดต่อหน่วยงานวนกลับภายในหน้าต่าง
- ไม่เปลี่ยนฐานข้อมูลหรือการนำทาง; ย้อนกลับได้ด้วยการ revert ชุดแก้

### 2026-11-26 แยกสถานะการโหลดข้อมูลและเวลาอัปเดตหน้าประชาชน
- แสดงสถานะกำลังโหลด โหลดไม่สำเร็จ และข้อมูลจากครั้งก่อนแยกจากกรณียืนยันว่าไม่มีรายงาน; ไม่เปลี่ยนฐานข้อมูลหรือสัญญา API
- แยกเวลาดึงข้อมูลสำเร็จออกจากเวลาอัปเดตรายงาน และแจ้งข้อมูลใหม่เมื่อเนื้อหารายงานเปลี่ยน ไม่ใช่เมื่อเวลาในการตอบกลับเปลี่ยน
- เป็นการแก้เฉพาะหน้าเว็บ ย้อนกลับได้ด้วยการ revert ชุดแก้

### [UPDATE-145] 2026-11-20 แยกตัวกรองสายทางหน้าประชาชนและให้แผนที่ลดความเด่นตามตัวกรอง
- แท็บน้ำท่วมแสดงเฉพาะชิป `ทล.` จากเหตุ active; แท็บทางเลี่ยงแสดง `ทล.` ที่ผูกเหตุ และ `ปน.`/`ปน.ถ.` ของทางเลี่ยงอิสระ พร้อมจำนวนรายการและเรียงหมายเลขแบบ numeric.
- แผนที่คง Canvas layer เดิมและข้อมูลความปลอดภัยทั้งหมด: เส้นที่ไม่ตรงตัวกรองเหลือ opacity 25% พร้อมป้าย `กำลังกรอง` และปุ่มล้าง. Deploy เฉพาะเว็บ; ย้อนกลับด้วย `git revert`.

### [UPDATE-144] 2026-11-20 ตรวจ Roadmap 3.2 และแยก coverage 4.2
- ตรวจ source บน `origin/main` @ `ce105ab`: ปิด 3.2 จาก RAF resize scheduling, dynamic dashboard และการถอด import ที่ไม่ใช้; แยก 4.2 เป็นรายการย่อยตาม test ที่มีอยู่ พร้อมระบุว่ายังไม่ได้รันทดสอบรอบนี้
- พัก 4.3 (login/auth) ตามคำสั่งเจ้าของ; เอกสารเท่านั้น ไม่ต้อง deploy และย้อนกลับได้ด้วยการ revert การแก้เอกสาร

### [UPDATE-143] 2026-11-19 แก้ migration Admin Audit และ retention preflight [B-001, B-024]
- **ไฟล์:** `supabase/migrations/20261119000300_admin_audit_log_and_ledger_retention.sql`, `docs/{AI_HANDOFF,BACKLOG,KNOWN_ISSUES,CHANGELOG}.md`
- **การแก้ไข:** Audit trigger ใช้ `layer_id` สำหรับ `doh_highway_layers`; บันทึก JWT subject หรือ `system:database` แทน `current_user` ภายใน `SECURITY DEFINER`; เพิ่ม `doh_preview_operational_ledger_prune()` สำหรับนับข้อมูลก่อนลบ และ partial index `doh_external_jobs_done_updated_idx` สำหรับงาน `done` ที่ retention query ใช้; cron job ถูกสร้างแบบ inactive เพื่อให้เจ้าของตรวจ preflight ก่อนเปิดใช้
- **ลำดับ Deploy / แผนย้อนกลับ:** ผู้ใช้ต้องรัน SQL migration ก่อน; Edge Function และเว็บไม่ต้อง deploy. จากนั้นบันทึกผล `select public.doh_preview_operational_ledger_prune(90, 90, 180);` และให้เจ้าของ activate cron job เมื่ออนุมัติแล้ว การย้อนกลับแบบปลอดภัยให้ unschedule cron และลบ trigger โดยเก็บ audit table ไว้ก่อน

### [UPDATE-142] 2026-11-19 ซิงก์เอกสารสถานะ Production Edge และปิด B-014
- **ไฟล์:** `docs/AI_HANDOFF.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`, `docs/ADMIN_ROADMAP.md`, `docs/CHANGELOG.md`
- **การแก้ไข:** อ้างอิง `docs/db-schema-snapshot.md` ซึ่งยืนยันแบบ read-only ว่า Production `hdms-api` เป็น v24, `verify_jwt: false`, สถานะ ACTIVE และเก็บนิยาม RPC ที่ deploy จริงแล้ว; ปิด B-014 และปรับแผน Phase 1.1/งานส่งต่อให้ไม่ทำซ้ำ
- **การตรวจ:** ตรวจ cross-reference ของเอกสารทั้งหมดกับ `origin/main` @ `ce105ab` และ `docs/db-schema-snapshot.md`; ไม่ได้รัน build หรือ E2E เพราะไม่มีโค้ดหรือ test เปลี่ยน
- **ลำดับ Deploy / แผนย้อนกลับ:** ไม่ต้อง deploy (เอกสารเท่านั้น); ย้อนกลับด้วย `git revert` commit เอกสารนี้

### [UPDATE-141] 2026-11-19 เพิ่มระบบ Draft Auto-Save และแบนเนอร์กู้คืนร่างใน `MapManagementTab` [ADMIN_ROADMAP Phase 2.4]
- **ไฟล์:** `components/admin/tabs/map-draft-storage.ts` (ใหม่), `components/admin/tabs/MapManagementTab.tsx`
- **การแก้ไข:**
  1. สร้าง helper `map-draft-storage.ts` เก็บร่างฟอร์มลง `localStorage` (`hdms_admin_map_draft_v1`, อายุสูงสุด 24 ชม.) พร้อมตรวจข้อมูลที่มีสาระและจับ error กรณี private mode/quota เต็ม
  2. เพิ่ม debounced auto-save (600ms) เฉพาะโหมดสร้างรายการใหม่ (`!routeEditId && !editingRoute?.id`), แสดงแบนเนอร์ `พบร่างข้อมูลที่พิมพ์ค้างไว้` พร้อมปุ่ม `กู้คืนร่างที่ค้างไว้` และ `ลบร่าง` (`min-h-[2.5rem]`, `max-w-[65ch]`), และล้างร่างอัตโนมัติใน `handleClearRoute()` หลังบันทึกสำเร็จหรือกดล้างฟอร์ม
- **การทดสอบ:** `npm run check:deploy` ผ่าน (0 warnings, 0 errors, build 6/6); `PLAYWRIGHT_STATIC=1 npm run test:e2e` ผ่าน **106 passed, 44 skipped, 0 failed** (1.5m)
- **ลำดับ Deploy / แผนย้อนกลับ:** Deploy เฉพาะ **เว็บ**; ย้อนกลับได้ทันทีด้วยการ revert ไฟล์ทั้ง 2 ไฟล์

### [UPDATE-140] 2026-11-19 แยกการโหลดข้อมูลหน้าแอดมินเป็น 2 ระดับ (Static GIS vs Operational) ลด payload `refetch()` ลง 63.9% [ADMIN_ROADMAP Phase 2.1]
- **ตัวเลขวัดจริงจาก Production Read-Only (`getSystemDataAction`):**
  - ก่อนแยก (Refetch ก้อนเดียวทุกครั้งหลังบันทึก): **`469,183 bytes` (`458.2 KB`)** (latency 3 รอบ: `1970 / 586 / 509 ms`)
  - สัดส่วน Static GIS (`highwayLayers` `231.9 KB` + `offices`/`mapStyles`/`systemSettings`): **`300,010 bytes` (`293.0 KB` = `63.9%`)**
  - สัดส่วน Operational (`floodRoutes`, `detourRoutes`, `timelineUpdates`, `mitigationProjects`, `eventDetourLinks`, `eventSegments`, `floodEvents`): **`169,174 bytes` (`165.2 KB` = `36.1%`)** → หลัง deploy Edge Function `hdms-api` รอบนี้ การบันทึกเหตุการณ์/ทางเลี่ยงจะดาวน์โหลดเฉพาะ `165.2 KB` (**ลดลง 293.0 KB / -63.9%**) และคง reference ของ `highwayLayers` ไม่ให้ `LongdoGisMap` วาดเส้นทางหลวงใหม่
- **ไฟล์ที่แก้:**
  1. `supabase/functions/hdms-api/index.ts`: เพิ่ม read-only actions `getAdminOperationalDataAction` และ `getAdminStaticGisDataAction` ใน `READ_ONLY_EDGE_ACTIONS` (คง `getSystemDataAction` ไว้ 100%)
  2. `app/actions/doh-actions.ts`: เพิ่ม `getAdminOperationalDataAction` / `getAdminStaticGisDataAction` พร้อม automatic fallback กลับ `getSystemDataAction()` หาก Edge Production ยังไม่ deploy เวอร์ชันใหม่
  3. `app/admin/page.tsx`: โหลดเริ่มต้น 1 RTT ด้วย `getSystemDataAction` เพื่อ hydrate ทั้ง `["dohAdminStaticGis"]` (`staleTime: 10m`) และ `["dohAdminOperational"]` (`staleTime: 0`) จากนั้น `refreshAdminData(scope)` รีเฟรชเฉพาะชั้นที่เปลี่ยน
  4. `components/admin/AdminConsole.tsx`: ส่ง `onDataRefresh("static")` ให้แท็บ `routes`, `style`, `system` และคง default `"operational"` ให้แท็บปฏิบัติการ (`map`, `incidents`, `detours`, `projects`)
- **การทดสอบ:** `npm run check:deploy` ผ่าน (0 warnings, 0 errors, build 6/6); `PLAYWRIGHT_STATIC=1 npm run test:e2e` ผ่าน **106 passed, 44 skipped, 0 failed** (1.7m)
- **ลำดับ Deploy / แผนย้อนกลับ:** 1) Deploy Edge Function `hdms-api` (optional ทำก่อนหรือหลังเว็บก็ได้เพราะมี fallback อัตโนมัติ) → 2) Deploy เว็บ; ย้อนกลับได้ทันทีด้วย `git revert`

### [UPDATE-139] 2026-11-19 ปรับชั้นฐานหน้าแอดมินเป็น Modern CSS Units (`rem`/`em`/`%`/`dvh`/`ch`) และเพิ่มปุ่มสลับ ฟอร์ม/แผนที่ บน `< lg` [ADMIN_ROADMAP Phase 3.2/3.4]
- **ไฟล์ที่แก้:** `app/globals.css`, `components/admin/ui.tsx`, `app/admin/page.tsx`
- **การแก้ไข:**
  1. `app/globals.css`: แปลง container query (`31.25rem`/`31.3125rem`/`42.5rem`/`53.75rem`), `.doh-capsule-tag` และ `.doh-highway-shield` เป็น `rem`/`em` (คง `px` เฉพาะเส้นขอบ hairline และ `box-shadow`) พร้อมเพิ่ม `.doh-readable-copy { max-width: 65ch; }`
  2. `components/admin/ui.tsx`: ปรับ `FormSection`, `ToolGroup`, `ActionButton`, `StickyActionBar` ใช้ `rem` สำหรับตัวอักษร/ความสูงขั้นต่ำ `2.5rem`, `em` สำหรับ padding/gap ในปุ่มและส่วนหัว, และ `max-w-[65ch]` สำหรับคำอธิบาย
  3. `app/admin/page.tsx`: เปลี่ยนเป็น `min-h-dvh lg:h-dvh`, `clamp(45rem,50vw,65rem)`, `min-h-[2.5rem]` บนปุ่มหลักรวมถึง `พับแผง`, ใช้ `requestAnimationFrame` throttle event `resize` ระหว่างลากแบ่งหน้าจอ (`scheduleMapResize`), และเพิ่ม Sticky Segmented Switch `ฟอร์มข้อมูล` / `แผนที่ GIS` สำหรับ `< lg` (สลับไปแผนที่อัตโนมัติเมื่อเปิดโหมดปักหมุด `adminPickMode`)
- **การทดสอบ:** `npm run check:deploy` ผ่าน (0 warnings, 0 errors, build 6/6); `PLAYWRIGHT_STATIC=1 npm run test:e2e` รอบเต็มผ่าน 105/106 (44 skipped, 1 timeout ชั่วคราวที่ `admin-menus.spec.ts:251` ซึ่งรันซ้ำผ่านใน `1.5s`)
- **ลำดับ Deploy / แผนย้อนกลับ:** Deploy เฉพาะ **เว็บ**; ย้อนกลับได้ทันทีด้วย `git checkout HEAD -- app/globals.css components/admin/ui.tsx app/admin/page.tsx`

### [UPDATE-138] 2026-11-19 ร่าง SQL Migration สำหรับ Phase 1.3 (DB Audit Log) และ Phase 1.4 (Ledger Retention 90 วัน) [B-001, B-024]
- **ไฟล์ใหม่:** `supabase/migrations/20261119000300_admin_audit_log_and_ledger_retention.sql`
- **รายละเอียด:**
  1. สร้างตาราง `public.doh_admin_audit_log` (RLS เปิดและจำกัดสิทธิ์เฉพาะ `service_role`) + trigger `doh_record_admin_audit_log()` บน `doh_flood_routes`, `doh_detour_routes` และ `doh_highway_layers` (ตัดคอลัมน์อนุพันธ์ `geom`, `geojson_display` ออกและข้าม no-op update เพื่อประหยัดพื้นที่)
  2. สร้างฟังก์ชัน `public.doh_prune_operational_ledgers(90, 90, 180)` สำหรับลบ `doh_event_detour_operations` (> 90 วัน), `doh_external_jobs` เฉพาะ `status = 'done'` (> 90 วัน) และ `doh_admin_audit_log` (> 180 วัน) พร้อมตาราง `pg_cron` รายวัน `'hdms-prune-operational-ledgers'` เวลา `20:15 UTC` (`03:15` น. เวลาไทย)
- **สถานะ Production:** **ยังไม่ได้ apply เข้า Production DB** (ตาม `AGENTS.md R5` — รอเจ้าของระบบตรวจและรันเองใน Supabase SQL Editor)
- **ลำดับ Deploy / แผนย้อนกลับ:** รันเฉพาะไฟล์ SQL migration ใน SQL Editor (ไม่กระทบ Edge/เว็บ); แผนย้อนกลับระบุครบที่หัวไฟล์ migration

### [UPDATE-137] 2026-11-19 บันทึกกติกาถาวรปรับโครงสร้างหน้าแอดมิน (`docs/ADMIN_ROADMAP.md`) และปิด Phase 0 ครบชุด [B-002, B-003, B-006]
- **การอนุมัติจากเจ้าของระบบ:** อนุมัติให้บันทึกแผน Roadmap 5 เฟสและกติกาควบคุมความเสี่ยงเป็นกติกาถาวร พร้อมอนุมัติแก้ `.mcp.json` และ `.github/workflows/deploy.yml` ตาม `AGENTS.md §4`
- **การแก้ไข:**
  1. สร้าง `docs/ADMIN_ROADMAP.md` (แผนโครงสร้างหน้าแอดมิน 5 เฟสแบบ Incremental Zero-Downtime, เมทริกซ์ 6 มิติ × 5 สภาพแวดล้อม และกติกาความปลอดภัยถาวร) พร้อมเชื่อมใน `AGENTS.md`, `docs/AI_HANDOFF.md`, `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`
  2. **ปิด `B-002`:** ปรับ `.mcp.json` เพิ่ม `read_only=true` และจำกัดเฉพาะฟีเจอร์อ่าน (`docs,database,debugging,development`) ให้สอดคล้องกับ ADR-001
  3. **ปิด `B-003`:** ปรับ `.github/workflows/deploy.yml` ใช้ `workflow_run` รอ `workflows: ["CI"]` (`conclusion == 'success'`, checkout `head_sha`) โดยคง `workflow_dispatch` สำหรับฉุกเฉิน และตัดการรัน Playwright ซ้ำออกจาก `deploy.yml` (ให้ `ci.yml` เป็นด่าน E2E เดียว)
  4. **ปิด `B-006`:** ย้าย `SUPPLEMENTAL_RULES.md` ไปที่ `docs/archive/SUPPLEMENTAL_RULES.md` และปรับลิงก์อ้างอิงทุกไฟล์
  5. ซิงก์ `PRODUCTION.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`, `docs/PLAYBOOKS.md` และ `docs/AI_HANDOFF.md` ให้ตรงกับโค้ดจริง
- **ลำดับ Deploy / แผนย้อนกลับ:** ไม่กระทบ SQL/Edge Function; ย้อนกลับได้ทันทีด้วย `git revert` commit นี้

### [UPDATE-136] 2026-11-19 ผูก `htmlFor`/`id` และ `aria-label` ให้ fallback `<select>` ของช่องเลือกหมายเลขทางหลวงใน `HighwayIdentificationSection`
- **ปัญหา:**
  - Fallback `<select className="sr-only">` ของช่องหมายเลขทางหลวงใน `HighwayIdentificationSection.tsx` มี `tabIndex={-1}` และ `aria-hidden="true"` เพื่อรองรับการส่งฟอร์ม/fallback มาตรฐาน แต่ไม่มี `id` และ `aria-label` และป้าย `<label>` ด้านบนไม่มี `htmlFor` ทำให้สคริปต์ตรวจความเข้าถึง (Accessibility Audit) รายงาน `missingLabelInputsCount: 1` ทุก viewport
- **การแก้ไข:**
  - `components/admin/tabs/HighwayIdentificationSection.tsx`: ผูก `<label htmlFor="highway-route-select-fallback">` พร้อมกำหนด `id="highway-route-select-fallback"` และ `aria-label="หมายเลขทางหลวง"` ให้ `<select className="sr-only">` โดยคง `tabIndex={-1}` และ `aria-hidden="true"`
- **ความสอดคล้อง & การทดสอบ:**
  - `npm run check:deploy` (`eslint . --max-warnings=0`, `tsc --noEmit`, `build:pages`): ผ่าน (exit code 0)
  - `PLAYWRIGHT_STATIC=1 npm run test:e2e`: `106 passed`, `44 skipped`, `0 failed` ครบทั้ง 150 เคส
  - สคริปต์ตรวจ 5 ขนาดหน้าจอ (`360–1600px`): `missingLabelInputsCount` ลดจาก `1` เป็น `0` ครบทุก viewport ทุกบริบท
- **ลำดับ Deploy / แผนย้อนกลับ:** Deploy เฉพาะ **เว็บ**; ย้อนกลับได้ด้วยการ revert ไฟล์ `components/admin/tabs/HighwayIdentificationSection.tsx`

### [UPDATE-135] 2026-11-19 ปิดงาน B-025 ส่วนที่เหลือ (`DetourAdviceSection`, โมดัล `DetourManagementTab`, และ `lg:h-screen` ใน `app/admin/page.tsx`)
- **ปัญหา:**
  - `components/admin/tabs/DetourAdviceSection.tsx` ยังใช้ `<span>` กับช่องกรอก Google Maps URL 2 ช่อง (`ขาไป A→B` และ `ขากลับ B→A`) ทำให้ `<input type="url">` ขาด `htmlFor`/`id`
  - โมดัล `รายละเอียดเส้นทางเลี่ยง` และ `แก้ไขข้อมูลเส้นทางเลี่ยง` ใน `components/admin/tabs/DetourManagementTab.tsx` มีปุ่มปิด/ปุ่มล่างสูง `32–34px` (< `40px`), group label ใช้ `<label>` ไม่ผูก input และช่อง URL ขาไป-ขากลับ / สภาพถนน / Checkbox เปิดใช้งานยังขาด `htmlFor`/`id` หรือ `aria-label`
  - `app/admin/page.tsx` ใช้ `min-h-screen` โดยไม่ล็อกความสูงบนเดสก์ท็อป (`lg+`) ทำให้การเลื่อนฟอร์มฝั่งซ้าย (`.doh-form`) ดันหัวเว็บและแถบแผนที่ GIS ฝั่งขวาหลุดออกจาก viewport ได้ (`bannerTop: -407`, `inViewport: false`)
- **การแก้ไข:**
  - `components/admin/tabs/DetourAdviceSection.tsx`: เปลี่ยนป้ายกำกับเป็น `<label htmlFor="detour-gmaps-url-fwd">` / `<label htmlFor="detour-gmaps-url-rev">` และผูก `id` ให้ `<input type="url">` ทั้ง 2 ช่อง
  - `components/admin/tabs/DetourManagementTab.tsx`: ปรับปุ่มปิดโมดัล (`ปิดรายละเอียด`, `ปิดหน้าต่างแก้ไขเส้นทางเลี่ยง`), ลิงก์ `ทดสอบเปิด Google Maps`, และปุ่ม `แก้ไขข้อมูล`, `ลบทางเลี่ยง`, `วิเคราะห์คำแนะนำอัตโนมัติ`, `เปิดเครื่องมือวาดแผนที่`, `ยกเลิก`, `บันทึกข้อมูล` เป็น `min-h-10` (และ `min-w-10` สำหรับปุ่มปิด), เปลี่ยน `<label>` กลุ่มเส้นทางเป็น `<span>`, ผูก `htmlFor`/`id` (`edit-detour-gmaps-url-fwd`, `edit-detour-gmaps-url-rev`, `edit-detour-road-condition`) และเพิ่ม `aria-label="เปิดใช้งานเส้นทางเลี่ยง"`
  - `app/admin/page.tsx`: เพิ่ม `lg:h-screen lg:overflow-hidden` ให้คอนเทนเนอร์หลักบนเดสก์ท็อป โดยคงการเลื่อนปกติบนจอ `< lg`
- **ความสอดคล้อง & การทดสอบ (ตรวจจริงบน working tree ล่าสุด):**
  - `npm run check:deploy` (`eslint . --max-warnings=0`, `tsc --noEmit`, `build:pages`): ผ่าน (exit code 0)
  - `PLAYWRIGHT_STATIC=1 npm run test:e2e`: `106 passed`, `44 skipped` (กรณีที่ต้องใช้ server/backend สดหรือถูก skip ตามเงื่อนไข static), `0 failed`
  - สคริปต์ตรวจ Playwright 5 ขนาดหน้าจอ (`360–1600px`) และตรวจโมดัล (`360×640`, `1280×800`): `จัดการแผนที่(DETOUR)` มี `missingLabelInputsCount: 0`, โมดัล `รายละเอียดเส้นทางเลี่ยง` และ `แก้ไขข้อมูลเส้นทางเลี่ยง` ได้ `missingLabels: 0` และ `unlabeledBtns: 0`, แบนเนอร์ปักหมุด A บนแผนที่ `1280×800` อยู่ที่ `bannerTop: 128`, `bannerBottom: 186`, `inViewport: true`
- **ลำดับ Deploy / แผนย้อนกลับ:** Deploy เฉพาะ **เว็บ** (`build:pages` / GitHub Pages) ไม่มีการเปลี่ยน SQL/Edge Function; ย้อนกลับได้ทันทีด้วยการ revert commit ในไฟล์ UI 3 ไฟล์ (`app/admin/page.tsx`, `DetourAdviceSection.tsx`, `DetourManagementTab.tsx`)

### [UPDATE-134] 2026-11-19 ปรับปรุง `htmlFor`/`aria-label` และขนาดปุ่ม ≥ 40px ใน `HighwayIdentificationSection`, `FloodSituationSection`, `IncidentRegistryTab` และ `GisHighwayModals` [B-025]
- **ไฟล์:** `components/admin/tabs/HighwayIdentificationSection.tsx`, `components/admin/tabs/FloodSituationSection.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/GisHighwayModals.tsx`, `docs/{CHANGELOG,BACKLOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **`HighwayIdentificationSection.tsx`:** ผูก `htmlFor`/`id` ครบทุกช่องกรอก (เหตุการณ์หลัก, จุดสังเกตหน้างาน, จุดน้ำท่วมอ้างอิง/ชื่อทางเลี่ยงในโหมด DETOUR, ชื่อตอนสายทางหลวง), เพิ่ม `role="group"` + `aria-pressed` ให้ปุ่มทิศทางเดินรถทางเลี่ยง, และขยายปุ่มเลือกโหมดเหตุการณ์/ปุ่มดึงพิกัด/ปุ่มฝั่งถนนเบื้องต้น/ปุ่มคำนวณ Linear Referencing เป็น `min-h-10`
  2. **`FloodSituationSection.tsx`:** ผูก `htmlFor`/`id` ให้วันเวลาเริ่มเกิดเหตุ, มาตรการอำนวยความปลอดภัย, ผู้รายงาน, สาเหตุ/หมายเหตุ และ `aria-label` บน input อัปโหลดภาพ, เพิ่ม `aria-pressed` และ `min-h-10` ให้ปุ่มส่วนถนนที่กระทบทั้งแบบเดี่ยวและแยก 2 ฝั่ง, ขยายปุ่มลบภาพเป็น `min-h-9 min-w-9` พร้อม `aria-label`
  3. **`IncidentRegistryTab.tsx`:** เพิ่ม `aria-label="ค้นหาเหตุการณ์น้ำท่วม"`, คง `aria-label="ลบช่วงนี้ (กู้คืนได้)"` ตาม E2E, ขยายปุ่มแถวเหตุการณ์/ปุ่มในโมดัล (`รายละเอียด`, `อัปเดตระดับน้ำ`, `แบ่งช่วง`, `รวมช่วง`) เป็น `min-h-10`, ปุ่มแก้ตัวเลข inline เป็น `min-h-9` และผูก `htmlFor`/`id` ครบทุกช่องในโมดัล `อัปเดตระดับน้ำ` และ `แบ่งช่วงกิโลเมตร`
  4. **`GisHighwayModals.tsx`:** ผูก `htmlFor`/`id`/`aria-label` ครบทุกช่องในโมดัล `ตั้งค่าคุณสมบัติทางวิศวกรรม` (หมายเลขทางหลวง, ชื่อตอน, ช่องจราจร, ผิวจราจร, หน่วยงาน, ประเภททางหลวง, หมายเหตุ, สวิตช์แสดงผลบนแผนที่) และขยายปุ่มปิดและปุ่มล่างของโมดัล `ตั้งค่า`, `รายละเอียดสายทาง` และ `ปรับแนวถนนทางหลวง` เป็น `min-h-10`
- **ตรวจแล้ว:**
  - `npm run check:deploy` (`eslint . --max-warnings=0 && tsc --noEmit && build:pages` 6/6 หน้า) — ผ่านสมบูรณ์
  - `PLAYWRIGHT_STATIC=1 BASE_PATH=/hdms_pn npm run test:e2e` — **106 passed, 44 skipped, 0 failed** (ทุกเคส `admin-menus.spec.ts`, `flood-form-rules.spec.ts`, `admin-dialog-keyboard.spec.ts`, `admin-shared-dialog-keyboard.spec.ts`, `gis-dialog-keyboard.spec.ts` ผ่าน)
  - Playwright 5 ขนาดหน้าจอ + โมดัล (`360×640`–`1600×960`): `unlabeledControls=0` ทุกหน้าจอที่แก้, โมดัล `ตั้งค่าคุณสมบัติทางวิศวกรรม`, `อัปเดตระดับน้ำ`, `แบ่งช่วงกิโลเมตร`, `รวมช่วงกิโลเมตร` มี `smallBtns=0, missingLabels=0`
- **ลำดับ Deploy & ย้อนกลับ:**
  - ไม่มีงาน SQL / DB / Edge Function (เว็บ static อย่างเดียว; ย้อนกลับด้วย `git revert`)

### [UPDATE-133] 2026-11-19 ปรับปรุง Layout แผงแอดมิน (768–1600px), Accessibility (`aria-label`/`htmlFor`), ขนาดปุ่มสัมผัส และสลับดูแผนที่บนมือถือ `< lg`
- **ไฟล์:** `app/admin/page.tsx`, `app/globals.css`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `components/admin/tabs/HighwaySpecificationsTableSection.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `components/admin/tabs/SystemSettingsTab.tsx`, `components/admin/tabs/LineStylingTab.tsx`, `docs/{CHANGELOG,BACKLOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **แก้แถบเครื่องมือล้นขวา `.doh-form` (768–1600px):** ปรับแถบด้านบนของ `DetourManagementTab.tsx` และ `HighwaySpecificationsTableSection.tsx` ให้ wrap อัตโนมัติ (เอา `shrink-0` และ `md:flex-row`/`sm:flex-row` ที่ดันทะลุความกว้างแผงออก) พร้อมเพิ่ม `min-h-10` ให้ปุ่มหลัก
  2. **ปรับเกณฑ์ตาราง `รายการทางเลี่ยง` และป้องกัน DOM ซ้ำซ้อน:** ปรับ `@container` ของ `.doh-auto-table` ใน `app/globals.css` เป็น `500px` (`cards` `<= 500px`, `table` `> 500px`) เพื่อให้เดสก์ท็อป (`1280×800`, `1600×960`) แสดงตารางได้โดยไม่บังคับการ์ดมือถือ พร้อมใช้ `ResizeObserver` ใน `DetourManagementTab.tsx` แสดงเฉพาะโหมดที่ใช้งานจริงหลัง mount เพื่อไม่ให้เหลือ DOM ซ้ำซ้อนและคงตัวเลือกปุ่ม `"แก้ไข"` (`aria-label="แก้ไข"`) ตาม E2E
  3. **เพิ่ม `aria-label`, `htmlFor` และขนาดปุ่มสัมผัส:**
     - `app/admin/page.tsx`: เพิ่ม `aria-label` และขนาด `min-h-10 min-w-10` ให้ลิงก์ `หน้าประชาชน` (มือถือ) และปุ่มรีเฟรชข้อมูล; เพิ่มปุ่ม `ดูแผนที่` (`lg:hidden`) ใน Header, ปุ่ม `↑ กลับไปฟอร์ม` ในกรอบแผนที่ และ auto-scroll ไปยังแผนที่เมื่อเปิดโหมดปักหมุด (`adminPickMode`) บนจอ `< 1024px` แล้วเลื่อนคืนตำแหน่งเดิมเมื่อปักหมุดเสร็จ
     - `AdminConsole.tsx`: เพิ่ม `aria-label`/`aria-expanded`/`min-h-10` ให้ปุ่มย่อ-ขยาย Sidebar และเปลี่ยนแถบแท็บมือถือเป็น `<nav aria-label="เมนูจัดการแอดมินมือถือ">` พร้อม `aria-current="page"` และ `min-h-10`
     - `SystemSettingsTab.tsx`: ผูก `htmlFor`/`id` ครบทั้งฟอร์มข้อมูลระบบ (4 ช่อง) และฟอร์มสำนักงาน (5 ช่อง) พร้อมปรับปุ่มเป็น `min-h-10` (`40px`) และปุ่มแก้ไข/ลบสำนักงานเป็น `min-h-10 min-w-10`
     - `DetourManagementTab.tsx`, `HighwaySpecificationsTableSection.tsx`, `GisDataImportTab.tsx`: เพิ่ม `aria-label` บนช่องค้นหา/ตัวกรอง/ปุ่มไอคอน (ตา, ลบ, ซูม, แก้ไข, ลบเลเยอร์) และเพิ่มความสูง/กว้างสัมผัส `>= 36–40px`
     - `LineStylingTab.tsx`: ผูก `htmlFor`/`id`/`aria-label` ครบทั้ง 13 คอนโทรล และขยายปุ่มสีด่วน 15 ปุ่มจาก `w-5 h-5` (`20×20px`) เป็น `w-8 h-8` (`32×32px`) พร้อม `aria-label`
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`), `npm run typecheck`, `npm run build:pages` (6/6 static pages) — ผ่านสมบูรณ์
  - `PLAYWRIGHT_STATIC=1 BASE_PATH=/hdms_pn npm run test:e2e` — 106 passed, 44 skipped (desktop/mobile env skip), 0 failed
  - Playwright 5 ขนาดหน้าจอ (`360×640`, `768×1024`, `1024×768`, `1280×800`, `1600×960`) บน `out/` — `docOverflow=0` และ `clippedCount=0` ทุกแท็บหลัก, `unlabeledControls=0` ในแท็บที่แก้ไข
- **ลำดับ Deploy & ย้อนกลับ:**
  - ไม่มีงาน SQL / DB / Edge Function (เว็บ static อย่างเดียว; ย้อนกลับด้วย `git revert`)

### [UPDATE-132] 2026-11-19 ขยายความครอบคลุม Playwright E2E: สรุปสถานการณ์ประชาชน, ตัวกรอง 5 สถานะ, Route Chips และปุ่มล้างตัวกรอง [B-011]
- **ไฟล์:** `tests/e2e/compact-card-detour-accordion.spec.ts`, `docs/{CHANGELOG,BACKLOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **เพิ่มชุดทดสอบ E2E ใหม่ใน `tests/e2e/compact-card-detour-accordion.spec.ts`:**
     - ตรวจสอบ `SituationSummary` นับจำนวนจุดตามสีสถานะจราจรถูกต้อง (`ผ่านไม่ได้`, `รถเล็กไม่สามารถผ่านได้`, `ผ่านได้ปกติ`)
     - ตรวจสอบการเรียงลำดับการ์ดตามความรุนแรง (Severity: `CLOSED` > `WARNING` > `PASSABLE`)
     - ตรวจสอบการคลิกปุ่มกรองสถานะเฉพาะจุดสีแดง (`ผ่านไม่ได้`), การแสดงปุ่ม `"แสดงทุกสถานะ"`, และการกดเพื่อยกเลิกตัวกรอง
     - ตรวจสอบการคลิกชิปหมายเลขสายทาง (`ทล.418`), การแสดงปุ่ม `"ล้างตัวกรอง"` ข้างช่องค้นหา, และการกรองเฉพาะสายทางที่เลือก
     - ตรวจสอบสถานะผลลัพธ์ว่าง (Empty state: 0 รายการ) เมื่อรวมเงื่อนไขตัวกรอง และการกดปุ่ม `"ล้างตัวกรอง"` จากหน้าจอว่างเพื่อคืนค่ารายการทั้งหมด
- **ตรวจแล้ว:**
  - `node scripts/test-e2e-with-public-config.mjs tests/e2e/compact-card-detour-accordion.spec.ts` — ผ่านครบ 5 ข้อ (3 skipped for mobile)
  - `npm run check:deploy` (`npm run lint && npm run typecheck && npm run build:pages`) — ผ่านสมบูรณ์ (0 warnings, 0 errors, 6/6 static pages)
- **ลำดับ Deploy & ย้อนกลับ:**
  - ไม่มีงาน SQL / DB / Edge Function
  - เปิด PR จาก `test/e2e-roadmap-coverage` เข้า `main` (ย้อนกลับด้วย `git revert`)

### [UPDATE-131] 2026-11-19 ปิด Dependabot PR #27, ลบกิ่งเก่า และปรับแต่ง `.github/dependabot.yml` ป้องกันการอัปเกรดข้าม Major Version
- **ไฟล์:** `.github/dependabot.yml`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **ปิด Dependabot PR #27 และลบกิ่งรีโมต:**
     - ปิด PR #27 (`dependabot/npm_and_yarn/dependencies-534e62a8e0`) บน GitHub เนื่องจากรวมการอัปเกรดข้าม Major version 3 ตัวพร้อมกัน (`tailwindcss 4.x`, `eslint 10.x`, `typescript 7.x`) ซึ่งทำลายความเข้ากันได้กับ Next.js 16/React 19 และทำให้ CI `lint` ล้มเหลว
     - ลบกิ่งรีโมต `origin/dependabot/npm_and_yarn/dependencies-534e62a8e0` ออกจาก GitHub
  2. **ปรับแต่งการตั้งค่า Dependabot (`.github/dependabot.yml`):**
     - กำหนด `update-types: ["minor", "patch"]` ภายในกลุ่ม `dependencies`
     - เพิ่มบล็อก `ignore` ทั่วโลกสำหรับทุกแพ็กเกจ: `update-types: ["version-update:semver-major"]` ป้องกันไม่ให้ Dependabot มัดรวมการอัปเกรด Major version เข้ามาสร้างปัญหาในอนาคต โดยยังคงให้ความสำคัญกับการอัปเดตช่องโหว่ความปลอดภัย (Security updates)
- **ตรวจแล้ว:**
  - `git branch -a` — เหลือเฉพาะ `main` และ `origin/main` (กิ่งขยะและ PR ที่ค้างถูกเก็บกวาดครบ 100%)
  - `.github/dependabot.yml` — ตรวจสอบโครงสร้าง YAML ถูกต้องตามสเปกทางการของ GitHub Dependabot v2
  - `npm run lint` (`--max-warnings=0`), `npm run typecheck`, `npm run build:pages` — ผ่าน
- **ลำดับ Deploy & ย้อนกลับ:**
  - ไม่มีงาน SQL / DB / Edge Function
  - เปิด PR จาก `chore/dependabot-ignore-major` เข้า `main` (ย้อนกลับด้วย `git revert`)

### [UPDATE-130] 2026-11-19 แก้ปัญหา CRLF ใน `scripts/backfill-flood-areas.mjs` และเพิ่ม Migration Backfill แถว `F-6bc2ee64-1ad6-412f-bf1b-bcc2033ad844`
- **ไฟล์:** `scripts/backfill-flood-areas.mjs`, `supabase/migrations/20261119000200_backfill_flood_route_f6bc2ee64.sql`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **รองรับ CRLF บน Windows (`scripts/backfill-flood-areas.mjs`):** Normalize `\r\n` เป็น `\n` ใน `loadDopaSubdistricts()` ก่อนค้นหา `endMarker` เพื่อไม่ให้ fail หลัง `git pull` บน Windows
  2. **Migration Backfill 1 แถวใหม่ (`supabase/migrations/20261119000200_backfill_flood_route_f6bc2ee64.sql`):** เตรียม migration idempotent (คงค่า `updated_at` เดิมและแนบ Rollback SQL) สำหรับแถว `F-6bc2ee64-1ad6-412f-bf1b-bcc2033ad844` (ทล.418 งาแม่ - ยุโป ที่บันทึกเมื่อ `2026-11-19 07:12:30Z` ก่อน PR #49 Deploy เสร็จ) เป็น `อ.เมืองปัตตานี / ต.รูสะมิแล` (**รออนุมัติก่อนรันบน Production** ตามกฎ R5)
- **ตรวจแล้ว:**
  - `node scripts/backfill-flood-areas.mjs` และ `--sql` — ผ่าน (1/1 match `[polygon]` บน Windows CRLF)
  - `npm run lint` (`--max-warnings=0`), `npm run typecheck`, `npm run build:pages` (6/6 static pages) — ผ่าน
- **ลำดับ Deploy & ย้อนกลับ:**
  1. ขออนุมัติเจ้าของก่อนรัน `20261119000200_backfill_flood_route_f6bc2ee64.sql` บน Production (ย้อนกลับด้วย `UPDATE public.doh_flood_routes SET district = '', subdistrict = '' WHERE id = 'F-6bc2ee64-1ad6-412f-bf1b-bcc2033ad844'`)
  2. เปิด PR / Merge กิ่ง `fix/crlf-backfill-and-row` เข้า `main` (ย้อนกลับด้วย `git revert`)

### [UPDATE-129] 2026-11-19 ซ่อมฐานข้อมูล 115 ตำบล 12 อำเภอ จ.ปัตตานี ด้วยขอบเขตรูปหลายเหลี่ยม DOPA จริง, สร้างสคริปต์ Backfill และแก้ปัญหา CI Timeout ของ OSRM Heading Constraint
- **ไฟล์:** `lib/gis-data.ts`, `lib/area-lookup.ts`, `lib/osrm-client.ts`, `scripts/backfill-flood-areas.mjs`, `supabase/migrations/20261119000100_backfill_flood_routes_district_subdistrict.sql`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **แทนที่ขอบเขตจำลองใน `lib/gis-data.ts` ด้วยข้อมูล DOPA จริงครบ 12 อำเภอ 115 ตำบล:**
     - แก้ชื่อตำบลที่เคยผิดอำเภอ/นอกจังหวัดจาก `a792965` (ลบ `ตะปอเยาะ`/`บ้านดอน` ออกจาก `ปะนาเระ` เป็น `คอกกระบือ`/`บ้านน้ำบ่อ`, แก้ `แหลมโพธิ์` ใน `เมืองปัตตานี` เป็น `ปุยุด`, แก้ `ตุยง`/`บางโกลด` ใน `โคกโพธิ์` เป็น `ควนโนรี`/`บางโกระ`/`ปากล่อ`, แก้ `ระตาปันยัง` ใน `ยะรัง` เป็น `เขาตูม`)
     - ใช้รูปหลายเหลี่ยมขอบเขตตำบล/อำเภอจริงจาก GeoThai/boundaries ที่เทียบชื่อตรงกับข้อมูลกรมการปกครอง (`kongvut/thai-province-data`) 115/115 ตำบล
  2. **Point-in-Polygon ระดับตำบล (`lib/area-lookup.ts`):**
     - ปรับ `localArea()` ให้คัดกรอง bounding box แล้วตรวจสอบ Point-in-Polygon บนขอบเขต 115 ตำบลจริง ก่อน fallback ไปจุดศูนย์กลางตำบลภายในอำเภอที่รองรับ `MultiPolygon`/`Polygon` แล้วใน `findPattaniDistrictName()`
  3. **แก้ปัญหา CI Timeout ของ OSRM Heading Constraint (`lib/osrm-client.ts`):**
     - ปรับให้ `fetchOsrmWithFailover` ข้าม Tier 2 (Edge proxy) ไปยัง Tier 3 (OSRM direct) ทันทีเมื่อคำขอมี query params เฉพาะทางอย่าง `continue_straight` หรือ `bearings` เพื่อรักษาเงื่อนไขการบังคับตรงผ่านแยก และแก้ปัญหา Playwright E2E (`admin-menus.spec.ts:115`) รอนานจน Timeout บน GitHub Actions CI เมื่อมีการตั้งค่า `NEXT_PUBLIC_SUPABASE_URL`
  4. **One-Off Dry-Run & SQL Backfill (`scripts/backfill-flood-areas.mjs`, `supabase/migrations/20261119000100_backfill_flood_routes_district_subdistrict.sql`):**
     - สร้างสคริปต์ read-only (`--dry-run` และ `--sql`) และ migration แบบ idempotent สำหรับ Backfill `district`/`subdistrict` ใน `public.doh_flood_routes` ทั้ง 22 แถว (19 แถวใช้งาน + 3 แถว `deleted_at IS NOT NULL`) โดยคงค่า `updated_at` เดิมไว้เพื่อไม่ให้ทริกเกอร์ `doh_enqueue_external_report()` ส่งรายงานซ้ำและไม่เปลี่ยนเวลา `"อัปเดตล่าสุด"` พร้อม Rollback SQL ในหัวไฟล์
- **ตรวจแล้ว (รวมหลังรันบน Production ตามอนุมัติเจ้าของ):**
  - **Production Migration (`ebyobrtvisylwawxiurx`):** Apply `backfill_flood_routes_district_subdistrict` (`version 20261119070256`) สำเร็จ · ตรวจ `public.doh_flood_routes` (`total_rows = 22`, `empty_district = 0`, `empty_subdistrict = 0`), `public.doh_external_jobs` คงที่ `94` แถว (ไม่สร้าง job ซ้ำ) และ `node scripts/backfill-flood-areas.mjs` คืน `0 active rows with blank district/subdistrict`
  - `npm run lint` (`--max-warnings=0`), `npm run typecheck`, `npm run build:pages` (6/6 static pages) — ผ่าน
  - Playwright E2E: `hybrid-google-maps.spec.ts` (18 passed), `flood-form-rules.spec.ts` (24 passed), `admin-menus.spec.ts` (16 passed, 20 skipped) — ผ่านครบ
- **ลำดับ Deploy & ย้อนกลับ:**
  1. SQL/DB รันบน Production แล้ว (`version 20261119070256`; ย้อนกลับด้วย `UPDATE public.doh_flood_routes SET district = '', subdistrict = '' WHERE id IN (...)` ในหัวไฟล์ migration)
  2. Push กิ่ง `feat/fix-coordinates-and-detour-advice` และ Merge PR #49 เข้า `main` เพื่อ Deploy เว็บ Static Pages (ย้อนกลับด้วย `git revert`)

### [UPDATE-128] 2026-11-19 แก้ปัญหาพิกัดพื้นที่ไม่ตรงกับแผนที่ และปรับปรุงเอนจินคำบรรยายทางเลี่ยงให้แม่นยำตามเส้นถนนจริง
- **ไฟล์:** `lib/gis-data.ts`, `lib/area-lookup.ts`, `lib/gis-utils.ts`, `components/admin/tabs/MapManagementTab.tsx`, `db/default-data.ts`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **ขยายฐานข้อมูลตำบลครอบคลุม 115 ตำบล 12 อำเภอ จ.ปัตตานี (`lib/gis-data.ts`, `lib/area-lookup.ts`):**
     - เพิ่มฐานข้อมูลขอบเขตพิกัด (Bounding Box) และพิกัดศูนย์กลางของตำบลในจังหวัดปัตตานีครบถ้วน 115 ตำบล ทั้ง 12 อำเภอ (เมืองปัตตานี 13, โคกโพธิ์ 12, หนองจิก 12, ปะนาเระ 10, มายอ 13, ทุ่งยางแดง 4, สายบุรี 11, ไม้แก่น 4, ยะหริ่ง 18, ยะรัง 12, กะพ้อ 3, แม่ลาน 3)
     - ปรับปรุงฟังก์ชัน `localArea` ใน `lib/area-lookup.ts` ให้กรองตำบลตามอำเภอที่คำนวณได้จากรูปหลายเหลี่ยมอำเภอจริงก่อน แล้วตรวจสอบ Bounding Box และหาระยะห่างน้อยที่สุดไปยังศูนย์กลางตำบล แก้ปัญหาการเดาตำบลเดิมซ้ำๆ นอกเขต 22 ตำบลเดิม
  2. **ปรับปรุงเอนจินคำบรรยายทางเลี่ยง (`lib/gis-utils.ts`):**
     - สกัด `formatHighwayOrRuralPrefix` จัดรูปแบบชื่อทางหลวงและทางหลวงชนบทให้ถูกต้อง (`ทล.xxx` สำหรับทางหลวงแผ่นดิน, `ทางหลวงชนบท ปน.xxxx` สำหรับทางหลวงชนบท) ป้องกันบั๊กชื่อซ้ำซ้อน เช่น `ทล.ปน.7081` หรือ `ทล.ทล.42`
     - นำเทคนิค Lookahead Coordinates (~25-50 ม. ถัดจากจุดเลี้ยวตามแนวเส้นทางใหม่) มาใช้ในการค้นหาทางหลวง (`findNearestHighwayFromLayers`) และดึงที่อยู่ (`getDetailedPattaniAddress`) แทนการใช้พิกัดจุดยอดทางแยก (`maneuver.location`) ซึ่งเดิมนั่งอยู่บนสายทางหลักเดิม (เช่น ทล.42) ส่งผลให้คำแนะนำบอกว่า "เลี้ยวเข้าสู่ ทล.42" ทั้งที่เลี้ยวออกจาก ทล.42 เข้าสู่สายทางรอง
     - ปรับขั้นตอนที่ไม่มีชื่อถนนทางการ ให้ระบุเป็น `เส้นทางเชื่อมต่อท้องถิ่น (ต... อ...)` ตามตำบลและอำเภอจริงของพิกัด Lookahead แทนคำว่า "เส้นทางเชื่อมต่อท้องถิ่น" ซ้ำๆ
     - ละเว้น micro-maneuvers ระยะสั้น (< 30 ม.) ที่เป็นเพียงความโค้งของผิวทาง เพื่อให้คำบรรยายกระชับและไม่สับสน
     - เสริมความปลอดภัยใน `slicePolylineByKmRange` ตรวจสอบทิศทาง `clampedStart > clampedEnd` เพื่อเรียงลำดับพิกัดจาก `targetKmStart` ไป `targetKmEnd` อย่างถูกต้องเสมอ และรองรับ `isReverseOrientation` ป้องกันปัญหาเส้นทางสลับหัวท้าย
  3. **เชื่อมต่อการบันทึกตำบล/อำเภอ และรักษาชื่อตอนควบคุมทางการ (`components/admin/tabs/MapManagementTab.tsx`, `db/default-data.ts`):**
     - ปรับ `handleSaveRoute` ส่ง `district` และ `subdistrict` ในคำสั่ง `upsertRouteAction` ทั้งฝั่งขาไป (A→B), ขากลับ (B→A) และเส้นทางเดี่ยว/ทางเลี่ยง โดยคำนวณจาก `startArea`, `endArea` หรือ `localArea` อัตโนมัติ ปิดช่องโหว่เดิมที่ทำให้ข้อมูลตำบล/อำเภอในตาราง `doh_flood_routes` เป็นค่าว่าง
     - รักษาชื่อตอนควบคุมทางการ (`selectedHighwayOption.sectionName`) ใน `useEffect` ไม่ให้ถูกเขียนทับด้วยข้อความตำบลอัตโนมัติ
     - โหลดข้อมูล `startArea` และ `endArea` อัตโนมัติเมื่อกดเปิดแก้ไขข้อมูลช่วงน้ำท่วม (`editingRoute`) ทั้งจากฟิลด์เดิมและจาก `localArea`
     - เพิ่มฟิลด์ `district?: string; subdistrict?: string;` ให้กับ `DetourRoute` ใน `db/default-data.ts`
- **ตรวจแล้ว:**
  - `npm run lint` ผ่าน (`--max-warnings=0`, 0 warnings, 0 errors)
  - `npm run typecheck` ผ่าน (`tsc --noEmit`, 0 errors)
  - `npm run build:pages` ผ่าน (6/6 static pages compiled and optimized)
  - Playwright E2E: `tests/e2e/flood-form-rules.spec.ts` ผ่าน (6 passed, 2 skipped)
  - Playwright E2E: `tests/e2e/hybrid-google-maps.spec.ts` ผ่าน (18 passed, 0 failed)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ไข DB schema/migration ใหม่ (ตารางและ Edge Function รองรับฟิลด์อยู่แล้ว) → Commit & Merge เข้า `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-127] 2026-11-19 แก้ปัญหาเชิงลึกการสร้างเส้นน้ำท่วมและทางเลี่ยงให้ตรงการใช้งานจริง (P1 & P2)
- **ไฟล์:** `lib/gis-utils.ts`, `components/admin/tabs/HighwayIdentificationSection.tsx`, `components/admin/tabs/RouteGeometryEditorSection.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `tests/e2e/flood-form-rules.spec.ts`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **Step 1 — เลือกฝั่ง/ทิศทางตั้งแต่ต้น & เตือนช่วง กม. ยาวเกินจริง (`HighwayIdentificationSection.tsx`):** เพิ่มแถบเลือกฝั่งเบื้องต้น (`ขาไป A→B / ขากลับ B→A / ทั้ง ๒ ฝั่ง A⇄B`) ใน Step 1 ซิงค์กับ Step 3, ผูก `htmlFor/id` ให้ช่อง `กม. เริ่มต้น`/`กม. สิ้นสุด`, แสดงคำเตือนเมื่อช่วง กม. ยาวตั้งแต่ 5 กม. ขึ้นไปพร้อมปุ่ม `ล้าง กม.`, และแสดงช่วง กม.+ทิศทาง ใน dropdown `ผูกกับจุดน้ำท่วมอ้างอิง`
  2. **กันเส้นน้ำท่วมอ้อม U-Turn & แก้ Fallback ช่วง กม. (`MapManagementTab.tsx`):**
     - `snapFloodDirected` ใช้โครงข่ายจริงของกรมทางหลวง (`snapRouteAction`) เป็น Tier 1 ก่อนตกไป Google/OSRM และตรวจ U-Turn Loop Guard (`polyKm > Math.max(0.8, directKm * 2.5)`) ป้องกันลากเส้นเลยจุดกลับรถ
     - `handleSlicePolylineFromKm` fallback จับคู่ Feature ที่ช่วง `km_start..km_end` ครอบคลุมช่วงที่กรอกก่อน ไม่หยุดที่ Feature แรกเสมอ
     - แก้การบันทึกและเปิดแก้ไขช่วง `B_TO_A` เมื่อสลับเป็น `ท่วมทั้งสองฝั่งจราจร` ไม่ให้เขียนทับฝั่งผิด ID (`editOriginalFloodDirRef`)
  3. **แก้ไขทางเลี่ยง 2 ทิศทางและแจ้งเตือนผ่านจุดน้ำท่วม (`MapManagementTab.tsx`, `RouteGeometryEditorSection.tsx`, `lib/gis-utils.ts`):**
     - `handleAddMidpointWaypoint` ฝั่งขาไป `A → B` สั่งคำนวณเส้นใหม่ทันทีเหมือนฝั่ง `B → A`
     - อัปเดตเวลาเดินทาง (นาที) อัตโนมัติเมื่อขยับจุด A/B หรือคำนวณเส้นใหม่ ยกเว้นเมื่อเจ้าหน้าที่กรอกแก้ตัวเลขเอง (`durationFwdManualRef` / `durationRevManualRef`)
     - สกัด `detectFloodStatusConflicts` ร่วมกับ `detectClosedRoadConflicts` และเพิ่ม `detectPassabilityFloodWarnings` แจ้งเตือนสีเหลืองเมื่อทางเลี่ยงผ่านจุด `WARNING` หรือ `ONE_LANE`
- **ตรวจแล้ว:** `npm run lint`, `npm run typecheck`, `npm run build:pages`, `PLAYWRIGHT_STATIC=1 npx playwright test tests/e2e/flood-form-rules.spec.ts tests/e2e/admin-menus.spec.ts tests/e2e/gis-dual-carriageway-save.spec.ts tests/e2e/hybrid-google-maps.spec.ts`
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function เพิ่ม → Commit & Merge เข้า `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-126] 2026-11-19 ปรับปรุงสถาปัตยกรรมทางเลือกที่ 1 ครบวงจร: ย้าย OSRM/Geocode Proxy เข้า Edge Function (v24), ถอด Dead Mutation Code ฝั่ง Client และ Deploy Production
- **ไฟล์:** `supabase/functions/hdms-api/index.ts`, `lib/hdms-api.ts`, `app/actions/doh-actions.ts`, `lib/osrm-client.ts`, `lib/area-lookup.ts`, `tests/e2e/hybrid-google-maps.spec.ts`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **Edge Function Read-Only Proxy (`supabase/functions/hdms-api/index.ts` → Deploy Production v24):** เพิ่ม Action `proxyOsrmRouteAction` และ `proxyReverseGeocodeAction` ใน `READ_ONLY_EDGE_ACTIONS` พร้อมตรวจช่วงพิกัดตัวเลขเข้มงวด (ป้องกัน CWE-918 SSRF) และกำหนด `AbortSignal.timeout` + `Cache-Control` โดยคง `verify_jwt = false` ตามเดิม
  2. **เสริมความปลอดภัย Client Adapter (`lib/hdms-api.ts`, `app/actions/doh-actions.ts`):** ถอด dead mutation branches (`setIncidentStatusAction`, `toggleDetourStatusAction`, `deleteRouteAction`, `restoreRouteAction`) ออกจาก `executeDirectAction` บนเบราว์เซอร์ ให้เหลือเพียง read-only fallback และเพิ่ม `proxyOsrmRouteAction` / `proxyReverseGeocodeAction` ใน `READ_ONLY_ACTIONS`
  3. **เชื่อมต่อ Edge Proxy + Circuit Breaker ฝั่ง Client (`lib/osrm-client.ts`, `lib/area-lookup.ts`):**
     - `fetchOsrmWithFailover` เรียก Local OSRM (Tier 1) → Edge `proxyOsrmRouteAction` (Tier 2) → Public OSRM (Tier 3 fallback)
     - `queryNominatim` เรียก Edge `proxyReverseGeocodeAction` พร้อม cooldown (`UNCONFIGURED_COOLDOWN_MS` เมื่อ upstream คืน `403`) แล้ว fallback ไป Direct Nominatim อัตโนมัติ
  4. **E2E & Security Verification (`tests/e2e/hybrid-google-maps.spec.ts`):** เพิ่มเคสทดสอบ Edge OSRM/Nominatim Proxy และการถอด dead mutation code
- **ตรวจแล้ว (หลังแก้ครั้งสุดท้าย):**
  - Deploy Edge `hdms-api` v24 บน Supabase Production (`ebyobrtvisylwawxiurx`) และเทียบ byte-for-byte กับไฟล์ในเครื่อง: ตรงกัน 100%
  - ทดสอบ Live Production: `proxyOsrmRouteAction` ตอบ `200` (`available: true, found: true, dist: 4819.8`), SSRF Attack `127.0.0.1:22` ถูกบล็อก `400 Invalid numeric value`, `getPublicSystemDataAction` ตอบ `200`, `proxyReverseGeocodeAction` ได้ `403` จาก OSM บน IP คลาวด์และ fallback ฝั่ง Client ทำงานถูกต้อง
  - รัน `npm run lint`, `npm run typecheck`, `npm run build:pages`, และ Playwright `hybrid-google-maps.spec.ts` (9 passed) + `smoke.spec.ts` + `admin-menus.spec.ts`
- **ลำดับ Deploy & ย้อนกลับ:** Edge Function `hdms-api` v24 Deploy บน Production แล้ว → Merge/Push โค้ดเว็บเข้า `main` เพื่อ Deploy GitHub Pages; ย้อนกลับ Edge ด้วยการ Deploy `index.ts` v23 จาก git history

### [UPDATE-125] 2026-11-19 ปรับปรุง UX/UI ครบทั้ง 4 ชุดตาม Roadmap รายเมนู (ทะเบียนเหตุการณ์, หน้าประชาชน, จัดการแผนที่, ทะเบียนทางเลี่ยง)
- **ไฟล์:** `components/admin/tabs/IncidentRegistryTab.tsx`, `app/page.tsx`, `app/globals.css`, `components/admin/tabs/FloodSituationSection.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `tests/e2e/admin-menus.spec.ts`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **ชุดที่ 3 (ทะเบียนเหตุการณ์ `IncidentRegistryTab.tsx`):** เพิ่มตัวกรองสายทางหลวง (`ทล.xx`) และตัวกรองสถานะจราจร 5 ค่า พร้อมปุ่ม `ล้างตัวกรอง`, เพิ่มตัวเลือกเปลี่ยนสถานะจราจรด่วน (`Quick Status Override`) คู่กับช่องแก้ไขระดับน้ำแบบ inline (ยังคำนวณสถานะแนะนำอัตโนมัติเมื่อพิมพ์ระดับน้ำ), และแสดงจำนวนช่วงย่อย (`N ช่วง`) บนปุ่มพับ/กางเหตุการณ์หลัก
  2. **ชุดที่ 1 (หน้าประชาชน `app/page.tsx`, `app/globals.css`):** เพิ่มปุ่ม `ล้างตัวกรอง` บนแถบค้นหาฝั่งเดสก์ท็อปเมื่อมีตัวกรองใช้งานอยู่, เพิ่มเงาจาง (Gradient Scroll Hint) ด้านขวาของแถบชิปเลือกสายทาง, และขยายขนาดปุ่มปิดป๊อปอัปแผนที่บนมือถือ (`.leaflet-popup-close-button`) เป็น `44×44px` ตามเกณฑ์ `UI_CONTRACT.md`
  3. **ชุดที่ 2 (จัดการแผนที่ `FloodSituationSection.tsx`, `MapManagementTab.tsx`):** เพิ่มปุ่มลัด `เลือกทั้งหมด` / `ล้าง` สำหรับส่วนของถนนที่ถูกน้ำท่วมทั้งทางหลวง 1 คันทางและ 2 คันทาง, เพิ่มคำแนะนำไฟล์รูปถ่ายหน้างาน (`.jpg, .png`, บีบอัด ≤ 300 KB), และเพิ่มป้ายสถานะโหมดชัดเจน (`โหมดฉบับร่าง` vs `เผยแพร่ขึ้นแผนที่ประชาชน`) พร้อมปรับสีปุ่มบันทึกใน `StickyActionBar` ให้แยกจากโหมดเผยแพร่จริงชัดเจน
  4. **ชุดที่ 4 (ทะเบียนทางเลี่ยง `DetourManagementTab.tsx`):** แสดงสถานะ `(กำลังเกิดเหตุ)` / `(ปกติแล้ว)` ในตัวกรองเหตุการณ์น้ำท่วม, เพิ่มปุ่ม `ล้างตัวกรอง`, และเพิ่มแผนที่ SVG พรีวิวรูปทรงแนวเส้นทางย่อ (Start `A` → End `B`) ในหน้าต่างรายละเอียดทางเลี่ยง
- **ตรวจแล้ว:** `npm run lint` (`0` warnings), `npm run typecheck` (`0` errors), `npm run build:pages` (6/6 routes) ผ่านครบ; `PLAYWRIGHT_STATIC=1 npx playwright test tests/e2e/admin-menus.spec.ts:701` และ `smoke.spec.ts` ผ่าน
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Merge กิ่ง `feat/ui-roadmap-batches` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-124] 2026-11-19 ปรับปรุง UX/UI ทั้งหน้าประชาชนและแอดมิน: ลดช่องกรอกซ้ำซ้อน, จัดลำดับปุ่ม, เพิ่ม Contrast และแยกชื่อหมุดแผนที่
- **ไฟล์:** `app/page.tsx`, `components/map/LongdoGisMap.tsx`, `components/admin/tabs/HighwayIdentificationSection.tsx`, `components/admin/tabs/RouteGeometryEditorSection.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `tests/e2e/admin-menus.spec.ts`, `docs/CHANGELOG.md`
- **การแก้ไข:**
  1. **แอดมิน — ขจัดช่องกรอกที่มีความหมายซ้ำซ้อนกัน (`HighwayIdentificationSection.tsx`):** แยกหน้าที่ระหว่าง *"ชื่อตอนสายทางหลวง (ตามบัญชีทางหลวง) \*"* (สำหรับชื่อตอนทางหลวง) กับ *"จุดสังเกตหน้างาน / หมู่บ้าน / ตำบล–อำเภอ"* (สำหรับระบุจุดเกิดเหตุและตำบล/อำเภอ) และรวมปุ่มดึงตำแหน่ง/ตำบล-อำเภอจากพิกัดไว้ในจุดเดียว ไม่ให้เจ้าหน้าที่สับสนว่าต้องกรอกตำบล/อำเภอที่ช่องไหน
  2. **แอดมิน — จัดลำดับความสำคัญปุ่มวาดเส้น (`RouteGeometryEditorSection.tsx`):** เน้นขั้นตอนหลัก *"สร้างแนวเส้นอัตโนมัติ (แนะนำ)"* (`คำนวณเส้นเกาะถนน`) ให้อยู่ในแถบไฮไลต์ชัดเจน และจัดกลุ่มเครื่องมือดัดเส้น/ย้อนกลับ/ล้างข้อมูลไว้ในกรอบรองที่เป็นสัดส่วน โดยคงตำแหน่งและการมองเห็นของปุ่มทั้งหมดไว้ครบถ้วนตามสัญญา E2E (R7)
  3. **ประชาชน — แยกชื่อเข้าถึงได้ของหมุดแผนที่ (`LongdoGisMap.tsx`):** เพิ่ม `alt`, `title`, และ `aria-label` ที่ระบุหมายเลขทางหลวง ชื่อตอน หลัก กม. และสถานะจราจร ให้กับหมุดน้ำท่วมทั้งแบบแยกช่วงและแบบรวมเหตุการณ์
  4. **ประชาชน — ปรับ Contrast และขนาดปุ่มบนมือถือ (`app/page.tsx`):** เพิ่มขนาดปุ่ม `"ดูตำแหน่งบนแผนที่"` ในโมดัลรายละเอียดเป็น `min-h-11` (44px) และปรับข้อความรอง `"ข้อควรทราบก่อนนำทาง"` เป็น `text-slate-300` เพื่อให้อ่านง่ายกลางแจ้ง
  5. **แอดมิน — เพิ่ม Quick Inline Edit ระดับน้ำ (`IncidentRegistryTab.tsx`, `tests/e2e/admin-menus.spec.ts`):** เพิ่มปุ่ม `"แก้ตัวเลข"` ข้างระดับน้ำในแถวรายการเหตุการณ์ เพื่อแก้ไขตัวเลข 0–500 ซม. พร้อมแสดงตัวอย่างสถานะจราจรอัตโนมัติ (ตาม `deriveTrafficStatusFromWaterLevel`) และกดบันทึกทันที (รองรับ Enter/Escape) โดยไม่ต้องเปิดหน้าต่างใหม่ พร้อมสกัด helper `submitWaterLevelUpdate` ร่วมกับโมดัลอัปเดตด่วนและเพิ่มเทสต์ E2E รองรับ
- **ตรวจแล้ว:** `npm run lint` (`0` warnings), `npm run typecheck` (`0` errors), `npm run build:pages` ผ่านครบ; รัน E2E (`smoke.spec.ts`, `public-route-sheet.spec.ts`, `flood-form-rules.spec.ts`, `compact-card-detour-accordion.spec.ts`, `admin-menus.spec.ts`) ผ่านทุกข้อ (35 passed, 0 failed)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Merge กิ่ง `fix/ui-p1-p2-accessibility-and-layout` เข้า `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-123] 2026-11-19 ปรับสีเส้นทางเลี่ยง 2 ทิศทางให้ตรงสไตล์ที่ตั้งไว้ พร้อมแยกหมุด A→B / B→A และปลดล็อกดัดเส้นอิสระ
- **ไฟล์:** `components/map/LongdoGisMap.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/RouteGeometryEditorSection.tsx`, `app/admin/page.tsx`, `tests/e2e/admin-menus.spec.ts`, `docs/{CHANGELOG,AI_HANDOFF,UI_CONTRACT}.md`
- **การแก้ไข:**
  1. **แก้สี/ลวดลาย/ลูกศรทางเลี่ยง 2 ทิศทางให้ตรงกับสไตล์เส้นทาง (`components/map/LongdoGisMap.tsx`):** ถอดค่าสีฟ้า `#38bdf8` ที่ hardcode ไว้บนเส้นขากลับ B→A, ลูกศรขากลับ และเส้นพรีวิวร่างออก แล้วใช้ `mapStyles.detour` (รวมถึง `dashArrayFor` สำหรับ `dot` / `long-dash-dot` และ `resolveVisibleArrowColor`) ทั้งขาไปและขากลับเช่นเดียวกับเส้นน้ำท่วม พร้อมใช้ `dashArrayFor` บนเส้นน้ำท่วมด้วย
  2. **แยกหมุดจุดเริ่ม–จุดสิ้นสุดฝั่งขากลับ (B → A) สำหรับโหมด 2 ทิศทาง (`RouteGeometryEditorSection.tsx`, `MapManagementTab.tsx`, `app/admin/page.tsx`, `LongdoGisMap.tsx`):** เพิ่มการ์ด `หมุดเส้นทางขากลับ (B → A)` (`PICK_REV_START` / `PICK_REV_END`, คลาส `.doh-draft-rev-endpoint`, ปุ่ม `แยกหมุด B→A บนแผนที่`) รองรับทั้งทางเลี่ยง 2 ทิศทางและน้ำท่วม 2 ฝั่งแยกกัน พร้อม fallback ไป B→A เดิมเมื่อยังไม่แยกหมุด
  3. **ปลดล็อกการดัดเส้นอิสระ (`ดัดเส้นอิสระ`) สำหรับทั้งขาไป–ขากลับ (`MapManagementTab.tsx`, `LongdoGisMap.tsx`, `RouteGeometryEditorSection.tsx`):** ซ่อน `draftPickMarkers` ขณะเปิดโหมดดัดจุดดัดอิสระเพื่อไม่ให้แย่งลากหมุดปลายทาง, ปลดบล็อกการย้ายหมุดปลายทางและต่อปลายเส้น (`ADD_LINE_VERTEX`), เพิ่ม `revDraftLineRef` ให้ลากพรีวิวเส้นขากลับลื่นไหล, และปรับ `updateFreeGeometry` ให้ซิงค์พิกัดปลายทางฝั่งขากลับแยกจากขาไป
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Push ขึ้น `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-122] 2026-11-19 Apply SQL Migration B-023 (`event_detour_both_directions`) บน Supabase Production
- **ไฟล์:** `supabase/migrations/20261118000100_event_detour_both_directions.sql`, `docs/{CHANGELOG,AI_HANDOFF,BACKLOG,KNOWN_ISSUES}.md`
- **การดำเนินการ:**
  1. **อนุมัติและรัน DDL บน Supabase Production (B-023, KI-013):** ได้รับความยินยอมจากเจ้าของระบบ ("อนุญาตทุกครั้งจนเสร็จ") ดำเนินการ apply migration `20261118000100_event_detour_both_directions.sql` เข้า Supabase Production ผ่าน MCP tool `supabase_apply_migration` สำเร็จ (`name: event_detour_both_directions`, `{"success": true}`)
  2. **ปรับ Check Constraints:** `chk_doh_edl_event_direction` รองรับค่า `BOTH`/`UNKNOWN`, `chk_doh_edl_detour_direction` รองรับ `TWO_WAY`/`UNKNOWN`, และ `chk_doh_edl_recommended_reviewed`
  3. **อัปเดตฟังก์ชัน `doh_replace_event_detour_links`:** รองรับการบันทึกเชื่อมโยงทางเลี่ยงแบบ 2 ทิศทาง และ validation ตาม segments
  4. **สถานะความเข้ากันได้:** Edge Function `hdms-api` v23 บน Supabase และหน้าเว็บ Production บน GitHub Pages รองรับ schema นี้สมบูรณ์แล้ว
- **ลำดับ Deploy & ย้อนกลับ:** SQL รันแล้ว → Edge Function v23 ใช้งานอยู่แล้ว → เว็บ GitHub Pages เผยแพร่แล้ว; แผนย้อนกลับ: รัน restore function จาก migration `20261117135032_event_detour_relationships.sql`

### [UPDATE-121] 2026-11-19 แก้ `popupclose` และพิกัดเทส 360×640 ที่ทำให้ E2E บน CI แกว่ง
- **ไฟล์:** `components/map/LongdoGisMap.tsx`, `tests/e2e/public-route-sheet.spec.ts`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **แก้ `isMapPopupOpen` ค้างเมื่อปิดป๊อปอัพ (`components/map/LongdoGisMap.tsx`):** ปรับ handler `popupclose` ให้ตรวจ `(map as any)._popup !== e?.popup` (เพราะ Leaflet ยิง `popupclose` ก่อนล้าง `map._popup` หมด) เพื่อให้แถบควบคุมบนแผนที่และปุ่มซูมคืนกลับมาทุกครั้งหลังปิดป๊อปอัพ
  2. **แก้พิกัดหมุดทดสอบใน `tests/e2e/public-route-sheet.spec.ts`:** แยกพิกัดหมุดน้ำท่วม (`101.225–101.235, 6.83–6.84`) กับหมุดทางเลี่ยง/ภาพทางเข้า (`101.26–101.29, 6.79–6.795`) ให้อยู่โซนกลางจอและห่างจากแคปซูล `ทล.42` (~65px) พร้อมถอด `{ force: true }` ออกจาก `.click()` เพื่อตรวจการไม่ถูกบังจริงบน `360×640`
- **ตรวจแล้ว:** `npm run lint` (`0` warnings), `npm run typecheck` (`0` errors), `npm run build:pages` (`BASE_PATH=/hdms_pn` ผ่าน), Playwright `--repeat-each=5` บน `public-route-sheet.spec.ts` (`10 passed, 10 skipped, 0 failed`) และชุด `public-route-sheet`, `smoke`, `compact-card-detour-accordion`, `detour-navigation` (`26 passed, 4 skipped, 0 failed`)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Push ขึ้น `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-120] 2026-11-18 ปรับแถบสรุปแผนที่บนมือถือ 360px ไม่ให้ตัดข้อความทางเลี่ยง และซ่อน overlay ชั่วคราวขณะเปิดป๊อปอัพบนมือถือ
- **ไฟล์:** `app/globals.css`, `components/map/LongdoGisMap.tsx`, `components/map/MapLegendOverlay.tsx`, `components/map/longdo-map-popups.ts`, `tests/e2e/public-route-sheet.spec.ts`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **แก้ข้อความ `"ทางเลี่ยง X เส้นทาง"` ถูกตัดบนจอ 360px (`components/map/MapLegendOverlay.tsx`):** เปลี่ยนแถบสรุปด้านซ้ายจาก `overflow-x-auto max-w-[calc(100%-105px)]` เป็น `flex-1 min-w-0 flex-wrap gap-1 sm:gap-1.5` (ใส่ `pointer-events-auto` เฉพาะป้าย ไม่ให้กล่องว่างดักคลิก), เปลี่ยนตัวครอบนอกเป็น `items-start`, และคงข้อความ/accessible name ของปุ่ม `"สัญลักษณ์บนแผนที่"` / `"สัญลักษณ์"` เดิม
  2. **แก้ปุ่มปิดป๊อปอัพถูก overlay/ปุ่มซูมบังบนมือถือ (`LongdoGisMap.tsx`, `MapLegendOverlay.tsx`, `app/globals.css`, `longdo-map-popups.ts`):** ติดตามสถานะ `isMapPopupOpen` จาก `popupopen`/`popupclose` ของ Leaflet; ขณะป๊อปอัพเปิดบนมือถือ `< 640px` ซ่อนแถบสรุปด้านบน/ปุ่ม `"ตำแหน่งของฉัน"` และปุ่มซูม `+ / -` (`.doh-map-popup-open`) ชั่วคราวพร้อมคืนทันทีเมื่อปิดป๊อปอัพ และปรับ `autoPanPaddingTopLeft` บนมือถือเป็น `[12, 16]`
  3. **เพิ่ม assertion ตรวจแถบสรุป 360×640 (`tests/e2e/public-route-sheet.spec.ts`):** ตรวจว่า badge `"น้ำท่วม 1 จุด"` และ `"ทางเลี่ยง 1 เส้นทาง"` (`exact: true`) มองเห็นครบ ไม่ถูกตัด (`scrollWidth <= clientWidth + 1`) และไม่ซ้อนทับปุ่ม `"สัญลักษณ์"`
- **ตรวจแล้ว:** `npm run lint` (`0` warnings), `npm run typecheck` (`0` errors), `npm run build:pages` (`BASE_PATH=/hdms_pn` ผ่าน), และ Playwright Static (`PLAYWRIGHT_STATIC=1`, `BASE_PATH=/hdms_pn`: `public-route-sheet`, `smoke`, `compact-card-detour-accordion`, `detour-navigation` — `26 passed`, `4 skipped`, `0 failed`)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Push ขึ้น `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

### [UPDATE-119] 2026-11-18 ปรับปรุงป๊อปอัพหน้าประชาชนให้รองรับหน้าจอมือถือ 360×640 (`f1c3453`, `5f43716`, `0e57bb1`)
- **ไฟล์:** `app/globals.css`, `app/page.tsx`, `components/map/LongdoGisMap.tsx`, `components/map/longdo-map-popups.ts`, `tests/e2e/public-route-sheet.spec.ts`, `docs/{CHANGELOG,AI_HANDOFF}.md`
- **การแก้ไข:**
  1. **คุมขนาดป๊อปอัพแผนที่แบบ Responsive (`components/map/longdo-map-popups.ts`, `components/map/LongdoGisMap.tsx`):** เพิ่ม `getResponsivePopupOptions` คำนวณ `minWidth`/`maxWidth` ตามขนาดหน้าจอมือถือ พร้อมตั้ง `autoPanPaddingTopLeft` (`[12, 96]`) และ `autoPanPaddingBottomRight` (`[12, 112]`) บน `< 640px` เพื่อเว้นระยะพ้นแถบสถานะด้านบนและแถบสรุปด้านล่าง
  2. **แก้ปุ่มซูมบังป๊อปอัพและคุมขอบเขตบนมือถือ (`app/globals.css`, `components/map/longdo-map-popups.ts`):** เพิ่ม `.leaflet-popup-pane { z-index: 1050 !important; }` เพื่อไม่ให้ปุ่มซูม `+ / -` ลอยทับเนื้อหาป๊อปอัพ, จำกัดขนาดผ่าน `@media (max-width: 639px)` (`max-width: calc(100vw - 24px)`, ปุ่มปิด `34×34px`), ลด `max-height` ป๊อปอัพน้ำท่วม/ทางเลี่ยง/ภาพทางเข้าบนมือถือเป็น `min(54dvh, 350px)` พร้อม scroll ภายใน, ปรับปุ่มนำทางในป๊อปอัพทางเลี่ยงเรียงแนวตั้งบนมือถือ, และคงข้อความ/accessible names เดิม
  3. **ปรับปรุง Dialog รายละเอียดฝั่งประชาชน (`app/page.tsx`):** ขยายปุ่มปิด Flood/Detour Modal เป็น `min-h-[44px] min-w-[44px]` บนมือถือ และเปลี่ยนหัวข้อชื่อทางเลี่ยงใน Detour Modal จาก `truncate` เป็น `break-words` เพื่อให้ชื่อยาวขึ้นบรรทัดใหม่ได้ตาม `UI_CONTRACT.md`
  4. **เพิ่ม E2E ตรวจ Viewport 360×640 (`tests/e2e/public-route-sheet.spec.ts`):** เพิ่มเคส `citizen map popups fit 360x640 mobile viewport without overflow or changing accessible names` ตรวจขนาดป๊อปอัพ (`width <= 344`, `height <= 370`, `x + width <= 360`), `scrollWidth <= innerWidth`, กดปุ่มปิด `.leaflet-popup-close-button` ได้ไม่ถูกบัง, และ Accessible Name คงเดิม
- **ตรวจแล้ว:** `npm run lint` (`0` warnings), `npm run typecheck` (`0` errors), `npm run build:pages` (Static export ผ่าน), และ Playwright Static (`PLAYWRIGHT_STATIC=1`: `public-route-sheet`, `smoke`, `compact-card-detour-accordion`, `detour-navigation` — `26 passed`, `4 skipped`, `0 failed`)
- **ลำดับ Deploy & ย้อนกลับ:** ไม่ต้องแก้ SQL/Edge Function → Commit & Push ขึ้น `main` เพื่อ Deploy GitHub Pages; ย้อนกลับด้วย `git revert`

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
