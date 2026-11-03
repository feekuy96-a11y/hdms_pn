# Production deployment

Run the same application on Node.js 24/Docker or GitHub Pages. Both call the shared Supabase Edge Function `hdms-api`; no server credential is required by either web build.

1. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the web build. `.github/hdms-public.json` contains public deployment configuration, not privileged credentials.
2. Set `app_metadata.role` to `admin` or `doh_admin` for authorized Supabase users, through a trusted administrative process. User metadata does not grant access.
3. Verify Supabase tables, RPCs, grants and RLS against the intended authorization model before release.
4. Run `npm ci`, `npm run check`, and `npm run test:e2e` (install Chromium with `npx playwright install chromium` first).
5. Server: `npm run build:server` then `npm start`, or build/run the Docker image. Pages: `BASE_PATH=/hdms_pn npm run build:pages`; deploy `out/`. CI verifies both builds. The Pages workflow deploys main only.

Deploy `supabase/functions/hdms-api/index.ts` with the function configuration in `supabase/config.toml`. Platform JWT checking is disabled because public reads are supported; every mutation separately validates the access token with Supabase Auth, checks the current user app_metadata role, and uses the user-scoped database client under RLS. This function never accepts a table name or RPC name supplied by the browser. CORS allows the two web deployments; CORS is not an authorization control.

The `/admin/` route opens directly without a login screen as requested. The shared Edge API still requires an authenticated admin session for data mutations; this prevents an openly reachable `/admin/` page from becoming an unrestricted delete/update endpoint.

ESLint uses Next's configuration with explicit legacy GIS exclusions. Passing lint does not establish that the excluded hook and dynamic typing rules have been remediated. Production dependency audit passed; development dependencies include known moderate advisories and ESLint 9 is retained because bundled Next lint plugins do not support ESLint 10 yet.

Rollback: restore the previous application image and environment configuration. Applied migrations add deleted_at columns, strengthen admin policies, and add metadata plus doh_import_routes_rpc. Preserve these additive database changes during application rollback.

GitHub Pages does not run Next.js Server Actions or middleware. The application therefore uses client API adapters in `app/actions/doh-actions.ts` for both deployments. Credentials with service privileges must never be placed in web build variables or GitHub Pages artifacts. Roll back the web artifact and Edge Function together when reverting the shared API contract.
