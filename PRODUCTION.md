# Production deployment

Run on Node.js 24 or Docker. GitHub Pages static deployment is no longer supported.

1. Configure variables documented in `.env.example` in the hosting secret manager.
2. Set `app_metadata.role` to `admin` or `doh_admin` for authorized Supabase users, through a trusted administrative process. User metadata does not grant access.
3. Verify Supabase tables, RPCs, grants and RLS against the intended authorization model before release.
4. Run `npm ci`, `npm run check`, and `npm run test:e2e` (install Chromium with `npx playwright install chromium` first).
5. Start with `npm start`, or build the Dockerfile and run its image. Public variables must be supplied as Docker build arguments; secret keys must only be supplied at runtime.

Release verification still requires a staging account and configured Supabase server credential. Verify login/logout, every write operation and persistence after restart before enabling production traffic. Current smoke tests cover the public map and unauthenticated admin redirect on desktop/mobile Chromium; they do not certify authenticated admin flows or database policy correctness.

ESLint uses Next's configuration with explicit legacy GIS exclusions. Passing lint does not establish that the excluded hook and dynamic typing rules have been remediated. Production dependency audit passed; development dependencies include known moderate advisories and ESLint 9 is retained because bundled Next lint plugins do not support ESLint 10 yet.

Rollback: restore the previous application image and environment configuration. Applied migrations add deleted_at columns, strengthen admin policies, and add metadata plus doh_import_routes_rpc. Preserve these additive database changes during application rollback.

GitHub Pages cannot run Server Actions, middleware or server-only Supabase credentials. Production requires a Node.js 24 or Docker host; do not re-enable static export for the admin application.
