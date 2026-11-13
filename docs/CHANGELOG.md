# CHANGELOG.md — บันทึกงานใหม่ (แทนการเพิ่มใน SUPPLEMENTAL_RULES.md)

รูปแบบสั้น: วันที่ · หัวข้อ · ไฟล์ · ทำอะไรและทำไม · ตรวจอะไรแล้ว/ยังไม่ได้ตรวจ · ความเสี่ยงที่ยอมรับ (ถ้ามี) · ลิงก์ BACKLOG
ประวัติเก่า (UPDATE-001…047) อยู่ใน `SUPPLEMENTAL_RULES.md` — ใช้ grep ค้น ไม่อ่านทั้งไฟล์ เลขรายการต่อจาก 047

### [UPDATE-090] 2026-11-13 ป้องกัน Draft หลุดใน Public API
- **ไฟล์:** `supabase/migrations/20261113091500_public_payload_excludes_inactive_records.sql` (ใหม่), `supabase/functions/hdms-api/index.ts`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/KNOWN_ISSUES.md`
- **การแก้ไข:** เพิ่ม RPC wrapper `doh_get_public_system_data_display_rpc()` ซึ่งคง geometry แบบเบา แต่ตัด flood Draft, timeline ของ Draft และ detour ที่ผูกกับ Draft ก่อนส่งให้ประชาชน; Edge Function เรียก wrapper นี้เฉพาะ `getPublicSystemDataAction` และไม่ fallback ไป payload เต็มเมื่อ Public RPC ใช้ไม่ได้ เพื่อไม่ให้เกิดการรั่วข้อมูลซ้ำ.
- **Production:** ใช้ migration แล้วกับ Supabase project `ebyobrtvisylwawxiurx`; deploy `hdms-api` เวอร์ชัน 11 แล้ว. ไม่มีตารางหรือข้อมูลจริงถูกเปลี่ยน.
- **ตรวจแล้ว:** lint, typecheck, build:pages และ Playwright ทั้งชุดผ่าน (`86` ผ่าน); QA lifecycle บน Production ยืนยัน Admin เห็น Draft, Public API/UI ไม่เห็น Draft กับ detour ที่ผูก, เปิดใช้งานแล้ว Public เห็น, soft delete แล้ว Public ไม่เห็น. ลบข้อมูล QA ออกจาก DB และตรวจคงเหลือ `0` แล้ว.
- **ย้อนกลับ:** deploy Edge Function เวอร์ชัน 10 แล้ว `DROP FUNCTION IF EXISTS public.doh_get_public_system_data_display_rpc()`; หลัง rollback Public จะกลับไปส่ง Draft ตามพฤติกรรมเดิม จึงไม่แนะนำยกเว้นกรณีฉุกเฉิน.
- **Backlog:** ปิด B-019

### [UPDATE-075] 2026-11-13 เริ่มรวมพฤติกรรม Keyboard ของ modal แอดมิน
- **ไฟล์:** `components/ui/use-modal-accessibility.ts` (ใหม่), `components/ui/AnimatedStatusModal.tsx`, `components/admin/OfficialReportDispatchModal.tsx`
- **การแก้ไข:** สร้าง hook กลางสำหรับตั้ง focus เมื่อเปิด, trap Tab/Shift+Tab, Escape เพื่อปิด และคืน focus กลับปุ่มเดิม; นำไปใช้กับ modal กลางสำหรับยืนยัน/สำเร็จ/ผิดพลาดและแบบรายงานราชการแล้ว
- **ตรวจแล้ว:** `npm run lint`, `npm run typecheck`, `npm run build:pages` ผ่าน
- **ยังไม่เสร็จ:** modal รายละเอียดเหตุการณ์, ทางเลี่ยง และ GIS ยังต้องย้ายมาใช้ hook เดียวกัน (B-018)
- **ลำดับ deploy:** เว็บไซต์ GitHub Pages เท่านั้น · ย้อนกลับด้วย `git revert` commit นี้

### [UPDATE-076] 2026-11-13 ทำให้ modal เหตุการณ์น้ำท่วมใช้งานด้วยคีย์บอร์ดได้
- **ไฟล์:** `components/admin/tabs/IncidentRegistryTab.tsx`
- **การแก้ไข:** ใช้ hook accessibility กลางกับ modal รายละเอียดเหตุการณ์, อัปเดตระดับน้ำ, แบ่งช่วง และรวมช่วง; แต่ละหน้าต่างรองรับ focus ตอนเปิด, Tab/Shift+Tab trap, Escape และคืน focus กลับสู่ปุ่มต้นทาง
- **ตรวจแล้ว:** typecheck และ diff check ผ่าน; lint กำลังรันในสภาพแวดล้อมนี้
- **ยังไม่เสร็จ:** modal ทางเลี่ยงและ GIS ยังอยู่ใน B-018

### [UPDATE-077] 2026-11-13 ทำให้ modal ทางเลี่ยงใช้งานด้วยคีย์บอร์ดได้
- **ไฟล์:** `components/admin/tabs/DetourManagementTab.tsx`
- **การแก้ไข:** modal รายละเอียดและแก้ไขทางเลี่ยงใช้ focus/Escape/Tab trap/คืน focus จาก hook กลางแล้ว
- **ตรวจแล้ว:** `npm run typecheck`, `git diff --check` ผ่าน · **ยังไม่ได้ตรวจ:** E2E keyboard และ modal GIS

### [UPDATE-078] 2026-11-13 ตรวจ modal GIS ด้วยข้อมูลทดสอบแยกจาก Production
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`, `tests/e2e/gis-dialog-keyboard.spec.ts`
- **การแก้ไข:** หน้าต่างตั้งค่าคุณสมบัติและรายละเอียดสายทางใช้ hook กลางสำหรับ focus, Tab, Escape และคืน focus; เพิ่มชื่อให้ปุ่มปิดที่เป็นไอคอน
- **ตรวจแล้ว:** lint, typecheck, build:pages และ Playwright Desktop ผ่าน 1/1 โดย mock สายทางเฉพาะในเบราว์เซอร์ทดสอบ
- **ยังไม่ได้ตรวจ:** คีย์บอร์ดบนอุปกรณ์จริงและ modal แอดมินอื่น ๆ

### [UPDATE-079] 2026-11-13 ทดสอบคีย์บอร์ด modal เหตุการณ์และทางเลี่ยง
- **ไฟล์:** `tests/e2e/admin-dialog-keyboard.spec.ts`
- **การตรวจ:** ใช้ข้อมูลจำลองเฉพาะใน Playwright เปิด modal อัปเดตระดับน้ำและแก้ไขทางเลี่ยงจากปุ่มจริง ตรวจ Tab trap, Escape และคืน focus
- **ผล:** `npx playwright test tests/e2e/admin-dialog-keyboard.spec.ts --project=desktop-chromium --workers=1` ผ่าน 1/1; ไม่มีข้อมูล Production ถูกเปลี่ยน
- **ยังไม่ได้ตรวจ:** modal แบบอื่นและการใช้โปรแกรมอ่านหน้าจอบนอุปกรณ์จริง

### [UPDATE-080] 2026-11-13 ทดสอบ modal กลางของ Admin
- **ไฟล์:** `tests/e2e/admin-shared-dialog-keyboard.spec.ts`
- **การตรวจ:** ใช้ข้อมูลจำลองเฉพาะ Playwright ทดสอบรายงานราชการและกล่องยืนยันลบจากปุ่มจริง; ตรวจ Tab, Escape และคืน focus โดยไม่ยืนยันการลบ
- **ผล:** Playwright desktop ผ่าน 1/1; ไม่เปลี่ยนข้อมูล Production

### [UPDATE-081] 2026-11-13 ทดสอบ modal แบ่งช่วงและรวมช่วง
- **ไฟล์:** `tests/e2e/admin-dialog-keyboard.spec.ts`
- **การตรวจ:** mock เหตุการณ์สองช่วง กม. ในเบราว์เซอร์ทดสอบ แล้วเปิดจากปุ่มจริง ตรวจ Tab วนใน modal, Escape ปิด และคืน focus; ไม่กดยืนยันเปลี่ยนข้อมูล
- **ผล:** Playwright desktop ผ่าน 2/2 ในไฟล์ทดสอบนี้

### [UPDATE-082] 2026-11-13 เปิดรายละเอียดเหตุการณ์ใน Admin และตรวจหน้าต่างรายละเอียดสองอุปกรณ์
- **ไฟล์:** `components/admin/tabs/IncidentRegistryTab.tsx`, `tests/e2e/admin-dialog-keyboard.spec.ts`
- **ปัญหาและการแก้ไข:** modal รายละเอียดเหตุการณ์มีอยู่แต่ไม่มีทางเปิด เพิ่มปุ่มรายละเอียดประจำช่วงเหตุการณ์
- **ผล:** Playwright รายละเอียดเหตุการณ์/ทางเลี่ยงผ่าน desktop 1/1 และ mobile 1/1; ตรวจ Escape, Tab trap, การคืน focus; ไม่เปลี่ยนข้อมูล Production

### [UPDATE-083] 2026-11-13 เปิดรายละเอียดทางเลี่ยงบนมือถือด้วยคีย์บอร์ด
- **ไฟล์:** `components/admin/tabs/DetourManagementTab.tsx`, `tests/e2e/admin-dialog-keyboard.spec.ts`
- **ปัญหาและการแก้ไข:** การ์ดทางเลี่ยงบนมือถือเปิดรายละเอียดได้ด้วยการแตะทั้งการ์ด แต่ไม่มีปุ่มที่โฟกัสด้วยคีย์บอร์ดได้ จึงเพิ่มปุ่ม “รายละเอียด” ในการ์ดและทดสอบ Enter, Escape และการคืน focus
- **ตรวจแล้ว:** lint, typecheck, build:pages ผ่าน; Playwright บน build ล่าสุดผ่าน 6 กรณี (desktop 5, mobile 1) และข้ามตามเงื่อนไข viewport 4 กรณี; ไม่เปลี่ยนข้อมูล Production

### [UPDATE-084] 2026-11-13 ตรวจตัวแก้ไขแนวสายทางด้วยข้อมูลจำลอง
- **ไฟล์:** `tests/e2e/gis-geometry-editor.spec.ts`
- **การตรวจ:** เปิดตัวแก้ไขแนวถนนของสายทางจำลอง, สลับโหมดวาดอิสระ, เพิ่มจุดกึ่งกลาง, Undo/Redo และลบจุด โดยไม่บันทึกข้อมูล; ยืนยันจำนวน Canvas ใน Leaflet overlay ไม่เพิ่มระหว่างแก้ไข
- **ตรวจแล้ว:** Playwright static desktop ผ่าน 1/1; mobile ข้ามตามข้อจำกัดพื้นที่ทำงานของตัวแก้ไข; ไม่เปลี่ยนข้อมูล Production

### [UPDATE-085] 2026-11-13 วัดทรัพยากรของตัวแก้ไขเส้นขนาดใหญ่
- **ไฟล์:** `tests/e2e/gis-editor-performance.spec.ts`
- **การตรวจ:** ใช้เส้นทางจำลอง 500 จุด เปิด–ปิดโหมดวาดอิสระ 3 รอบ ตรวจจำนวนหมุดที่แสดงและ Canvas; แนบค่า `JSHeapUsedSize` จาก Chrome DevTools Protocol เป็นหลักฐานประกอบ
- **ผลวัด:** Chromium desktop heap ก่อนทดสอบ 10,629,660 bytes และหลังทดสอบ 12,414,584 bytes; Canvas คงที่ 1 ใบ; หมุดถูกจำกัดไม่เกิน 400 จุดตามข้อกำหนด
- **ข้อจำกัด:** ค่านี้เป็นเครื่องทดสอบ headless และไม่ใช่ตัวแทน RAM ของเครื่องเจ้าหน้าที่จริง; ยังไม่มีหลักฐานสำหรับปรับจูนโค้ดเพิ่ม

### [UPDATE-086] 2026-11-13 ตรวจการลากหมุดต่อเนื่องของตัวแก้ไขเส้น
- **ไฟล์:** `tests/e2e/gis-geometry-drag-performance.spec.ts`
- **การตรวจ:** ใช้หมุดกึ่งกลางของเส้นจำลอง ลากจริง 12 ครั้งผ่าน pointer event ของเบราว์เซอร์ แล้วตรวจสถานะ Undo, Canvas และ `JSHeapUsedSize`; ยกเลิกตัวแก้ไขโดยไม่บันทึก
- **ผลวัด:** Chromium desktop heap ก่อนลาก 10,545,416 bytes และหลังลาก 12,341,776 bytes; Canvas คงที่ 1 ใบ
- **ข้อจำกัด:** ผลยืนยันเส้นทางลากของ Chromium headless เท่านั้น ยังไม่แทนการใช้งานแบบลากต่อเนื่องนานบนอุปกรณ์เจ้าหน้าที่จริง

### [UPDATE-087] 2026-11-13 ตรวจคำสั่งจัดการจุดดัดของแนวสายทาง
- **ไฟล์:** `tests/e2e/gis-geometry-operations.spec.ts`
- **การตรวจ:** ใช้เส้นจำลองสองสายในเลเยอร์เดียวกัน เปิดโหมดวาดอิสระ แล้วเพิ่มจุดจากกึ่งกลางเส้น, ลบจุด, แบ่งเส้น, เชื่อมเส้น และทำ Undo/Redo หลายลำดับ; ปิดด้วยยกเลิกโดยไม่บันทึก
- **ตรวจแล้ว:** Playwright static desktop ผ่าน 1/1; mobile ข้ามตามขอบเขตเครื่องมือแก้แนว; ไม่เปลี่ยนข้อมูล Production

### [UPDATE-088] 2026-11-13 ตรวจตัวแก้ไขแนวถนนโหมดตามถนน
- **ไฟล์:** `tests/e2e/gis-road-editor.spec.ts`
- **การตรวจ:** ใช้ข้อมูลเส้นจำลองและตอบ OSRM จำลองเฉพาะในการทดสอบ เลือกจุดดัดบนแผนที่, คำนวณแนวใหม่, ลบจุดดัด และยกเลิกโดยไม่บันทึก
- **ตรวจแล้ว:** Playwright static desktop ผ่าน 1/1; mobile ข้ามตามขอบเขตเครื่องมือแก้แนว; ไม่มีการเรียก OSRM หรือเปลี่ยนข้อมูล Production จริง

### [UPDATE-089] 2026-11-13 ตรวจบันทึกแนวสายทางและคันทางคู่
- **ไฟล์:** `components/admin/tabs/GisDataImportTab.tsx`, `tests/e2e/gis-geometry-save.spec.ts`, `tests/e2e/gis-dual-carriageway-save.spec.ts`
- **การแก้ไข:** เพิ่ม accessible name ให้ตัวเลือกโครงสร้างถนนและทิศทางลูกศร เพื่อให้คีย์บอร์ดและโปรแกรมอ่านหน้าจอระบุ control ได้
- **การตรวจ:** ตรวจ payload การบันทึก geometry 3 จุด, การอ่านข้อมูลกลับหลังบันทึก, การตอบ 422 แล้วคง editor ไว้, และ payload คันทางคู่ที่มีเส้นขาไป/ขากลับ; ทุก API ถูกจำลองในเบราว์เซอร์
- **ตรวจแล้ว:** Playwright static desktop ผ่าน 3/3; mobile ข้าม 3 กรณีตามขอบเขตเครื่องมือแก้แนว; build:pages ผ่าน; ไม่เปลี่ยนข้อมูล Production

### [UPDATE-073] 2026-11-12 แก้ให้ Stroke/Casing ของเส้นแสดงผลบนแผนที่ Canvas จริง
- **ไฟล์:** `components/map/LongdoGisMap.tsx`
- **ปัญหา:** `LineStylingTab` บันทึก `borderActive`, `borderColor` และ `borderWidth` ได้ แต่ตัววาด Leaflet Canvas ใช้เฉพาะเส้น foreground จึงไม่มีเส้นขอบปรากฏจริงบนแผนที่
- **การแก้ไข:** วาด casing แบบ non-interactive ใต้เส้นหลักเฉพาะกรณีเปิด Stroke/Casing สำหรับเส้นน้ำท่วม ทางเลี่ยง และโครงข่ายสายทางหลัก/รอง; คลิก ป๊อปอัป การเลือก และแอนิเมชันยังทำบนเส้นหลักชั้นเดียว และเมื่อเลือกเหตุการณ์น้ำท่วม casing จะขยายตามเส้นหลัก
- **ผลด้านทรัพยากร:** ไม่สร้าง SVG/DOM ต่อเส้น และไม่เพิ่มชั้น casing หากปิดตัวเลือก; Canvas renderer เดิมและ layer group เดิมยังถูกใช้ต่อเนื่อง
- **ตรวจแล้ว:** `npm run lint`, `npm run typecheck`, `npm run build:pages` ผ่าน; Playwright mobile route-sheet ผ่านเมื่อ build ด้วย public Supabase config เช่นเดียวกับ CI
- **ลำดับ deploy:** เว็บไซต์ GitHub Pages เท่านั้น (ไม่มี SQL หรือ Edge Function) · ย้อนกลับด้วย `git revert` commit นี้

### [UPDATE-074] 2026-11-12 ทำให้ E2E ในเครื่องใช้ public configuration เดียวกับ CI
- **ไฟล์:** `package.json`, `scripts/test-e2e-with-public-config.mjs` (ใหม่), `docs/BACKLOG.md`
- **การแก้ไข:** เพิ่ม `npm run test:e2e:local` ซึ่งอ่านเฉพาะ public URL/key จาก `.github/hdms-public.json`, build ก่อน แล้วจึงรัน Playwright; ป้องกันหน้า public ค้าง Loading เพราะ `NEXT_PUBLIC_*` ถูกฝังตั้งแต่ขั้น build
- **ตรวจแล้ว:** `npm run test:e2e:local -- tests/e2e/public-route-sheet.spec.ts --project=mobile-chromium --workers=1` ผ่าน 1/1
- **ลำดับ deploy:** ไม่ต้อง deploy (เครื่องมือทดสอบเฉพาะ local/CI) · ย้อนกลับด้วย `git revert` commit นี้

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

### [UPDATE-065] 2026-11-10 ปรับปรุง UI นำเข้า GIS, ลบ Header แอดมิน, ลบโค้ดค้าง, เพิ่มแคช Edge Function, สร้าง Event Code และตำแหน่งอัตโนมัติ, แก้บั๊กฝั่งถนน
- **ไฟล์:**
  - `components/admin/tabs/GisDataImportTab.tsx` (แก้)
  - `app/admin/page.tsx` (แก้)
  - `db/supabase-server.ts` (ลบ - Dead code B-007)
  - `lib/auth.ts` (ลบ - Dead code B-007)
  - `server/routing-service.mjs` (ลบ - Dead code B-007)
  - `supabase/functions/hdms-api/index.ts` (แก้)
  - `lib/flood-event-schema.ts` (แก้)
  - `components/map/LongdoGisMap.tsx` (แก้)
  - `app/page.tsx` (แก้)
  - `components/admin/tabs/MapManagementTab.tsx` (แก้)
  - `components/admin/tabs/IncidentRegistryTab.tsx` (แก้)
  - `docs/BACKLOG.md` (แก้)
  - `docs/CHANGELOG.md` (แก้)
- **ทำอะไร:**
  1. **ตารางนำเข้า GIS (`GisDataImportTab.tsx`):**
     - ปรับ table `thead` และ `tbody` ให้มี `whitespace-nowrap` ป้องกันข้อความถูกบีบขึ้นบรรทัดใหม่
     - นำข้อความแสดงจำนวนจุดพิกัด `({branch.coordinates.length} จุด)` ออกจากแถวย่อยตามภาพที่ 1
  2. **Header หน้าแอดมิน (`app/admin/page.tsx`):**
     - ลบปุ่มออกจากระบบ (`LogOut`), ปุ่มสีแดง `รายงานผู้ว่าฯ ด่วน`, และปุ่มแสดงสถานะ `OfflineSyncStatus` ออกจาก Header ตามภาพที่ 2
  3. **ล้าง Dead Code (B-007):**
     - ลบ `lib/auth.ts` (better-auth ที่ไม่ได้ใช้งาน), `db/supabase-server.ts` (service key เก่า), และ `server/routing-service.mjs` พร้อมโฟลเดอร์ `server/` ออกจากระบบ
  4. **แคชข้อมูลสาธารณะใน Edge Function (B-010):**
     - ใน `supabase/functions/hdms-api/index.ts`: เพิ่มการรองรับ HTTP GET method สำหรับ `action=getPublicSystemDataAction`
     - ส่ง Header `Cache-Control: public, s-maxage=15, stale-while-revalidate=30` เมื่อเรียกดูข้อมูลสาธารณะ เพื่อลดภาระการ query Database ซ้ำๆ ในช่วงวิกฤตที่มีประชาชนเข้าชมจำนวนมาก
  5. **สร้างรหัสเหตุการณ์และดึงตำแหน่งจากพิกัดอัตโนมัติ:**
     - ใน `lib/flood-event-schema.ts`: เพิ่มฟังก์ชัน `generateNextEventCode` คำนวณรหัสถัดไปตามสายทาง (เช่น `FL-42-01`)
     - ใน `MapManagementTab.tsx`:
       - สร้างรหัสเหตุการณ์อัตโนมัติทันทีที่เลือกสายทาง พร้อมปุ่ม `⚡ สร้างอัตโนมัติ`
       - ดึงชื่อหมู่บ้าน/ตำบล/อำเภออัตโนมัติเมื่อตัดเส้นจาก กม. (`getDetailedPattaniAddress`) พร้อมปุ่ม `📍 ดึงจากพิกัด` ให้เจ้าหน้าที่กดได้ตลอดเวลา
  6. **แก้ปัญหา "ฝั่ง ไม่ระบุฝั่ง" (Road Side Resolution):**
     - ใน `lib/flood-event-schema.ts`: เพิ่ม `resolveEffectiveRoadSide(flood)` ตรวจสอบฝั่งถนนแบบครบวงจร ทั้งจาก `road_side`, `direction_meta.roadSide`, `direction_meta.directionCode` (A_TO_B -> LEFT, B_TO_A -> RIGHT, BOTH -> BOTH), และ `affectedParts`
     - ใน `MapManagementTab.tsx`: เชื่อมโยง `effectiveRoadSide` บันทึกเข้าทั้งฟิลด์ `roadSide` และ `directionMeta.roadSide` และปรับปุ่มเลือกฝั่งให้แสดงข้อความชัดเจน
     - ใน `IncidentRegistryTab.tsx`: รักษาค่า `effectiveRoadSide` เมื่อแบ่งช่วง, รวมช่วง, และอัปเดตสถานการณ์ด่วน
     - ใน `supabase/functions/hdms-api/index.ts`: ตรวจสอบและซิงค์ `road_side` เข้า `doh_flood_routes` และ `direction_meta` เสมอ
     - ใน `components/map/LongdoGisMap.tsx` และ `app/page.tsx`: แสดงผลข้อความฝั่งถนนที่ถูกต้อง ชัดเจน และไม่มีคำว่า "ไม่ระบุฝั่ง" อีกต่อไป
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`)
  - `npm run typecheck` (`tsc --noEmit`)
  - `NEXT_OUTPUT=export next build` (Static export 6/6 หน้า)
- **ลำดับ deploy:**
  1. **Edge Function:** Deploy `hdms-api` (`supabase functions deploy hdms-api --no-verify-jwt`)
  2. **เว็บไซต์:** Push ขึ้น GitHub (GitHub Pages deploy ผ่าน GitHub Actions)
  (ขั้นตอน SQL ไม่ต้องทำ)

### [UPDATE-066] 2026-11-11 Phase 5 เต็มรูปแบบ — Adaptive GIS Markers 3 ระดับ, Popup Layout มาตรฐานสูง, Google Maps ทางเลี่ยง, แก้ปุ่มนำทางลงน้ำท่วม, ปรับปรุง UI แอดมิน & เอกสารกลาง
- **ไฟล์:**
  - `lib/detour-navigation.ts` (ใหม่)
  - `docs/KNOWN_ISSUES.md` (ใหม่)
  - `tests/e2e/detour-navigation.spec.ts` (ใหม่)
  - `app/globals.css` (แก้)
  - `app/page.tsx` (แก้)
  - `components/map/LongdoGisMap.tsx` (แก้)
  - `components/admin/tabs/GisDataImportTab.tsx` (แก้)
  - `components/admin/tabs/DetourManagementTab.tsx` (แก้)
  - `components/admin/tabs/IncidentRegistryTab.tsx` (แก้)
  - `components/admin/tabs/MapManagementTab.tsx` (แก้)
  - `components/admin/AdminConsole.tsx` (แก้)
  - `db/default-data.ts` (แก้)
  - `AGENTS.md` (แก้)
  - `docs/UI_CONTRACT.md` (แก้)
  - `docs/BACKLOG.md` (แก้)
  - `docs/CHANGELOG.md` (แก้)
- **ทำอะไร:**
  1. **แก้ไขข้อเสนอแนะเชิงรุกข้อที่ 1 (Proactive Finding #1):**
     - ใน `app/page.tsx`: แก้ไขปุ่ม "นำทาง" ใน Dialog รายละเอียดจุดน้ำท่วมของประชาชน (`selectedFlood`) จากเดิมที่นำทางตรงไปยังพิกัดจุดน้ำท่วม (`selectedFlood.lat_start`) ซึ่งเป็นอันตรายต่อประชาชน ให้เปลี่ยนเป็นการคำนวณและเปิดเส้นทางเลี่ยงที่ปลอดภัยที่ผูกไว้แทน โดยส่งต่อไปยัง Universal Google Maps Navigation
  2. **แก้ไขข้อเสนอแนะเชิงรุกข้อที่ 2 (Proactive Finding #2):**
     - ซิงค์ 5 สถานะการจราจร (`PASSABLE`, `LIGHT_VEHICLES_ONLY`, `ONE_LANE`, `CLOSED`, `WARNING`) ระหว่างหมุด Adaptive GIS Markers, Popup บนแผนที่, และการ์ดข้อมูล ให้ตรงกัน 100% ตามกฎ R1
  3. **ข้อบังคับสูงสุด Popup Layout (Highest Directive):**
     - ใน `app/globals.css`: ปรับ `.leaflet-popup-content-wrapper` ให้ `padding: 0` ขอบเดี่ยวคมชัด 1px slate-800 ไร้กรอบซ้อนกรอบ (No double borders/cards)
     - ใน `components/map/LongdoGisMap.tsx`: ปรับแต่ง HTML Popup ทุกประเภท (ทางหลวง, ทางเลี่ยง, จุดน้ำท่วม, สำนักงาน) ให้หัวเรื่อง รหัสสายทาง และประเภททางหลวง แสดงผลเป็นข้อความชุดเดียวกันในบรรทัดเดียวเมื่อพื้นที่พอเพียง ไม่ตัดบรรทัดแปลกแยก
  4. **Task 5.1 Adaptive GIS Markers 3 ระดับ Zoom:**
     - ซูมไกล (Zoom <= 10): แสดงเฉพาะไอคอนสถานะน้ำท่วม/การจราจรแบบกะทัดรัด
     - ซูมกลาง (Zoom 11..13): แสดงไอคอน + หมายเลขทางหลวง
     - ซูมใกล้ (Zoom >= 14): แสดงแคปซูลข้อมูลเต็มรูปแบบ (ไอคอน, หมายเลขทางหลวง, ระดับน้ำ ซม., สถานะการจราจร)
     - เพิ่มกลไก Screen-space De-overlapping คำนวณ offset ป้องกันป้ายซ้อนทับกันเมื่อมีหลายจุดน้ำท่วมใกล้กัน
  5. **Task 5.2 Flood Report UX/UI:**
     - ใน `IncidentRegistryTab.tsx`: ขยายตารางเต็มความกว้างหน้าจอ จัดกลุ่มปุ่มคำสั่งหลักและปุ่มบริหารจัดการช่วงอย่างเป็นระเบียบด้วย `whitespace-nowrap` ไม่ตกบรรทัด
     - ส่ง Context เหตุการณ์น้ำท่วมไปยังฟอร์มเพิ่มช่วงเหตุการณ์อัตโนมัติ เพื่อความสะดวกรวดเร็วของเจ้าหน้าที่
  6. **Task 5.3 Highway Management UI:**
     - ใน `GisDataImportTab.tsx`: เพิ่มช่องค้นหาอัจฉริยะ (ค้นหาเลขหรือชื่อสายทาง) และตัวกรอง 3 มิติ (ประเภททางหลวง, หมวดทางหลวง/หน่วยงาน, สถานะการแสดงผล)
     - ตรึงคอลัมน์สำคัญ (Sticky columns): ลำดับ `#`, ปุ่มเปิด/ปิดตา `Eye/EyeOff`, และคอลัมน์ปุ่ม `จัดการ`
     - รวมคอลัมน์ช่วง กม. และระยะทางเป็นคอลัมน์เดียว รวมคอลัมน์ช่องจราจรและชนิดผิวทางเป็นคอลัมน์เดียว
  7. **Task 5.4 Detour Management UI:**
     - ใน `DetourManagementTab.tsx`: เพิ่มการแสดงผลแบบ Responsive Card View บนมือถือ และตาราง Compact บนเดสก์ท็อป
     - เพิ่มแท็บตรวจสอบคำแนะนำการเดินทาง Turn-by-Turn ตามทิศทาง A ➔ B และ B ➔ A พร้อมปุ่มทดสอบเปิด Google Maps Navigation
     - เพิ่มช่องกรอกและจัดเก็บ Google Maps URLs ที่ผ่านการอนุมัติล่วงหน้าใน `detour_meta`
  8. **Task 5.5 GIS Popup Improvements:**
     - Popup ของทางเลี่ยงแสดงทิศทาง A ➔ B และ B ➔ A ชัดเจน พร้อมปุ่มนำทาง Google Maps และปุ่มเปิดหน้าต่างรายละเอียดทางเลี่ยงฉบับเต็ม
     - ควบคุมความสูงสูงสุด `max-h-[75vh]` พร้อม Scrollbar อัตโนมัติ ป้องกันการบังพื้นที่แผนที่
  9. **Task 5.7 Google Maps Detour Navigation Architecture:**
     - สร้าง `lib/detour-navigation.ts` รองรับกระบวนการ 5 ขั้นตอน (Approved URL -> Geometry with Waypoints -> Reversed Direction -> Conflict Detection -> Fallback Guard)
     - ป้องกัน URL ล้นด้วยการตัดทอน Waypoints สำคัญไม่เกิน 8 จุด และตรวจจับกรณีเส้นทางเลี่ยงตัดผ่านถนนที่ถูกสั่งปิด
  10. **Task 5.8 AI Rules & Documentation:**
     - สร้าง `docs/KNOWN_ISSUES.md` บันทึกข้อจำกัดเชิงเทคนิคและหลักฐานการทดสอบ
     - อัปเดต `AGENTS.md`, `docs/UI_CONTRACT.md`, `docs/BACKLOG.md`
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน 100%
  - `npm run typecheck` (`tsc --noEmit`): ผ่าน 100%
  - `NEXT_OUTPUT=export next build`: ผ่าน 100% สร้าง Static pages 6/6 หน้าสมบูรณ์
  - `npx playwright test tests/e2e/detour-navigation.spec.ts`: ผ่าน 12/12 ข้อ
  - `npx playwright test tests/e2e/smoke.spec.ts`: ผ่าน 8/8 ข้อ (Phase 1–4 regression ทดสอบสมบูรณ์)
- **ลำดับ deploy:** เว็บไซต์ (GitHub Pages) ขั้นเดียว ไม่กระทบ Database หรือ Edge Function


### [UPDATE-067] 2026-11-11 Phase 6 Integrated Staging Patch — ตรวจค่าทิศทาง, Vertex Editor และแผง Responsive
- **ฐาน:** `hdms_pn-main.zip` กับ Patch ก่อนหน้าที่เจ้าของส่งใน Library
- **เพิ่ม:** Unified vertex UI บนเส้นน้ำท่วม/ทางเลี่ยง, แก้ขากลับแยก, คำนวณถนนหลัง A/B, ลากปรับแผงงาน, Auto Table เฉพาะตารางทางเลี่ยง, สีลูกศรตัดกับเส้น, ลดข้อความซ้ำซ้อน
- **แก้ข้อมูล:** การอ่านค่า `UNKNOWN` ไม่เป็น A→B/TWO_WAY, ตรวจผลหลัง upsert, ป้องกันค่าฟิลด์หายจากขา Frontend/API, URL approved map ตรวจ hostname อย่างเข้มงวด
- **ยืนยันจาก Production แบบ READ-ONLY:** Edge `hdms-api` เวอร์ชัน 9 ยังไม่เขียนช่องจราจร/ฝั่งถนน/ทิศทาง, ซึ่งเป็นสาเหตุหลักของการแสดง Default; ไม่มีการเปลี่ยนข้อมูลจริง
- **ทดสอบ:** Syntax ผ่าน, pure TS compile ผ่าน, 9 standalone assertions ผ่าน; **ยังไม่ผ่าน full typecheck/build/E2E** เพราะ dependencies ขาด และไม่ได้ทดสอบ DB writes
- **สถานะ:** Staging Patch / ห้ามใช้ Production จนกว่าจะปิด B-001, B-014, B-015; ดู `docs/PHASE6_VALIDATION.md`

### [UPDATE-068] 2026-11-11 Phase 6 — Public Route List / Detour Details UI (ต่อเนื่องจาก UPDATE-067)
- **ฐาน:** `hdms_pn-main.zip` + `HDMS_PN_Phase6_Integrated_Staging_Patch_20261111.zip` (ใช้เป็นฐานแก้โค้ด ไม่ย้อนทับ patch ก่อนหน้า)
- **ไฟล์:** `app/page.tsx`, `tests/e2e/public-route-sheet.spec.ts` (ใหม่), `docs/UI_CONTRACT.md`, `docs/CHANGELOG.md`, `docs/KNOWN_ISSUES.md`, `docs/BACKLOG.md`.
- **ปรับฝั่งประชาชน:** Bottom Sheet รายการบนมือถือมี 3 ระดับ (ย่อ/รายการ/เต็มจอ), หัวข้อและแท็บแบบกระชับ, ค้นหาและกรองหมายเลขสายทางร่วมกันทั้งน้ำท่วมและทางเลี่ยง, การ์ดแสดงข้อมูลจำเป็นก่อน, ป้ายทิศทางย่อ A→B / B→A / A⇄B (ไม่เดาค่าที่ไม่ทราบ).
- **รายละเอียดทางเลี่ยง:** ชื่อยาวตัดขึ้นบรรทัดได้, เลือกเฉพาะทิศทางที่อนุญาต, แยกขั้นตอนและหมายเหตุจากข้อความที่เจ้าหน้าที่บันทึกโดยไม่ประดิษฐ์คำแนะนำใหม่, แสดงระยะทางเฉพาะเมื่อมีค่าบันทึกไว้, ลดข้อความ/กล่องซ้อน, ย้ายภาพประกอบเข้ากล่องเปิดดู, ปุ่ม Google Maps และดูบนแผนที่อ่านง่ายบนมือถือ; เมื่อเข้าจากรายการจะซ่อน Sheet รายการและคืนรายการเดิมหลังปิดรายละเอียด.
- **ขอบเขต:** ไม่เปลี่ยน Edge Function, Database, แผนที่ Popup ที่ Leaflet สร้างเป็น HTML หรือข้อมูลจริง; ไม่ได้สร้าง React Component ชุดเดียวใช้กับ Leaflet Popup เพราะต้องแก้สถาปัตยกรรมและทดสอบแยกภายหลัง.
- **ตรวจแล้ว:** Syntax/JSX ผ่าน TypeScript transpile diagnostics; ตรวจ ZIP CRC; เพิ่ม Playwright test สำหรับการกรอง/เปิด/ปิด/ย้อนกลับ/ทิศทางเดียว.
- **ยังไม่ได้ตรวจ:** lint, typecheck, build:pages, Playwright E2E, การแสดงบน Chrome มือถือจริง (npm ci ล้มเหลวจาก EAI_AGAIN ระหว่างดึง dependency), การเขียนข้อมูลกับ Supabase (ไม่อยู่ในขอบเขต UI นี้).
- **สถานะ:** Patch สำหรับ Staging เท่านั้น; B-001, B-014, B-015 ยังคงเปิดอยู่.

### [UPDATE-069] 2026-11-11 แก้ไข TypeScript Type Error ใน app/page.tsx และ Playwright E2E Test Selectors เพื่อให้ CI เขียว
- **ไฟล์:** `app/page.tsx`, `tests/e2e/admin-menus.spec.ts`, `tests/e2e/public-route-sheet.spec.ts`, `docs/CHANGELOG.md`
- **ปัญหาที่พบ:**
  1. `app/page.tsx` มี TypeScript error TS2367 เนื่องจากเปรียบเทียบ `sidebarTab !== "DETOUR"` ในกิ่งที่ `sidebarTab` ไม่มีทางเป็น `"DETOUR"` ส่งผลให้ `npm run typecheck` ล้มเหลวและบล็อก GitHub Actions Deploy/CI ทั้งหมด (แก้ไปใน commit 79403c5 แล้ว)
  2. `tests/e2e/admin-menus.spec.ts`: ในการตรวจ landmark ของ "โครงข่ายสายทาง" Playwright `.first()` ไปเลือก `<span>โครงข่ายสายทาง</span>` ใน `div.lg:hidden` (แถบเมนูมือถือที่ซ่อนบน desktop) ทำให้ assertion `.toBeVisible()` ล้มเหลว
  3. `tests/e2e/public-route-sheet.spec.ts`: การเรียก `list.getByLabel("สายทาง")` เกิด Playwright strict mode violation เนื่องจากชน 2 องค์ประกอบ (ปุ่ม `aria-label="ปิดรายการสายทาง"` และ `<select id="citizen-highway-filter">`)
- **การแก้ไข:**
  1. ใน `tests/e2e/admin-menus.spec.ts`: จำกัดขอบเขตการตรวจ landmark ให้อยู่ภายใน `.doh-form` (พื้นที่แสดงเนื้อหาของแท็บจริง)
  2. ใน `tests/e2e/public-route-sheet.spec.ts`: ระบุ `{ exact: true }` ให้กับ `getByLabel("สายทาง", { exact: true })` เพื่อเลือก `<select>` อย่างแม่นยำ ไม่ชนกับปุ่มปิด
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน 0 errors, 0 warnings
  - `npm run typecheck` (`tsc --noEmit`): ผ่าน 0 errors
  - `cmd /c "set NEXT_OUTPUT=export && npx next build"`: ผ่าน 100% สร้าง Static Pages 6/6 หน้าสมบูรณ์
- **ลำดับ deploy:** เว็บไซต์ (GitHub Pages) ขั้นเดียว ไม่กระทบ Database หรือ Edge Function

### [UPDATE-070] 2026-11-11 Phase 6 Completion & Integration Audit (P6-01 ถึง P6-08)
- **ไฟล์:**
  - `lib/detour-presentation.ts` (ใหม่): Shared presentation logic สำหรับทางเลี่ยงระหว่าง Leaflet Map Popup และ Citizen Bottom Sheet (`detourDirectionBadge`, `parseDetourAdvice`, `isDetourDirectionAllowed`, `isRecordedDetourDirection`, `detourDistanceMeters`, `formatDetourDistanceKm`)
  - `app/page.tsx`: ปรับใช้โมดูลกลาง `detour-presentation.ts`, ป้องกันปุ่มทิศทางด้วย `isDetourDirectionAllowed`
  - `components/map/LongdoGisMap.tsx`: Popup ทางเลี่ยง HTML แสดงขั้นตอน numbered steps และหมายเหตุด้วย logic เดียวกัน, ป้ายทางเลี่ยงยาวขึ้นบรรทัดใหม่ได้ (`break-words [overflow-wrap:anywhere]`), ปรับ Compact Flood Marker 3 ระดับตามซูม (ไกล: ไอคอน 28px, กลาง: ไอคอน+ทล. 96px, ใกล้: ไอคอน+ทล.+ระดับน้ำ 168/244px เช่น `⚠ ทล.4075 · 60 ซม.`), คืนค่า `vertexEditCoordinates` และ `activeDirMap`
  - `components/admin/tabs/DetourManagementTab.tsx`: เพิ่ม `<span title="เส้นทางเลี่ยง">` ใน Card View สำหรับคอนเทนเนอร์ขนาด <=900px เพื่อความสอดคล้องกับตารางและผ่านการตรวจของ e2e
  - `components/admin/tabs/MapManagementTab.tsx`: การ hydrate ข้อมูลคงค่า `directionCode` จริง ไม่ default เป็น BOTH
  - `lib/flood-event-schema.ts`: `resolveEffectiveRoadSide` คงค่า `UNKNOWN` ไม่เดาฝั่งถนนจากทิศทางจราจร, `generateNextEventCode` ป้องกัน ID ชนกันด้วยการหา `max(numeric_suffix) + 1`
  - `supabase/functions/hdms-api/index.ts`: ฝั่ง Edge Function ไม่แปลง `UNKNOWN` หรือค่าว่างเป็น `"BOTH"` โดยพลการ
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน 0 errors, 0 warnings
  - `npm run typecheck` (`tsc --noEmit`): ผ่าน 0 errors
  - `NEXT_OUTPUT=export next build`: ผ่าน 100% สร้าง Static Pages 6/6 หน้าสมบูรณ์
  - `npx playwright test --workers=2`: ผ่านครบ 46 passed, 14 skipped (admin tests on mobile viewports skipped per design), 0 failed
- **ลำดับ deploy:** Edge Function (`hdms-api`) → เว็บไซต์ (GitHub Pages) (ไม่มี migration SQL ใหม่)

### [UPDATE-071] 2026-11-11 แก้ไขปัญหาโครงสร้าง 4 จุด (URLs ทางเลี่ยง, พิกัดพื้นที่, ป๊อปอัปแผนที่, บันทึกฝั่งถนน)
- **ไฟล์:**
  - `supabase/migrations/20261109000100_directional_flood_and_detour.sql`: รัน migration เพิ่มคอลัมน์ `road_side`, `affected_lanes`, `affected_shoulder`, `direction_meta`, `reporter_name` ใน `doh_flood_routes` และ `doh_timeline_updates`, เพิ่ม `detour_meta`, `direction_mode`, `reverse_coordinates_json`, `reverse_waypoints_json` ใน `doh_detour_routes`
  - `supabase/functions/hdms-api/index.ts`: Deployed version ล่าสุด รองรับการ upsert และอ่านค่า `detour_meta` และ directional flood fields กลับมาครบถ้วน
  - `components/admin/tabs/DetourManagementTab.tsx`: แก้ไขการบันทึก `detour_meta` (Google Maps URL ไป-กลับ) ให้คงค่าเดิมและลบเมื่อผู้ใช้ล้างช่องกรอก ไม่เกิดค่า undefined
  - `components/admin/tabs/MapManagementTab.tsx`: บันทึก `detour_meta` โดยดึงค่าเดิม (`systemData.detourRoutes`) มาผสาน ไม่ลบลิงก์ Google Maps ที่เจ้าหน้าที่เคยอนุมัติไว้
  - `components/map/LongdoGisMap.tsx`:
    1. แก้ไขหน้าต่างรายละเอียดและปุ่มบนแผนที่: ผูก `window.__openDetourGoogleMaps`, `window.__openDetourModal`, `window.__getDetourCurrentDir`, `window.__toggleDetourPopupDir` เข้ากับ window พร้อมดึงข้อมูลจาก dynamic ref
    2. จัดการ Event การคลิก: เพิ่ม `disableClickPropagation` และ `disableScrollPropagation` บน Popup Container ป้องกันการลากแผนที่แทรกแซงการกดปุ่ม
    3. เชื่อมโยง Popup ทั้งเส้นและไอคอน: เพิ่ม `bindPopup()` และ `openPopup()` บน polyline และ marker ของทั้งน้ำท่วมและทางเลี่ยง ทำให้คลิกที่ใดก็เปิดป๊อปอัปได้ทันที
    4. เพิ่ม prop `onSelectDetour` เชื่อมโยงการเปิด Detour Modal ระหว่างแผนที่กับหน้าประชาชน
  - `app/page.tsx`: นำเข้า `defaultDetourDirection` จาก `@/lib/detour-presentation` และส่งต่อ `onSelectDetour` เพื่อเปิด Modal ข้อมูลทางเลี่ยงเมื่อผู้ใช้แตะป๊อปอัปบนแผนที่
  - `app/admin/page.tsx`: เพิ่ม `onSelectDetour` โฟกัสพิกัดเมื่อแตะเส้นทางเลี่ยง
  - `lib/gis-utils.ts`:
    1. ปรับปรุง `cleanThaiAdminPrefix`: ตัดคำนำหน้า `เทศบาลตำบล`, `เทศบาลเมือง`, `อบต.` ฯลฯ ให้กระชับ
    2. ปรับปรุง `reverseGeocodeTambonAmphoe` และ `getDetailedPattaniAddress`: อ่าน `addr.subdistrict || addr.municipality || addr.town` อย่างถูกต้อง เพิ่ม timeout เป็น 3500ms
    3. เพิ่ม `PATTANI_AMPHOE_CENTERS` กำหนดพิกัดศูนย์กลางอำเภอจริงทั้ง ๑๒ อำเภอของ จ.ปัตตานี ทำให้ Centroid fallback แม่นยำ 100%
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน 0 errors, 0 warnings
  - `npm run typecheck` (`tsc --noEmit`): ผ่าน 0 errors
  - `NEXT_OUTPUT=export next build`: ผ่าน 100% สร้าง Static Pages 6/6 หน้าสมบูรณ์
  - `npx playwright test --workers=2`: ผ่านครบ 46 passed, 14 skipped, 0 failed
  - Live Supabase Database / RPC: ทดสอบเขียน-อ่าน `detour_meta` และ `doh_get_system_data_rpc` บนฐานข้อมูลจริงสำเร็จ
- **ลำดับ deploy:** SQL Migration (`20261109000100_directional_flood_and_detour.sql`) [เสร็จแล้ว] → Edge Function (`hdms-api`) [เสร็จแล้ว] → เว็บไซต์ (GitHub Pages)

---

### [UPDATE-072] แก้ไข CI แดงจากปุ่มสลับทิศทางเส้นทางเลี่ยง และลบไฟล์วางผิดที่ `lib/MapManagementTab.tsx`
- **สาเหตุ:**
  1. `app/page.tsx` (จาก commit `3ee39e5`) เปลี่ยนข้อความปุ่มเลือกทิศทางใน `viewingDetourModal` เป็น `🚗 ขาไป (A ➔ B)` / `🚙 ขากลับ (B ➔ A)` ทำให้ `tests/e2e/public-route-sheet.spec.ts:49-50` หา `getByRole("button", { name: "ขาไป A → B" })` และ `"ขากลับ B → A"` ไม่เจอ (R7)
  2. Commit `8d444b0` อัปโหลดไฟล์ `MapManagementTab.tsx` ผิดโฟลเดอร์ไปที่ `lib/MapManagementTab.tsx` (ซึ่งเป็นเวอร์ชันเก่ากว่า `components/admin/tabs/MapManagementTab.tsx` และมี unused import)
- **การแก้ไข:**
  1. `app/page.tsx`: เพิ่ม `aria-label="ขาไป A → B"` และ `aria-label="ขากลับ B → A"` บนปุ่มเลือกทิศทาง พร้อม `aria-hidden="true"` บนอีโมจิตกแต่ง เพื่อรักษา e2e contract (R7) โดยคงหน้าตา UI ไว้ครบถ้วน
  2. ลบไฟล์ `lib/MapManagementTab.tsx` ที่วางผิดโฟลเดอร์ (`components/admin/tabs/MapManagementTab.tsx` มีฟีเจอร์ล่าสุดครบอยู่แล้ว)
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน (0 errors, 0 warnings)
  - `npm run typecheck` (`tsc --noEmit`): ผ่าน (0 errors)
  - `$env:NEXT_OUTPUT="export"; npx next build`: ผ่าน (Static Pages 6/6)
  - `npx playwright test --workers=2`: ผ่าน (46 passed, 14 skipped, 0 failed)
- **ลำดับ deploy:** เว็บไซต์ (GitHub Pages) เท่านั้น (ไม่ต้องแก้ SQL หรือ Edge Function)

---

### [UPDATE-073] ผสานฟีเจอร์แสดงผลข้อความแนะนำทางเลี่ยง (`AdviceText`), ชุดตัวอย่างมาตรฐาน, ตัวแยกทิศทาง, และ `lib/osrm-client.ts` โดยไม่กระทบฟีเจอร์ปัจจุบัน
- **การแก้ไข:**
  1. เพิ่ม `components/AdviceText.tsx` และ `lib/advice-format.ts` (`parseAdviceText`, `buildGoogleMapsDirectionsUrl`) แสดงหัวข้อทิศทางตัวหนา ขั้นตอนเลขพร้อมป้าย `จุดเริ่มต้น:/จุดสิ้นสุด:` ตัวหนา และสรุป 3 บรรทัดย่อหน้าเข้าทั้งในหน้าประชาชน (`app/page.tsx`) และหน้าแอดมิน (`MapManagementTab.tsx`, `DetourManagementTab.tsx`)
  2. เพิ่ม `lib/detour-advice-presets.ts` (ชุดตัวอย่างมาตรฐาน 2 สาย: ปน.2003 และ ปน.3057) พร้อมช่องเลือกตัวอย่าง, ลิงก์เทียบกับ Google Maps (ขาไป/ขากลับ), และกล่อง `"ตัวอย่างที่ประชาชนจะเห็น"` ใน `components/admin/tabs/MapManagementTab.tsx`
  3. ปรับ `extractDirectionalAdvice`, `splitDetourAdviceByDirection`, และ `buildSingleDirectionAdvice` ใน `lib/gis-utils.ts` ให้คงส่วนหัว ต./อ. เมื่อแก้ทีละทิศทาง, รองรับกรณีพิมพ์หัวข้อขากลับผิดเป็น `"ทิศทางขาไป: จุด B → จุด A"`, บอกทางออกวงเวียน `"ทางออกที่ N"`, ใช้ `"ถนนโยธาธิการ ปน.2003"`, และขึ้นต้นขั้นสุดท้ายด้วย `"จุดสิ้นสุด:"` โดยคงระบบ `area-lookup` และพารามิเตอร์ทิศทางเดิมไว้ครบถ้วน
  4. เพิ่ม `lib/osrm-client.ts` (แคช 30 นาที, in-flight deduplication, retry 1 ครั้ง, เว้นช่วง 1 วินาที, circuit breaker 60 วินาทีสำหรับ local OSRM) และกู้คืน `server/routing-service.mjs`
  5. ปรับ `lib/hdms-api.ts` (`HdmsHttpError`), `app/actions/doh-actions.ts`, และ `components/providers/QueryProvider.tsx` เพื่อจำกัดการยิงซ้ำเมื่อระบบขัดข้อง
- **ตรวจแล้ว:**
  - `npm run lint` (`--max-warnings=0`): ผ่าน (0 errors, 0 warnings)
  - `npm run typecheck` (`tsc --noEmit`): ผ่าน (0 errors)
  - `$env:NEXT_OUTPUT="export"; npx next build`: ผ่าน (Static Pages 6/6)
  - `$env:PLAYWRIGHT_STATIC="1"; npx playwright test --workers=2`: ผ่านครบ (46 passed, 14 skipped, 0 failed)
- **ลำดับ deploy:** เว็บไซต์ (GitHub Pages) เท่านั้น (ไม่ต้องแก้ SQL หรือ Edge Function)
