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
