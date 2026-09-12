# Native Account Boundaries

## Delivered Preview - 2026-09-12

- Repository: `nkopp-cmd/travelchat-ai`; release branch: `cloudflare/full-migration`.
- Account boundary implementation: `5363e40afa3cfa095d433d4dce02febeaad793e8`, [PR132](https://github.com/nkopp-cmd/travelchat-ai/pull/132).
- PR132 merge: `a7738de3aac3b4d39b4201c4e55c21a63acb60ac`; PR and merge checks passed (`34705190805`, `34705539781`).
- Live-review correction: `71bd4047b8e904abd76758b4a7f622774b470041`, [PR133](https://github.com/nkopp-cmd/travelchat-ai/pull/133).
- Final deployed merge: `18f43472126bc5260ed51db3ae76ec4a02de4733`; its tree matches the checked PR133 source.
- Final PR and merge checks passed: `34707364774` and `34707616147`, attempt 1.
- Worker: `localley-discovery-preview`, at `https://preview.localley.io`, with unchanged Cloudflare Access protection.
- Active version: `b4b364de-1721-402b-8fd3-4b342267baef`, tagged with the deployed merge, serving 100%.
- Cloudflare deployment ID: `c5ef3681-60de-4fcb-9e86-3a79371fbdbc`; verified at `2026-09-12T17:20:16.213Z`.
- Persistent data: EU D1 `localley-migration-preview`, ID `e943548b-01ae-485d-9219-e2a46cb0da8e`.
- No schema migration ran. All eight public records and the fifteen checked data tables matched their pre-deployment snapshots.
- Private backup: `cloudflare/auth-proof/.preview-private/account-release-RRVkBe/before.sql`, mode `0600`.
- Backup SHA-256: `8cb164333313bcbf0efe486cd46b29f2dda6a2dbc1619377428a1b8c32a16316`; restoration and foreign-key checks passed.
- Rollback version: `586a50c1-09a3-4e46-a5da-1bdf50fb79ba`. Preserve all newer data and receipts during code rollback.

PR132 was first deployed as version `586a50c1-09a3-4e46-a5da-1bdf50fb79ba`, deployment `922ebdc2-f808-4fd8-920b-b7684bb82461`.
That checkpoint and its screenshots remain in `.preview-private/account-release-V8xVoF/`.
The final deployment and live reports remain in `.preview-private/account-release-RRVkBe/` as `release.json` and `live.json`.
All bindings and Access policies stayed unchanged. The hourly transfer remains active; no ingestion command was repeated.
The disk guard stopped the first deployment command before it started. Only the inactive production Turbopack build cache was removed.
The active webpack development server, `.next/dev`, source, private backups, screenshots, and operator receipts were preserved.

Live JavaScript SHA-256: `1f681ba0a1e713a7c3c6a36c078d072b6cb47bc031604be3a80edc159e26c23b`.
Live CSS SHA-256: `2e6ee6fee62a96d3829d7e4defc696a9ebf261b6384c978f9b1e102c0e654de8`.
All seven reviewed JPEG hashes, public credits, eight catalog records, and fifteen map selections passed live checks.
Private reads returned 401 without a Better Auth session. Service-token account creation and password-reset requests returned 403.
The final read-only account panel was opened at 390/900/1440 pixels and no longer presents a generic denial as unverified email.
These checks sent no email and created no account. They do not establish hosted human sign-in or recovery acceptance.

Gravity accepted coding evidence for `native-migration-next` at checked source `5363e40afa3cfa095d433d4dce02febeaad793e8`.
It also accepted the complete `localley-preview-next-release` evidence through the supported `evidence` command.
That evidence pins PR133, its checked source, the final merge, CI/workflow run `34707616147.1`, and the active Worker version.
The private evidence file is `.preview-private/gravity-preview-release-133.json`.
The profile uses the Worker version as its `deploymentId`; the separate Cloudflare deployment ID is recorded above.
No registry, acceptance requirement, operator receipt, submission limit, or counter was manually changed.
This is independent restricted-preview release evidence, not full production migration acceptance.

## Scope

The `native-migration-next` task advances the existing native auth consumer and identity boundary.
It does not create a replacement app, import real customer records, or cut over production.
The native SDK and application requests now reuse the bounded fetch adapter, including body consumption and disabled automatic retries.
Account replacement cancels an old mapping read. Timed-out authentication cannot leave the app indefinitely loading.
Timed-out logout keeps private views blocked rather than claiming success.

Both native account mutations require a matching `x-localley-session-id`. Missing or empty preconditions return 428.
The browser's first-party account callers already send that header. It is not an authentication credential.
Session GET also rejects a supplied stale header before exposing a replacement mapping.
New-owner and legacy-claim batches recheck verification and session expiry inside their SQL operation.
Sessions revoked or expired after HTTP authentication cannot create identity rows or consume a claim grant.
The same guard rejects verification removed before the batch. A previously ready account cannot create a new owner after concurrent unlinking.
Claims remain local synthetic-fixture functionality. The hosted preview still rejects its claim route.

## Ownership Rehearsal

The real local workerd/D1 harness seeds one synthetic legacy owner and exercises the actual private routes.
It preserves the owner string, separate profile UUID, save UUID, spot UUID, millisecond save timestamp, and quota.
The itinerary UUID, creation timestamp, raw activity payload, and imported metadata remain unchanged.
Explicit false and true email preferences survive the claim and subsequent password recovery.
Another verified account cannot read or delete the legacy itinerary; stale mapping reads expose no replacement identity.
Repeated account creation returns the already-linked identity. Repeated grant redemption remains rejected.
Local password reset revokes the old session. A new login retains the original owner, profile, and consent values.
No matching email address grants ownership. The trusted synthetic issuer supplies the signed, single-use legacy proof.

This is not a real customer-data import or restoration rehearsal. Production credential export and proof issuance remain unfinished.

## Checks

The final native check passed 218 tests without skips, environment isolation, Worker/frontend types, lint, and the bundle build.
It includes the ready-account no-fork regression and verification, revocation, and expiry checks at batch execution.
The initial five auth-consumer tests passed. Root TypeScript passed.
Both actual HTTPS browser suites passed, including profile-change isolation, explicit retry, timeout recovery, and password reset.
The successful browser run is `test-results/cloudflare-frontend/run-kHpMFL/`.
The timeout state was opened at 390 and 1440 pixels. It retains the existing layout, readable errors, and visible keyboard focus.
Browser checks found zero page errors and zero external requests. Local email stayed in the synthetic outbox.
New browser runs use unique evidence directories, preserving previous screenshots and failed-attempt evidence.

The first browser attempt assumed mapping-request order identified the caller. Startup cancellation invalidated that assumption.
The second scenario still distinguished consumers by header presence, although both now send the header.
The corrected fixtures wait for the shell's rendered identity before injecting root-provider changes or failure.
They still require both contexts to agree before private reads and reject repeated automatic retries.

Live read-only screenshot review then found that generic HTTP 403 responses were mislabeled as unverified email.
The follow-up keeps generic denials in an unknown/error state, with private identity cleared.
Only an explicit current verification flag can produce the email-verification instruction.
Malformed auth IDs, mismatched session subjects, and missing verification flags fail before requesting an app mapping.
Additional regression tests cover those distinctions and private-operation denials. The hosted service identity remains read-only.
The follow-up passed twelve focused consumer tests, root TypeScript, and both native HTTPS browser suites.
Its browser evidence is retained separately in `test-results/cloudflare-frontend/run-xvYpju/`.

## External Gates

Silent credential verification confirmed the production Supabase origin and service-role REST key.
SQL connection/password credentials, management tokens, and the stored CLI token remain unavailable.
That blocks production SQL catalog validation, backup, adapter installation, and activation, not independent native coding.

The preserved production site returned HTTP 200 at `https://www.localley.io/`.
Vercel CLI is unavailable in this session. The existing API credential's read-only project request returned HTTP 403.
The last verified production identity remains `e96b00356d955ed6b777f5fd139ce1652accf09d`, deployment `dpl_FA3tzDj3zDmxLGEFEjvoXv7d6rgg`.
That provider identity was not freshly reverified here. No Vercel deployment, connection, domain, or environment setting changed.

Hosted human Access sign-in, native account recovery, and actual email delivery remain unverified.
The read-only service identity cannot substitute for that human journey. No bypass or real email test was introduced.
Remaining private business routes, customer ownership/credential imports, billing, media, CPU limits, and full cutover acceptance remain open.
The six image-rights gaps and native current-week social acceptance remain separate from this account increment.

## Release Contract

Deploy the checked merged result only to `localley-discovery-preview` with the existing Access policies and database.
This increment needs no schema migration. Preserve all eight public records, account data, receipts, and the hourly transfer.
Retain a private database backup and the preceding Worker version before deployment.
Verify the exact version tag, active deployment, asset hashes, private-route denials, and unchanged data after deployment.
Rollback restores the previous Worker without restoring old data over newer records or resetting counters.
