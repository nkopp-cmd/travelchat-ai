# Restricted Preview Backend

This code does not switch the live origin.
The parent owns infrastructure, dependencies, secrets, DNS, and deployment.
The template cannot serve preview traffic without deliberate changes.
It has a zero account, zero database, no routes, and an invalid base URL.

## Configuration Contract

| Setting | Required value |
| --- | --- |
| `APP_MODE` | `preview` |
| `AUTH_BASE_URL` | Exactly `https://preview.localley.io`, without a trailing slash |
| `ACCESS_TEAM_DOMAIN` | Fixed `https://<team>.cloudflareaccess.com`, without a trailing slash |
| `ACCESS_AUD` | Exact Access application audience, 64 lowercase hexadecimal characters |
| `ACCESS_SERVICE_CLIENT_CN` | Optional secret containing the exact service client `common_name`; missing or empty disables service access |
| `PREVIEW_ALLOWED_EMAILS` | Secret containing comma-separated private test addresses; maximum 4096 characters |
| `BETTER_AUTH_SECRET` | Separate preview secret, at least 32 characters |
| `DB` | New preview-only D1 database |
| `NATIVE_EMAIL` | Native Cloudflare Email Sending binding; sender restricted to `auth@localley.io` |
| `ASSETS` | Worker assets with `run_worker_first: true` |
| `workers_dev`, `preview_urls` | Both `false` |

The parent installed the direct `jose@6.2.12` dependency.
This task does not change package files.
Wrangler generates `Env` and `PreviewEnv` through `scripts/types.mjs`.
Generation uses temporary dummy secrets, not hosted secrets.
`LOCAL_PROOF` and `CLAIM_SECRET` do not authorize preview requests.
Preview does not require a claim secret.

Apply `0003_preview_mail.sql` separately to the new preview database.
It creates `runtime_purpose` with `purpose = 'unset'`.
After checking database isolation, the parent sets row `id = 1` to `localley-preview`.
The backend rejects preview requests without that marker.
Never populate this database with customer profiles, legacy mappings, or imported auth records.
Local tests do not need this marker.

## Access And Auth

All preview routes require a verified Access JWT, including assets and the catalogue.
The backend accepts only RS256 with the configured issuer and audience.
It caches key discovery configuration, never user identity.
Human JWT email must match the secret allowlist.
Signup, sign-in, mail, verification, reset, and existing human sessions must use that same email.
The request email gate runs before Better Auth creates an account.
Empty POST bodies use an empty object during preview checks.
The handler removes zero-byte streams before Better Auth parses them.
Malformed JSON still fails; outer body limits remain unchanged.
The backend disables email changes, account deletion, user updates, social login, and account linking.
The preview claim endpoint returns 404.
The fixture issuer is not part of the Worker bundle.

A matching service JWT permits only GET and HEAD.
It can read assets, catalogue, app configuration, and health.
Private application routes still require a Better Auth session.
That session must belong to an allowlisted preview user.
Service JWTs cannot call auth routes or send mail.
The backend validates `cf-connecting-ip` before replacing the internal rate-limit header.
It ignores a caller-supplied `x-local-proof-ip`.
This assumes Cloudflare owns ingress and overwrites `cf-connecting-ip`.

`GET /api/app-config` returns these values after Access validation:

```json
{"mode":"preview","catalogSource":"seoul-pilot","registration":"restricted-preview","emailDelivery":"cloudflare"}
```

Local mode returns `local`, `synthetic`, `local-test`, and `captured`, respectively.
Catalogue content and frontend behavior belong to the other agent.
`GET /api/health` returns `{"ok":true}` after the same runtime and Access checks.

## Mail Safety

Local callbacks still write only to the private local outbox.
Preview callbacks use `NATIVE_EMAIL.send` with sender name `Localley`.
Only the matching human Access email can receive mail.
Mail contains plain text and HTML, with an escaped link in the HTML.
Links require HTTPS, the exact preview origin, and a purpose-specific Better Auth path.
Links cannot contain credentials or fragments.
Verification links require one nonempty `token` query parameter.
Reset links use `/api/auth/reset-password/<token>?callbackURL=...`.
Callback destinations must resolve to the preview origin without credentials or fragments.
The audit stores a URL hash, purpose, user ID, state, and provider message ID.
It never stores plaintext URLs or tokens.
Better Auth retains its normal internal verification records.

One atomic D1 insert reserves each unique URL hash.
The database permits five reservations per UTC day across all users and purposes.
Every reservation consumes its attempt, including failures and uncertain outcomes.
Repeated accepted callbacks succeed without sending again.
Other repeated callbacks fail without sending again.
The backend commits `sending` before calling the provider.
It never retries the mail RPC.
`accepted` means the provider returned a message ID, not confirmed delivery.

Provider errors, missing receipts, and ten-second timeouts fail the HTTP response.
They leave the attempt `unknown` when D1 remains available.
If D1 fails, an attempt can remain `reserved` or `sending`; neither state allows automatic resend.
Late provider acceptance remains `unknown`; the backend does not reconcile late promises.
The `failed` state remains available for reviewed, definitive outcomes.
No automatic job retries or cleanup reset the daily limit.

Better Auth can retain an unverified partial user after registration fails.
The response reports failure and creates no application profile.
Only private preview test users can reach this path.
Any manual recovery must remain within the isolated preview database.
The existing atomic `/api/account/new` flow creates new profiles without importing customer identities.

## Validation

Run `npm run check` from `cloudflare/auth-proof`.
The final local check passed all 41 proof tests, type checks, lint, build, and package inspection.
The separate clean-environment test also passed.
Auth tests cover SDK action methods and zero-byte SDK fetch calls with verified Access identities and sessions.
The clean runner includes `test/preview.test.mjs` through the existing proof suite.
Preview tests use real RS256 fixture keys and native workerd D1.
Only the test manifest installs the mail mock and fixture endpoints.
Every fixture endpoint and mail fault control requires a random nonce.
Outbound test requests can only retrieve the local fixture JWKS response.
The tests never send real email or contact Cloudflare resources.
Hosted Access, sender activation, and delivery remain parent-owned release checks.
Checks now use the installed direct `jose@6.2.12` dependency.
The current package manifest omits the preview template and generated preview types from its package file list.
The parent owns any package distribution changes.
