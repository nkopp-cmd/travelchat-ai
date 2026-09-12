# Native Account Boundaries

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
