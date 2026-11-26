# HDMS administrative boundaries: data attribution and build

## Attribution

- **Boundary lines:** Royal Thai Survey Department (กรมแผนที่ทหาร), acquired by ICRC and made available by OCHA Field Information Services Section through [OCHA COD-AB Thailand / Humanitarian Data Exchange](https://data.humdata.org/dataset/cod-ab-tha). [Creative Commons Attribution 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/).
- **Distributor and adaptation:** [GeoThai/boundaries v2026.10.23](https://github.com/GeoThai/boundaries/releases/tag/v2026.10.23), [upstream NOTICE](https://raw.githubusercontent.com/GeoThai/boundaries/v2026.10.23/NOTICE), [source manifest](https://raw.githubusercontent.com/GeoThai/boundaries/v2026.10.23/manifest.json). GeoThai relabelled p-codes to DOPA codes, linked three legacy shapes to current subdistricts, simplified lines to 5% of source points, and derived district/province outlines from the subdistrict layer.
- **Names and codes:** [GeoThai/data v2026.10.22](https://github.com/GeoThai/data/tree/v2026.10.22), [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).
- **HDMS changes:** joined by DOPA codes, kept Thai names and shared-geometry membership, and repackaged by selected administrative area. Coordinates are unchanged after GeoThai processing. Informational map overlay only, not a legal boundary or evidence of endorsement by a data provider.

All 77 provinces and 928 districts have distinct outlines. All 7,436 subdistrict codes can be selected; 7,418 have an individual outline and the remaining 18 Bangkok khwaeng share seven outlines from the source. The shared outline uses a different dash pattern and the UI discloses all members. No separate line is invented.

## Reproduce

`npm run generate:admin-boundaries` fetches six pinned assets (public versioned raw GitHub URLs) and checks each byte against the SHA-256 in `scripts/build-admin-boundaries.mjs`. No credentials are required. Standard npm dev, server build and Pages build scripts run it automatically. With an existing verified cache, run `HDMS_GEOTHAI_OFFLINE=1 npm run generate:admin-boundaries`; use `HDMS_GEOTHAI_CACHE` for another cache directory. Cache filenames are the keys in the script’s checksum table. A wrong checksum fails the build; remove the mismatched cache file before trying a clean fetch. Keep cache and generated assets out of Git. The attribution document also ships with the generated distribution.

The on-demand index `public/boundaries/th/index.json` lists 77 province names only. Each `{areaCode}.json` contains that area's Polygon/MultiPolygon and only its direct children's names. The client does not fetch these while the layer is off. On enable it fetches the index and Pattani; selection then requests exact area assets. Parent changes reset descendants; failures can be retried and don't prevent ordinary map use. The read-only overlay sits beneath incident/road layers, captures no pointer events and does not change records, map routing, or database/API contracts.
