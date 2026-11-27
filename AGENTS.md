# HDMS agent rules

## Scope and evidence

- When starting or resuming HDMS work, read `docs/AI_HANDOFF.md` for the latest verified release and recent changes; verify against `origin/main` and the deployment workflow before relying on it.

- Read `docs/CODEBASE_MAP.md` first to jump directly to target files and commands instead of scanning or grepping the whole repo.
- Before editing, start here and read the current guide for **every affected topic** in the table below, not just the first match. If the scope expands, read the newly relevant guide before editing that area. For example, a road-closure form with a map pin and saved state needs the UI, Map/GIS, and Data guides. Report any required guide or verification you could not check.
- Inspect only files needed for the assigned task. Preserve unrelated working-tree changes.
- At each stage, use the [pre-CI checklist](docs/PRE_CI_CHECKLIST.md) to define expected results, trace dependencies, choose tests and record evidence. Use the GitHub CI gates required for the actual scope before release; focused local checks do not replace it.
- During incremental edits, run `npm run check:fast` and `npx eslint <changed-files> --max-warnings=0`; run `npm run check:deploy` once before the PR for runtime changes. For a documentation-only edit, verify changed links, commands and scope; this does not change the configured GitHub gates.
- Before editing, state the paths in scope. After editing, inspect `git diff --check` and the relevant diff.
- Output diffs and concise verification results only; do not paste full source files or claim checks not run.
- Do not commit, push, deploy, alter production data, rotate secrets, or relax authentication/RLS unless explicitly asked.

## Pick the current guide by topic

| Work | Current source |
| --- | --- |
| UI, forms, responsive layout, accessibility | [UI Contract](docs/UI_CONTRACT.md); find the affected components and tests in [Codebase Map](docs/CODEBASE_MAP.md) |
| Map, markers, geometric editing and GIS performance | [Map module guide](docs/map-modules/README.md) and [Architecture](docs/ARCHITECTURE.md) §5 and the relevant schema below. For how the map looks or responds to taps, read the UI Contract as well |
| Data schema, API, or auth/security boundary | [Architecture](docs/ARCHITECTURE.md) §§2–3, 6 and the active schema/Edge source below; [Production](PRODUCTION.md) records operational constraints |
| Testing, CI scope, or troubleshooting a failing check | [Playbooks](docs/PLAYBOOKS.md) P2/P7, [CI scope](docs/CI_SCOPE.md) and the live [CI workflow](.github/workflows/ci.yml) |
| Git, deployment, or rollback | [Playbooks](docs/PLAYBOOKS.md) P1/P6 and the live [Pages workflow](.github/workflows/deploy.yml) |
| Public offline behavior and recovery | [Public offline](docs/PUBLIC_OFFLINE.md); the Admin reporting queue is separate and documented in Architecture |
| Release facts and handover, not standing rules | [AI Handoff](docs/AI_HANDOFF.md), [Known Issues](docs/KNOWN_ISSUES.md) and [Changelog](docs/archive/history/CHANGELOG.md). Reverify time-sensitive claims |

Project rules live here; domain details live in the named current guide. Keep archived rationale but do not use it to override the current sources. For branch, workflow or release changes, keep the previous production behavior until the new behavior and release gates are verified. Never add privileged credentials to the static web build.

## Efficient investigation and verification

- For follow-ups, start with the current branch and `git diff --stat`. Use the codebase map and scoped `rg -n` searches for a UI label, identifier, or test ID. Read nearby lines first and widen to callers or contracts only when needed.
- Before changing shared UI behavior, search its labels and test IDs in the related specs. Run the affected cases together with Playwright project and grep filters.
- Run `npm run test:e2e:local -- --full` before opening a PR that changes the E2E runner. It runs lint, typecheck, one fresh Pages build under `BASE_PATH=/hdms_pn` by default, and all Playwright projects in order. The managed runner locks the workspace through test completion and allocates a port and output directory by default. Avoid running standalone builds against the same output while it runs.
- Use `--reuse-build` for focused test-only edits. The managed runner verifies the app inputs, build environment (including `BASE_PATH`), and artifact identity before reuse. A mismatch triggers one fresh build. `--full` always builds fresh.
- On E2E failure, inspect the first failing assertion and relevant trace before retrying. Check data readiness, viewport, overlays and server identity. Use action-specific timeouts for steps that should resolve quickly.
- Run the shared flood and detour vertex-edit cases with `npm run test:e2e:local -- --reuse-build tests/e2e/admin-menus.spec.ts --grep @vertex-edit --workers=1`. Focused local runs stop at the first failure by default. Open the reported trace with `npx playwright show-trace <trace.zip>` before rerunning a narrowed case.
- For shared map work, start at [the map module guide](docs/map-modules/README.md). Find the file and focused Playwright command by symptom. Reuse mocked records/fixtures so Admin and Public see the same inputs; do not use live records for regression tests.
- During edits, run the smallest affected cases (reuse a build only when the managed runner confirms identity). Cover shared behavior deeply on the Public implementation once per relevant browser profile, and retain functional smoke checks in both pages, including mobile overlap, Admin-only edit actions, and the Pattani-boundary flood popup regression.
- Keep full CI and offline checks for runtime map work as required release gates. Before reducing or rebalancing CI work, measure the slowest shard and individual retries against a comparable baseline; remove only proven duplicate checks without losing an assertion unique to a portal.
- Poll CI with a compact status query. Fetch failed steps and the first actionable error instead of streaming repeated job lists or full logs. Keep all release checks required by the active workflow for the actual scope; do not bypass failures.
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

## UI/UX: current contract

Before designing or changing an interface, read [the UI/UX contract](docs/UI_CONTRACT.md). It is the single source for current UI rules, including the color and Field GIS rules previously duplicated here.
Use [Playbooks P2](docs/PLAYBOOKS.md) for the process and [Codebase Map](docs/CODEBASE_MAP.md) to find the implementation and focused tests. Archived text and `DESIGN.md` are historical context, not current UI requirements.

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
