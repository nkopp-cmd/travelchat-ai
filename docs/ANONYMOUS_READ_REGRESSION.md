# Anonymous read regression

Nils closed the historical exposure review on2026-10-17: the three email addresses were his own.
No external notice is required. Keep the existing RLS containment.

## Check

```sh
node scripts/d1-migration/anonymous-read-regression.mjs \
  --out /home/dev/.local/state/localley/anonymous-read-NEW-UTC-STAMP.json
```

The stable server secret files supply the anonymous key and Management read-only token.
The script pins the project, checks the JWT role/ref and verifies a key-authenticated control.
It discovers every public application table/view from the physical catalog, excluding extension-owned relations only.
It probes every relation with HEAD, limit=0 and count=exact; no row body is retrieved.
Permission denials are explicit, not fabricated zero counts.
Unknown counts, absent relations, HTTP errors and transport failures fail the regression.
The script never retries a request or changes Source, policies, mail, credentials or a Worker.
The report is created privately with mode600 and cannot overwrite an existing file.

The strict default has no public-table exceptions.
The exit code is zero only when every relation returns an exact zero or denies access.
This is a current visibility check. Empty tables also need seeded policy tests to prove future-row isolation.
Existing source-owner PostgreSQL policy tests retain that seeded coverage for their repaired tables.
The sole required workflow runs the new adversarial offline suite and the existing policy proof.

## First production run —2026-10-17

All48current application relations were discovered and checked.
Twenty-nine returned exact zero counts; ten denied access.
Nine intentionally public catalogs returned visible counts:

| Catalog | Anonymous visible count |
| --- | ---: |
| challenges |10 |
| geo_aliases |276 |
| geo_countries |12 |
| geo_destinations |30 |
| geo_local_area_vibe_scores |857 |
| geo_local_areas |212 |
| geo_vibe_taxonomy |15 |
| spots |3295 |
| transfer_edges |24 |

Users, conversations, messages, itineraries, subscriptions and usage all returned exact zero.
The strict all-table result is FAILED, with zero unknown relation results.
Do not report all48as private or claim that all anonymous table access is blocked.
No record contents were downloaded.
The first calibration conservatively classified PostgREST206as unknown.
The corrected parser recognizes206with an exact total; the offline regression covers that case.
Both private receipts are retained; no third live attempt is needed without changed scope or state.

Current RLS intentionally permits public catalogs.
The owner scope question asks whether to preserve that access or block all direct reads while retaining public application pages.
This evidence-only tool does not change those policies or silently exempt them.
The historical incident NEED remains closed; public-catalog scope is a separate design decision.

Private receipts: `anonymous-regression-production-strict-20261017.json` and
`anonymous-regression-production-strict-v2-20261017.json` under `/home/dev/.local/state/localley`.
Required CI, source/Worker preservation and final delivery identity follow in the root plan.
