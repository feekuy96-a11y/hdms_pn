# HDMS agent rules

## Scope and evidence

- When starting or resuming HDMS work, read `docs/AI_HANDOFF.md` for the latest verified release and recent changes; verify against `origin/main` and the deployment workflow before relying on it.

- Read `docs/CODEBASE_MAP.md` first to jump directly to target files and commands instead of scanning or grepping the whole repo.
- Inspect only files needed for the assigned task. Preserve unrelated working-tree changes.
- During incremental edits, run `npm run check:fast` and `npx eslint <changed-files> --max-warnings=0`; run full `npm run check:deploy` once before commit/PR.
- Before editing, state the paths in scope. After editing, inspect `git diff --check` and the relevant diff.
- Output diffs and concise verification results only; do not paste full source files or claim checks not run.
- Do not commit, push, deploy, alter production data, rotate secrets, or relax authentication/RLS unless explicitly asked.

## Efficient investigation and verification

- For follow-ups, start with the current branch and `git diff --stat`. Use the codebase map and scoped `rg -n` searches for a UI label, identifier, or test ID. Read nearby lines first and widen to callers or contracts only when needed.
- Before changing shared UI behavior, search its labels and test IDs in the related specs. Run the affected cases together with Playwright project and grep filters.
- Run `npm run test:e2e:local -- --full` before opening a PR that changes the E2E runner. It runs lint, typecheck, one fresh Pages build under `BASE_PATH=/hdms_pn` by default, and all Playwright projects in order. The managed runner locks the workspace through test completion and allocates a port and output directory by default. Avoid running standalone builds against the same output while it runs.
- Use `--reuse-build` for focused test-only edits. The managed runner verifies the app inputs, build environment (including `BASE_PATH`), and artifact identity before reuse. A mismatch triggers one fresh build. `--full` always builds fresh.
- On E2E failure, inspect the first failing assertion and relevant trace before retrying. Check data readiness, viewport, overlays and server identity. Use action-specific timeouts for steps that should resolve quickly.
- Run the shared flood and detour vertex-edit cases with `npm run test:e2e:local -- --reuse-build tests/e2e/admin-menus.spec.ts --grep @vertex-edit --workers=1`. Focused local runs stop at the first failure by default. Open the reported trace with `npx playwright show-trace <trace.zip>` before rerunning a narrowed case.
- For shared map work, start at [the map module guide](docs/map-modules/README.md). Find the file and focused Playwright command by symptom. Reuse mocked records/fixtures so Admin and Public see the same inputs; do not use live records for regression tests.
- During edits, run the smallest affected cases (reuse a build only when the managed runner confirms identity). Cover shared behavior deeply on the Public implementation once per relevant browser profile, and retain functional smoke checks in both pages, including mobile overlap, Admin-only edit actions, and the Pattani-boundary flood popup regression.
- Keep required full CI and offline checks as release gates. Before reducing or rebalancing CI work, measure the slowest shard and individual retries against a comparable baseline; remove only proven duplicate checks without losing an assertion unique to a portal.
- Poll CI with a compact status query. Fetch failed steps and the first actionable error instead of streaming repeated job lists or full logs. Keep the full pre-release checks.
- When measuring workflow cost, record substantive files opened, builds, E2E retries, and timeout time separately. These are workload indicators rather than account quota measurements.

Workflow validation: the initial mobile detour baseline took 34.2 s with one build. The reuse validation took 26.4 s with one build and 9.3 s with zero builds after a test-only edit. Changing the Admin source or `BASE_PATH` triggered a rebuild in separate checks. Build-cache conditions varied between rounds. The shared vertex-edit group passed four Desktop/Mobile cases, and an intentional failure check confirmed that the first failure retained a trace without retrying or starting the second serial case.

## Required references

Read only relevant parts of these authoritative contracts before changing their domain:

- `lib/flood-event-schema.ts`
- `lib/highway-schema.ts`
- `supabase/functions/hdms-api/index.ts`

## Data and map safety

- Preserve schema field meanings, status values, and API request/response compatibility. Validate untrusted input at the boundary.
- Longdo Map coordinates are `{ lon, lat }`: longitude first. Never reverse them.
- PostGIS points use `POINT(lng lat)`: longitude first. Never pass `POINT(lat lng)`.
- Treat coordinate conversion, route identifiers, and road-status changes as safety-sensitive: make the smallest change, add or update focused coverage where applicable, and state unverified behavior.

## Delivery

Report changed paths, validation actually run, remaining risks, and rollback (normally `git revert <commit>`). For database, Edge Function, and web changes, state explicitly which deployment stages apply and their order.

## Core Color System & Field GIS Usability Rules

### Part 1: Core Color System Rules (กฎหลักระบบสี 6 ข้อ)

#### Rule 1: Zero Hardcoded Hex in Components (แยก Scale ออกจาก Semantic Tokens)
- **ห้าม** เขียนรหัสสี Hex/RGB แบบ Hardcode ลงใน HTML, JSX, JS หรือ CSS ของคอมโพเนนต์โดยตรง
- **ต้อง** ใช้ระบบ 2 ชั้นเสมอ:
  1. **Primitive Scale (`50–950`):** ไล่เฉดสีฐาน (Slate Navy, Deep Teal, Ice Blue, Amber, Red, Orange, Yellow, Cyan, Green)
  2. **Semantic Tokens:** ตั้งชื่อตามหน้าที่ใช้งานจริง (เช่น `--bg-card`, `--text-primary`, `--brand-active`, `--status-danger-bg`) เพื่อให้สลับ Light/Dark Mode ได้จากการเปลี่ยนค่า Token ชุดเดียว

#### Rule 2: Unified Status Color Mapping (Map = Card = Badge = Filter)
สีของสถานะจราจรและภัยพิบัติ **ต้องตรงกัน 100%** ทั้งบนหมุดแผนที่ (Markers), เส้นทางถนน (Polylines), การ์ดสรุปด้านข้าง, ป้ายสถานะ (Badges) และเมนูตัวกรอง (Dropdown):
- **ผ่านไม่ได้ (`status.danger`):** โทนแดง (`Red`)
- **รถเล็กผ่านไม่ได้ / เฝ้าระวัง (`status.warning-high`):** โทนส้ม / อำพันเข้ม (`Orange / Deep Amber`)
- **รถเล็กผ่านได้ 1 ช่องทาง (`status.warning-low`):** โทนเหลือง / ทอง (`Yellow / Gold`)
- **รถทุกชนิดผ่านได้แต่ไม่สะดวก (`status.info`):** โทนฟ้า / ไซแอน (`Cyan / Sky Blue`)
- **ทางเลี่ยง (`route.detour`):** โทนเหลืองอำพันมีขอบ (`Amber / Gold`) — *ต้องแยกโทนให้ชัดจากสีแดงของจุดน้ำท่วม*
- **เส้นทางปกติ / กล้อง CCTV (`status.normal`):** โทนเขียวเข้ม (`Dark Green`)

#### Rule 3: 60·30·10 Visual Balance (คุมสัดส่วนสีไม่ให้แย่งซีนแผนที่)
- **60% พื้นหลังกลาง (Dominant Neutral):** พื้นหลังขาว/เทาอมฟ้าอ่อนมาก (Light) หรือ Slate Navy เข้ม (Dark) สำหรับ Sidebar, ช่องค้นหา และพื้นหลังการ์ด
- **30% โครงสร้างรอง (Secondary):** เส้นขอบบางๆ, ปุ่ม Outlined ใน Header (`ติดต่อ`, `สายด่วน 073-336051`), ชิปข้อมูลประกอบ (`ระดับน้ำ`, `ฝั่งน้ำท่วม`)
- **10% สีเน้นและจุดสำคัญ (Accent & Status):** ใช้เฉพาะแท็บ/ตัวกรองที่ Active อยู่, ข้อความพิกัด/กม., ปุ่มนำทางหลัก (`ดูบน Google Maps`) และป้ายสถานะ

#### Rule 4: WCAG Contrast & Intentional Active Inversion
- ข้อความปกติต้องมีค่า Contrast Ratio อย่างน้อย **4.5:1** และข้อความขนาดใหญ่/ไอคอนอย่างน้อย **3:1**
- **การกลับขั้วสี Active (Active State Inversion):**
  - **Light Mode:** แท็บหรือตัวกรองที่ถูกเลือก (`น้ำท่วม`, `ทุกสายทาง`) ใช้พื้น **Deep Teal** + ตัวอักษร **สีขาว**
  - **Dark Mode:** กลับขั้วเป็นพื้น **Soft Ice Blue** + ตัวอักษร **Slate Navy เข้ม** เพื่อให้อ่านชัดบนพื้นมืด

#### Rule 5: Dark Mode Elevation & Subtle Borders
- พื้นหลังหลัก (`--bg-app`) ต้องเข้มกว่าพื้นหลังการ์ดและช่องค้นหา (`--bg-card`, `--bg-input`) เสมอ
- การ์ดทุกใบใน Dark Mode ต้องมีเส้นขอบบาง `--border-subtle` (โทนเทาอมน้ำเงิน) เพื่อแยกชั้นความลึก ไม่ให้การ์ดจมกลืนไปกับพื้นหลัง

#### Rule 6: Floating Map Controls Over Light Map Tiles
- เนื่องจากแผนที่พื้นหลัง (Longdo / NuMAP) ยังแสดงผลเป็นโทนสว่างแม้ผู้ใช้จะเปิด Dark Mode
- ปุ่มควบคุมที่ลอยอยู่บนแผนที่ทุกชิ้น (`น้ำท่วม X จุด`, `ทางเลี่ยง X เส้นทาง`, ปุ่มซูม `+`/`-`, ปุ่มระบุตำแหน่ง, ปุ่มสลับชั้นข้อมูล) **ห้ามใช้พื้นหลังโปร่งใสจัด** ต้องคงความทึบแสงสูง (`opacity >= 0.92`) และมี `box-shadow` ชัดเจนเสมอ

### Part 2: Field GIS & Usability Rules (กฎเสริมสำหรับงานภาคสนาม 5 ข้อ)

#### Rule 7: Never Rely on Color Alone (Color + Shape / Pattern)
- เนื่องจากสีของ `ทางเลี่ยง`, `รถเล็กผ่านไม่ได้` (ส้ม/อำพัน) และ `รถเล็กผ่านได้ 1 ช่องทาง` (เหลือง/ทอง) อยู่ในตระกูลเดียวกัน การสื่อสารบนแผนที่และป้ายสถานะ **ห้ามใช้สีอย่างเดียว**
- **เส้นทางเลี่ยง (Detour Polylines):** ต้องใช้เส้นประ (`dashArray`) หรือสัญลักษณ์ลูกศรทิศทางควบคู่กับสีเหลืองอำพัน เพื่อแยกจากเส้นน้ำท่วมทึบอย่างชัดเจน
- **หมุดและป้ายสถานะ:** ต้องใช้รูปทรงไอคอนที่ต่างกันตามระดับความรุนแรง (เช่น กากบาท/ห้ามผ่าน, สามเหลี่ยมเตือน, คลื่นน้ำ, ลูกศรเลี่ยง) เพื่อรองรับการดูกลางแดดจ้าและผู้ที่มีภาวะตาบอดสี

#### Rule 8: Map Tile Dimming in Dark Mode (แยกชั้นพื้นแผนที่กับหมุด)
- เมื่อเปิด Dark Mode ให้ลดแสงจ้าของแผนที่พื้นหลังเฉพาะชั้น Tile Layer (เช่น ใช้ CSS Filter `brightness(0.75) contrast(1.05)` กับ `.leaflet-tile-pane`)
- **ห้าม** ใส่ Filter ลดความสว่างครอบทั้งกล่องแผนที่ (`.leaflet-container`) เพราะจะทำให้หมุดน้ำท่วม (Markers), เส้นทาง (Polylines) และปุ่มควบคุมมืดหม่นตามไปด้วย ต้องให้ข้อมูลภัยพิบัติยังคงสว่างเด่นขึ้นมาจากพื้นแผนที่

#### Rule 9: Explicit Interactive & Focus States
- ต้องกำหนด Token สำหรับสถานะโต้ตอบทุกคอมโพเนนต์ที่กดได้ (`--state-hover`, `--state-selected`, `--focus-ring`)
- เมื่อผู้ใช้คลิกเลือกการ์ดเหตุการณ์ใน Sidebar หรือคลิกหมุดบนแผนที่ การ์ดที่เชื่อมโยงกันต้องเปลี่ยนเป็นสถานะ `--state-selected` (มีพื้นไฮไลต์และขอบเน้น) เพื่อให้รู้ทันทีว่ากำลังดูจุดไหนอยู่

#### Rule 10: Field Typography (`tabular-nums`) & Touch Targets
- ตัวเลขเชิงพื้นที่และข้อมูลเรียลไทม์ทั้งหมด เช่น ช่วง กม. (`กม. 12+400`), ระดับน้ำ (`40 ซม.`), เวลาอัปเดต และตัวนับจำนวนจุดบนปุ่ม **ต้อง** กำหนด `font-variant-numeric: tabular-nums;` เพื่อป้องกันตัวเลขกระตุกหรือขยับแนวนอนเมื่อข้อมูลรีเฟรช
- ปุ่มควบคุมบนแผนที่และปุ่มหลักบนหน้าจอมือถือต้องมีขนาดพื้นที่สัมผัส (Touch Target) ไม่เล็กกว่า **44×44 px** เพื่อความแม่นยำในการกดขณะปฏิบัติงานหรือเดินทาง

#### Rule 11: Data Freshness Visual Hierarchy (แยกสีความสดใหม่ของข้อมูล)
- แยกโทนสีของป้ายเวลาอัปเดตข้อมูล (Last Updated) เพื่อช่วยประเมินความน่าเชื่อถือของสถานการณ์ได้ทันที:
  - **ข้อมูลใหม่/สด (`fresh` — อัปเดตภายใน 1–2 ชม.):** โทนเขียวอมฟ้าหรือน้ำเงินอ่อน พร้อมจุดสถานะชัดเจน
  - **ข้อมูลปานกลาง (`aging` — อัปเดต 2–6 ชม.):** โทนสีข้อความรองปกติ (`--text-secondary`)
  - **ข้อมูลค้างนาน (`stale` — เกิน 6 ชม. หรือไม่ระบุเวลา):** โทนสีเทาจางหรือสีอำพันอ่อนเตือนให้ตรวจสอบซ้ำ

### Required Semantic Token Structure

ใช้โครงสร้างตัวแปร CSS ต่อไปนี้เป็นมาตรฐานกลาง (ปรับค่า Hex/OKLCH ให้ตรงกับธีมของระบบ):

| Token Name | บทบาทหน้าที่ | Light Mode | Dark Mode |
| :--- | :--- | :--- | :--- |
| `--bg-app` | พื้นหลังหลักของแอป / แถบด้านข้าง | ขาว / เทาอมฟ้าอ่อนมาก | Slate Navy เข้มสุด |
| `--bg-card` | พื้นหลังการ์ดข้อมูลและ Modal | ขาวบริสุทธิ์ | Slate Navy สว่างขึ้น 1 ระดับ |
| `--bg-input` | ช่องค้นหาและ Input | เทาอมฟ้าอ่อน | Slate Navy เข้มกว่า Card เล็กน้อย |
| `--border-subtle` | เส้นขอบการ์ดและปุ่ม Outlined | เทาอมฟ้าจาง | เทาอมน้ำเงินบาง |
| `--text-primary` | ชื่อตอน, หมายเลขทางหลวง, หัวข้อ | กรมท่าเข้ม / เทาเข้ม | ขาว / เทาอ่อนสว่าง |
| `--text-secondary` | คำอธิบายรอง, ป้ายกำกับทั่วไป | เทาปานกลาง | เทาอมฟ้าอ่อน |
| `--text-location` | ช่วง กม., ตำบล/อำเภอ, ลิงก์ดูรายละเอียด | น้ำตาลอมส้ม (Ochre) | เหลืองทอง (Warm Gold) |
| `--brand-active-bg` | พื้นหลังแท็บ/ตัวกรองที่ถูกเลือก | Deep Teal | Soft Ice Blue |
| `--brand-active-text` | ตัวอักษรบนแท็บ/ตัวกรองที่ถูกเลือก | ขาว | Slate Navy เข้ม |
| `--cta-primary-bg` | ปุ่มนำทางหลัก (`ดูบน Google Maps`) | เหลืองอำพัน (Solid Amber) | เหลืองอำพัน (Solid Amber) |
| `--cta-primary-text` | ตัวอักษรบนปุ่มนำทางหลัก | กรมท่าเข้ม | กรมท่าเข้ม |
| `--state-hover` | พื้นหลังเมื่อชี้เมาส์บนการ์ด/ปุ่ม | เทาอมฟ้าอ่อนจาง | Slate Navy สว่างขึ้นเล็กน้อย |
| `--state-selected` | พื้นหลัง/ขอบการ์ดที่เชื่อมกับหมุดที่เลือก | Deep Teal โปร่งอ่อน + ขอบ Teal | Ice Blue โปร่งอ่อน + ขอบ Ice Blue |
| `--focus-ring` | เส้นกรอบโฟกัสสำหรับคีย์บอร์ด/Accessibility | Deep Teal ชัด | Soft Ice Blue / Gold ชัด |
| `--status-danger-*` | สถานะ: ผ่านไม่ได้ | พื้นแดงอ่อน / ขอบ-อักษรแดง | พื้นแดงเข้มโปร่ง / อักษรชมพูแดง |
| `--status-warning-high-*` | สถานะ: รถเล็กผ่านไม่ได้ | พื้นอำพันอ่อน / อักษรน้ำตาลทอง | พื้นอำพันเข้มโปร่ง / อักษรทอง |
| `--status-warning-low-*` | สถานะ: รถเล็กผ่านได้ 1 ช่องทาง | พื้นเหลืองอ่อน / อักษรเหลืองเข้ม | พื้นเหลืองเข้มโปร่ง / อักษรเหลืองสว่าง |
| `--status-info-*` | สถานะ: ผ่านได้แต่ไม่สะดวก | พื้นฟ้าอ่อน / อักษรน้ำเงินเข้ม | พื้นฟ้าเข้มโปร่ง / อักษรฟ้าสว่าง |
| `--freshness-live` | ป้ายข้อมูลอัปเดตล่าสุด (สดใหม่) | เขียวอมฟ้าเข้มบนพื้นอ่อน | เขียวอมฟ้าสว่างบนพื้นเข้มโปร่ง |
| `--freshness-stale` | ป้ายข้อมูลเก่า / ค้างนาน | เทาจาง / อำพันอ่อน | เทาหม่น / อำพันจาง |

### Strict Guardrails (ข้อห้ามเด็ดขาด)
1. **ห้าม** ใช้สีแดงสดของสถานะ `ผ่านไม่ได้` กับเส้นทางหรือปุ่ม `ทางเลี่ยง` เด็ดขาด
2. **ห้าม** ใช้สีตัวอักษรที่อ่านยากบนพื้นมืด (เช่น เทาเข้มบนพื้น Slate Navy) ให้ตรวจสอบ Contrast ทุกครั้ง
3. **ห้าม** สร้างปุ่มหรือการ์ดใหม่โดยไม่ผูกกับ Token ในตารางด้านบน
4. **ห้าม** ทำให้ปุ่มลอยบนแผนที่โปร่งใสจนกลืนกับชื่อถนนหรือเส้นทางบน Longdo/NuMAP
5. **ห้าม** ใส่ Filter ลดความสว่างใน Dark Mode ครอบทั้งแผนที่จนทำให้หมุดน้ำท่วมและเส้นทางเลี่ยงมืดตามไปด้วย
6. **ห้าม** ใช้สีเพียงอย่างเดียวในการแยกความแตกต่างของเส้นทางและระดับความรุนแรงบนแผนที่โดยไม่มีรูปทรงไอคอนหรือรูปแบบเส้นประกอบ

### Output & Verification Checklist
ทุกครั้งที่แก้ไขหรือสร้าง UI ใหม่ ให้ตรวจสอบ 7 ข้อนี้ก่อนส่งงานเสมอ:
1. ไม่มี Hardcoded Hex ในไฟล์ Component (เรียกผ่าน CSS Variables ทั้งหมด)
2. สลับ Light Mode ↔ Dark Mode แล้วสี Active Tab, ข้อความ กม., ขอบการ์ด และความสว่างของ Map Tile Layer เปลี่ยนครบทุกจุดโดยหมุดยังสว่างเด่น
3. สีบนหมุด/เส้นแผนที่ตรงกับสีบนการ์ดสรุปและป้าย Badge พร้อมรูปทรงไอคอน/เส้นประที่แยกได้แม้ไม่ดูสี
4. ปุ่มลอยบนแผนที่ยังคงอ่านชัด มีเงาแยกชั้น และมีขนาด Touch Target ไม่ต่ำกว่า 44×44 px บนมือถือ
5. การคลิกการ์ดหรือหมุดแสดงสถานะ `--state-selected` และรองรับ `--focus-ring` ชัดเจน
6. ตัวเลข กม., ระดับน้ำ และตัวนับจำนวนจุดใช้ `tabular-nums` ไม่กระตุกเมื่ออัปเดต
7. ป้ายเวลาอัปเดตแยกความสดใหม่ของข้อมูล (`fresh` / `stale`) ได้อย่างชัดเจน

## กฎบังคับท้ายคำตอบ: เสนอ Next Steps แบบ Master Prompt + แนะนำ Skill ที่เกี่ยวข้อง (ภาษาไทย)

ทุกครั้งที่ตอบคำถามหรือทำงานเสร็จสิ้น ต้องปิดท้ายด้วยหัวข้อ `### Next Steps` เสมอ โดยเสนอทางเลือกในการทำงานขั้นถัดไป 2–3 ข้อที่สอดคล้องกับสถาปัตยกรรมของโปรเจกต์ `hdms_pn` (Next.js App Router, Longdo Map, PostGIS/Supabase, OSRM)

### ข้อกำหนดรูปแบบการเขียน Next Steps:
1. **เขียนเป็น Master Prompt ภาษาไทยที่พร้อมก๊อปปี้ไปใช้งานทันที:** ครอบแต่ละข้อด้วยกล่องโค้ด `text` เพื่อให้ผู้ใช้คัดลอกไปวางสั่งงานในรอบถัดไปได้ทันที
2. **แนบ Skill ที่เกี่ยวข้อง (แบบประหยัดโควตา - Lazy Reference):**
   - เลือกเสนอ **Skill ที่ตรงกับบริบทของงานนั้นมากที่สุด (ไม่เกิน 1–2 สกิลต่อข้อ)** โดยอ้างอิงจากตาราง `Lazy Skill Reference` ด้านล่าง
   - **ข้อห้ามเด็ดขาด:** ระหว่างเขียนหัวข้อ Next Steps **ห้าม**เปิดอ่านเนื้อหาภายในไฟล์สกิลทั้งหมด ให้ระบุเพียง `@ชื่อสกิล` หรือ `ใช้สกิล: [ชื่อสกิล]` ลงไปใน Master Prompt เพื่อให้โหลดใช้งานเฉพาะตอนที่ผู้ใช้ก๊อปปี้คำสั่งนั้นไปรันจริงเท่านั้น
   - ระบุเหตุผลสั้นๆ (ไม่เกิน 1 บรรทัด) ไว้นอกกล่องโค้ดว่าทำไมถึงแนะนำสกิลนี้
3. **ล็อกขอบเขตไฟล์และประหยัดโควตา Token:** ในทุก Prompt ที่เสนอ ต้องระบุเงื่อนไขต่อไปนี้เสมอ:
   - ชื่อไฟล์เป้าหมายที่เจาะจงตามขอบเขตงานจริงของเฟส/หน่วยงานนั้น (Atomic Unit ที่จบในตัวเองและคอมไพล์/เทสต์ผ่านได้ โดยแยกเฟสเมื่อข้าม Domain ใหญ่)
   - ขอบเขตการห้ามอ่านไฟล์เกินจำเป็น (เช่น ห้ามอ่าน `docs/archive/`, `lib/gis-data.ts`, `supabase/migrations/`)
   - รูปแบบการแสดงผลโค้ด (แสดงเฉพาะ Unified Diff หรือจุดที่แก้ไข ห้ามเขียนทับทั้งไฟล์)
   - ข้อควรระวังเฉพาะทางของระบบ (เช่น พิกัด Longdo Map `{ lon, lat }`, PostGIS `POINT(lng lat)`, สิทธิ์ RLS, การป้องกันระบบเดิมพัง)
4. **ลำดับการเสนอทางเลือก 3 มิติ:**
   - **ข้อที่ 1 (ตรวจสอบความถูกต้องทันที):** คำสั่งสำหรับทดสอบระบบหรือเช็ก Error หลังการแก้ไขล่าสุด (เช่น `npm run check:fast`, `npm run build:pages`, หรือรัน Playwright E2E เฉพาะจุด)
   - **ข้อที่ 2 (ก้าวถัดไปตามแผนงาน):** คำสั่งสำหรับแตกไฟล์ย่อยหรือพัฒนาฟีเจอร์ลำดับถัดไปที่ต่อเนื่องจากงานปัจจุบัน
   - **ข้อที่ 3 (ป้องกันความเสี่ยงและจุดบอด):** คำสั่งตรวจสอบ Edge Cases เช่น การซิงก์ข้อมูลออฟไลน์ (`lib/offline-db.ts`), สิทธิ์ความปลอดภัยหน้า Admin หรือความเสถียรของแผนที่

### Lazy Skill Reference (ตารางอ้างอิงสกิลประจำโปรเจกต์)

> [!IMPORTANT]
> ห้ามโหลดไฟล์เนื้อหาสกิลเหล่านี้ระหว่างสร้างหัวข้อ Next Steps ให้ระบุเพียงชื่อสกิลเท่านั้น เพื่อโหลดใช้งานจริงในเทิร์นถัดไป

| ชื่อสกิล (Skill Name) | หมวดหมู่ (Category) | เงื่อนไขการเรียกใช้ใน Next Steps (Trigger Context) |
| :--- | :--- | :--- |
| `master-developer-rules-description` | Core Architecture | วิเคราะห์โครงสร้าง แตกไฟล์ Monolith ขนาดใหญ่ และแก้บั๊กซับซ้อนข้ามชั้นระบบ |
| `systematic-debugging` | Debugging | สืบหา Root Cause ของบั๊กใน Longdo Map, Supabase RPC หรือ Offline Sync |
| `writing-plans` | Planning | วางแผนการทำงานเป็นขั้นตอนย่อยก่อนแก้ไขงานที่ข้ามหลาย Domain หรือปรับโครงสร้างใหญ่ |
| `verification-before-completion` | Verification | รัน `npx tsc --noEmit`, `npm run build` หรือตรวจความถูกต้องก่อนส่งมอบงาน |
| `playwright-cli` | E2E Testing | สั่งรันหรือซ่อมไฟล์เทสต์ใน `tests/e2e/` แบบเจาะจงทีละ Spec |
| `playwright-trace` | E2E Diagnostics | เปิดวิเคราะห์ Trace, Network Request และ Console Error เมื่อเทสต์ไม่ผ่าน |
| `webapp-testing` | Browser QA | ทดสอบ Flow การทำงานบนเบราว์เซอร์จริงของหน้าแผนที่และหน้า Admin |
| `frontend-design` | UI/UX | ปรับปรุง Layout, Dashboard การ์ดระดับน้ำท่วม และแผงควบคุมหน้า Admin |
| `context7-cli` | Live Docs | ดึงคู่มือ API เวอร์ชันล่าสุดของ Next.js, Supabase หรือ Library แผนที่ |
| `skill-creator` | Skill Ops | สร้าง บีบอัด หรืออัปเดตไฟล์สกิลเฉพาะทางของระบบ HDMS |
