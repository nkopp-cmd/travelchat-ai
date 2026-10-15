# Stripe live billing

## Scope

Nils selected live mode on2026-10-14 and removed the sandbox setup prerequisite.
The existing Localley account has charges enabled and a localley.io business profile.
Its four active USD recurring prices match the application: Pro9monthly/79yearly, Premium19monthly/159yearly.
Both enabled subscription and Connect endpoints already point directly to www.localley.io.
No catalog, webhook URL, API credential or customer subscription needs replacement for this rollout.

The release audit found obsolete product IDs in the local server price fields.
On2026-10-15, those four fields were synchronized with the verified live price registry.
A private backup and parse/readback checks preserve every other environment value.
Current Worker secret values cannot be read back, so their previous values are not inferred.
`config/stripe-live-prices.json` declares the verified public live price IDs.
Use `wrangler versions secret bulk` after the inactive code upload. This preserves existing binding types.
Confirm it clones that uploaded code version before staging. Never delete an active secret binding.
The existing private API key and webhook secrets stay in Worker bindings.
Inactive upload must verify binding names/types and unchanged safety bindings before promotion.
All four controlled checkout sessions must prove the actual price IDs before default activation.

## Checkout safety

A verified session must match the current user before checkout.
A product ID cannot pass as a price ID.
Existing paid active/trialing/past-due plans use billing settings instead of another checkout.
A provider lookup also refuses any non-terminal subscription, covering delayed or incomplete app records.
Starting checkout updates only the stored customer association, preserving tier and status.
Absent rows initialize with ignoreDuplicates, preserving any concurrent insert.
A stored customer association is verified against its owner metadata.
An email search reuses only an exact metadata owner and refuses ambiguous results.
It never reassigns another customer's metadata by matching email.
New customer creation uses an actor-specific idempotency key. Provider transport retries are disabled.

## Webhook safety

Both webhook routes use asynchronous SubtleCrypto signature verification on Workers.
Signature failures do not log raw payloads or signatures.
Subscription updates retrieve current provider state instead of replaying older snapshots.
Missing owner metadata uses one exact trusted Source customer association; ambiguous links fail closed.
No identity is assigned by email. The existing live trial uses this compatibility path.
Its saved Premium/trialing state was reconciled on2026-10-15 without changing the provider subscription.
Current item-level periods and invoice parent subscription references are supported.
Invoice status follows the current subscription and cannot reactivate a canceled subscription from an old paid invoice.
Deletion and invoice writes match the exact subscription ID.
Checkout completion alone does not grant a paid status or tier.
Unknown prices and database errors fail honestly, allowing provider retries.
Provider states outside the four supported app states map to an inactive canceled state.

This does not certify complete historical billing reconciliation or cross-system atomicity.
Subscription notification activation remains behind the existing source schema/consent audit.
Candidate checkout remains disabled; production application data remains Supabase until the full cutover gates pass.

## Delivery

Preparation: focused checks include real offline HMAC verification.
Pinned build, scoped lint, TypeScript, exact CI, independent review and hosted release gates remain required.
A controlled live checkout may verify the hosted form, followed by expiry and exact owned cleanup.
That check is not a completed purchase or a test-mode transaction.

## Production release — 2026-10-15

The live checkout fix is active on100% of production traffic.
Code PR421 head185a8716d2296217e94175af8eba02083ec80304 passed requiredCI38574737099 and mergedee7336b4887a0c27e79139079aa9c914c0cc8bc0.
The tested and merged trees match. Local62focused checks, scoped lint, TypeScript and pinned OpenNext build passed.
Independent code reviews found no confirmedP0/P1. Artifact SHA-256:
`370355d18d51fa2f2467170efce9adf347d21ed7bba3845a8175a6843a910965`.
The artifact scan found zero unexpected private values.

Worker `localley-next` version `c674089a-8f92-4f7e-b4a1-dca4c7685e32` serves100%.
Deployment `4cd627fe-f874-4520-a458-6817d4c3e931` activated at11:27:01UTC.
Default root, spots, sign-in, pricing and cities returned200; the signed webhook returned200 with the2026-10-14 contract.
The external recovery timer stopped after successful readback. All three release timers are inactive.
The retained prior Worker is `b4d426e2-1952-4f7b-9989-67142b47053f`; account changes require the combined rollback below.

### Hosted acceptance and cleanup

The first desktop run lost its response body during cross-origin navigation.
Its single unpaid session expired; its empty owned customer and exact Source/Auth fixture were removed.
Original users/subscription/usage hashes matched after cleanup. Failed evidence was retained.

The corrected capture reads the actual upstream response before fulfilling the same browser request.
It uses no request retry and does not add a second checkout call.
The second guarded1% run passed77checks and restored the prior Worker before promotion.
Actual desktopProMonthly and mobilePremiumYearly buttons opened real Stripe payment forms.
Four inspected screenshots show the pricing pages and the correct9USD/month and159USD/year forms.
API sessions proved ProYearly79USD and PremiumMonthly19USD.
All four sessions used the existing live Localley prices, one exact owned customer and the expected currency/interval.
The unpaid sessions did not grant paid access. Anonymous checkout and invalid signatures were refused.
A real billing portal URL and both Workers signature boundaries passed.

All four sessions expired and read back as expired/unpaid.
The owned customer had no subscriptions, cards, invoices, SetupIntents, PaymentIntents or balance transactions.
Cleanup deleted only that empty customer and exact reserved Source/Auth fixture.
Original users/subscription/usage hashes matched. No card was entered and no payment was confirmed.
This proves live unpaid checkout and signed boundaries; it does not prove a completed purchase or genuine provider webhook delivery.

### Existing trial and billing portal

The operational plan review identified an account-wide sequencing and rollback risk.
Both account changes ran only after100% health passed and every release timer was inactive.
A follow-up script review timed out; no positive script-review verdict is claimed.
The existing code review, exact guards, six offline account-rollback tests and explicit release instruction support the bounded operations.

One self-signed maintenance event caused the application to retrieve the current live Stripe subscription.
It used the unique stored customer association and matching owner metadata; it did not assign identity by email.
The saved row now has the current Premium/trialing status, price, periods and subscription ID.
The provider subscription remained byte-for-byte unchanged. The other four Source subscriptions stayed unchanged.
The operation required the provider to remain trialing, avoiding the active-upgrade email path.
The private before/after backup and guarded rollback fields are retained.

The existing live default portal now permits price changes among the four verified live choices.
Only update enablement, allowed price updates and the configured catalog were submitted.
Proration, trial behavior, cancellation and all other configuration values were preserved.
The first readback omitted the expandable product list. An expanded GET confirmed all four choices without another write.
The real provider configuration-update event is retained as configuration evidence; it is not proof of delivery to the application webhook.
No existing customer subscription or charge changed during portal configuration.

### Final proof and rollback

Final proof passed22checks: exact100% Worker, five public200 including uncached cities,
Source counts8users/5subscriptions/33usage/85itineraries/3295spots, unchanged users/usage hashes,
the one intended trial row, four unrelated subscription rows, both exact admin IDs and the expanded live portal catalog.
Production application data remains Supabase. No D1 application-data switch occurred.

Before rolling back to the old Worker after account changes:

1. Keep the fixed Worker active during account recovery.
2. Restore the portal's previous disabled/allowed-update flags with exact current-feature guards.
   Retain the verified four-price catalog. The pre-change catalog was not expanded, so an exact old catalog restore is not claimed.
3. Restore only the trial row's recorded billing fields, guarded by exact owner, ID and updated timestamp.
4. Read back both restorations before deploying the old Worker. Stop on concurrent changes; keep the fixed Worker active.

A failed account readback triggers this recovery after reconciling any ambiguous reply by GET.
Unknown writes are never automatically repeated. No recovery mutation was needed in this release.
Nine canary recovery guards, nine promotion recovery guards and six account rollback guards passed offline.
The actual canary restores passed. This is not the full application-data cutover rollback drill.

Private evidence under `/home/dev/.local/state/localley/`:

- `stripe-live-hosted-resume-20261015.json` — first failed probe and successful cleanup.
- `stripe-live-hosted-resume2-20261015.json` —77checks, four sessions and four screenshots.
- `stripe-live-window-state-resume2-20261015.json` — canary and actual restore.
- `stripe-live-promotion-state-20261015.json` and `stripe-live-default-health-20261015.json` — default release.
- `stripe-live-reconcile-20261015.json` — exact trial backup, canonical state and provider preservation.
- `stripe-live-portal-enable-20261015.json` and `stripe-live-portal-expanded-read-20261015.json` — configuration and catalog proof.
- `stripe-live-final-proof-20261015.json` — final22checks.
- `stripe-server-price-sync-20261015.json` — four local price fields synchronized; all other values preserved.
- `stripe-live-account-rollback-20261015.mjs` — scoped recovery and six offline guards.
