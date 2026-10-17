# Anonymous read regression

Nils closed the historical exposure review on2026-10-17: the three email addresses were his own.
No external notice is required. Keep the existing RLS containment.

## Check

```sh
node scripts/d1-migration/anonymous-read-regression.mjs \
  --out /home/dev/.local/state/localley/anonymous-read-NEW-UTC-STAMP.json
```

The stable server secret files supply the anonymous key and Management read-only token.
The script pins the project, checks the JWT role/ref/expiry and verifies a key-authenticated control.
It discovers every public application table/view from the physical catalog, excluding extension-owned relations only.
It probes every relation with HEAD, limit=0 and count=exact; no row body is retrieved.
Permission denials require the PostgREST42501 Proxy-Status header and catalog proof of no anonymous table or column SELECT grant.
This prevents a SELECT-star denial from hiding a readable individual column. JWT failures and absent proof remain unknown.
The Auth settings control alone cannot prove PostgREST accepted its JWT; permission headers prevent that false pass.
Unknown counts, absent relations, HTTP errors and transport failures fail the regression.
The script never retries a request or changes Source, policies, mail, credentials or a Worker.
The report is created privately with mode600 and cannot overwrite an existing file.

Nils confirmed the scope on2026-10-17: private tables must be unreadable; retain public catalogs.
The immutable public list contains exactly the nine catalogs below. Every new relation defaults to private.
The exit code is zero only when every private relation returns an exact zero or confirmed permission denial,
and every approved public catalog remains readable with a valid exact count.
The report lists every public exception explicitly. No environment flag can expand it.
This is a current visibility check. Empty tables also need seeded policy tests to prove future-row isolation.
Existing source-owner PostgreSQL policy tests retain that seeded coverage for their repaired tables.
This check excludes extension-owned relations, RPCs, other schemas and Storage buckets. It is not a full anonymous attack-surface audit.
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
The initial strict all-table result was FAILED, with zero unknown relation results.
That result predates the owner clarification and remains retained unchanged.
Do not report all48as private or claim that all anonymous table access is blocked.
No record contents were downloaded.
The first calibration conservatively classified PostgREST206as unknown.
The corrected parser recognizes206with an exact total; the offline regression covers that case.
Both initial receipts are retained. Review then found a possible invalid-JWT false pass in denied responses.
The corrected implementation rejects expired/missing-expiry keys and requires42501for denial.
A focused real denied-table HEAD returned401with `PostgREST; error=42501`; no body was retrieved.
The final release proof must use this stricter implementation.

Current RLS intentionally permits public catalogs.
Nils answered: "Private tables; retain public catalogs". The scope NEED is closed.
The checker now requires privacy for all39other tables and explicitly accepts these nine public catalogs.
This tool changes no policies. The historical incident NEED remains closed.

Private receipts: `anonymous-regression-production-strict-20261017.json` and
`anonymous-regression-production-strict-v2-20261017.json` under `/home/dev/.local/state/localley`.
Required CI, source/Worker preservation and final delivery identity follow in the root plan.
