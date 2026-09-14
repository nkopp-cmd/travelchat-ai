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

Catalog chat in this increment answers from published D1 spots only. It is not GLM.
