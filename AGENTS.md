# HDMS agent rules

## Scope and evidence

- Read `docs/CODEBASE_MAP.md` first to jump directly to target files and commands instead of scanning or grepping the whole repo.
- Inspect only files needed for the assigned task. Preserve unrelated working-tree changes.
- During incremental edits, run `npm run check:fast` and `npx eslint <changed-files> --max-warnings=0`; run full `npm run check:deploy` once before commit/PR.
- Before editing, state the paths in scope. After editing, inspect `git diff --check` and the relevant diff.
- Output diffs and concise verification results only; do not paste full source files or claim checks not run.
- Do not commit, push, deploy, alter production data, rotate secrets, or relax authentication/RLS unless explicitly asked.

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

## กฎบังคับท้ายคำตอบ: เสนอ Next Steps แบบ Master Prompt + แนะนำ Skill ที่เกี่ยวข้อง (ภาษาไทย)

ทุกครั้งที่ตอบคำถามหรือทำงานเสร็จสิ้น ต้องปิดท้ายด้วยหัวข้อ `### Next Steps` เสมอ โดยเสนอทางเลือกในการทำงานขั้นถัดไป 2–3 ข้อที่สอดคล้องกับสถาปัตยกรรมของโปรเจกต์ `hdms_pn` (Next.js App Router, Longdo Map, PostGIS/Supabase, OSRM)

### ข้อกำหนดรูปแบบการเขียน Next Steps:
1. **เขียนเป็น Master Prompt ภาษาไทยที่พร้อมก๊อปปี้ไปใช้งานทันที:** ครอบแต่ละข้อด้วยกล่องโค้ด `text` เพื่อให้ผู้ใช้คัดลอกไปวางสั่งงานในรอบถัดไปได้ทันที
2. **แนบ Skill ที่เกี่ยวข้อง (แบบประหยัดโควตา - Lazy Reference):**
   - เลือกเสนอ **Skill ที่ตรงกับบริบทของงานนั้นมากที่สุด (ไม่เกิน 1–2 สกิลต่อข้อ)** โดยอ้างอิงจากตาราง `Lazy Skill Reference` ด้านล่าง
   - **ข้อห้ามเด็ดขาด:** ระหว่างเขียนหัวข้อ Next Steps **ห้าม**เปิดอ่านเนื้อหาภายในไฟล์สกิลทั้งหมด ให้ระบุเพียง `@ชื่อสกิล` หรือ `ใช้สกิล: [ชื่อสกิล]` ลงไปใน Master Prompt เพื่อให้โหลดใช้งานเฉพาะตอนที่ผู้ใช้ก๊อปปี้คำสั่งนั้นไปรันจริงเท่านั้น
   - ระบุเหตุผลสั้นๆ (ไม่เกิน 1 บรรทัด) ไว้นอกกล่องโค้ดว่าทำไมถึงแนะนำสกิลนี้
3. **ล็อกขอบเขตไฟล์และประหยัดโควตา Token:** ในทุก Prompt ที่เสนอ ต้องระบุเงื่อนไขต่อไปนี้เสมอ:
   - ชื่อไฟล์เป้าหมายที่เจาะจง (ไม่เกิน 2 ไฟล์ต่อครั้ง)
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
| `writing-plans` | Planning | วางแผนการทำงานเป็นขั้นตอนย่อยก่อนแก้ไขไฟล์เกิน 2 ไฟล์หรือปรับโครงสร้าง |
| `verification-before-completion` | Verification | รัน `npx tsc --noEmit`, `npm run build` หรือตรวจความถูกต้องก่อนส่งมอบงาน |
| `playwright-cli` | E2E Testing | สั่งรันหรือซ่อมไฟล์เทสต์ใน `tests/e2e/` แบบเจาะจงทีละ Spec |
| `playwright-trace` | E2E Diagnostics | เปิดวิเคราะห์ Trace, Network Request และ Console Error เมื่อเทสต์ไม่ผ่าน |
| `webapp-testing` | Browser QA | ทดสอบ Flow การทำงานบนเบราว์เซอร์จริงของหน้าแผนที่และหน้า Admin |
| `frontend-design` | UI/UX | ปรับปรุง Layout, Dashboard การ์ดระดับน้ำท่วม และแผงควบคุมหน้า Admin |
| `context7-cli` | Live Docs | ดึงคู่มือ API เวอร์ชันล่าสุดของ Next.js, Supabase หรือ Library แผนที่ |
| `skill-creator` | Skill Ops | สร้าง บีบอัด หรืออัปเดตไฟล์สกิลเฉพาะทางของระบบ HDMS |
