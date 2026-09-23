# Localley auth: Better Auth (replaces Clerk)

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
| `lib/auth/mail.ts` | Resend (production) or D1 outbox (`AUTH_MAIL_MODE=outbox`). |
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
`CLOUDFLARE_OPENNEXT.md` (production Worker on the staging host `next.localley.io`). Not approved: A6, P6–P8,
anything on Vercel.

Status 2026-09-23 (claude):

| Step | State | Evidence |
| --- | --- | --- |
| A1 | done | D1 `localley-auth` `73378d0e-7f2a-465a-8188-a67cb6d2a5c2` (WEUR) in `env.production`; migrations 0001 + 0002 applied remotely. |
| A2 | done | 35 Worker secrets on `localley-next` (`wrangler secret bulk`): Vercel production runtime values, `GLM_API_KEY` + `APIFY_API_TOKEN` from `~/secrets/keys.env` (Vercel "Sensitive" placeholders), `SUPABASE_JWT_SECRET` from `LOCALLEY_SUPABASE_JWT_SECRET` (checked: Supabase REST accepts a token signed with it, rejects a wrong one), new `BETTER_AUTH_SECRET`, `ADMIN_USER_IDS` = the Clerk id of `nkopp@my-goodlife.com`. `hello@localley.io` has no Clerk account and no Supabase profile, so it has no admin id yet. Flags `WEEKLY_SOCIAL_TRENDS_ENABLED`, `APIFY_SPOT_DISCOVERY_ENABLED`, `MULTI_CITY_PREVIEW_API` are unset = code default off. No Google OAuth secrets. |
| A3 | done | Nils chose (2026-09-23) a **new Resend team** (the one that owns `LOCALLEY_RESEND_ADMIN_API_KEY`); the old send-only key's team is not used by the Worker any more. Domain `localley.io` (id `116e561d-a336-4e21-9080-71cdc1da75ab`, `eu-west-1`) verified. DNS-only records in the Cloudflare zone: `resend._domainkey` TXT, `send` MX + SPF TXT, `rsend` CNAME. New send-only key `localley-next-sending` (id `8f68aab4-…`, domain-scoped) = Worker secret `RESEND_API_KEY`, copy in `keys.env` as `LOCALLEY_RESEND_SENDING_API_KEY`. `FROM_EMAIL` = `Localley <hello@localley.io>` is a Worker **secret** (not in `vars`, so no rebuild was needed). Worker version `0dc8d774-170f-4668-8bfc-336cda26a2df` (rollback `ad07d446`). Resend reports `delivered` for a test to `delivered@resend.dev` and for a real magic link requested on `next.localley.io`. Vercel production still uses its old key and `onboarding@resend.dev` (unchanged). Inbound mail for `localley.io` is Google Workspace (apex MX), unchanged. |
| A4 | done | 5 users imported: `{"users":5,"verified":5,"clerkIds":5,"accounts":0}`. Export/SQL files shredded. |
| A5 | partly | Worker `localley-next` version `ad07d446-e0d6-4209-8a0d-22c0c6f73015`, custom domain `next.localley.io`, crons `[]`, workers.dev off. Signed-out acceptance passed (below). Signed-in check: magic link delivered (A3); the click-through on `next.localley.io` waits for Nils. |

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
