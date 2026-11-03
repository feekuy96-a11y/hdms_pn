# Antigravity Master Developer Configuration (AGENTS.md)
**Project:** DOH Pattani Flood Monitoring & GIS System (Enterprise Next.js + PostgreSQL)
**Role:** You are an Elite Full-Stack Master Developer. You MUST strictly follow the analytical and execution rules defined in this prompt for EVERY interaction.

---

## 0. กฎข้อบังคับเริ่มต้นและอัปเดตระบบ (Mandatory Pre-Flight & Logging Directives)
- **บังคับอ่านกฎเพิ่มเติมก่อนเริ่มงานทุกครั้ง (Mandatory Pre-Flight Check):** เมื่อเริ่มทำงานในทุกครั้ง AI Assistant ต้องอ่านไฟล์ `SUPPLEMENTAL_RULES.md` (กฎเพิ่มเติม) ก่อนเสมอ เพื่อให้เข้าใจว่าขณะนี้ระบบมีการอัปเดตอะไรบ้าง ฟังก์ชันใดที่มีการเปลี่ยนแปลง และโครงสร้างใดที่ทำงานอยู่แล้ว ห้ามเริ่มลงมือเขียนโค้ดหรือแก้ไขโดยไม่อ่าน `SUPPLEMENTAL_RULES.md`
- **บังคับบันทึกประวัติทุกครั้งที่มีการอัปเดตใหม่ (Mandatory Post-Update Logging):** ทุกครั้งที่มีการอัปเดตระบบใหม่ หรือเพิ่มฟังก์ชันใหม่ ต้องเขียนบันทึกประวัติการพัฒนาลงใน `SUPPLEMENTAL_RULES.md` เสมอ โดยระบุ วันที่, วัตถุประสงค์, รายการไฟล์ที่แก้ไข, รายละเอียดฟังก์ชัน, และผลการทดสอบ

---

## 1. Core Execution Protocol (The Master Developer Rules)
For EVERY user input (requirement, bug, idea, or refactor), you MUST execute the following sequence before writing any code. Never skip steps.

**Step 0: Mandatory Supplemental Rules Check**
- Always read `SUPPLEMENTAL_RULES.md` first to synchronize with the latest project updates, active modules, and existing conventions.

**Step 1: Environment Discovery (Inspect & Read)**
- Analyze the user request. Identify direct impacts, related dependencies, and out-of-scope areas.
- If necessary, search the repository and existing docs first. Do not guess filenames, schemas, or behaviors.
- *Zero Assumption:* If the user's requirement is vague, ask clarifying questions before proceeding.

**Step 2: Analysis & Hypothesis (Plan)**
- State the root cause of the issue (if debugging) or the rationale for the implementation.
- Identify potential risks (e.g., Data integrity, Compatibility with Longdo Map, UI responsiveness).
- Always prepare a fallback/rollback plan.

**Step 3: Implementation (Modify)**
- Solve the root cause, not just the symptom.
- Make the minimal necessary changes. Do not perform broad refactoring unless explicitly requested.
- Never hardcode secrets, tokens, or DB URLs. Always use `.env`.

**Step 4: Validation & Changelog (Verify & Record)**
- Detail how the implementation will be tested (Static checks, UI states, Error handling).
- Ensure UI handles 4 states: Loading, Empty, Error, Success.
- **Append Update Entry:** Record the completion details and test results into `SUPPLEMENTAL_RULES.md`.

---

## 2. Project Architecture & Tech Stack Rules
You must strictly implement the DOH_Pattani_Flood system using this stack:

**2.1 Framework & Core:**
- Next.js (App Router) with React Server Actions for mutations.
- TanStack Query (React Query) for client-side data fetching and state management.
- Path Routing: 
  - `app/` (Public Citizen View)
  - `app/admin/` (Protected Admin & Executive Dashboard)

**2.2 Database & Storage:**
- **PostgreSQL / Supabase** (PostGIS extension for spatial operations).
- Implement PL/pgSQL RPC Functions for complex transactions (`doh_get_system_data_rpc`, `doh_update_timeline_rpc`).
- **Offline Sync:** Use IndexedDB for offline field reporting, syncing with Real-time DB listeners upon network recovery.

**2.3 UI & Styling (Mobile-First & Flat Design):**
- shadcn/ui + Tailwind CSS.
- Leaflet + OpenStreetMap + Longdo HD layers.
- Responsive container with ResizeObserver for full-canvas map viewport.

**2.4 Routing & Microservice:**
- Local OSRM microservice (`server/routing-service.mjs`) on port 5000 with multi-tier failover.
- Bidirectional detour advice generation with subdistrict (`ต.`), village (`บ./ม.`), real road names, and natural Thai maneuvers.

---

## 3. Strict Prohibitions
- **NO Mock Code Left Behind:** Any temporary scripts, mock data files, or test components MUST be deleted immediately after validation.
- **NO Blind Refactoring:** Do not rewrite untouched components just to "clean them up".
- **NO Over-Engineering:** Build what is required efficiently.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
