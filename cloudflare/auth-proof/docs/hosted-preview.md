# Hosted Preview Evidence

## Current Increment

On 2026-09-12, PR 123 delivered the native collection/editor increment to this restricted preview.
Current version: `7b5ad3c3-f6bf-4bb9-97c9-85e86729bd3a`.
Deployed source: `c5d1446941049bd8663adec1bf6f654e0f4b6cac`.
Migration 0005 was applied after a private backup and in-memory restoration rehearsal.
Live version tags, asset hashes, access checks, maps, photos, and gated Trips navigation passed verification.
Private authenticated acceptance remains open; read-only Access credentials cannot perform the human journey.
See `../../../docs/releases/seoul-discovery.md` for the authoritative release and rollback record.
The earlier checkpoint below is historical.

Verified on 2026-09-11 at https://preview.localley.io.
This restricted preview does not replace the live Localley service.

## Deployment

- Worker: `localley-discovery-preview`.
- Version: `88de0da0-0e10-4e4e-9cf7-1f12b4be1c04`.
- Configuration: `../wrangler.preview.jsonc`.
- Startup time reported by Cloudflare: 63 ms.
- Both `workers_dev` and preview version URLs remain disabled.
- Static assets pass through the Worker and its Access checks.
- Access permits one reviewer and a separate read-only service identity.
- The service credential expires at `2026-09-12T03:28:48Z`.
- Preview secrets are separate from live credentials.

The initial deployment had no route. Access policy checks passed before domain attachment.
No Vercel deployment, live-domain switch, customer import, or plan purchase occurred.
Cloudflare accepted the configured CPU limit. This does not measure authentication CPU usage or establish costs.

## Database

D1 `localley-migration-preview` has ID `e943548b-01ae-485d-9219-e2a46cb0da8e` and EU jurisdiction.
Before initialization, it contained only Cloudflare and migration metadata tables.
Migrations 0001 through 0004 applied successfully to this database only.
The reviewed `pilot/import.sql` loaded three public places.
The runtime purpose marker is `localley-preview`.
After hosted checks, the database contained three places, zero users, and zero mail attempts.

## HTTP Checks

| Path | Anonymous | Service credential |
| --- | --- | --- |
| `/` | 302 to Access | 200 |
| `/api/health` | 302 to Access | 200 |
| `/api/app-config` | 302 to Access | 200 |
| `/api/spots` | 302 to Access | 200, three places |
| `/api/session` | 302 to Access | 401 |
| `/api/account/claim` | 302 to Access | 404 |
| `/api/auth/get-session` | 302 to Access | 403 |

A service-authenticated signup POST returned 403 without creating a user or sending mail.
These checks do not establish human authentication or email delivery.

## Browser Review

Chromium checked the hosted page at widths 390, 900, and 1440 pixels.
The reviewer opened all three full-page screenshots.
Evidence remains in ignored `.preview-private/hosted-{width}.png` files.
The private harness is `.preview-private/check-hosted.mjs`.
It attaches service credentials only to the exact preview origin, never to map requests.

- All three place entries and both licensed photos loaded.
- Real OpenStreetMap tiles loaded at each width.
- Place selection opened the matching map popup.
- No horizontal overflow or JavaScript page errors occurred.
- Mobile controls wrapped without clipping their labels.
- The portrait stream photo remained uncropped with neutral space beside it.
- The park showed an explicit missing-photo message, not a substitute image.
- The preview banner and source credits remained visible.

The first browser attempt stopped because the configured Chromium version was absent.
Installing the matching browser in the ignored local directory resolved that tooling issue.

## Remaining Checks

Human Access sign-in, preview registration, verification delivery, recovery, and authenticated saves remain unverified on the host.
The service identity deliberately cannot perform those checks.
Use a separate preview password. Do not import or link a live account.
The preview mail limit remains five attempts per UTC day.

This pilot has three places and two photos, not full Seoul coverage.
The local package passed 41 runtime tests, environment isolation, types, lint, build, and package inspection.
Hosted zoom, measured contrast, screen-reader behavior, and other browser engines still need checks.
The migration, production release, and paid media activation remain incomplete.
