# HDMS Google Drive and Sheets Web App

This Apps Script creates the HDMS Drive folder and reporting spreadsheet, stores uploaded evidence, and maintains one reporting row per HDMS record. Supabase remains the operational data source; a Sheets failure does not roll back the HDMS record.

## Setup

1. Open [script.google.com](https://script.google.com), create a **New project**, and paste `Code.gs` over the sample code.
2. Select `setupHdmsIntegration` in the function list and click **Run**. Approve Drive and Sheets access when Google asks.
3. Open **Execution log**. The returned JSON contains `folderUrl`, `spreadsheetUrl`, and the generated `apiSecret`. Keep the secret private.
4. Click **Deploy → New deployment → Web app**. Choose **Execute as: Me** and the access option that allows the Supabase Edge Function to call it, then deploy.
5. Copy the `/exec` Web App URL into `APPS_SCRIPT_WEB_APP_URL`. Put the generated secret into `APPS_SCRIPT_API_SECRET` in Supabase Edge Function secrets.
6. Open the Web App URL in a browser. A valid deployment returns JSON containing `"ok":true` and `"configured":true`.

The setup function is safe to run again. It reuses the saved folder and spreadsheet instead of creating duplicates. The Apps Script runs as the Google account that approved it, so this setup does not require a Google service account.

The script updates rows by `idempotency_key`, so a retry does not create a duplicate. Values beginning with spreadsheet formula characters are stored as text. Uploaded images are limited to 500 KB and the script makes each saved image readable by link for the public map.
