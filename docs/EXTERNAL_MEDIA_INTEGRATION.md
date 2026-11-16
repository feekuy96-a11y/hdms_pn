# Google Drive media and Google Sheets reporting

New HDMS photos are first staged in Supabase Storage through `hdms-api`. The browser stores that temporary public URL in the existing database field. A durable Supabase outbox then copies the media to Google Drive and the report to Google Sheets in the background. Supabase remains the source of truth.

## Edge Function secrets

| Variable | Purpose |
| --- | --- |
| `APPS_SCRIPT_WEB_APP_URL` | Deployed Apps Script `/exec` URL |
| `APPS_SCRIPT_API_SECRET` | Shared secret stored in Edge Function and Apps Script properties |
| `GOOGLE_DRIVE_FOLDER_ID` | Optional fallback when using direct Drive API |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Optional fallback service account email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Optional fallback PKCS8 key; escaped `\\n` is accepted |

None of these variables use the `NEXT_PUBLIC_` prefix. They are not required during the static website build.

The recommended setup uses only the two Apps Script variables. Run `setupHdmsIntegration` once; it creates the Drive folder and spreadsheet under the approving Google account. The three service account variables remain an optional fallback if Apps Script is not configured.

## Save lifecycle

1. The browser compresses flood evidence to at most 300 KB or validates project images at at most 500 KB.
2. `uploadExternalMediaAction` validates the image, writes it to the public `hdms-media-staging` bucket, and inserts a `MEDIA` outbox job. It returns the temporary URL without waiting for Google.
3. The incident or project saves that URL in Supabase. If the save fails before a media reference exists, `deleteExternalMediaAction` removes the temporary image and pending job.
4. Database triggers insert a `REPORT` job in the same transaction as a saved flood route, detour, or project. `syncReportingRowAction` only wakes the worker after the form finishes all writes. `EdgeRuntime.waitUntil` processes pending work after the response. Worker retries use exponential backoff and a `SKIP LOCKED` claim; an Admin read triggers recovery after Edge interruption. The job UUID is reused as the Drive idempotency key, then `doh_promote_staged_media` replaces every matching URL atomically without changing `updated_at`; only then is the temporary object removed.
5. Migration `20261116093000` schedules a lightweight worker wake-up every two minutes. Failed jobs after eight attempts still require inspection and manual requeue; there is no operator UI for that yet (KI-010/B-021).

## Deployment order

1. Paste `integrations/google-apps-script/Code.gs` into the Apps Script project and run `setupHdmsIntegration` on first setup.
2. Deploy it as a Web App.
3. Set `APPS_SCRIPT_WEB_APP_URL` and `APPS_SCRIPT_API_SECRET` as Edge Function secrets.
4. Apply `supabase/migrations/20261116090000_async_external_integrations.sql` (new bucket, outbox table, claim RPC).
5. Deploy `supabase/functions/hdms-api/index.ts`.
6. Apply `supabase/migrations/20261116093000_schedule_external_jobs.sql` after Edge deployment.
7. Deploy the static website and verify a new image reloads while staged, then later resolves to the Drive URL and a matching Sheets row appears.

## Updating an existing Apps Script deployment

The repo now contains duplicate-upload protection and stale-report prevention in `integrations/google-apps-script/Code.gs`. They do not become active until the existing Web App is updated: replace its `Code.gs`, save, then use **Deploy → Manage deployments → Edit → New version → Deploy**. Editing the existing deployment keeps the `/exec` URL unchanged. Afterward, retrying the same MEDIA job must return the existing Drive file and an older `updatedAt` REPORT must return `operation: "skipped-stale"`.

Rollback the website first, then restore the previous Edge Function. Existing Drive URLs remain readable and existing Supabase Storage URLs remain supported.

## Verification status

- Lint, TypeScript, static production build, Admin regression and mobile smoke pass locally.
- Browser integration tests use mocked API responses to verify stage → database URL → queue order and cleanup after a simulated database failure.
- Production schema contains `doh_promote_staged_media` and Edge `hdms-api` v18 is active. A read-only queue action returned HTTP 200 with zero pending/processing/failed jobs, and a no-match RPC call returned zero promoted rows.
- The Apps Script source has not been remotely published from this repository because no Apps Script deployment project identifier or deployment channel is available here. Complete the update above before claiming retry idempotency and stale REPORT protection through Apps Script are live.
