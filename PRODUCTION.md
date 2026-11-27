# Production deployment

> **อัปเดตล่าสุด (2026-11-19):** ปรับให้ตรงกับโค้ดจริงในรีโป สถาปัตยกรรมเต็มดู `docs/ARCHITECTURE.md` และแผนปรับโครงสร้างหน้าแอดมินดู `docs/ADMIN_ROADMAP.md`

The production web site is deployed as a static export on GitHub Pages (`npm run build:pages` → `out/`). Node.js 24/Docker remains available only as a secondary local/LAN option. Existing operational browser calls go through `lib/hdms-api.ts` → Supabase Edge Function `hdms-api` (and the documented public read fallback). The private road-closure form generates an SQL statement only; no closure storage requests are made by the browser. No privileged server credentials are embedded in the web build.

1. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the web build (`.github/hdms-public.json` holds public deployment config only, never service-role secrets).
2. Verify Supabase tables, RPCs, grants, and RLS against `docs/ARCHITECTURE.md` before release. Public reads use `doh_get_public_system_data_display_rpc` (excluding inactive/Draft rows).
3. Run `npm ci`, `npm run check:deploy` (`eslint --max-warnings=0`, `tsc --noEmit`, `build:pages`), and `PLAYWRIGHT_STATIC=1 BASE_PATH=/hdms_pn npm run test:e2e` (install Chromium with `npx playwright install chromium` first).
4. GitHub Actions CI (`.github/workflows/ci.yml`) runs lint, typecheck, `build:pages`, and Playwright static E2E on PRs and `main`; `.github/workflows/deploy.yml` triggers only after `CI` succeeds on `main` via `workflow_run` (with `workflow_dispatch` kept for emergency manual deploys).

## Edge Function (`supabase/functions/hdms-api/index.ts`) and Current Auth Posture (`B-001`)

- Deploy `supabase/functions/hdms-api/index.ts` with `supabase/config.toml` (`verify_jwt = false`).
- Read-only actions (`READ_ONLY_EDGE_ACTIONS`) use the anon/publishable client under RLS (or server-side Google Maps proxy keys).
- **Important (`B-001` — Accepted Risk by System Owner on 2026-11-16):** The `/admin/` route currently opens directly without a login screen as requested, and mutation actions in `hdms-api` currently execute with `SUPABASE_SERVICE_ROLE_KEY` **without** JWT or `app_metadata.role` verification. Input validation (`traffic`, `detourDir`, coordinates, etc.) enforces data shape only; CORS is **not** an authorization control.
- Mitigations & future opt-in Supabase Auth (`app_metadata.role = admin/doh_admin` + DB Audit Trail + Rate Limit) are tracked in `docs/BACKLOG.md` (`B-001`) and `docs/ADMIN_ROADMAP.md` (Phase 1 & Phase 4.3).

## Private road-closure storage

- In the incident detail form, prepare and copy the closure SQL. Nothing is saved by the web app. Review it and run it manually only in the existing HDMS project's Supabase SQL Editor. The statement inserts at most one new row keyed to that event. An existing row is never overwritten; no returned event ID means no new row was saved.
- The statement contains the incident details and any attached photos. Do not share it outside the trusted project console. The form, map preview and prepared SQL are held in memory only. The site does not read, migrate or delete old localStorage entries, open a public preview, update the public map, queue writes or call reporting integrations.
- Production status, 2026-11-27: the owner-authorized SQL Editor run applied the additive schema to the HDMS database. The table, three RLS policies and trigger were confirmed in the catalog; this does not confirm a Supabase CLI migration ledger entry. No closure records were inserted. Do not reapply the migration just to make the form work. Verify import with synthetic data in a disposable or staging database, not in production.
- Rollback: revert the web change and preserve the table and any saved records. No Edge Function change is needed.

## Rollback & Static Export Notes

- GitHub Pages does not run Next.js Server Actions or middleware. Client API adapters live in `app/actions/doh-actions.ts`.
- Service-role credentials and upstream API keys (`GOOGLE_MAPS_API_KEY`, `APPS_SCRIPT_WEB_APP_URL`) must remain in Supabase Edge Secrets only.
- Rollback order: revert web commit (`git revert <sha>`) or re-deploy previous Edge Function version together if the API contract changed. Preserve additive database migrations (`deleted_at`, `event_detour_links`, etc.) during application rollback.
