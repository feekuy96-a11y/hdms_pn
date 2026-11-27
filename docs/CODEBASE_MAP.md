# HDMS Codebase Routing Map (AI Fast-Lookup)

ใช้ตารางนี้เพื่อกระโดดตรงไปยังไฟล์และคำสั่งตรวจที่เกี่ยวข้องเท่านั้น แทนการ `grep` หรือสแกนทั้งโปรเจกต์

## 1. Public Dashboard (`/`)
| งาน / อาการ | ไฟล์เป้าหมาย (อ่านเฉพาะไฟล์นี้) | คำสั่งตรวจเฉพาะจุด |
|---|---|---|
| Layout หลัก, แผนที่, Top bar | `app/page.tsx` | `npm run check:fast` |
| Data fetching, filter, notification, photo loader | `components/public/usePublicDashboardData.ts` | `npm run check:fast` |
| การ์ดสรุปเหตุการณ์น้ำท่วม (6-group compact card) | `components/public/FloodCard.tsx` | `npx eslint components/public/FloodCard.tsx --max-warnings=0` |
| แถบสรุปสถานะ & ปุ่มกรอง (Status pills) | `components/public/SituationSummary.tsx` | `npx eslint components/public/SituationSummary.tsx --max-warnings=0` |
| Modal รายละเอียดน้ำท่วม, รูปภาพ, กราฟน้ำ, ทางเลี่ยง | `components/public/FloodDossierModal.tsx` | `npx eslint components/public/FloodDossierModal.tsx --max-warnings=0` |
| ส่วนประกอบย่อย Dossier (ทางเลี่ยงแนะนำ, ประวัติระดับน้ำ) | `components/public/FloodDossierSections.tsx` | `npx eslint components/public/FloodDossierSections.tsx --max-warnings=0` |
| Modal ทางเลี่ยงเดี่ยว (Standalone Detour) | `components/public/DetourDossierModal.tsx` | `npx eslint components/public/DetourDossierModal.tsx --max-warnings=0` |
| Bottom sheet สำหรับมือถือ | `components/public/MobileCitizenDrawer.tsx` | `npx eslint components/public/MobileCitizenDrawer.tsx --max-warnings=0` |
| Constants & pure formatters ของหน้าหลัก | `components/public/public-route-helpers.ts` | `npm run check:fast` |

## 2. Admin Workspace (`/admin`)
| งาน / อาการ | ไฟล์เป้าหมาย | คำสั่งตรวจเฉพาะจุด |
|---|---|---|
| แท็บจัดการแผนที่/วาดเส้นน้ำท่วม-ทางเลี่ยง (UI หลัก/Container) | `components/admin/tabs/MapManagementTab.tsx` | `npm run check:fast` |
| ส่วนประกอบ Form UI ย่อย (Header, Draft Banner, Action Bar) | `components/admin/tabs/MapFormSections.tsx` | `npx eslint components/admin/tabs/MapFormSections.tsx --max-warnings=0` |
| Hooks ของ MapManagementTab (draft, hydration, picker, media, snapping, submit) | `components/admin/tabs/useMapRoute*.ts`, `useDualRoadSnapping.ts`, `useMapCoordinatePicker.ts` | `npm run check:fast` |
| Hooks ฟอร์มแผนที่ (state โหมด, พิกัด, นำทาง, combobox) | `components/admin/tabs/useMapRouteFormState.ts` | `npm run check:fast` |
| Helper ตัดช่วง กม. บนแนวทางหลวง | `components/admin/tabs/map-management-helpers.ts` | `npm run check:fast` |
| แท็บจัดการเส้นทางเลี่ยง (UI หลัก/Container) | `components/admin/tabs/DetourManagementTab.tsx` | `npx eslint components/admin/tabs/DetourManagementTab.tsx --max-warnings=0` |
| รายการทางเลี่ยง Mobile Cards / Table & Action buttons | `components/admin/tabs/DetourListCard.tsx` | `npx eslint components/admin/tabs/DetourListCard.tsx --max-warnings=0` |
| Modal แก้ไขทางเลี่ยงฉุกเฉิน (Quick Detour Editor) | `components/admin/tabs/DetourEditModal.tsx` | `npx eslint components/admin/tabs/DetourEditModal.tsx --max-warnings=0` |
| Modal ดูรายละเอียดทางเลี่ยง (Mini-map / Route Advice) | `components/admin/tabs/DetourViewModal.tsx` | `npx eslint components/admin/tabs/DetourViewModal.tsx --max-warnings=0` |
| Logic จัดการเส้นทางเลี่ยง (filter, reorder, save, export) | `components/admin/tabs/useDetourManagement.ts` | `npm run check:fast` |
| แท็บทะเบียนเหตุการณ์น้ำท่วม (UI หลัก/Container) | `components/admin/tabs/IncidentRegistryTab.tsx` | `npx eslint components/admin/tabs/IncidentRegistryTab.tsx --max-warnings=0` |
| Modals ทะเบียนเหตุการณ์ (Update Water, Split, Merge) | `components/admin/tabs/IncidentActionModals.tsx` | `npx eslint components/admin/tabs/IncidentActionModals.tsx --max-warnings=0` |
| Modal ดูรายละเอียดเหตุการณ์น้ำท่วม (Detail & Media) | `components/admin/tabs/IncidentDetailModal.tsx` | `npx eslint components/admin/tabs/IncidentDetailModal.tsx --max-warnings=0` |
| Logic ทะเบียนเหตุการณ์ (filter, split, merge, inline water) | `components/admin/tabs/useIncidentRegistry.ts` | `npm run check:fast` |
| Modal เชื่อมโยงเหตุการณ์น้ำท่วม ↔ ทางเลี่ยง (UI) | `components/admin/EventDetourLinkModal.tsx` | `npx eslint components/admin/EventDetourLinkModal.tsx --max-warnings=0` |
| Logic เชื่อมโยงเหตุการณ์ ↔ ทางเลี่ยง (drafts, 409 version) | `components/admin/useEventDetourLinkModal.ts` | `npm run check:fast` |
| แท็บนำเข้า/จัดการข้อมูลสายทางหลวง GIS (UI หลัก/Container) | `components/admin/tabs/GisDataImportTab.tsx` | `npm run check:fast` |
| ตารางสายทางและเลเยอร์โครงข่ายเดิม (Highway Table & Layer List) | `components/admin/tabs/GisHighwayTable.tsx` | `npx eslint components/admin/tabs/GisHighwayTable.tsx --max-warnings=0` |
| Modals จัดการข้อมูลทางหลวง GIS (Container) | `components/admin/tabs/GisHighwayModals.tsx` | `npx eslint components/admin/tabs/GisHighwayModals.tsx --max-warnings=0` |
| Modal ดูรายละเอียดสายทางหลวง (Route Detail) | `components/admin/tabs/HighwayRouteDetailModal.tsx` | `npx eslint components/admin/tabs/HighwayRouteDetailModal.tsx --max-warnings=0` |
| Panel ปรับแนวถนนทางหลวง (Geometry Editor Panel) | `components/admin/tabs/HighwayGeometryEditorPanel.tsx` | `npx eslint components/admin/tabs/HighwayGeometryEditorPanel.tsx --max-warnings=0` |

## 3. Map & GIS Engine (Safety-Sensitive: `{ lon, lat }` / `POINT(lng lat)`)

เริ่มจาก [คู่มือโมดูลแผนที่ร่วม](map-modules/README.md) เพื่อเลือกไฟล์และเทสต์ของปุ่ม เลเยอร์ ป๊อปอัพ สถานะ หรือโหมดโฟกัสก่อนแก้
| งาน / อาการ | ไฟล์เป้าหมาย | คำสั่งตรวจเฉพาะจุด |
|---|---|---|
| Longdo Map canvas, layers, popups, markers | `components/map/LongdoGisMap.tsx` | `npm run check:fast` |
| Pure layer & marker builders สำหรับ Longdo Map | `components/map/longdo-layer-builders.ts` | `npm run check:fast` |
| คำนวณระยะทาง Haversine, ความยาวเส้น, Bearing | `lib/gis/geo-math.ts` | `npx playwright test tests/e2e/hybrid-google-maps.spec.ts` |
| อ่านไฟล์ KMZ / KML / GeoJSON & field mapping | `lib/gis/gis-file-parser.ts` | `npm run check:fast` |
| บีบอัดภาพ Base64 / Adaptive WebP-JPEG | `lib/gis/image-compress.ts` | `npm run check:fast` |
| ตรวจจับทางเลี่ยงทับถนนปิด (CLOSED) & แยกฝั่งจราจร | `lib/gis/conflict-detection.ts` | `npx playwright test tests/e2e/detour-navigation.spec.ts` |
| Detour Turn-by-Turn advice, OSRM/Google routing, KM slicing | `lib/gis-utils.ts` | `npx playwright test tests/e2e/hybrid-google-maps.spec.ts` |
| แปลงพิกัดเป็นตำบล/อำเภอ จ.ปัตตานี (115 ตำบล) | `lib/area-lookup.ts`, `lib/gis-data.ts` | `npx playwright test tests/e2e/hybrid-google-maps.spec.ts` |
| สร้างลิงก์นำทาง Google Maps (5 Steps) | `lib/detour-navigation.ts` | `npx playwright test tests/e2e/detour-navigation.spec.ts` |

## 4. Schema, API & Backend Contracts
| งาน / อาการ | ไฟล์เป้าหมาย | คำสั่งตรวจเฉพาะจุด |
|---|---|---|
| Schema เหตุการณ์น้ำท่วม, ระดับน้ำ, สถานะจราจร | `lib/flood-event-schema.ts` | `npx playwright test tests/e2e/flood-form-rules.spec.ts` |
| Schema สายทางหลวง & การแปลงหลัก กม. | `lib/highway-schema.ts` | `npm run check:fast` |
| Edge Function API (`hdms-api`) | `supabase/functions/hdms-api/index.ts` | `npx playwright test tests/e2e/phase6-data-integrity.spec.ts` |
| Client actions เรียก Edge Function | `app/actions/doh-actions.ts` | `npm run check:fast` |

## 5. Verification Commands (เรียงจากเร็วไปเต็มรูปแบบ)
1. **ระหว่างแก้ไขย่อย (~10–15 วิ):** `npm run check:fast` และ `npx eslint <changed-files> --max-warnings=0`
2. **เทสต์ Logic/GIS เฉพาะจุด (~10 วิ, ไม่ต้องเปิด Browser):** `npx playwright test tests/e2e/hybrid-google-maps.spec.ts tests/e2e/detour-navigation.spec.ts tests/e2e/phase6-data-integrity.spec.ts`
3. **ก่อน Commit / PR (Full Gate):** `npm run check:deploy` (`lint` + `typecheck` + `build:pages`)
