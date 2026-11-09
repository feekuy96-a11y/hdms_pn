# ARCHITECTURE.md — ระบบจริงตามโค้ดปัจจุบัน

> ไฟล์นี้อธิบาย **สิ่งที่ระบบเป็นจริง ณ ตอนนี้** ถ้าขัดกับ `DESIGN.md`, `MANUAL.md` หรือ `PRODUCTION.md` ให้ยึดไฟล์นี้และโค้ด แล้วแก้เอกสารที่เก่า
> ทุกข้อที่ยังไม่ได้ยืนยันกับ production ถูกทำเครื่องหมาย **(ต้องยืนยัน)**

## 1. ภาพรวมการทำงาน
```
ประชาชน (มือถือ) ──┐                                   ┌─ RPC doh_get_system_data_display_rpc  (เส้นทางหลวงลดจุด)
                   ├─ GitHub Pages (static) ──POST──▶ Edge Function hdms-api ─┤  RPC doh_get_system_data_rpc          (เต็มความละเอียด)
เจ้าหน้าที่ (PC) ──┘   app/page.tsx, app/admin/page.tsx   (supabase/functions)  ├─ RPC doh_import_routes_rpc / doh_update_timeline_rpc / doh_snap_line_rpc
                                                                               └─ ตารางโดยตรง (service role) สำหรับการเขียนอื่น ๆ
```
- **Runtime:** Next.js 16 (App Router), React 19, TanStack Query 5, Tailwind 3, Leaflet 1.9 (+ Longdo layers), Chart.js, Playwright. Node ≥ 22 (CI ใช้ 24)
- **Build ที่ใช้จริงใน production:** `npm run build:pages` (`NEXT_OUTPUT=export`, `BASE_PATH=/hdms_pn` หรือ `/` ถ้า repo ชื่อ `*.github.io`) ผลลัพธ์โฟลเดอร์ `out/` ขึ้น GitHub Pages
- โหมดอื่น (`next start`, Docker `standalone`) ยังมีอยู่ แต่ **ต้องเขียนโค้ดให้ทำงานได้ในโหมด static เสมอ**
- GitHub Pages ไม่มี Server Actions/middleware/API routes ดังนั้น `app/actions/doh-actions.ts` ชื่อ "Action" แต่เป็น **client adapter** ที่เรียก `invokeHdms`

## 2. การไหลของข้อมูล
| ขั้น | ไฟล์ | หมายเหตุ |
|---|---|---|
| เรียก API | `lib/hdms-api.ts` `invokeHdms(action,args)` | POST ไป `${SUPABASE_URL}/functions/v1/hdms-api`; timeout 20 วินาที (บันทึกเลเยอร์ทางหลวง 90 วินาที); เฉพาะ read มี fallback ไปเรียก RPC ตรง |
| Adapter | `app/actions/doh-actions.ts` | `getSystemDataAction` (เต็ม), `getPublicSystemDataAction` (เบา, ย้อนไปใช้เต็มถ้า server ยังไม่อัปเดต) |
| Edge Function | `supabase/functions/hdms-api/index.ts` | `verify_jwt=false` (`supabase/config.toml`); อ่าน = anon key; **เขียน = service role และไม่มีการตรวจสิทธิ์ผู้เรียก** (ดู §6) |
| เขียนข้อมูล | `invokeHdms` ส่ง `light:true` | server ตอบ `{success:true}` อย่างเดียว; หน้าแอดมินเรียก `refetch()` หนึ่งครั้ง (เดิมโหลดซ้ำ 2 รอบ) |
| Query key | หน้าประชาชน `["dohSystemData"]`, หน้าแอดมิน `["dohAdminSystemData"]` | staleTime 0, refetch ทุก 30 นาทีเมื่อผู้ใช้ active (`lib/use-polling-activity.ts`), ไม่ refetch ตอนกลับมาที่แท็บ |
| Offline | `lib/offline-db.ts` (IndexedDB) | คิวรายงานภาคสนาม ใช้การเชื่อมต่อเดียวร่วมกัน; ซิงก์ผ่าน `OfflineSyncStatus` |

### กฎขนาดข้อมูล (payload)
- หน้าประชาชนต้องใช้ข้อมูลแบบเบา: เส้นทางหลวงจากคอลัมน์ `doh_highway_layers.geojson_display` (ลดจุด ~2 ม., ทศนิยม 5 หลัก, คำนวณด้วย trigger ตอนบันทึก) ผ่าน `doh_get_system_data_display_rpc` (migration `20261107000200`)
- หน้าแอดมินต้องใช้ `geojson_data` เต็ม เพราะตัวแก้ไขเส้นบันทึกกลับ **ห้ามให้แอดมินแก้บนเส้นที่ลดจุดแล้ว** (เส้นเสียถาวร)
- `timelineUpdates` จำกัด 60 รายการต่อจุดน้ำท่วม (migration `20261107000100`) ห้ามเพิ่ม query ที่ไม่มี limit/ขอบเขต
- งานที่เปลี่ยนขนาด payload ต้องรายงานตัวเลขก่อน-หลัง (F12 → Network → `hdms-api`)
- **สถานะ migration ทั้งสองไฟล์:** สร้างแล้วในรีโป **(ต้องยืนยันว่าเจ้าของรันบน Supabase แล้ว)** — โค้ดฝั่งเว็บและ Edge Function ย้อนไปใช้แบบเดิมได้เองถ้ายังไม่รัน

## 3. ฐานข้อมูล (Supabase / PostGIS)
- ตาราง: `doh_flood_routes`, `doh_detour_routes`, `doh_timeline_updates`, `doh_mitigation_projects`, `doh_highway_layers`, `doh_offices`, `doh_map_styles`, `doh_system_settings` (+ `deleted_at` soft delete บน flood/detour)
- RPC: `doh_get_system_data_rpc`, `doh_get_system_data_display_rpc`, `doh_import_routes_rpc` (รับ LineString ≥ 2 จุด WGS84), `doh_update_timeline_rpc`, `doh_snap_line_rpc`
- trigger `trg_doh_highway_layer_geom` สร้างคอลัมน์ `geom`; `trg_doh_highway_layer_display` สร้าง `geojson_display`
- **ไฟล์ SQL ในรีโปไม่ใช่สถานะจริงของ DB** — มีการแพตช์ฟังก์ชันภายหลังด้วย `pg_get_functiondef` + `replace` (เช่น soft delete) ก่อนแก้ฟังก์ชันใดต้องอ่านนิยามจริงจาก DB ก่อน (R4)
- สถานะจราจรที่ DB รับ: `PASSABLE`, `LIGHT_VEHICLES_ONLY`, `ONE_LANE`, `CLOSED`, `WARNING` (constraint `chk_doh_flood_traffic_status`, `chk_doh_timeline_traffic_status`)
- การเปลี่ยน schema: ไฟล์ใหม่ใน `supabase/migrations/` ชื่อ `YYYYMMDDHHMMSS_คำอธิบาย.sql`, idempotent, มีคอมเมนต์ "ทำไม/ย้อนกลับอย่างไร", ผู้ใช้รันเองใน SQL Editor หรือ `supabase db push`

## 4. หน้าจอและโค้ดหลัก
| พื้นที่ | ไฟล์ | จุดที่ต้องรู้ |
|---|---|---|
| หน้าประชาชน | `app/page.tsx` | `FloodCard` ใช้ร่วมเดสก์ท็อป/มือถือ, `SituationSummary`, bottom sheet รายละเอียด, เรียงจุดตามความรุนแรง |
| หน้าแอดมิน | `app/admin/page.tsx` + `components/admin/AdminConsole.tsx` | แผงซ้าย (เมนู+ฟอร์ม) กว้าง `lg:56vw`, `xl: clamp(720px,50vw,1040px)`; แผนที่ขวา; เมนูย่อเป็นไอคอนเมื่อจอ < 1536px |
| แท็บแอดมิน | `components/admin/tabs/*` | `MapManagementTab` (สร้างจุดน้ำท่วม/ทางเลี่ยง), `GisDataImportTab` (นำเข้า GIS, แก้แนวเส้น), `IncidentRegistryTab`, `DetourManagementTab`, `GovernorProjectsTab`, `LineStylingTab`, `SystemSettingsTab` |
| ส่วนประกอบฟอร์มกลาง | `components/admin/ui.tsx` | `FormSection`, `ToolGroup`, `ActionButton`, `StickyActionBar` |
| ตัวแก้ไขเส้นอิสระ | `lib/line-edit.ts` + `GisDataImportTab` + `LongdoGisMap` | เหตุการณ์ vertex ไหลแผนที่ → `app/admin/page.tsx` (`vertexEvent`) → AdminConsole → แท็บ; undo/redo เป็น snapshot; บันทึกทั้งเลเยอร์ผ่าน `updateHighwayLayerAction` |
| แผนที่ | `components/map/LongdoGisMap.tsx` | ดูกฎ §5 |
| คำนวณเชิงพื้นที่/OSRM | `lib/gis-utils.ts` | เรียก OSRM สาธารณะ (`router.project-osrm.org`) + failover, สร้างคำแนะนำทางเลี่ยง |

## 5. กฎของแผนที่ (เรียนรู้จากปัญหาเครื่องค้าง)
1. **canvas renderer ตัวเดียว** สร้างตอนเริ่มแผนที่ ห้ามสร้างใหม่ตอนวาดซ้ำ (เดิมสร้าง `<canvas>` ใหม่ทุกครั้ง จน RAM พุ่ง) และห้ามใช้หลาย canvas renderer ซ้อนกัน เพราะ canvas บนสุดกลืน event ของตัวล่าง
2. แยก **layer group ต่อชนิดข้อมูล** (ทางหลวง, ป้าย, ทางเลี่ยง, น้ำท่วม, เส้นร่าง, หมุดจุดแก้ไข, สำนักงาน) แต่ละ effect ขึ้นกับข้อมูลของตัวเองเท่านั้น ห้ามวาดทั้งแผนที่ใหม่เพราะซูม/เลือก/ลาก
3. callback จาก parent เข้า effect ผ่าน **ref** (`onSelectFloodRef` ฯลฯ) ห้ามใส่ฟังก์ชัน inline ใน dependency
4. ค่าเริ่มต้นของ prop แบบ array/object **ต้องเป็นค่าคงที่ระดับโมดูล** (`= []` สร้างอ้างอิงใหม่ทุก render แล้ว effect ทำงานซ้ำ)
5. popup/tooltip สร้าง HTML ตอนเปิดเท่านั้น; หมุดแก้ไขวาดเฉพาะในกรอบจอ (สูงสุด 400); ป้ายทางหลวงคำนวณใหม่แบบ debounce ตอนเลื่อน/ซูม
6. `className` ของ path ถูกละเลยเมื่อใช้ canvas (animation ของเส้นไม่ทำงาน) — อย่าสัญญาฟีเจอร์ที่ต้องพึ่ง CSS บนเส้น
7. งานแผนที่ทุกครั้ง: นับ `document.querySelectorAll('.leaflet-overlay-pane canvas').length` ก่อน-หลังซูม/คลิก 20 ครั้ง ต้องคงที่

## 6. ความปลอดภัย (ตามโค้ดจริง) — อ่านก่อนแตะ Edge Function
- `supabase/config.toml`: `verify_jwt = false`; `index.ts`: ทุก action ที่ไม่ใช่ `getSystemDataAction`/`getPublicSystemDataAction` ใช้ **service role** และ **ไม่มีการตรวจ token หรือบทบาท** (คอมเมนต์ในโค้ดระบุว่า "ตั้งใจให้เข้า /admin ได้โดยไม่ต้อง login")
- ผลคือใครก็ตามที่รู้ URL ของฟังก์ชัน (อยู่ในไฟล์ JS สาธารณะ) ส่ง POST แก้สถานะจราจร/ลบเส้นทางหลวงได้ CORS ไม่ใช่การควบคุมสิทธิ์ ที่ validate คือรูปแบบข้อมูล (เช่น สถานะจราจร 5 ค่า) ไม่ใช่ตัวผู้เรียก
- `PRODUCTION.md` เขียนว่ามีการตรวจ JWT/บทบาท ซึ่ง **ไม่ตรงกับโค้ดในรีโป** **(ต้องยืนยันกับฟังก์ชันที่ deploy จริงใน Supabase Dashboard)** — ดู BACKLOG B-001
- `.mcp.json` ชี้ Supabase production พร้อมความสามารถ `database` — ขัดกับ ADR-001 (production อ่านอย่างเดียว) ดู B-002

## 7. ทดสอบและ CI/CD
- `tests/e2e/*.spec.ts` (Playwright; โปรเจกต์ `desktop-chromium` = Desktop Chrome 1280×720, `mobile-chromium` = Pixel 7) mock ที่ `**/functions/v1/hdms-api` จึงตอบทุก action ด้วยข้อมูลชุดเดียว
- `.github/workflows/ci.yml` (PR + push main): lint → typecheck → build → e2e (server) → build:pages → e2e (static)
- `.github/workflows/deploy.yml` (push main + manual): lint → typecheck → build:pages → deploy **ไม่รอ CI และไม่รัน e2e** ดู B-003
- `npm run check` = lint + typecheck + `build` (ไม่ใช่ `build:pages`) จึงอาจผ่านทั้งที่ deploy ไม่ผ่าน

## 8. โค้ดเก่าที่ไม่อยู่ใน path จริง (ห้ามขยาย ดู B-007)
`lib/auth.ts` (better-auth, ไม่มีใครนำเข้า และ throw ถ้าไม่มี `BETTER_AUTH_SECRET`), `db/supabase-server.ts`, `server/routing-service.mjs`, Postgres ใน `docker-compose.yml`, ข้อความ "Server Actions"/Docker ใน `DESIGN.md`/`MANUAL.md`
