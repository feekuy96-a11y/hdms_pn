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

## กฎบังคับท้ายคำตอบ: เสนอ Next Steps แบบ Master Prompt (ภาษาไทย)

ทุกครั้งที่ตอบคำถามหรือทำงานเสร็จสิ้น ต้องปิดท้ายด้วยหัวข้อ `### Next Steps` เสมอ โดยเสนอทางเลือกในการทำงานขั้นถัดไป 2–3 ข้อที่สอดคล้องกับสถาปัตยกรรมของโปรเจกต์ `hdms_pn` (Next.js App Router, Longdo Map, PostGIS/Supabase, OSRM)

### ข้อกำหนดรูปแบบการเขียน Next Steps:
1. **เขียนเป็น Master Prompt ภาษาไทยที่พร้อมก๊อปปี้ไปใช้งานทันที:** ครอบแต่ละข้อด้วยกล่องโค้ด `text` เพื่อให้ผู้ใช้คัดลอกไปวางสั่งงานในรอบถัดไปได้ทันที
2. **ล็อกขอบเขตไฟล์และประหยัดโควตา Token:** ในทุก Prompt ที่เสนอ ต้องระบุเงื่อนไขต่อไปนี้เสมอ:
   - ชื่อไฟล์เป้าหมายที่เจาะจง (ไม่เกิน 2 ไฟล์ต่อครั้ง)
   - ขอบเขตการห้ามอ่านไฟล์เกินจำเป็น (เช่น ห้ามอ่าน `docs/archive/`, `lib/gis-data.ts`, `supabase/migrations/`)
   - รูปแบบการแสดงผลโค้ด (แสดงเฉพาะ Unified Diff หรือจุดที่แก้ไข ห้ามเขียนทับทั้งไฟล์)
   - ข้อควรระวังเฉพาะทางของระบบ (เช่น พิกัด Longdo Map `{ lon, lat }`, PostGIS `POINT(lng lat)`, สิทธิ์ RLS, การป้องกันระบบเดิมพัง)
3. **ลำดับการเสนอทางเลือก 3 มิติ:**
   - **ข้อที่ 1 (ตรวจสอบความถูกต้องทันที):** คำสั่งสำหรับทดสอบระบบหรือเช็ก Error หลังการแก้ไขล่าสุด (เช่น `npm run check:fast`, `npm run build:pages`, หรือรัน Playwright E2E เฉพาะจุด)
   - **ข้อที่ 2 (ก้าวถัดไปตามแผนงาน):** คำสั่งสำหรับแตกไฟล์ย่อยหรือพัฒนาฟีเจอร์ลำดับถัดไปที่ต่อเนื่องจากงานปัจจุบัน
   - **ข้อที่ 3 (ป้องกันความเสี่ยงและจุดบอด):** คำสั่งตรวจสอบ Edge Cases เช่น การซิงก์ข้อมูลออฟไลน์ (`lib/offline-db.ts`), สิทธิ์ความปลอดภัยหน้า Admin หรือความเสถียรของแผนที่
