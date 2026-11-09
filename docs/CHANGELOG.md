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
