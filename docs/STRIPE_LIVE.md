# Stripe live billing

## Scope

Nils selected live mode on2026-10-14 and removed the sandbox setup prerequisite.
The existing Localley account has charges enabled and a localley.io business profile.
Its four active USD recurring prices match the application: Pro9monthly/79yearly, Premium19monthly/159yearly.
Both enabled subscription and Connect endpoints already point directly to www.localley.io.
No catalog, webhook URL, API credential or customer subscription needs replacement for this rollout.

The local server environment contains obsolete product IDs in price fields.
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
No identity is assigned by email. One existing live trial subscription needs this compatibility path.
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
