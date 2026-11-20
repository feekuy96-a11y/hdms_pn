# HDMS agent rules

## Scope and evidence

- Inspect only files needed for the assigned task. Preserve unrelated working-tree changes.
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
