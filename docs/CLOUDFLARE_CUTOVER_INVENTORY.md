# Cloudflare cutover inventory — 2026-09-21

## Verified current state

The public apex and www hosts return HTTP 200 with Vercel origin headers. DNS hosting alone is not application migration.
The protected Cloudflare preview is not a replacement for the entire live application.
Existing live Clerk and Stripe API credentials are available and accepted. Supabase service-role export access works.
SQL/management credentials remain absent, but that does not block read-only application-data export to Cloudflare.

## Source custody now on Cloudflare

The new source snapshot tool exports every REST-exposed application table discovered through the authorized OpenAPI schema.
It uses primary-key ordering, exact counts, private files and a second read/hash comparison. It never writes to the source.
This establishes observed source stability, not a transactional snapshot or a final cutover write freeze.
It preserves raw JSON bytes, including numeric representations, and refuses partial exports as complete evidence.

- **48 tables / 5,502 rows** exported and verified.
- Includes 5 profiles, 85 itineraries, 115 conversations, 173 messages, 3 subscriptions and 3,295 spots.
- EU R2 bucket: `localley-migration-backups`; public development endpoint disabled, no custom domains.
- Archive SHA-256: `7a1c66c6a90a12fada700b66aabfccbdd9b366d1b085d12b5d71e12d2b25783f`.
- Prefix: `source-20260921/7a1c66c6a90a12fada700b66aabfccbdd9b366d1b085d12b5d71e12d2b25783f/`.
- `archive.json` describes six ordered, hashed parts. All parts were downloaded, reassembled, restored, and independently verified.
- Source manifest SHA-256: `2428ac6f34b47b877e79dc9880fce02cecfe70a0ff2d579cf5aadc8ab35269f4`.
- A single-object 93 MiB upload returned 502. Read-back confirmed absence; smaller parts succeeded. No uncertain write was blindly retried.

This archive excludes Clerk's account/password export, database functions, non-exposed tables, and unrelated Storage objects.
It is a migration backup, not live D1 application data.

## Story media prepared for R2-backed data

Twelve source itinerary rows exceeded D1's 2 MiB row limit; the largest was 23,711,386 bytes.
The media migration tool extracts inline PNG/JPEG bytes and copies existing referenced media without generating replacements.
All **223 references** resolve to **222 unique objects**, totaling **482,060,794 bytes**.
Magic bytes determine extensions; WebP and unapproved origins are rejected. Redirects do not forward credentials.

The 147 Supabase references used public URLs for a private `generated-images` bucket.
Authorized reads through the documented authenticated Storage endpoint recovered every object without changing bucket permissions.
The other references were 49 inline images and 27 existing Pexels story images. These remain cinematic story media, not proof of a venue.

- EU R2 bucket: `localley-legacy-media`, private, no public endpoint or custom domain.
- Content-addressed object keys: `legacy/<sha256>.png` or `.jpg`.
- All 222 uploaded objects were downloaded and hash-verified. One interrupted verification was reconciled read-only, without re-uploading.
- The 85 projected itinerary records reference private `r2://` keys. The largest projected row is now **11,797 bytes**.
- Projection bundle: `localley-migration-backups/story-projection-20260921/6b0742d6a9bf26ddb00784f266ebf75da4057755071dfd8c564d4c1432ed9cc8.tar.gz`; read-back hash verified.
- The live database still retains its original values. Private R2 references require an authorized native media-serving route before live use.

## Identity reconciliation is not an email join

Five live Clerk users and five source profiles exist, but only three Clerk IDs overlap.
Two source profiles have no current Clerk account; two current Clerk accounts have no source profile.
All 85 itineraries and 115 conversations map to known source owners. All 173 messages have their conversation.
Two of the three subscription rows belong to current Clerk users without profiles. All three database subscription rows are active/free; this does not certify Stripe-wide revenue or entitlement state.
Do not automatically merge identities by matching email, drop historical owners, or create paid access from these observations.

## Required before public cutover

1. Implement verified D1 imports from the snapshot, including explicit owner mappings and preserved unclaimed history.
2. Complete native conversation/history, subscription/webhook, guide/admin, and remaining product API parity.
3. Serve existing media from private R2 through owner/shared-itinerary authorization; port rendering/background jobs with existing safety constraints.
4. Port the complete user-facing application routes and design system, rather than replacing them with the restricted proof shell.
5. Prove real hosted signup, email delivery, login, recovery, ownership claims and isolation with authorized human sessions.
6. Freeze or reconcile final source writes, repeat exports/deltas, verify import counts/hashes and rollback, then route apex/www to the verified production Worker.

Backups and native preview tests are not proof that this checklist is complete. No percentage is derived from route or table counts.

## Operator commands

```sh
node scripts/cloudflare-source-snapshot.mjs --out NEW_PRIVATE_DIRECTORY
node scripts/cloudflare-source-snapshot.mjs --verify PRIVATE_SNAPSHOT
node scripts/cloudflare-story-media.mjs PRIVATE_SNAPSHOT NEW_PRIVATE_MEDIA_DIRECTORY
node scripts/cloudflare-media-upload.mjs --apply PRIVATE_MEDIA_DIRECTORY
node --test scripts/cloudflare-source-snapshot.test.mjs scripts/cloudflare-story-media.test.mjs scripts/cloudflare-media-upload.test.mjs
```

Run heavy work through the shared wrapper. The exporter reads only the app's pinned production source from `.env.local`.
Keep archives, projected rows and manifests in private storage; never commit them or expose either migration bucket publicly.
