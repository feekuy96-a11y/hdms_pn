# บันทึกการตัดสินใจทางสถาปัตยกรรมและความปลอดภัย (Architecture & Security Decision Log)
**ระบบแผนที่รายงานสถานการณ์น้ำท่วมและเส้นทางเลี่ยง แขวงทางหลวงปัตตานี กรมทางหลวง (DOH_Pattani_Flood)**

---

## ADR-001: กรอบสิทธิ์และความปลอดภัยในการทำงานของ AI Assistant (Antigravity Safety Profile)

- **วันที่อนุมัติ:** 2 พฤศจิกายน 2569 (2026-11-02)
- **ผู้อนุมัติ (Owner):** ผู้ดูแลระบบ / เจ้าของโครงการ
- **สถานะ:** มีผลบังคับใช้ทันที (ACTIVE)

### 1. ขอบเขตสิทธิ์ที่ได้รับอนุญาต (Approved Capabilities & Scopes)
| ทรัพยากร / เครื่องมือ | ขอบเขต Development / Staging | ขอบเขต Production |
| :--- | :--- | :--- |
| **Workspace Filesystem** | อ่าน-เขียน แก้ไข โค้ด สคริปต์ และไฟล์คอนฟิกในโฟลเดอร์โปรเจกต์ | อ่านอย่างเดียว (Read-only) เป็นค่าเริ่มต้น |
| **Database & Migration** | รัน Migration, Query, Test Seed Data, ดัดแปลง Schema ทดสอบ | Read-only เป็นค่าเริ่มต้น; ป้องกันการรัน DROP/TRUNCATE โดยไม่ผ่านขั้นตอนอนุมัติ |
| **GitHub / Version Control** | สร้าง Branch, Commit, Test PRs, ตรวจสอบ Diff | ห้าม Direct Push บน Main Branch; ต้องผ่าน Review & PR |
| **Docker & Containers** | สั่ง build, start, stop คอนเทนเนอร์ dev/staging เฉพาะที่กำหนด | ห้ามแก้ไข Container Orchestration Production โดยตรง |
| **Package Registry / npm** | ติดตั้งและอัปเดตแพ็กเกจที่ตรวจสอบความปลอดภัยแล้ว | ห้ามติดตั้ง dynamic dependency โดยไม่มี lockfile ตรวจสอบ |
| **Browser Automation & DevTools**| ตรวจสอบ UI, A11y, Performance, Network Requests และ Cookie state | ป้องกันการเข้าถึงข้อมูลส่วนบุคคลจริง (PII) |

### 2. นโยบายการจัดการความปลอดภัยและ Credential (Security & Secret Management)
- **Secret Manager:** บังคับจัดเก็บ Credential และ API Keys ทุกชนิดผ่าน Environment Variables / Secret Manager ห้ามฮาร์ดโค้ดลงใน Source Code เด็ดขาด
- **Least Privilege:** ใช้สิทธิ์ขั้นต่ำเท่าที่จำเป็น (เช่น Frontend ใช้ Publishable/Anon Key ที่มี RLS ควบคุม, Server ใช้ Scoped Token)
- **ข้อห้ามเด็ดขาด (Prohibitions):**
  - ไม่อนุญาตสิทธิ์ Root / Administrator ถาวร
  - ไม่อนุญาตสิทธิ์ Cloud Owner หรือ Production Database Write ถาวร
  - ไม่อนุญาต Unrestricted Network Access ที่ไม่ผ่านการจำกัดขอบเขต

### 3. เกณฑ์การเปลี่ยนแปลงที่มีผลต่อ Production (Production Change Governance)
ทุกการกระทำที่มีผลกระทบต่อ Production (เช่น Deploy, Migration, Backfill, Delete, Secret Rotation, IAM/Permission Change, หรือ API ที่สร้างค่าใช้จ่าย) จะต้องระบุ:
1. **ผลกระทบ (Impact Analysis):** ประเมินผลกระทบต่อผู้ใช้งาน ความพร้อมของระบบ และค่าใช้จ่าย
2. **แผนย้อนกลับ (Rollback Plan):** แผนกู้คืนสถานะเดิมอย่างเป็นขั้นตอนกรณีเกิดความผิดพลาด
3. **บันทึกการตัดสินใจ (Decision Log Entry):** บันทึกเหตุผล รายละเอียด และผลลัพธ์ลงในเอกสารนี้ก่อนดำเนินการ

---

## ADR-002: การติดตั้ง Supabase Authentication และ SSR Protected Routes

- **วันที่บันทึก:** 2 พฤศจิกายน 2569 (2026-11-02)
- **Owner:** ทีมพัฒนาระบบแขวงทางหลวงปัตตานี
- **Environment:** Development & Staging
- **สิทธิ์ที่ใช้ (Permissions):** 
  - Client-side: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (หรือ Anon Key) ภายใต้การควบคุมของ Row Level Security (RLS)
  - Server-side: `@supabase/ssr` บริหารจัดการ Session ผ่าน HttpOnly Cookies ป้องกัน XSS
- **ขอบเขตการทำงาน (Scope):**
  - ป้องกันเส้นทาง `/admin` และ `/admin/:path*` โดยตรวจสอบ Session Token ผ่าน Next.js Middleware
  - หากไม่มีสิทธิ์หรือยังไม่ได้เข้าสู่ระบบ จะ Redirect ไปที่ `/login?next=${path}`
- **แผนย้อนกลับ (Rollback Plan):**
  - กู้คืน Middleware เดิม หรือเปิดใช้ Bypass Cookie `doh_admin_role=doh_admin` สำหรับกรณีฉุกเฉินใน Dev
- **วิธี Revoke Credential:**
  - เข้าสู่หน้า Supabase Dashboard > Settings > API Keys เพื่อ Rotate Key หรือ Revoke Token ทันที

---

## ADR-003: การเพิ่มประสิทธิภาพคำสั่งคิวรี ดัชนี และความปลอดภัยฐานข้อมูลตาม Supabase Postgres Best Practices

- **วันที่บันทึก:** 2 พฤศจิกายน 2569 (2026-11-02)
- **Owner:** ทีมสถาปัตยกรรมระบบแขวงทางหลวงปัตตานี
- **Environment:** Development, Staging & Production
- **เป้าหมายและหลักเกณฑ์ (Supabase Best Practices Categories):**
  1. **Query Performance (CRITICAL):**
     - สร้าง Composite B-tree Indexes (`idx_doh_flood_active_updated`, `idx_doh_detour_active_updated`, `idx_doh_proj_status_budget`, `idx_doh_offices_type_id`) เพื่อขจัด Full-table Sort ในฟังก์ชัน `doh_get_system_data_rpc()`
     - สร้าง Partial Indexes (`WHERE is_active = TRUE`) สำหรับการคัดกรองเหตุการณ์น้ำท่วมและเส้นทางเลี่ยงที่เปิดใช้งาน ช่วยลดขนาดดัชนีลง 5-20 เท่า และประหยัด I/O
     - สร้างดัชนี `idx_doh_timeline_reported_at` บน `reported_at DESC` เพื่อรองรับการเรียกไทม์ไลน์ภาพรวมโดยไม่ต้องจัดเรียงทั้งตาราง
  2. **Connection Management (CRITICAL):**
     - ปรับจูน Pool ใน `db/client.ts` เพิ่ม `statement_timeout: 10000` (10s) ป้องกัน Long-running Queries ค้าง Connection
     - กำหนด `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000` และ `allowExitOnIdle: true` รองรับทั้ง PgBouncer Transaction Pooling และ Serverless Runtime
  3. **Security & Row Level Security (CRITICAL):**
     - เปิดใช้ `ENABLE ROW LEVEL SECURITY (RLS)` ครอบคลุม 8 ตารางหลัก
     - กำหนด Public Read Policy สำหรับประชาชนทั่วไป และ Authenticated Write Policy สำหรับเจ้าหน้าที่
     - ใช้รูปแบบ Subquery Caching `(SELECT auth.role()) = 'authenticated'` เพื่อให้ประเมินเพียงครั้งเดียวต่อ Statement แทนการประเมินรายแถว (Row-by-row) เร็วกว่าเดิมกว่า 10-100 เท่า
     - กำหนด `SET search_path = public, pg_temp;` ให้แก่ทุก RPC Functions ป้องกันช่องโหว่ Search Path Hijacking
  4. **Schema Design & PostGIS Optimization (HIGH):**
     - เพิ่มคอลัมน์ Native PostGIS Geometry `geom geometry(Geometry, 4326)` พร้อม GiST Spatial Index และ Trigger คำนวณอัตโนมัติจาก `geojson_data` ช่วยให้การทำ Road-snapping และ Intersecting Highway ค้นหาเชิงพื้นที่เร็วขึ้นระดับ Milliseconds
     - เพิ่ม GIN Index (`jsonb_path_ops`) สำหรับคอลัมน์พิกัด JSONB `coordinates_json`
     - กำหนด Check Constraints แบบ Idempotent (`DO $$ BEGIN ... END $$;`) ป้องกันค่าผิดปกติ
  5. **Concurrency & RPC Volatility (MEDIUM):**
     - กำหนดสถานะ `STABLE` ให้แก่ฟังก์ชันอ่านข้อมูล (`doh_get_system_data_rpc`, `doh_find_intersecting_highway`, `doh_snap_line_rpc`) เพื่อให้ Postgres Optimizer ทำ Query Plan Reuse ได้
- **ไฟล์ที่สร้าง/ปรับปรุง:**
  - `db/schema.sql`: ผังโครงสร้างฐานข้อมูลฉบับสมบูรณ์พร้อม Best Practices
  - `db/optimize-indexes-and-rls.sql`: สคริปต์ Migration สำหรับรันอัปเกรดฐานข้อมูลเดิม
  - `db/client.ts`: การจัดการ Connection Pool & Timeout
- **แผนย้อนกลับ (Rollback Plan):**
  - กู้คืนสถานะก่อนหน้าได้ด้วยการรัน `DROP INDEX IF EXISTS ...` และ `ALTER TABLE ... DISABLE ROW LEVEL SECURITY;`


