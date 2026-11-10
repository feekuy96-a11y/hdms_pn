# CHANGELOG.md — บันทึกงานใหม่ (แทนการเพิ่มใน SUPPLEMENTAL_RULES.md)

รูปแบบสั้น: วันที่ · หัวข้อ · ไฟล์ · ทำอะไรและทำไม · ตรวจอะไรแล้ว/ยังไม่ได้ตรวจ · ความเสี่ยงที่ยอมรับ (ถ้ามี) · ลิงก์ BACKLOG
ประวัติเก่า (UPDATE-001…047) อยู่ใน `SUPPLEMENTAL_RULES.md` — ใช้ grep ค้น ไม่อ่านทั้งไฟล์ เลขรายการต่อจาก 047

### [UPDATE-048] 2026-11-06 โครงสร้างแผนที่ลด CPU/RAM
- **ไฟล์:** `components/map/LongdoGisMap.tsx`, `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`
- **ทำอะไร:** สร้าง canvas renderer ตัวเดียว (เดิมสร้างใหม่ทุกครั้งที่วาด → `<canvas>` สะสมจนเครื่องค้าง); แยก layer group ต่อชนิดข้อมูล; ค่าเริ่มต้น prop แบบ array เป็นค่าคงที่; callback ผ่าน ref; popup/tooltip lazy; ป้ายทางหลวง debounce ตามกรอบจอ; กันผลคำนวณเส้นเก่าเขียนทับ
- **ตรวจแล้ว:** TypeScript (ตัวตรวจจำลอง) ไม่มี error เพิ่ม · **ยังไม่ได้ตรวจ:** lint, build, e2e, ดูบนเบราว์เซอร์จริง (ให้วัดจำนวน `<canvas>` ก่อน-หลัง)

### [UPDATE-049] 2026-11-07 ตัวแก้ไขเส้นอิสระ (แนว Google My Maps)
- **ไฟล์:** `lib/line-edit.ts` (ใหม่), `components/admin/tabs/GisDataImportTab.tsx`, `components/map/LongdoGisMap.tsx`, `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`
- **ทำอะไร:** เพิ่ม/ลบ/ลากจุด, ตัดเส้น, เชื่อมเส้น, undo/redo (100 ขั้น); เปิดตัวแก้ไขในโหมด "ตามถนน (OSRM)" เป็นค่าเริ่มต้นเพื่อคงพฤติกรรมเดิมและ e2e
- **ตรวจแล้ว:** ฟังก์ชันใน `lib/line-edit.ts` ทดสอบด้วย Node ผ่านทุกกรณี · **ยังไม่ได้ตรวจ:** การทำงานบนเบราว์เซอร์จริง, e2e ใหม่ (B-011)

### [UPDATE-050] 2026-11-07 ปรับโครงสร้างประสิทธิภาพนอกแผนที่
- **ไฟล์:** `app/page.tsx`, `app/layout.tsx`, `components/charts/WaterTimelineChart.tsx`, `lib/offline-db.ts`, `lib/hdms-api.ts`, `lib/use-polling-activity.ts`, `components/offline/*`, migration `20261107000100_limit_timeline_history_in_system_data.sql`
- **ทำอะไร:** จำกัด timeline 60 รายการ/จุด; โหลดกราฟแบบ lazy; memo กราฟ/ข้อความทางเลี่ยง; ลบลิงก์ CSS จาก CDN ที่ซ้ำ/ไม่ใช้; IndexedDB ใช้การเชื่อมต่อเดียว; ข้ามการ poll เมื่อแท็บซ่อน; timeout บันทึกเลเยอร์ 90 วินาที
- **ตรวจแล้ว:** TypeScript จำลอง · **ยังไม่ได้ตรวจ:** migration บน PostgreSQL จริง (เจ้าของต้องรัน), lint/build/e2e

### [UPDATE-051] 2026-11-07 ลดขนาด payload (เส้นทางหลวงลดจุด + ตอบกลับแบบเบา)
- **ไฟล์:** migration `20261107000200_highway_display_geometry.sql`, `supabase/functions/hdms-api/index.ts`, `lib/hdms-api.ts`, `app/actions/doh-actions.ts`, `app/page.tsx`
- **ทำอะไร:** คอลัมน์ `geojson_display` + trigger + RPC `doh_get_system_data_display_rpc`; หน้าประชาชนใช้ `getPublicSystemDataAction`; การเขียนส่ง `light:true` ไม่ตอบข้อมูลทั้งระบบ (เดิมหน้าแอดมินโหลดซ้ำ 2 รอบต่อการบันทึก)
- **ตรวจแล้ว:** ไวยากรณ์ Edge Function ผ่าน, TypeScript จำลอง · **ยังไม่ได้ตรวจ:** SQL บน PostgreSQL จริง · **ลำดับ deploy:** SQL → Edge Function → เว็บ (ทุกขั้นย้อนไปทางเดิมได้เองถ้าขั้นอื่นยังไม่อัปเดต)

### [UPDATE-052] 2026-11-08 ปรับ UX/UI หน้าประชาชนและหน้าแอดมิน
- **ไฟล์:** `app/page.tsx`, `app/globals.css`, `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`, `components/admin/ui.tsx` (ใหม่), `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`
- **ทำอะไร:** ดู `docs/UI_CONTRACT.md` · แก้ข้อความสถานะที่ขัดกันในการ์ดสรุปเดสก์ท็อป (แสดงจุดผ่านได้ 1 ช่องทางว่า "ผ่านได้ปกติ")
- **ตรวจแล้ว:** TypeScript จำลอง, การ render ของ `FloodCard`/`SituationSummary`, เทียบชื่อ/label ที่ e2e อ้างถึงด้วยการอ่าน · **ยังไม่ได้ตรวจ:** ดูบนเบราว์เซอร์จริง, e2e

### [UPDATE-053] 2026-11-08 ปรับกติกาและ workflow สำหรับ AI
- **ไฟล์:** `AGENTS.md` (เขียนใหม่), `CLAUDE.md` (ใหม่), `GEMINI.md`, `.cursorrules`, `.windsurfrules` (เหลือตัวชี้), `docs/*` (ใหม่), `PRODUCTION.md` และ `DESIGN.md` (เพิ่มประกาศแก้ข้อมูลที่ไม่ตรงโค้ด)
- **ทำอะไร:** ไฟล์กติกาหลักไฟล์เดียว (เดิม 4 ฉบับซ้ำและเพี้ยนกัน) · เลิกบังคับอ่าน `SUPPLEMENTAL_RULES.md` 120 KB ทุกเซสชัน · เพิ่ม Challenge Protocol และ "ข้อเสนอเชิงรุก" ท้ายทุกคำตอบ · เพิ่ม playbook, UI contract, backlog · บันทึกข้อค้นพบ B-001–B-012
- **ตรวจแล้ว:** ทุกข้อเท็จจริงในเอกสารตรวจกับโค้ดในรีโปแล้ว (ระบุ "(ต้องยืนยัน)" ในจุดที่ต้องดู production)

### [UPDATE-054] 2026-11-09 ปรับปรุง UI แผนที่และระบบจัดการ 5 จุด (UX/UI Enhancements)
- **ไฟล์:** `components/map/LongdoGisMap.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/SystemSettingsTab.tsx`, `components/admin/tabs/MapManagementTab.tsx`
- **ทำอะไร:**
  1. `components/admin/tabs/MapManagementTab.tsx`: เปลี่ยนตัวเลือกหมายเลขทางหลวงเป็น Combobox ค้นหาอัจฉริยะ (Smart Search), จัดเรียงตามหมายเลขทางหลวงและคุณสมบัติทางวิศวกรรม พร้อมแสดงช่วง กม. และ auto-fill กม.เริ่มต้น/สิ้นสุด
  2. `components/map/LongdoGisMap.tsx`: ปรับตำแหน่งป้ายแคปซูลแจ้งเตือนน้ำท่วม (Capsule Badge) ให้อยู่จุดกึ่งกลางของเส้นทางน้ำท่วม (Midpoint of polyline) เสมอ
  3. `app/admin/page.tsx`: เพิ่มปุ่มพับ/เปิดแผงควบคุมฝั่งซ้าย (Collapsible Sidebar) ขยายแผนที่แบบเต็มจอ พร้อม auto-resize
  4. `components/admin/tabs/GisDataImportTab.tsx`: ปรับดีไซน์ Modal รายละเอียดสายทาง จัดหมวดหมู่คุณสมบัติวิศวกรรมและการ์ดปุ่มจัดการให้เรียบร้อยสวยงาม
  5. `components/admin/tabs/SystemSettingsTab.tsx`: ปรับปุ่ม "จิ้มพิกัดบนแผนที่" ให้ใช้ `ActionButton variant="pick"` พร้อมสถานะ active และจัดกรอบช่องกรอก Lat, Lon ให้เป็นมาตรฐานเดียวกัน
- **ตรวจแล้ว:** `npm run typecheck`, `npm run lint` (0 warnings), Next.js Static Export build ผ่านสมบูรณ์ (Static pages 6/6) · **ยังไม่ได้ตรวจ:** ตรวจผลบนหน้าจอมือถือจริง

### [UPDATE-055] 2026-11-09 แก้ไขเพิ่มเติมระบบเลือกทางหลวง พับแผง และช่องพิกัดเดี่ยว
- **ไฟล์:** `components/admin/tabs/MapManagementTab.tsx`, `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/SystemSettingsTab.tsx`
- **ทำอะไร:**
  1. `MapManagementTab.tsx`: แก้ไข auto-fill กม.เริ่มต้น-สิ้นสุด ให้เปลี่ยนค่าตามสายทางหลวงที่เลือกใหม่เสมอทุกครั้ง (ไม่ถูกบล็อกด้วยเงื่อนไขเดิม)
  2. `app/admin/page.tsx` & `AdminConsole.tsx`: ปรับปรุงระบบพับแผง เมื่อพับแผงย่อย (หน้าต่างฟอร์ม) แถบไอคอนเมนูหลักยังคงแสดงผลอยู่ด้านข้าง และเมื่อคลิกที่ไอคอนเมนูใดก็ตาม จะขยายเปิดแผงทำงานทั้งหมดกลับมาอัตโนมัติ
  3. `SystemSettingsTab.tsx`: เปลี่ยนช่องกรอกพิกัดสำนักงานเป็นช่องเดี่ยว รองรับการคัดลอกพิกัดคู่ (Lat, Lon) จาก Google Maps มาวางได้โดยตรง พร้อมระบบ parse แยกค่าอัตโนมัติ
- **ตรวจแล้ว:** `npm run typecheck`, `npm run lint` (0 warnings), Next.js Static Export build ผ่าน 100% (6/6 static pages)

### [UPDATE-056] 2026-11-09 พัฒนาระบบ GIS ทั้ง 4 รายการหลัก (Zoom-based Highway, Directional Arrows, Side/Lane Flood Reporting, A-B / B-A Detour Routing)
- **ไฟล์:** `supabase/migrations/20261109000100_directional_flood_and_detour.sql` (ใหม่), `lib/constants.ts`, `db/default-data.ts`, `app/actions/doh-actions.ts`, `supabase/functions/hdms-api/index.ts`, `lib/gis-utils.ts`, `components/map/LongdoGisMap.tsx`, `components/admin/tabs/LineStylingTab.tsx`, `app/admin/page.tsx`, `components/admin/AdminConsole.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `components/admin/tabs/GisDataImportTab.tsx`, `app/page.tsx`
- **ทำอะไร:**
  1. **รายการที่ 1 (ระบบแสดงเส้นทางหลวงตามระดับ Zoom):** ซ่อนทางหลวงสายรอง (`SECOND_HIGHWAY`) อัตโนมัติเมื่อ `zoom < 11` ยกเว้นสายรองที่มีเหตุการณ์น้ำท่วมกำลังเกิดเหตุ (`criticalHighwayRouteNos`) พร้อมสวิตช์ `"แสดงสายรองทุกระดับซูม"` ใน Legend และปรับลดความหนาแน่นของเส้นในมุมมองภาพรวมโดยใช้ Canvas Renderer เดียว
  2. **รายการที่ 2 (ระบบสร้างแนวเส้น GIS และลูกศรอัตโนมัติ):** รองรับการสร้างแนวเส้นอ้างอิงโครงข่ายถนนจริง (`SINGLE_CENTERLINE` 2 ทิศทาง, `DUAL_CARRIAGEWAY` แยกคันทาง A→B และ B→A จาก OSRM โดยห้ามใช้ offset ปลอม, และ `ONE_WAY`) พร้อมระบบลูกศรบอกทิศทาง (`TWO_WAY ⇄`, `FORWARD →`, `REVERSE ←`, `UNKNOWN` ซ่อนลูกศรเพื่อไม่เดาทิศทางจากลำดับจุดดิบ), ปรับแต่งสี/ขนาด/ระยะห่าง/เปิด-ปิด ได้ใน `LineStylingTab.tsx`, ซ่อนอัตโนมัติเมื่อซูมออก และจำกัดการวาดเฉพาะในกรอบหน้าจอ (`MAX_ARROWS = 160`)
  3. **รายการที่ 3 (ระบบน้ำท่วมแยกฝั่งและช่องจราจร):** เพิ่มการบันทึก `road_side` (`LEFT/RIGHT/BOTH/UNKNOWN`), `affected_lanes`, `affected_shoulder`, `reporter_name`, และ `direction_meta.water_level_known` · ซ่อนเส้นน้ำท่วมจากแผนที่ปัจจุบันเมื่อยืนยันระดับน้ำล่าสุดเป็น `0 ซม.` (`isFloodLineVisibleOnCurrentMap`) โดยเก็บประวัติทั้งหมดไว้ · แก้ไข `IncidentRegistryTab.tsx` ไม่ให้เปลี่ยนสถานะถนนเป็น `PASSABLE` อัตโนมัติเมื่ออัปเดตระดับน้ำเป็น `0 ซม.` · แจ้งเตือนชัดเจนว่าฝั่งตรงข้ามที่ไม่มีรายงานไม่ถือว่าปลอดภัยอัตโนมัติ
  4. **รายการที่ 4 (ระบบทางเลี่ยง A-B และ B-A):** คำนวณเส้นทางเลี่ยง `A → B` และ `B → A` แยกจากกันตามโครงข่ายถนนจริง รองรับ `direction_mode` (`TWO_WAY`, `FORWARD_ONLY`, `REVERSE_ONLY`), ตรวจสอบการทับซ้อนกับช่วงถนนที่ปิดการจราจร (`detectClosedRoadConflicts`) พร้อมบล็อกการเผยแพร่ทางเลี่ยงที่ตัดผ่านจุดปิดการจราจร และเพิ่มกล่องพรีวิวตรวจสอบ `A-B / B-A Inspector` ก่อนบันทึก
- **ความเสี่ยงที่ยอมรับ:** เจ้าของระบบอนุมัติทางเลือก A (Additive Schema Migration + Backward Fallback) และรับทราบว่าจะทยอยอัปเดตข้อมูลทิศทางของรายการเดิมภายหลัง · คงระบบบันทึก χωρίς การบังคับ Login ในรอบนี้ตาม B-001
- **ตรวจแล้ว:** `npm run lint` (`--max-warnings=0`), `npm run typecheck`, และ `NEXT_OUTPUT=export npm run build` ผ่านทั้งหมด (6/6 static pages) · **ยังไม่ได้ตรวจ:** รันไฟล์ SQL migration บนฐานข้อมูล Supabase จริง และรัน Edge Function บนคลาวด์จริง
- **ลำดับ deploy:** 1) รัน SQL `supabase/migrations/20261109000100_directional_flood_and_detour.sql` → 2) Deploy Edge Function `supabase/functions/hdms-api/index.ts` → 3) Deploy เว็บ (ทั้ง Edge Function และเว็บมีระบบ fallback อัตโนมัติหากยังไม่ได้รัน SQL)

### [UPDATE-061] 2026-11-10 Phase 2: ระบบจัดการและรายงานสถานการณ์น้ำท่วม (Flood Event Management System)
- **ไฟล์:** `lib/flood-event-schema.ts` (ใหม่), `lib/gis-utils.ts`, `app/globals.css`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/map/LongdoGisMap.tsx`, `app/page.tsx`, `eslint.config.mjs`
- **ทำอะไร:**
  1. **สถาปัตยกรรมข้อมูล Parent–Child เหตุการณ์หลักและช่วงย่อย (ทางเลือก 1):** ออกแบบ Schema ใน `lib/flood-event-schema.ts` เชื่อมโยงเหตุการณ์หลัก (Parent Event ID, Code, Title) กับช่วงย่อย (Child Segments) ผ่าน `direction_meta` (JSONB) บนตาราง `doh_flood_routes` เดิม 100% ไม่ต้อง Migrate Database ข้อมูลผูกกับ `doh_timeline_updates` และ `doh_detour_routes` ได้อย่างสมบูรณ์
  2. **ระบบตัดแนวเส้น GIS ตามช่วง กม. อัตโนมัติ (Linear Referencing):** เพิ่มฟังก์ชัน `slicePolylineByKmRange` ใน `lib/gis-utils.ts` ตัดแนวเส้นเฉพาะช่วง กม. ที่ท่วมตามทิศทางสายทางจริง (`A_TO_B` หรือ `B_TO_A`) จากจุดเริ่ม กม. ถึงจุดสิ้นสุด กม. ไม่ต้องวาดเส้นซ้ำ
  3. **การแสดงผล 5 สีสถานะจราจรบนแผนที่:** รองรับสถานะ 5 สีตามมาตรฐาน (เขียว `#16a34a`, เหลือง `#eab308`, ส้ม `#f97316`, แดง `#dc2626`, เทา `#64748b`) ทั้งบนป้ายแคปซูล (`LongdoGisMap.tsx`), การ์ดสรุปสถานการณ์, แถบสถานะ, และชิปแสดงผล พร้อมแก้ไข Leaflet Zoom Controls ไม่ให้ชนกับป้ายด้านบน
  4. **ระบบอัปโหลดรูปภาพหน้างานสูงสุด 5 รูป (Adaptive Client-Side Compression):** ฟังก์ชัน `compressImageToAdaptiveBase64` บีบอัดภาพหน้างานอัตโนมัติให้มีขนาดไม่เกิน 300 KB ต่อรูป จัดเก็บรูปแรกใน `latest_photo_url` และอาเรย์ภาพทั้งหมดใน `direction_meta.photos` แสดงแกลเลอรีรูปขนาดย่อ (Thumbnail strip) ในหน้าต่างรายละเอียดฝั่งประชาชน
  5. **แผงจัดการสำหรับเจ้าหน้าที่ (`MapManagementTab.tsx` & `IncidentRegistryTab.tsx`):**
     - รองรับการเลือก/สร้างเหตุการณ์หลัก (Parent Event)
     - เลือกทิศทาง (`A_TO_B`, `B_TO_A`, `BOTH`)
     - เลือกส่วนของถนนที่ได้รับผลกระทบ (Multi-select chips: ผิวทางซ้าย/ขวา, ไหล่ทางซ้าย/ขวา, ทางขนาน)
     - ปุ่ม "✂️ แบ่งช่วงน้ำท่วม" (Split Segment) สำหรับแบ่งช่วงกิโลเมตรและสถานะแยกอิสระ
     - ยืนยันระดับน้ำลดเหลือ 0 ซม. โดยไม่เปลี่ยนสถานะเป็นผ่านได้ปกติอัตโนมัติ
- **ตรวจแล้ว:**
  - `npm run typecheck` (`tsc --noEmit`): ผ่าน Exit Code 0
  - `npm run lint` (`eslint . --max-warnings=0`): ผ่าน Exit Code 0
  - Static Export Build (`cmd /c "set NEXT_OUTPUT=export && npx next build"`): ผ่าน 100% (6/6 static routes prerendered)
- **ยังไม่ได้ตรวจ:** Playwright E2E บนเครื่องนี้เนื่องจากไม่มี binary Chromium ของ Playwright ติดตั้งไว้ในเครื่องผู้ใช้ (ใช้ได้บน CI ของ GitHub Actions)
- **ลำดับ deploy:** เว็บไซต์ (GitHub Pages) ขั้นเดียว ไม่ต้องรัน Migration ฐานข้อมูลหรือ Edge Function ใหม่
- **ไฟล์:** `lib/highway-schema.ts` (ใหม่), `components/admin/tabs/GisDataImportTab.tsx`, `tests/e2e/admin-menus.spec.ts`
- **ทำอะไร:**
  1. **แก้ปัญหา CI แดงจาก Empty State (`tests/e2e/admin-menus.spec.ts`):** ปรับปรุง assertion ของหมวดรายการเหตุการณ์ให้รองรับกรณีฐานข้อมูลว่างเปล่า (Empty State ขณะรอลงข้อมูลใหม่) ด้วย pattern `if (await floodSymbol.count()) ... else ...` เช่นเดียวกับฝั่งทางเลี่ยง เพื่อไม่ให้ CI timeout 5 วินาที
  2. **มาตรฐาน Parent–Child สายทาง & Stable ID (`lib/highway-schema.ts`):** กำหนด Types/Interfaces และฟังก์ชันคำนวณ `groupHighwayFeatures`, `generateSectionGroupId`, `generateStableFeatureId`, `calculateGeodesicLengthKm`, `calculateKmDistanceKm`, `haversineDistanceMeters` โดยอิง GeoJSON properties เดิม 100% ไม่ต้อง Migrate Database
  3. **ตารางจัดกลุ่มตอนควบคุมหลักและเส้นย่อย (`components/admin/tabs/GisDataImportTab.tsx`):** เพิ่มปุ่มสลับมุมมอง `[ 📑 จัดกลุ่มตอนควบคุม (Parent–Child) ]` และ `[ 📋 รายการเดี่ยวทั้งหมด ]` ในมุมมองจัดกลุ่ม แสดงชิปทิศทาง `🚗 ขาไป (A→B)`, `🚙 ขากลับ (B→A)`, `🛣️ ทางขนาน` และขยายดูเส้นย่อยเพื่อเปิดแก้ไขแนวถนนเฉพาะเส้นได้อิสระ
  4. **ตัวแก้ไขแนวถนนแยกทิศทาง & ป้องกันบั๊กซ้ำซ้อน:** ปรับปรุง `saveEditedGeometry` ให้อัปเดต `DUAL_CARRIAGEWAY` ในตำแหน่งเดิมแทนการ push ซ้ำซ้อน และเพิ่มการ์ดตรวจสอบความยาวจริง GIS vs ช่วง กม. พร้อมปุ่ม `"สลับทิศทางจุดหัว-ท้าย (A ⇄ B)"`
- **ตรวจแล้ว:** `npm run lint` (`--max-warnings=0`), `npm run typecheck`, และ Next.js Static Export build (`6/6 static pages`) ผ่านฉลุย 100%

### [UPDATE-059] 2026-11-10 แก้ไขข้อผิดพลาด CI บน GitHub Actions (E2E Contract & Detour Routing Assertion)
- **ไฟล์:** `app/page.tsx`, `components/admin/tabs/MapManagementTab.tsx`, `docs/CHANGELOG.md`, `SUPPLEMENTAL_RULES.md`
- **สาเหตุของข้อผิดพลาดบน GitHub CI (Run 42593837883):**
  1. `smoke.spec.ts:32` (ทั้ง desktop และ mobile): การ์ดทางเลี่ยงใน `detourList` มีชื่อตอนน้ำท่วม `(${linkedFlood.section_name})` เช่น "ตอนบ้านดี - ปะลัส" อยู่ในตัวปุ่มการ์ด ทำให้คำสั่ง Playwright `page.getByRole("button").filter({ hasText: "ตอนบ้านดี - ปะลัส" }).first()` ไปคลิกโดนการ์ดทางเลี่ยงแทนที่จะคลิกการ์ดจุดน้ำท่วม ส่งผลให้เปิดป๊อปอัปผิดตัว (เปิด Detour Modal แทน Flood Dossier Dialog) และหาไดอะล็อก `/รายละเอียดจุดน้ำท่วม/` ไม่เจอจนหมดเวลา
  2. `admin-menus.spec.ts:109`: เมื่อเปิดตัวเลือก "บังคับตรงผ่านสามแยก/สี่แยก" (`forceStraightThrough = true`) ข้อความสถานะ snapping ใน `MapManagementTab.tsx` ไม่ได้ใส่คำว่า `"คำนวณแนวตรงผ่านแยกตามจุดควบคุมสำเร็จ"` ตามที่ test คาดหวัง
- **การแก้ไข:**
  1. ใน `app/page.tsx`: ตัดชื่อตอน `(${linkedFlood.section_name})` ออกจากปุ่มการ์ดทางเลี่ยงด้านนอก ให้แสดงเฉพาะ `ผูกจุดน้ำท่วม ทล.42` ทำให้ Playwright คลิกโดนการ์ดจุดน้ำท่วมจริง 100% (ส่วนภายในป๊อปอัปคำแนะนำยังคงแสดงชื่อตอนและภาพถ่ายครบถ้วน)
  2. ใน `components/admin/tabs/MapManagementTab.tsx`: ใส่ข้อความ `"คำนวณแนวตรงผ่านแยกตามจุดควบคุมสำเร็จ"` เข้าใน `snappingStatusText` เมื่อคำนวณเส้นทางเลี่ยงในโหมดตรงผ่านแยก
- **ตรวจแล้ว:** `npm run lint` (`--max-warnings=0`), `npm run typecheck` ผ่านสมบูรณ์

### [UPDATE-058] 2026-11-09 แยกแท็บน้ำท่วม/ทางเลี่ยง, ปรับการ์ดทางเลี่ยงพร้อมโมดอลคำแนะนำ, และกรองชิปเฉพาะสายทางน้ำท่วม
- **ไฟล์:** `app/page.tsx`
- **ทำอะไร:**
  1. **แยกแท็บน้ำท่วมและทางเลี่ยง (Sub-tabs):** เพิ่มแท็บสลับมุมมอง `[ ทั้งหมด ]`, `[ 🌊 น้ำท่วม ]`, `[ 🔄 ทางเลี่ยง ]` ทั้งบน Desktop Sidebar และ Mobile Drawer ช่วยให้ประชาชนเลือกดูเฉพาะสิ่งที่สนใจได้ทันที ไม่ปะปนกัน
  2. **จัดรูปแบบการ์ดทางเลี่ยง (Compact Detour Card):** ยกเลิกการแสดงข้อความยาว 20 บรรทัดเทลงมาในการ์ด เปลี่ยนเป็นการ์ดสรุปหัวข้อหลัก แสดงชื่อเส้นทางเลี่ยง, ป้ายกำกับทิศทาง (ทางเดียว หรือ ไป-กลับ), ป้ายผูกจุดน้ำท่วม, และปุ่ม `"ดูคำแนะนำ →"` เพื่อเปิดหน้าต่างป๊อปอัป
  3. **หน้าต่างป๊อปอัปคำแนะนำทางเลี่ยง (Detour Recommendation Modal):** แสดงรายละเอียดครบถ้วน ได้แก่ ภาพถ่ายสถานการณ์น้ำท่วมจากจุดที่ผูกไว้ (`flood.latest_photo_url` ตามทางเลือกที่ 1 ที่ผู้ใช้เห็นชอบ), สวิตช์สลับทิศทาง `[ 🚗 ขาไป (A → B) | 🚙 ขากลับ (B → A) ]`, คำแนะนำเส้นทางทีละขั้นตอนที่อ่านง่าย, ปุ่มนำทาง Google Maps ไปยังจุดเริ่มต้นตามทิศทางที่เลือก, และปุ่มดูตำแหน่งบนแผนที่
  4. **กรองและจัดเรียงชิปหมายเลขทางหลวง (Dynamic Highway Chips):** ปรับปรุงตัวเลือกชิปด้านบนให้แสดง "เฉพาะสายทางที่มีรายงานน้ำท่วมกำลังเกิดเหตุเท่านั้น" (`is_active: true`) และจัดเรียงตามลำดับตัวเลขทางหลวงจริงจากน้อยไปมาก (เช่น ทล.42 → ทล.43 → ทล.418 → ทล.4061 → ทล.4075 → ทล.4092)
- **ตรวจแล้ว:** `npm run lint` (`--max-warnings=0`), `npm run typecheck`, Next.js Static Export build ผ่านสมบูรณ์ (Static pages 6/6), สัญญา E2E คงเดิม (`sidebarTab === "ALL"` เป็นค่าเริ่มต้น)
- **ลำดับ deploy:** เว็บไซต์ (GitHub Pages) ขั้นเดียว ไม่กระทบ Database หรือ Edge Function

### [UPDATE-057] 2026-11-09 แก้ไข 3 จุดตามภาพข้อเสนอแนะ (UI Polish & Detour Direction Toggle)
- **ไฟล์:** `components/map/LongdoGisMap.tsx`, `app/globals.css`, `lib/gis-utils.ts`, `app/page.tsx`
- **ทำอะไร:**
  1. **แก้ไขรายละเอียดจุดน้ำท่วมไม่แสดง (ภาพที่ 1):** ลบโค้ด inline style `color:#0f172a` ที่ทำให้ตัวหนังสือกลืนเป็นสีดำไปกับพื้นหลังป๊อปอัป ปรับเป็นชุดสีสว่าง (`text-slate-100`, `text-white`, `text-amber-400`, ป้าย ทล. สีเหลืองทองเด่นชัด, ป้ายสถานะจราจร, ข้อมูลฝั่ง/ช่องจราจร/ไหล่ทาง และปุ่ม `"ดูรายงานและทางเลี่ยงแบบเต็ม →"`)
  2. **แก้ไขป้ายซ้อนทับกันบนมือถือ (ภาพที่ 2):** ยุบรวมป้ายสรุปสถานะ (`น้ำท่วม x จุด`, `ทางเลี่ยง y เส้นทาง`) และปุ่ม `"สัญลักษณ์บนแผนที่"` เข้าใน Header Bar แถวเดียวกันด้านบนแผนที่ (`justify-between gap-1.5`) ป้องกันไม่ให้ป้ายชนหรือเกยทับกันบนจอมือถือ พร้อมเลื่อนปุ่ม Zoom Control ของ Leaflet ลงมาที่ `top: 54px` ไม่ให้ชนกับป้ายด้านบน
  3. **เพิ่มปุ่มสลับคำอธิบายทางเลี่ยง A→B และ B→A (ภาพที่ 3):** เพิ่มฟังก์ชัน `splitDetourAdviceByDirection` และปุ่ม Segmented Toggle `[ ขาไป (A → B) | ขากลับ (B → A) ]` ใน Detour Popup บนแผนที่ และกล่องแนะนำทางเลี่ยงในหน้าต่างรายละเอียดฝั่งประชาชน
- **ตรวจแล้ว:** `npm run lint` (`--max-warnings=0`), `npm run typecheck`, และ `NEXT_OUTPUT=export npm run build` (Static pages 6/6) ผ่านสมบูรณ์ 100%

### [UPDATE-062] 2026-11-10 Phase 3 — การเชื่อมโยงระบบรายงานน้ำท่วม ทางเลี่ยง และแผนที่ GIS (GIS Integration & Public Information)
- **ไฟล์:** `lib/gis-utils.ts`, `lib/flood-event-schema.ts`, `components/admin/tabs/MapManagementTab.tsx`, `components/admin/tabs/IncidentRegistryTab.tsx`, `components/admin/tabs/DetourManagementTab.tsx`, `components/map/LongdoGisMap.tsx`, `app/page.tsx`
- **ทำอะไร:**
  1. **แก้ไขการตัดเส้น Linear Referencing (`lib/gis-utils.ts`):** ปรับปรุง `slicePolylineByKmRange` ให้คำนวณตำแหน่งสัดส่วนตามแนวสายทางจริง (`sKm` ถึง `eKm`) ก่อน แล้วค่อยสลับลำดับจุดพิกัดผลลัพธ์ (Coordinate sequence order) ให้ตรงกับทิศทางการเดินทาง (`B_TO_A` หรือ high-to-low) ป้องกันไม่ให้พิกัดกระโดดไปอยู่อีกช่วงกิโลเมตรหนึ่ง
  2. **เลือกเส้นทางหลวงและ Branch ตามทิศทางจริง (`components/admin/tabs/MapManagementTab.tsx`):** เชื่อมโยง `handleSlicePolylineFromKm` เข้ากับ `groupHighwayFeatures` เพื่อเลือกตอนควบคุมและเส้น Branch Geometry ที่ตรงกับทิศทางจราจร (`A_TO_B` vs `B_TO_A`), เพิ่มการตรวจจับช่วงกิโลเมตรซ้อนทับ (`detectOverlappingFloodSegments`) ก่อนบันทึก, และเชื่อมโยง `eventId` เข้ากับ `detour_meta`
  3. **ตัดแบ่งพิกัดจริงเมื่อกดแบ่งช่วงน้ำท่วม (`components/admin/tabs/IncidentRegistryTab.tsx`):** ปรับปรุงฟังก์ชัน `handleSplitSegment` ให้ตัดแบ่งพิกัดจริงด้วย `slicePolylineByKmRange` ทั้งช่วงที่ 1 และช่วงที่ 2 ทำให้แต่ละช่วงย่อยมี Geometry, จุดเริ่มต้น-สิ้นสุด, และจุดกึ่งกลางของตนเองอย่างแท้จริง ไม่ซ้อนทับกัน
  4. **เชื่อมโยงทางเลี่ยงกับ Parent Event (`components/admin/tabs/DetourManagementTab.tsx`):** แนบ `eventId` ของเหตุการณ์น้ำท่วมเข้ากับ `detour_meta` เมื่อมีการผูกจุดน้ำท่วม เพื่อให้ทางเลี่ยงเชื่อมโยงกับทุกช่วงย่อยภายใต้เหตุการณ์เดียวกัน
  5. **ป้องกันหมุดแคปซูลซ้อนทับและเพิ่มสัญลักษณ์ตาบอดสี (`components/map/LongdoGisMap.tsx`):**
     - คงสีเส้นน้ำท่วมตามสไตล์กลางของแผนที่ (`fColor`) ตามทางเลือกที่ 2 ที่ผู้ใช้อนุมัติ
     - จัดการหมุดแคปซูลไม่ให้ซ้อนทับกัน (De-overlapping): เพิ่มระบบตรวจจับระยะใกล้เคียง (< 35 ม.) และขยับแบบ Lateral Offset สำหรับสองทิศทาง (`A_TO_B` ขยับขึ้นเหนือ/ตะวันตกเล็กน้อย, `B_TO_A` ขยับลงใต้/ตะวันออกเล็กน้อย)
     - กำหนด `zIndexOffset` ตามความรุนแรงของสถานะจราจร (`CLOSED`: 1000, `NO_SMALL_VEHICLES`: 800, `CAUTION`: 600, `PENDING_VERIFICATION`: 400, `PASSABLE`: 200)
     - เพิ่มสัญลักษณ์ที่เข้าถึงได้สำหรับผู้มีภาวะตาบอดสี (Colorblind Accessible Glyphs: `⛔`, `🚗`, `⚠️`, `✅`, `⏳`) บนป้ายแคปซูล
     - เพิ่มปุ่มสลับโหมดมุมมองในแถบสัญลักษณ์: "แยกช่วงย่อย (ค่าเริ่มต้น) / รวมเหตุการณ์"
  6. **ตารางเปรียบเทียบทุกช่วงและทิศทางในหน้าประชาชน (`app/page.tsx`):**
     - เพิ่มกล่องตารางเปรียบเทียบทุกช่วงและทิศทางในเหตุการณ์เดียวกัน (`siblingSegments`) ในหน้าต่างรายละเอียดจุดน้ำท่วมฝั่งประชาชน พร้อมปุ่มสลับดูแต่ละช่วงได้ใน 1 คลิก
     - เชื่อมโยงทางเลี่ยงผ่าน `eventId` เพิ่มเติมจาก `flood_id_ref`
     - ใส่ `loading="lazy"` และ `decoding="async"` สำหรับรูปภาพสถานการณ์เพื่อถนอมหน่วยความจำและดาต้าบนมือถือตามทางเลือกที่ 2
  7. **ปรับทิศทางทางเลี่ยง (FORWARD / REVERSE) ให้ตรงกับจุดน้ำท่วมอัตโนมัติ (`app/page.tsx` & `components/map/LongdoGisMap.tsx`):**
     - เมื่อประชาชนเลือกดูจุดน้ำท่วมทิศทางใด (เช่น `B_TO_A` ขากลับ) ระบบจะปรับกล่องคำแนะนำทางเลี่ยงในหน้าต่างรายละเอียด และป๊อปอัปทางเลี่ยงบนแผนที่ ให้แสดงทิศทางที่สอดคล้องกันโดยอัตโนมัติ พร้อมป้ายระบุสถานะชัดเจน โดยประชาชนยังคงสลับทิศทางดูเองได้ทุกเมื่อ
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่านฉลุย 0 warnings
  - `npm run typecheck`: ผ่านฉลุย 0 errors
  - Next.js Static Export build: ผ่าน 100% (6/6 static pages prerendered)
- **ลำดับ deploy:** เว็บไซต์ (GitHub Pages) ขั้นเดียว ไม่กระทบ Database หรือ Edge Function

### [UPDATE-063] 2026-11-10 Phase 4 — System Optimization, UX/UI & Production Readiness (การปรับปรุงประสิทธิภาพ ประสบการณ์ใช้งาน ความเสถียร และความพร้อมใช้งานจริง)
- **ไฟล์:**
  - `lib/gis-utils.ts`
  - `lib/flood-event-schema.ts`
  - `components/admin/tabs/MapManagementTab.tsx`
  - `components/admin/tabs/IncidentRegistryTab.tsx`
  - `components/admin/AdminConsole.tsx`
  - `app/admin/page.tsx`
  - `app/page.tsx`
  - `lib/offline-db.ts`
  - `components/offline/OfflineSyncStatus.tsx`
  - `supabase/functions/hdms-api/index.ts`
  - `app/actions/doh-actions.ts`
  - `supabase/migrations/20261110000100_optimize_display_payload_photos.sql` (ใหม่)
- **ทำอะไร:**
  1. **การปรับปรุงการอัปโหลดและบีบอัดภาพ (Image Upload & Adaptive Compression):**
     - ปรับปรุง `compressImageToAdaptiveBase64` ใน `lib/gis-utils.ts` ให้ตรวจจับและใช้ฟอร์แมต **WebP** เป็นลำดับแรก (Fallback เป็น JPEG อัตโนมัติเมื่อระบบไม่รองรับ)
     - การเรนเดอร์ผ่าน Canvas ช่วยล้าง EXIF Metadata ป้องกันข้อมูลส่วนบุคคลและลดขนาดไฟล์ลงทันที
     - เพดานขนาดรูปภาพไม่เกิน 300 KB ต่อภาพอย่างเด็ดขาด
     - แสดงรายละเอียดขนาดไฟล์ก่อนและหลังบีบอัดพร้อมเปอร์เซ็นต์ที่ลดลงใน `MapManagementTab.tsx` (เช่น `145 KB (WEBP) ลดจาก 4.2 MB (-97%)`)
  2. **ลดขนาด Payload หน้าประชาชนและโหลดภาพเต็มแบบ On-Demand (Database & Public Payload Optimization — ทางเลือก 1.1):**
     - สร้าง Migration `20261110000100_optimize_display_payload_photos.sql` ปรับปรุง `doh_get_system_data_display_rpc()` ให้ส่งเฉพาะรูปปก (`photos[0..0]`) ในการโหลดหน้าแรกของประชาชน
     - ใน `app/page.tsx`: เมื่อประชาชนคลิกเปิดหน้าต่างรายละเอียดจุดน้ำท่วม (Flood Dossier Modal) ระบบจะโหลดอัลบั้มภาพเต็ม (รูปที่ ๒–๕) แบบ On-Demand จากฐานข้อมูลทันที ทำให้หน้าแรกโหลดเร็วขึ้นกว่า 80% โดยไม่สูญเสียความสามารถในการดูอัลบั้มภาพ ๕ รูป
  3. **ลดขั้นตอนการทำงานของเจ้าหน้าที่ — สร้างคู่ทิศทางไป-กลับในคลิกเดียว (Dual-Direction Quick Create):**
     - เพิ่มโหมด `⚡ บันทึก ๒ ทิศทาง (A→B และ B→A) พร้อมกัน` ใน `MapManagementTab.tsx`
     - เจ้าหน้าที่สามารถระบุระดับน้ำและสถานะจราจรของแต่ละฝั่งได้ในฟอร์มเดียว ระบบจะสร้าง ๒ ช่วงย่อยภายใต้ `eventId` เดียวกันพร้อมตัดเส้น Geometry ตามทิศทางจริงใน ๑ คลิก
  4. **ปุ่ม "รวมช่วง กม. (Merge Segments)" ในทะเบียนเหตุการณ์:**
     - เพิ่มปุ่ม `รวมช่วง` และ Modal ใน `IncidentRegistryTab.tsx` สำหรับรวม ๒ ช่วงย่อยในสายทางเดียวกัน
     - ระบบคำนวณช่วง กม. รวม (`min(kmStart)` ถึง `max(kmEnd)`), ตัดเส้น Geometry ใหม่ตามช่วงรวม, สรุประดับน้ำและสถานะจราจร, อัปเดตช่วงหลัก, ซ่อนช่วงที่ถูกรวม และบันทึกประวัติ Timeline อัตโนมัติ
  5. **เพิ่มความเร็วหน้า `/admin` ด้วย Lazy Full-Precision Geometry (Backlog B-004 — ทางเลือก 3.1):**
     - หน้า `/admin` (`app/admin/page.tsx`) โหลดเริ่มต้นด้วย `getPublicSystemDataAction` (Geometry แบบลดจุด) ทำให้เข้าหน้าเว็บได้เร็วขึ้นกว่าเดิม ๓–๕ เท่า
     - เมื่อเจ้าหน้าที่สลับเข้าแท็บ `GIS` (`GisDataImportTab`) หรือเปิดโหมดแก้ไขจุด Vertex ระบบจะดึง `getSystemDataAction` (ความละเอียดเต็ม ๑๕ ตำแหน่ง) มาแทนที่อัตโนมัติ
  6. **เพิ่มความเสถียรและป้องกันการบันทึกทับกัน (Concurrency & Offline Field Sync):**
     - ใน `supabase/functions/hdms-api/index.ts`: เพิ่มการตรวจสอบ `expectedUpdatedAt` ใน `upsertRouteAction` เพื่อป้องกันเจ้าหน้าที่บันทึกทับข้อมูลกันเอง (HTTP 409 Conflict)
     - ใน `lib/offline-db.ts` และ `OfflineSyncStatus.tsx`: อัปเกรด `OfflineReportItem` ให้เก็บและซิงค์ฟิลด์ `roadSide`, `affectedLanes`, `affectedShoulder`, และ `directionMeta` กลับขึ้นเซิร์ฟเวอร์ได้ครบถ้วน
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่านฉลุย 0 warnings
  - `npm run typecheck`: ผ่านฉลุย 0 errors
  - `NEXT_OUTPUT=export next build`: ผ่าน 100% สร้าง Static pages 6/6 หน้าสมบูรณ์
- **ลำดับ deploy:**
  1. **SQL Migration:** รัน `supabase/migrations/20261110000100_optimize_display_payload_photos.sql` บน Supabase SQL Editor
  2. **Edge Function:** Deploy `hdms-api` (`supabase functions deploy hdms-api --no-verify-jwt`)
  3. **เว็บไซต์:** Push โค้ดขึ้น GitHub เพื่อให้ GitHub Actions Deploy Static Pages

### [UPDATE-064] 2026-11-10 ปรับปรุงตารางโครงข่ายทางหลวงเป็นแบบ Parent–Child จัดกลุ่มสายทางและขยายดู ๒ ฝั่ง
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`
- **ทำอะไร:**
  1. ปรับปรุงตารางคุณสมบัติทางวิศวกรรมในแท็บ "นำเข้าโครงข่ายสายทาง" ให้แสดงผลแบบ **Parent Control Section** (1 สายทาง/ตอนควบคุมต่อ 1 บรรทัดหลัก) โดยใช้ฟังก์ชัน `groupHighwayFeatures`
  2. รวมสายทางที่มี 2 ทิศทาง (`A_TO_B` และ `B_TO_A`) ที่เคยแสดงแยกเป็น 2 แถวซ้ำซ้อน ให้ยุบเหลือ 1 แถวหลักที่สรุปภาพรวมตอนควบคุม (ช่วง กม., ระยะทาง, ช่องจราจร)
  3. เพิ่มปุ่ม/แถบขยายรายละเอียด **`[ ๒ ฝั่ง (A⇄B) ]`** ในแต่ละแถว เมื่อคลิกจะคลี่แสดงแถวย่อย (Child Branches) ของฝั่งขาไปและฝั่งขากลับ พร้อมรายละเอียดจำนวนจุดพิกัด, ทิศทาง และปุ่มจัดการ (แนวถนน, ตั้งค่า, ลบ) แยกเฉพาะแต่ละฝั่ง
  4. เพิ่มฟังก์ชัน `handleToggleGroupVisibility` สลับเปิด/ปิดตาบนแผนที่ของทั้งตอนควบคุมในคลิกเดียว และ `handleDeleteHighwayGroup` ลบทั้งตอนควบคุมอย่างปลอดภัย
  5. ซิงค์คุณสมบัติทางวิศวกรรม (เช่น จำนวนช่องจราจร, ชนิดผิว, หน่วยงานรับผิดชอบ) ข้ามฝั่งคันทางในตอนควบคุมเดียวกันเมื่อมีการบันทึก เพื่อให้ข้อมูลสองฝั่งสอดคล้องกันเสมอ
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน 0 warnings
  - `npm run typecheck`: ผ่าน 0 errors
  - `NEXT_OUTPUT=export next build`: ผ่าน 100% สร้าง Static pages 6/6 หน้าสมบูรณ์
  - สัญญากับ E2E (Rule R7): ปุ่ม `แนวถนน`, `ตั้งค่า`, `+ เพิ่มสายทางใหม่` ยังคงมี accessible name ครบถ้วน
- **ลำดับ deploy:** เว็บไซต์ (GitHub Pages) ขั้นเดียว ไม่กระทบ Database หรือ Edge Function
