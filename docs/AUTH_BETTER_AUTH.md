# Localley auth: Better Auth (replaces Clerk)

## 2026-09-30: Cloudflare auth mail sender

Magic links, password reset links and email confirmations use the production Worker's `AUTH_EMAIL` send binding. The binding allows only `hello@localley.io` as sender. `FROM_EMAIL` remains the existing Worker secret `Localley <hello@localley.io>`; the auth sender rejects any other value. Every message has HTML and plain text. Cloudflare applies account and sender-domain suppressions; a suppressed send fails without retry or a Resend fallback. The preview Worker retains the isolated D1 outbox and has no email binding. The earlier Resend A3 history below records the former sender, not the current auth sender.

Release evidence: [PR219](https://github.com/nkopp-cmd/travelchat-ai/pull/219) merged as `e1e0178` after 15 focused auth tests, TypeScript, focused lint, diff check and required self-hosted CI `36659990654` passed. The independent advisor reached its eight-turn limit without a result. The merged OpenNext build and production Wrangler dry run passed. Production Worker version `4a7a0329-cdcb-4f69-aa2e-6146d093c543` deployed with `AUTH_EMAIL (unrestricted - senders: hello@localley.io)`; rollback version is `72cc3bca-1b07-4f5d-a1f3-f0fa6fa488bb`. A first deploy attempt stopped at the account selector; rerun with the existing nilskopp account ID succeeded. Live www `/`, `/sign-in`, `/api/auth/ok` and `/api/cities` returned 200. A real magic-link request for the migrated `nkopp@my-goodlife.com` account returned 200 through the live binding. Nils confirmed that the message arrived from `hello@localley.io` on 2026-09-30, but Gmail put it in spam. The current API token lacks Email Sending list and zone analytics read permission, so it cannot verify delivery logs. No app-data D1 switch or token change occurred.

## 2026-09-30: deliverability check

Live DNS resolves Cloudflare's bounce MX records, `cf-bounce.localley.io` SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, the `cf-bounce._domainkey.localley.io` DKIM public key, and apex DMARC `v=DMARC1; p=none;`. The apex has Google Workspace MX records. Its missing SPF was added as one TXT record, `v=spf1 include:_spf.google.com include:_spf.mx.cloudflare.net ~all` (Cloudflare record `e2ce720acf89803a9aa0edaacb754aca`), and `dig` confirmed it. This supports Google Workspace apex mail; Cloudflare Email Sending authenticates with its separate bounce SPF and DKIM selector. Leave DMARC at `p=none` until the received message's Authentication-Results shows actual alignment. Nils will provide those headers and the new controlled test's inbox or spam placement. The sender presents `Localley <hello@localley.io>`, both HTML and plain text, a direct HTTPS Localley link, and a specific subject. Production now rejects links on other domains or non-HTTPS URLs before sending, and never includes untrusted account names in the body.

Delivery evidence: [PR #246](https://github.com/nkopp-cmd/travelchat-ai/pull/246) merged as `558fe68` after CI `36723544766`, seven focused mail tests, TypeScript, focused lint and diff check passed. Advisor review found a user-name link injection path; the code and test now exclude account names. The first merged OpenNext build failed because the pulled Vercel environment carried an invalid Upstash URL placeholder. A retry with only public build variables and `NEXT_PUBLIC_APP_URL=https://www.localley.io` passed; Wrangler production dry run confirmed `AUTH_EMAIL` and `BETTER_AUTH_URL=https://www.localley.io`. Production Worker version `23b84d37-b55d-4405-94c3-4273c4e52691` deployed at 2026-09-30 13:54:59 UTC; rollback version is `4a7a0329-cdcb-4f69-aa2e-6146d093c543`. Live www `/`, `/sign-in`, `/api/auth/ok`, and `/api/cities` each returned 200. One new real magic-link request for `nkopp@my-goodlife.com` at about 13:56 UTC returned HTTP 200. Inbox placement and Authentication-Results remain unverified until Nils checks Gmail; HTTP 200 confirms request acceptance, not inbox delivery. The temporary production build env file was removed. No app-data D1 switch occurred.

Decision: **2026-09-23, Nils.** Replace Clerk with Better Auth in the Next.js app (path B, OpenNext on Workers)
**before** the Cloudflare cutover. Reasons: easier login, free agent testing, no external auth dashboard.
House standard: `CyberLink/CLAUDE.md` ("Auth: Better Auth using the same database").

## 1. Auth store: Cloudflare D1 (not Supabase Postgres)

| Store | Binding | Where |
| --- | --- | --- |
| Preview | `AUTH_DB` -> D1 `localley-auth-preview` (`58b7eef4-2e41-4408-9246-36bc22988200`) | top level of `wrangler.jsonc` |
| Production | `AUTH_DB` -> D1 `localley-auth` | **not created yet** (step A1, approval) |
| `next dev` | local miniflare D1 through `initOpenNextCloudflareForDev()` | `.wrangler/state` |
| Tests / rehearsal | node:sqlite through a D1 shim (`__tests__/helpers/d1-sqlite.ts`) | memory / throwaway file |

Schema: `migrations/auth/0001_better_auth.sql` (generated from `lib/auth/config.ts` with Better Auth's
`getMigrations`), `0002_preview_mail_outbox.sql` (test mailbox, unused in production).

Why D1 and not the Supabase database:

- The app data never had a foreign key to an auth table. Clerk was external; Supabase stores the user id as text
  (`clerk_id`, `clerk_user_id`, `user_id`) and RLS reads `auth.jwt() ->> 'sub'`. "Same database" gives no join or
  constraint here. Keeping the ids (below) is what keeps the data valid.
- D1 is a native Worker binding: no Postgres driver in the 10 MiB bundle, no Hyperdrive, no pooler password.
  No Supabase database password exists in Vercel or `~/secrets/keys.env` today.
- The preview gets a completely separate auth store with zero risk to production. With Supabase the preview would
  need a separate schema in the production project, which is itself a production-database change.
- Path A (native rewrite) already runs Better Auth 1.7.3 on D1; the final platform is Workers + D1.
- Supabase can be removed later without touching auth.

## 2. User ids stay the same

Migrated users get `user.id` = their Clerk id (`user_...`). New users get Better Auth ids. Nothing in Supabase is
rewritten. `ADMIN_USER_IDS` keeps working unchanged.

## 3. Code map

| File | Role |
| --- | --- |
| `lib/auth/config.ts` | Pure Better Auth factory: email+password (verified email required), magic link, password reset, optional Google, account linking by verified email (never to an unverified local user), profile fields `firstName`/`lastName`/`bio`, DB rate limits, 60 s cookie cache. |
| `lib/auth/server.ts` | Server adapter: `auth()` -> `{ userId, sessionId }`, `currentUser()` (Clerk-shaped subset), `getSession()`, `requireUser()` (401), `getAuth()`. Fails closed (signed out) when the store is unavailable. |
| `lib/auth/client.ts` | Client adapter: `useUser()`, `useAuth()`, `signOut()`, `authClient`, `safeRedirect()`. |
| `lib/auth/session-cookie.ts` + `middleware.ts` | Middleware verifies the HMAC signature of the session cookie (no DB). Signed out: pages 307 to `/sign-in?redirect_url=...`, APIs **401** JSON (Clerk answered 404). |
| `lib/auth/mail.ts` | Cloudflare `AUTH_EMAIL` (production) or D1 outbox (`AUTH_MAIL_MODE=outbox`). |
| `lib/auth/user-sync.ts` | Better Auth user hooks upsert Supabase `users` / `subscriptions` (replaces `/api/webhooks/clerk`, which is removed). No welcome email: `CLERK_WEBHOOK_SECRET` was never set in production, so none was ever sent. |
| `lib/supabase-server.ts` | Mints the RLS token that Clerk's `supabase` JWT template issued (HS256, `sub`, `role`/`aud` = authenticated, 60 s) with `SUPABASE_JWT_SECRET`. Without the secret: anon client (old fallback). |
| `app/api/auth/[...all]` | Better Auth handler. |
| `app/sign-in`, `app/sign-up`, `app/forgot-password`, `app/reset-password` | Own pages; `components/auth/*`. `components/auth/user-menu.tsx` replaces `<UserButton />`. |

The multi-city preview API (`/api/v2/trips/preview`) stays behind sign-in (Nils' choice): middleware plus an
explicit `requireUser()` in the route. `/api/viator/search` also got an explicit check.

Session revocation: sign-out and password reset delete the session row at once. A copied cookie pair can still
pass for up to 60 s (cookie cache) — the same window as Clerk's 60 s session JWT.

Pre-registration takeover (someone signs up with another person's email and a password, never verifies): a later
magic-link sign-in by the real owner deletes the unproven password account and sessions (Better Auth built-in,
regression-tested), and Google never links to an unverified local user (`requireLocalEmailVerified`).

Advisor review 2026-09-23 (`advisor --review`, Opus 5.5): the takeover path and the outbox gate were raised as P1.
Both are closed (above; the outbox also refuses any `localley.io` host), the cookie cache went from 5 min to 60 s.

## 4. Sign-in methods

Clerk production, read-only check 2026-09-23 (Backend API, counts only): **5 users, all Google OAuth, no password,
all emails verified, 5 distinct emails, no 2FA/passkeys/phone.**

Better Auth offers: email + password, **email magic link** (works at once for migrated users), forgot/reset
password (creates the first password for migrated users), and Google when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
exist. No Localley Google OAuth client exists in Vercel or `~/secrets/keys.env`, so the Google button stays hidden.
A migrated user who signs in with Google later is linked to the same user id by verified email.

### Google Cloud Console — steps for Nils

Clerk production needs custom Google credentials, so a client probably exists already in your Google Cloud
project (Clerk dashboard -> Configure -> SSO connections -> Google shows its Client ID). Reuse it if you find it.

1. Open https://console.cloud.google.com/auth/clients and select the Localley project (or create one).
2. If asked, configure Branding: app name `Localley`, support email, authorized domain `localley.io`.
   Audience: External, status In production (scopes openid/email/profile need no review).
3. Open the existing web client, or click **Create client** -> Application type **Web application** -> name `Localley`.
4. **Authorized JavaScript origins**: `https://www.localley.io`, `https://localley.io`, `https://next.localley.io`.
5. **Authorized redirect URIs**: `https://www.localley.io/api/auth/callback/google`,
   `https://localley.io/api/auth/callback/google`, `https://next.localley.io/api/auth/callback/google`.
6. Save. Copy the Client ID and Client secret into `~/secrets/keys.env` with
   `secret LOCALLEY_GOOGLE_CLIENT_ID` and `secret LOCALLEY_GOOGLE_CLIENT_SECRET`.
7. An agent then sets them as Worker secrets `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (step A2).

Until then the 5 users sign in with the magic link or "Forgot password".

## 5. Preview and agent testing

Preview Worker: `https://localley-next-preview.nkopp.workers.dev` (vars `AUTH_MAIL_MODE=outbox`,
`BETTER_AUTH_URL`, `AUTH_ALLOWED_HOSTS`; secret `BETTER_AUTH_SECRET`, preview-only random value).
App data stays on production Supabase with the anon key and `SUPABASE_READ_ONLY=true`. The preview has no
service-role key, so signed-in pages that need it (`/settings`, `/profile`, dashboard itineraries) show their error
state there. That is a preview data limit, not an auth failure.

Agents may create test users freely. Use the reserved domain `@preview.localley.test`:

```sh
# verified user + session cookie (JSON: email, password, userId, cookie)
node scripts/auth/preview-test-user.mjs --name mybot
# read verification / magic-link / reset links for a test user
curl "https://localley-next-preview.nkopp.workers.dev/api/test-auth/outbox?email=<addr>@preview.localley.test"
# full browser flow: sign-up -> verify -> protected page -> sign-out -> password sign-in -> magic link
PLAYWRIGHT_BASE_URL=https://localley-next-preview.nkopp.workers.dev npx playwright test e2e/auth-preview.spec.ts
```

`/api/test-auth/outbox` returns 404 unless `AUTH_MAIL_MODE=outbox`, and also on any `localley.io` request host or
`BETTER_AUTH_URL` (a stray outbox setting on production is ignored and real mail is sent). It only reads the
reserved domain.
The preview never sends email. Reset the preview store with
`npx wrangler d1 execute localley-auth-preview --remote --command 'delete from "user"'` (cascades).

Local dev: `npx wrangler d1 migrations apply localley-auth-preview --local`, then put
`BETTER_AUTH_SECRET` (32+ chars), `BETTER_AUTH_URL=http://localhost:3000`, `AUTH_MAIL_MODE=outbox` in `.env.local`.

## 6. Clerk -> Better Auth user migration

`scripts/auth/clerk-to-better-auth.mjs` exports Clerk users (id, email, name, avatar, created) and writes idempotent
SQL (`INSERT ... ON CONFLICT(id) DO NOTHING`; a clashing email aborts). No passwords, no account rows.
`scripts/auth/rehearse-migration.mts` proves every user can sign in as the old id by magic link and by
reset-then-password.

Rehearsal 2026-09-23 on a throwaway local D1 (`wrangler d1 execute --local --persist-to <private dir>`) with the
real export: `{"users":5,"rowsWithSameId":5,"verified":5,"magicLinkKeepsId":5,"resetThenPasswordKeepsId":5,
"accountsBefore":0,"newUsersCreated":0}`. A second import changed nothing. All files were shredded.

## 7. Production checklist — every step needs Nils' approval

**Approval 2026-09-23, Nils: "go ahead"** for A1–A5 and the matching cutover steps P2–P5 in
`CLOUDFLARE_OPENNEXT.md` (production Worker on the staging host `next.localley.io`). A6, P6–P8 and the Vercel domain removal were approved and done later the same day (see
`CLOUDFLARE_OPENNEXT.md` section 6).

Status 2026-09-23 (claude):

| Step | State | Evidence |
| --- | --- | --- |
| A1 | done | D1 `localley-auth` `73378d0e-7f2a-465a-8188-a67cb6d2a5c2` (WEUR) in `env.production`; migrations 0001 + 0002 applied remotely. |
| A2 | done | 35 Worker secrets on `localley-next` (`wrangler secret bulk`): Vercel production runtime values, `GLM_API_KEY` + `APIFY_API_TOKEN` from `~/secrets/keys.env` (Vercel "Sensitive" placeholders), `SUPABASE_JWT_SECRET` from `LOCALLEY_SUPABASE_JWT_SECRET` (checked: Supabase REST accepts a token signed with it, rejects a wrong one), new `BETTER_AUTH_SECRET`, `ADMIN_USER_IDS` = the Clerk id of `nkopp@my-goodlife.com`. `hello@localley.io` got a Better Auth account on 2026-09-23 (magic link, id `eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx`) and was added to `ADMIN_USER_IDS` (Nils); admin API and `/admin/analytics` verified. Flags `WEEKLY_SOCIAL_TRENDS_ENABLED`, `APIFY_SPOT_DISCOVERY_ENABLED`, `MULTI_CITY_PREVIEW_API` are unset = code default off. No Google OAuth secrets. |
| A3 | done | Nils chose (2026-09-23) a **new Resend team** (the one that owns `LOCALLEY_RESEND_ADMIN_API_KEY`); the old send-only key's team is not used by the Worker any more. Domain `localley.io` (id `116e561d-a336-4e21-9080-71cdc1da75ab`, `eu-west-1`) verified. DNS-only records in the Cloudflare zone: `resend._domainkey` TXT, `send` MX + SPF TXT, `rsend` CNAME. New send-only key `localley-next-sending` (id `8f68aab4-…`, domain-scoped) = Worker secret `RESEND_API_KEY`, copy in `keys.env` as `LOCALLEY_RESEND_SENDING_API_KEY`. `FROM_EMAIL` = `Localley <hello@localley.io>` is a Worker **secret** (not in `vars`, so no rebuild was needed). Worker version `0dc8d774-170f-4668-8bfc-336cda26a2df` (rollback `ad07d446`). Resend reports `delivered` for a test to `delivered@resend.dev` and for a real magic link requested on `next.localley.io`. Vercel production still uses its old key and `onboarding@resend.dev` (unchanged). Inbound mail for `localley.io` is Google Workspace (apex MX), unchanged. |
| A4 | done | 5 users imported: `{"users":5,"verified":5,"clerkIds":5,"accounts":0}`. Export/SQL files shredded. |
| A5 | done | Signed-in acceptance passed on `next.localley.io` and, after P7, on `www.localley.io` (magic link for a migrated account). See `CLOUDFLARE_OPENNEXT.md` section 6. |

A3 was unblocked on 2026-09-23 (see the table). Do not also add `FROM_EMAIL` to `env.production.vars`: Wrangler
rejects a var and a secret with the same name.

Signed-out acceptance on `next.localley.io` vs `www.localley.io` (117 build-manifest paths, IPv4): 49 equal;
the 68 differences are all expected — 65 protected APIs answer 401 instead of Clerk's 404, `/api/auth/get-session`
200 (`null`), `/forgot-password` + `/reset-password` 200 (new pages). `/api/cities` byte-identical (14,037 B),
`/spots` shows 3,023 spots on both, `next/image` returns AVIF, the 20/min limiter returns 429 in a burst, the four
cron routes return 401 with a wrong bearer, both Stripe webhook routes return 400 for an unsigned POST.
Note: IPv6 from the agent host to Cloudflare drops TLS handshakes (also on the old preview Worker); use `curl -4`.


Run from a clean worktree of `main`, with `set -a; . ~/secrets/keys.env; set +a` and
`export CLOUDFLARE_ACCOUNT_ID=664f242340bcec2f32daaeee15f58bde`. Never print or commit secrets or emails.

A1. **Production auth store** (creates Better Auth tables in production):

```sh
npx wrangler d1 create localley-auth --location weur
# uncomment the AUTH_DB entry in env.production.d1_databases with the new id; commit, PR, merge
npx wrangler d1 migrations apply localley-auth --env production --remote
```

A2. **Production secrets on the Worker** (`localley-next`):

```sh
openssl rand -base64 48 | tr -d '\n' | npx wrangler secret put BETTER_AUTH_SECRET --env production
# Supabase dashboard -> Project Settings -> JWT Keys -> Legacy JWT secret (the same key Clerk's
# "supabase" JWT template signs with; HS256). Without it user-scoped RLS reads return nothing.
npx wrangler secret put SUPABASE_JWT_SECRET --env production
npx wrangler secret put RESEND_API_KEY --env production
# optional, after section 4:
npx wrangler secret put GOOGLE_CLIENT_ID --env production
npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
```

A3. **Email sender** (DNS change). `localley.io` has no Resend DKIM record, and `FROM_EMAIL` is not set in Vercel,
so mail goes from `onboarding@resend.dev`, which Resend delivers only to the account owner. Verify `localley.io`
(or `mail.localley.io`) in the Resend account that owns the Localley key, add its DNS records in Cloudflare, then set
`"FROM_EMAIL": "Localley <hello@localley.io>"` in `env.production.vars`. Without this, magic links and reset links
do not reach the 5 users.

A4. **Migrate the 5 users** (production data):

```sh
D=/home/dev/projects/CyberLink/codex-work/tmp/claude-1000/auth-cutover; mkdir -p $D; chmod 700 $D; umask 077
vercel env pull $D/prod.env --environment=production --project travelchat-ai --scope nkopp-cmds-projects --yes
set -a; . $D/prod.env; set +a; shred -u $D/prod.env
node scripts/auth/clerk-to-better-auth.mjs export --out $D/users.json     # prints counts only
node scripts/auth/clerk-to-better-auth.mjs sql --in $D/users.json --out $D/users.sql
npx wrangler d1 execute localley-auth --env production --remote --file $D/users.sql
npx wrangler d1 execute localley-auth --env production --remote --command \
  "select count(*) users, sum(emailVerified) verified, sum(id like 'user_%') clerkIds from \"user\""   # expect 5/5/5
find $D -type f -exec shred -u {} \; ; rmdir $D
```

Run A4 again right before the DNS switch if Clerk gained users (idempotent).

A5. **Staging check on `next.localley.io`** (production Worker, P4/P5 in `CLOUDFLARE_OPENNEXT.md`): build with the
production `NEXT_PUBLIC_*` values, deploy `--env production`, then Nils signs in with a magic link and confirms the
old trips and the admin pages. `ADMIN_USER_IDS` moves unchanged (ids did not change). Vercel marks the variable
sensitive, so its value cannot be read back: confirm it lists the id of the Clerk account you use.

A6. **After the DNS switch is verified** (P7): disable the Clerk production instance, then remove the Clerk DNS
CNAMEs (`clerk.`, `accounts.`, `clkmail.`, `clk._domainkey.`, `clk2._domainkey.`). Rollback before this step: the
Vercel deployment still runs Clerk and its users were not changed.


### Users first: live sender authentication proof — 2026-10-01

Nils paused the application-data D1 cutover. Production remains OpenNext on Cloudflare with Supabase application data.

At approximately 02:31 UTC, one fresh, controlled mail-tester seed received a real production magic-link email from the existing Workers binding. The production request returned HTTP 200. The received report scored **10/10** and independently established:

- SPF passed for the `cf-bounce.localley.io` return-path domain.
- DKIM passed with a 2048-bit key, `d=localley.io`, selector `cf-bounce`.
- DMARC passed with `header.from=localley.io`; the author-domain DKIM signature aligns exactly.
- The message contained both `text/plain` and `text/html`, the sender name Localley, and the subject Your Localley sign-in link.
- Links used HTTPS on www.localley.io; the report found no shorteners or listed sending IP among its 20 blocklists.
- The sending host was `bg-bgi.cloudflare-smtp.org` / `104.30.16.168`, with matching reverse DNS.

The Cloudflare DNS API read all 22 zone records before this test. It confirmed one apex SPF (`v=spf1 include:_spf.google.com include:_spf.mx.cloudflare.net ~all`), one Cloudflare bounce SPF (`v=spf1 include:_spf.mx.cloudflare.net ~all`), the three Cloudflare bounce MX records, selector `cf-bounce._domainkey.localley.io`, and DMARC `v=DMARC1; p=none;`. These records already support passing alignment. No DNS record changed: before and after remain identical. Changing DMARC enforcement cannot establish inbox placement and could affect other legitimate mail sources.

Email Sending status API reads returned HTTP 403 / code 10000 for the existing token. DNS access and the live Workers send binding worked. No token or sender change is needed for the tested binding.

The report's link checker consumed the fresh seed magic link and created one isolated auth user/session. Exact seed cleanup removed that session and user; credential accounts and matching Supabase users/subscriptions were zero. The proof retained no customer identity or data. Private raw report and seed metadata are under `cloudflare/auth-proof/.preview-private/users-first-seed-20261001.*`; do not publish the raw report or link tokens.

This proves live receiver authentication and message quality. It does **not** prove Gmail inbox placement for every recipient. Nils's received-header and placement check remains in NEEDS.md; work on production user journeys continues without waiting for it. No production deployment, application-data import, D1 candidate change, or paid generation occurred. Existing production Worker remains `23b84d37-b55d-4405-94c3-4273c4e52691`, with rollback reference `4a7a0329` from the recorded email release.

### Production signup profile repair — 2026-10-01

The users-first desktop journey created and verified one isolated account and signed in successfully (HTTP 200). Its valid trip-save request then returned HTTP 404, `User not found.`. The live Supabase users schema contains `id`, `clerk_id`, `username`, `email`, `level`, `xp`, `title`, and `created_at`; the auth hook attempted absent `name`, `avatar_url`, `email_preferences`, and `updated_at` columns and omitted the required app UUID. The previous seed likewise had no application user or subscription.

The hook now creates the application UUID explicitly and writes only supported columns. Duplicate hooks ignore existing rows, preserving app IDs, usernames, XP, and paid subscription fields. Verification/profile-update hooks repair missing application mappings and update email without resetting those fields. Auth retains display names and avatars. Preview read-only guards remain in place. No Supabase schema or D1 application-data change is required.

Local verification: six production-schema contract tests and nine auth adapter tests passed; focused ESLint and TypeScript passed. A bounded insert for the already-created, isolated QA account returned 201 for both users and subscriptions. The users row supplied an explicit UUID and omitted username; live defaults were username null, level 1, xp 0, title Tourist. Both real on_conflict targets accepted ignore-duplicate inserts, confirming the unique constraints. PR #276 merged `1b1a0d8` after required CI `36807346959`. Production `049a6fbe-2988-4d1a-881c-7c221ddc5d50` proved fresh signup automatically creates one application profile and one Free subscription. Three verified missing mappings were repaired by exact auth IDs while preserving existing-row hashes and both admin mappings. The same owned trip save changed from 404 to 200. Confirmation delivery scored 10/10 with SPF/DKIM/DMARC pass. Subsequent magic-link verification kept the application UUID unchanged.

### One password callback navigation — 2026-10-01

The installed Better Auth default fetch plugin already follows `callbackURL`. The form also called `window.location.assign`, requesting a second navigation. PR #281 merged `71f9dc1` after required self-hosted CI `36815008641`; four real-SDK integration tests prove exactly one redirect, safe local destination preservation, external destination clamping and rejected credentials without navigation. The button remains busy after success. Read-only advisor review found no P0/P1 findings; its busy-state and assertion timing comments were addressed.

Merged OpenNext build and nilskopp account guard passed. Deployment `4c8acf2b-1836-41f0-968a-ff4c91ec69c2` released Worker `b66a792d-fa68-4db4-acda-3e60d9ed3329` at 2026-10-01 04:34:05 UTC, 100%; rollback `5a303f10-4e77-4cec-a19e-807030929066`. Real production UI password logins returned 200 and exactly one document request on desktop (dashboard) and mobile (owned trip). Both loaded without script errors or document overflow; screenshots were inspected. Four public curl routes returned 200. This confirms the duplicate navigation repair; it does not establish that all earlier intermittent settings probes had the same cause.

A separate full-page settings/dashboard diagnostic returned auth and preference HTTP 200, the correct unavailable notification message and no console or script errors. The earlier exact-text timeouts were a test-selector error: the status div also includes nested help text. Captured bodies contained both messages. A second read-only advisor review confirmed this premise; the corrected role/status check passed on desktop and mobile, including help text, zero switches and no Push Notifications label. The server explicitly reports unavailable storage; this is not a failed-auth state. Supabase application data and the prepared D1 cutover branches remain intact.

Exact QA cleanup removed two owned seed accounts, two trips, five conversations, eight messages, two usage rows, 24 sessions and two credential accounts. Owner-scoped reads confirmed zero remaining app/auth rows; both real admin identities still have one auth and one application mapping. Received-email reports and acceptance screenshots remain private.
