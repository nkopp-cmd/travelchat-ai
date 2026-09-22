# Native Google listing photos — Cloudflare preview

Date: 2026-09-22. Target: `localley-discovery-preview` at `https://preview.localley.io` (Access-protected).
This ports the venue gallery from `release/authentic-discovery` (`60ffc7c`). That branch failed its Vercel gate on 2026-09-22:
the Upstash limiter timed out, so every gallery returned 503. The native port uses no Upstash.

## Delivered

- Source `de5c7a9`, [PR149](https://github.com/nkopp-cmd/travelchat-ai/pull/149), merge `7a3c14f142946d59ed78bd4a0843b414c02bb6f0` (same tree). PR CI `35785361462` passed.
- Worker version `1b77837e-b372-4a2c-8439-72d75f411f3a`, 100%, tagged with the merge; deployment `70848e15-c9ba-43d8-adf3-02cb9389b991`.
- Rollback Worker `9129f4b6-e893-4441-afc1-c5bb66e3595c`. Keep the additive table; `DROP TABLE spot_listing_places` restores the prior schema (rehearsed on the restored backup).
- D1 backup before release: SHA-256 `bf5dbfe4c3a44485e4e02e6a83b9db21abfcac3db95a620f766161c9d18ac85b`; restore and rollback rehearsal passed.
- Remote migration `0012_listing_places.sql` through Wrangler tracking, then `pilot/listing-places.sql` (5 rows). All 17 checked existing tables kept identical hashes.
- New bindings only: `LISTING_LIMITER`, `LISTING_MEDIA_LIMITER` (Workers rate limiting) and preview secret `GOOGLE_PLACES_API_KEY`. Access policies unchanged.
- The read-only Access service token was refreshed in place (expired 2026-09-22T15:42Z, now 2026-09-23T21:14Z). Policies unchanged.

## Hosted photo gate — passed

| Spot | Gallery | First photo |
| --- | --- | --- |
| Seodaemun Independence Park | 4 photos, attributed | 200 JPEG, park memorial plaza |
| Gwangjang Market | 4 photos | 200 JPEG, market gate sign |
| Dongdaemun Design Plaza | 4 photos | 200 JPEG, DDP (older construction-era photo) |
| Gyeongbokgung Palace | 4 photos | 200 JPEG, Geunjeongjeon hall |
| Cheonggyecheon Stream | 4 photos | 200 JPEG, the stream |
| SeMA, Jongmyo, Sewoon | unavailable (no stored listing), no provider call | — |

- All five opened photos show the named venue. Galleries answered in 101–180 ms after warm-up (first call 1.4 s).
- Every photo response was `image/jpeg` by magic bytes, `Cache-Control: no-store`.
- Unknown spot 404; a real photo name requested for a different spot 404 (no open proxy); no Access header 302 to Access.
- Rate limit: 60 rapid requests gave 41 × 200 and 19 × 429 (limit 40/min; the binding is per location and eventually consistent).
- UI at 390 and 1440 px: four loaded images with author links, "Localley did not review these photos", "Google Maps" label. Jongmyo shows the honest unavailable state. No page errors.
- Google usage: about 12 billable requests. Ledger line in `shared/plans/SPEND.md`.

Private evidence: `cloudflare/auth-proof/.preview-private/listing-release-TmtcBP/` (`preflight.json`, `release.json`, `hosted/gate.json`, `hosted/ratelimit.json`, screenshots, photos).

## Open before public cutover

- Google Maps Platform terms: Places photos appear on the same page as the OpenStreetMap/Leaflet map. Confirm the applicable (EEA) terms, or show photos away from the non-Google map.
- Listing photos can be old (the DDP photo shows construction). The label says Localley did not review them.
- Only 5 of 8 preview spots have a stored listing. Imported live spots get listings from their own photo references (see the import runbook).
