# Phase 6 — รายงานตรวจแก้และ Release Gate (11 พฤศจิกายน 2026)

## ฐานการแก้ไข
- ZIP ต้นฉบับที่เจ้าของส่ง: `hdms_pn-main.zip`
- Patch ก่อนหน้า: `Phase6_All_Patches_Combined_For_Test_20261111.zip`
- ชุดนี้รวมไฟล์แก้ก่อนหน้าและเพิ่มเฉพาะงานที่ตรวจพบ ไม่ต้องติดตั้ง Patch หลายชุด
- ไม่มีการ deploy เว็บ, เปลี่ยนข้อมูล, เปลี่ยน SQL, deploy Edge Function หรือเขียนฐานข้อมูล Production

## ข้อค้นพบสำคัญจาก Supabase แบบอ่านอย่างเดียว
- `doh_detour_routes` ที่ไม่ถูกลบมี 8 รายการ: `direction_mode = TWO_WAY` ทั้ง 8 รายการ
- `doh_flood_routes` ที่ไม่ถูกลบมี 4 รายการ: `road_side` เป็น `UNKNOWN` หรือ NULL ทั้ง 4 รายการ
- Schema ปัจจุบันมีคอลัมน์ `road_side`, `affected_lanes`, `direction_meta`, `direction_mode`, `reverse_coordinates_json`, `detour_meta` แล้ว
- ค่า DEFAULT ของ `direction_mode` คือ `TWO_WAY`; `road_side` คือ `UNKNOWN`
- Edge Function ที่กำลังเผยแพร่จริง (`hdms-api` เวอร์ชัน 9) ยังไม่ได้จัดเก็บฟิลด์ส่วนขยายดังกล่าวใน upsert จึงเป็นสาเหตุหลักที่ *ตรวจสอบได้* ของค่าที่กลับไปเป็น Default
- ห้ามแก้ข้อมูลเก่าตามการคาดเดา ต้องให้เจ้าหน้าที่เลือกค่าจริงใหม่หลังโปรแกรมแก้แล้ว

## งานที่เพิ่ม/แก้ในชุดนี้
1. **Unified GIS Vertex Editing:** ฝั่งแอดมินน้ำท่วม/ทางเลี่ยงใช้ vertex handles และ `lib/line-edit.ts` เช่นเดียวกับโครงข่ายทางหลวง, เลือกโหมดเกาะถนน/อิสระ, ลาก แทรก ลบ (ยกเว้น A/B), Undo/Redo, ทิศทางขากลับแก้แยก; บันทึก geometry ตามที่แสดง ไม่ snap อัตโนมัติหลังดัดมือ
2. **A/B Auto Routing:** เมื่อปักจุด A และ B ครบ จะเริ่มคำนวณแนวถนนอัตโนมัติสำหรับน้ำท่วม/ทางเลี่ยง; ไม่ถือเส้นตรงเป็นผลที่คำนวณสำเร็จ
3. **Lane/Direction:** ไม่ยอมให้ `UNKNOWN` ถูกตีความเป็น A→B หรือ TWO_WAY โดยปริยาย; ต้องระบุฝั่งน้ำท่วมก่อนบันทึก; ค่าที่อ่านกลับจาก Backend ถูกเปรียบเทียบก่อนตอบสำเร็จ
4. **Frontend:** ขยาย/ย่อแถบเมนูและลากแบ่งแผง Admin–GIS, ทางเลี่ยงตาราง/การ์ดสลับตามขนาดพื้นที่จริง, หน้าโครงข่ายลดข้อความแนะนำ, Popup พร้อมปุ่มนำทาง Google Maps, ซิงค์สี Legend กับสไตล์ และออโตคอนทราสต์ของลูกศร
5. **Public Map:** ทางเลี่ยงที่ยังไม่ทราบทิศยังมองเห็นเป็นเส้นประจาง แต่ไม่ให้กดนำทางจนกว่าจะตรวจ; ซูม/ป้ายหมายเลขทางหลวงและป้ายสถานะยังคงระบบจาก Patch เดิม; ป้ายตราครุฑที่ถูกต้องต้องใช้ไฟล์อนุมัติจริงแยกต่างหาก
6. **Navigation:** ตรวจ hostname ด้วย URL parser, ป้องกันโดเมนปลอม, ลิงก์อนุมัติแยก A→B / B→A และถ้าไม่มีลิงก์ให้ใช้ waypoint จากฐานข้อมูลโดยย้ำข้อจำกัดของ Google Maps

## การตรวจสอบที่ทำจริง
- TypeScript/TSX parse/transpile diagnostics: ผ่าน (ยังไม่ใช่ semantic typecheck)
- TypeScript compilation ของ pure utility modules (`lib/line-edit.ts`, `lib/map-style-utils.ts`, `lib/flood-event-schema.ts`, `lib/highway-schema.ts`): ผ่าน
- Standalone assertions 9 รายการเกี่ยวกับ navigation, URL safety, unknown direction, geometry vertices, symbol contrast: ผ่าน
- ZIP integrity (CRC) และรายการไฟล์เปลี่ยนจากต้นฉบับ: ผ่าน

## ข้อจำกัดที่ยังเป็น Release Blocker
- `npm ci --offline` ติดแพ็กเกจ `zod-validation-error@4.0.2` ซึ่งไม่มีในแคช, จึงยังไม่มี Node dependencies เพียงพอสำหรับ `npm run typecheck`, lint, Next.js Build หรือ Playwright E2E; **ห้ามอ้างว่าผ่าน**
- **B-001 CRITICAL**: Edge Function Production `verify_jwt=false` และใช้ `service_role` ในคำสั่งเขียนโดยไม่มีการยืนยันผู้ใช้/บทบาทตามหลักฐานที่ตรวจ; จะไม่ deploy ฟังก์ชันที่แก้โดยอัตโนมัติ ต้องให้เจ้าของอนุมัติแนวทาง Auth ก่อน
- Live Edge Function เวอร์ชัน 9 ยังไม่ใช่ไฟล์ที่แก้ในชุดนี้ ดังนั้นการวางทับเฉพาะเว็บยัง **ไม่** แก้ความผิดพลาดของข้อมูลบันทึก; ต้องผ่าน Security Review แล้ว Deploy Edge Function ด้วย
- ยังไม่ทดสอบ CRUD บนฐานข้อมูลทดสอบ หรือ cross-browser/mobile E2E; ไม่อนุญาตทดสอบด้วยการเขียน Production
- โครงการเดิมมีโครงสร้าง Route Editor และ UI หลายรูปแบบ; การทำ visual regression ทั้งหมดจากภาพอ้างอิงเดิมยังไม่เสร็จ และ Auto Table ตอนนี้รองรับการ์ด responsive สำหรับทางเลี่ยงเป็นหลัก ส่วนโครงข่ายยังใช้ตารางเลื่อนแนวนอนที่มี sticky columns
- Asset ตราครุฑทางการยังไม่ได้รับจากเจ้าของ/แหล่งที่ตรวจสิทธิ์ จึงมีป้ายทรงโล่ 'ทล.' แบบ placeholder เท่านั้น

## Acceptance Tests ที่ต้องทำใน Staging ก่อน Production
1. น้ำท่วม: เลือกซ้าย/ขวา/สองฝั่ง และช่องจราจร → บันทึก → โหลดใหม่ → แก้ไข → แผนที่/Popup/รายการแสดงค่าเดิม
2. ทางเลี่ยง: เลือก A→B, B→A, TWO_WAY → บันทึก → เปิดใหม่ → ตรวจค่า `direction_mode` และลูกศร/ปุ่มนำทางแยกทิศ; ทดสอบกรณีไม่ระบุ
3. Editor ทั้ง 3 ประเภท: ปัก A/B → Auto route → แก้จุดด้วยมือ → เพิ่ม/ลบ/ลาก → Undo/Redo → Save → Reload และตรวจจุดเท่าเดิม
4. โหมดสองทิศทางต้องไม่กลับเส้นอิสระหรือเปลี่ยนค่าขากลับไปเป็นขาไป
5. มือถือ 360/412 px และเดสก์ท็อป 1024/1280/1920 px: ปรับขนาดแผงและตาราง, ไม่ซ่อนปุ่มสำคัญ, Popup ไม่บังแผนที่
6. ลิงก์อนุมัติ Google Maps ใช้ทิศที่กำหนด; ไม่มีลิงก์ใช้ geometry; ลิงก์อันตรายหรือระบุทิศไม่ได้ต้องถูกปฏิเสธ
7. ไม่ให้เผยแพร่เส้นทางเลี่ยงผ่านช่วงที่ปิดจราจรที่ตรวจพบ; ตรวจสิทธิ์ทุก mutation และไม่รั่ว service-role key
8. `npm ci`, `npm run typecheck`, `npm run lint`, `NEXT_OUTPUT=export npm run build`, `npx playwright test`

**ข้อสรุป:** Patch ชุดนี้มีโค้ดเพิ่มเติมและผลตรวจแบบ Static/Pure Tests แต่ไม่สามารถรับรอง Production-ready จนกว่าจะปิด Release Blockers ข้างต้น
