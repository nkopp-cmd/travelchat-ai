# Cloudflare go-live gates

Public `localley.io` stays on Vercel until these pass. Do not point DNS at Access-protected preview.

## Ready on preview

- Catalog, map, saves, Better Auth, email preferences, trends pipeline
- Trips: create, catalog generate, duplicate, share, edit, delete
- Localley chrome (mark, glass, violet)

## Still required before cutover

1. Preview chat uses `gpt-5.6-luna` when `OPENAI_API_KEY` is bound. Catalog facts still ground the reply. Paid AI itinerary generate, stories, billing, and admin remain unported.
2. Stories, billing, and admin are unported. Worker CPU is 1s.
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

Next AI slice: persistent usage reservations, owner quotas, and validated itinerary generation through this adapter.
Catalog-generated itineraries and basic share pages are not complete equivalents of the existing Localley product.
