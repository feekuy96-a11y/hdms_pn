# Public offline mode (opt-in)

Public HDMS can reopen its last prepared public map on the same browser. It is not a live traffic read: the last saved response time is shown on the map and in the dossiers. The displayed report may no longer describe safe travel. A device that has never opened a connected public page cannot start the site offline. Browser storage may be disabled, cleared or evicted.

## Release boundary

- Build with the default (unset or `NEXT_PUBLIC_HDMS_PUBLIC_OFFLINE=0`) to keep it off. Existing legacy `/sw.js` is unchanged and never loads the opt-in implementation. The new public page does not register a worker in this mode.
- A flag-enabled build (`NEXT_PUBLIC_HDMS_PUBLIC_OFFLINE=1`) registers the distinct `/sw-public-offline.js` under the deployment's base path on the public page only. When it takes control, it deletes the two owned legacy HDMS caches, not arbitrary Cache Storage entries. Auth, admin, API and non-public navigations stay network-only. It never fetches or stores third-party tiles, photos, credentials or device location for offline use.
- Preparation occurs after the public map has rendered while connected. The worker compares the rendered page's resources to the current public HTML, checks each selected asset's successful nonempty response and size, then switches the index to the verified complete generation. The last two complete generations are kept; failed or abandoned generations are never selected. An installed worker without a complete generation shows the explicit offline fallback.
- At most 180 assets and 24 MiB per complete shell; any individual response must be ≤4 MiB. The published map display cache is a separate single projection (24-hour reload expiration, 1 MiB) without source responses, media, notes, staff or directory records. A public snapshot does not include a full basemap, photos and photo albums, history, contact directory or alerts.
- To turn the feature off after opt-in, deploy this code with the flag unset/off. A **connected** visit to the public page unregisters only the matching opt-in worker and deletes its scope-specific generations/index and public display snapshot. It preserves unrelated browser data and registrations. Close/reopen the tab to release any existing controller. Disconnected devices cannot receive the change until they reconnect. Reverting straight to an older build lacking retirement logic is not a substitute for deploying the flag-off build first.

## Verification

1. Build the flag-off export with `BASE_PATH=/hdms_pn NEXT_PUBLIC_HDMS_PUBLIC_OFFLINE=0 npm run build:pages`. Move `out` to a separate workspace path so it is not overwritten.
2. Build the flag-on export with `BASE_PATH=/hdms_pn NEXT_PUBLIC_HDMS_PUBLIC_OFFLINE=1 npm run build:pages`.
3. Run `BASE_PATH=/hdms_pn PLAYWRIGHT_STATIC=1 HDMS_TEST_PUBLIC_OFFLINE=1 HDMS_TEST_OFFLINE_DISABLED_OUTPUT=/absolute/path/to/off/export npx playwright test tests/e2e/public-offline.spec.ts tests/e2e/public-offline-upgrade.spec.ts`. Use a loopback-only mock public endpoint for test builds; the E2E reads are fixture-routed, not production writes.

The upgrade regression serves actual export assets over loopback with a version-specific required script intentionally returning 503. Offline views retain the previous complete release, then switch after the missing asset is restored. The rollback regression runs the real flag-off export and verifies legacy preservation, opt-in retirement and unrelated cache preservation.
