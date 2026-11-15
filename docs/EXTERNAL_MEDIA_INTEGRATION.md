# Google Drive media and Google Sheets reporting

Large HDMS photos are uploaded through `hdms-api` to Google Drive. The browser receives only the public media URL and saves that URL in the existing database fields. Google Sheets receives a reporting copy after the database save succeeds.

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
2. `uploadExternalMediaAction` validates the data URL again, uploads it to Drive and grants read access.
3. The incident or project stores the returned Drive URL. If the database save fails before a media reference is persisted, `deleteExternalMediaAction` removes the uploaded file.
4. `syncReportingRowAction` sends a bounded reporting payload to Apps Script and waits for an `{ ok: true }` response. A Sheets failure shows a warning after the HDMS save; it does not undo the saved incident.

## Deployment order

1. Paste `integrations/google-apps-script/Code.gs` into a new Apps Script project and run `setupHdmsIntegration`.
2. Deploy it as a Web App.
3. Set `APPS_SCRIPT_WEB_APP_URL` and `APPS_SCRIPT_API_SECRET` as Edge Function secrets.
4. Deploy `supabase/functions/hdms-api/index.ts`.
5. Deploy the static website.

Rollback the website first, then restore the previous Edge Function. Existing Drive URLs remain readable and existing Supabase Storage URLs remain supported.

## Verification status

- Lint, TypeScript, static production build, Admin regression and mobile smoke pass locally.
- Browser integration tests verify upload → database URL → reporting order and compensating deletion after a simulated database failure.
- Google Drive and Apps Script still require an end-to-end staging check with real secrets. Do not mark external integration complete until an uploaded image can be reloaded from its saved public URL and the matching Sheets row is confirmed.
