# Cloudflare go-live gates

See `CLOUDFLARE_CUTOVER_INVENTORY.md` for the 2026-09-21 live source audit, verified private EU R2 backups and media transfer, identity mismatches, and full-product cutover requirements.
Available live Clerk/Stripe credentials and REST export access are confirmed; missing SQL access does not block the completed read-only export.

Public `localley.io` stays on Vercel until these pass. Do not point DNS at Access-protected preview.

## Ready on preview

- Catalog, map, saves, Better Auth, email preferences, trends pipeline
- Trips: create, catalog generate, duplicate, share, edit, delete
- Localley chrome (mark, glass, violet)

## Still required before cutover

1. Preview chat and explicit AI itinerary drafts use `gpt-5.6-luna` when `OPENAI_API_KEY` is bound. Full live-app generation parity, stories, billing, and admin remain unfinished.
2. Stories, billing, and admin are unported. The preview Worker CPU limit is 15s; each migrated workload still needs verification.
3. Hosted human sign-in and recovery on this shell.
4. Access is not consumer login. Remove it only after public Better Auth works.
5. Production SQL/import if live spots must move with the domain.
6. Backup, rollback Worker, and a verified `localley.io` switch.

Chat calls GPT-5.6 Luna with catalog facts and retains a catalog-only fallback.
The September 20 audit found that the first adapter used `redirect: "error"`, which workerd rejects before a provider request.
The replacement uses manual redirects, rejects redirect responses, bounds provider bodies, and accepts only completed Luna assistant output.
Native provider-path tests now cover success, incomplete output, refusals, malformed/oversized bodies, redirects, and no retry.
One real host adapter probe completed: `resp_06da74f5c0ce31fb016aaf76f1bd5887d2a1e2c272030807cb`, 82 input and 6 output tokens.
This is provider acceptance, not hosted account acceptance. The read-only Access identity cannot exercise chat POST.

Native chat now reserves each paid attempt in D1 before calling Luna (migration `0010_ai_requests.sql`).
Preview limits are 20 attempts per owner and 100 globally per UTC day, checked atomically with insertion.
Completed, failed, and uncertain attempts all count. Accounting outages block new provider calls and keep catalog fallback available.
API `aiStatus` distinguishes completion, daily limits, provider unavailability, and accounting faults.
These are persistent request limits, not exact token usage or subscription billing.
Migration `0011_ai_receipts.sql` adds provider IDs/status and nullable input, output, and cached-input counts for chat and itinerary attempts.
Incomplete and rejected outputs retain observed counts; absent or malformed metrics remain unknown. This is not billing settlement.
`POST /api/itineraries/generate` accepts explicit `mode:"ai"` and optional preferences. Default catalog mode remains non-AI.
Luna selects day order and unique published spot IDs; the server reconstructs names, coordinates and addresses from D1.
Unknown IDs, repeated venues, wrong day counts, incomplete output and insufficient coverage fail without saving a trip.
Persistence rechecks the session, owner mapping and spot visibility in one INSERT after the provider wait.
No automatic retry or paid-model fallback. Shared limits remain 20 owner/100 global attempts per UTC day.
Actual structured host probe: `resp_00016ba3d3417215016aafa39a085c87d28872bf08fe68135b`; 603 input/177 output/0 cached tokens; two valid days and six real catalog venues. No database write.
Hosted signed-in generation remains a separate acceptance check; the Access service identity is read-only.
Catalog-generated itineraries and basic share pages are not complete equivalents of the existing Localley product.
