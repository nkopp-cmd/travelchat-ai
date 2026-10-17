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

## Delivered check and stable-host acceptance

PR464 source `d5207fdf1802c1175ca510bf611c3139ec71bf20` passed required CI39054435856.
The verify job passed in19m09s. All35focused regression tests pass locally and in required CI.
The squash merge is `cdfc06d4cf6857a35d8676fbc063f52bce55857e`, with the same tested tree.
Two concrete review findings were fixed: invalid-JWT denials and partial-column grants.
The follow-up review cleared its remaining P1 condition after the column guard and tests.
The live catalog confirms every denied private table has no anonymous table or column SELECT grant.
No third independent review verdict is claimed.

The command is installed through stable main. No Worker code release is required for this host-only check.
Its stable-main live run passes on48relations:39private tables protected and nine explicit public catalogs readable.
The private result consists of29exact zero counts and ten proven permission denials.
All48tables retain RLS. Unknown results and downloaded record bodies both equal zero.
Sixteen release checks pass, including exact CI/source identity, tree equality and preservation guards.
All48Source row hashes/counts, eight Auth business-table counts and both full administrator rows match before and after.
Production and preview deployments also match before and after.

### Approved concurrent secret update

Two earlier release attempts stopped before the actual command ran.
They expected the previous production deployment and retained that failed evidence.
The approved Scrapelet owner operation had added one encrypted secret at17:36UTC.
It changed the Worker version without changing application code.

Current production Worker: `a70b4e30-01d7-48b7-84c4-c31e110770c5` at100%.
Current production deployment: `8db047ad-ec06-4e45-a478-b2f65d3dbd40`.
The approved owner receipt proves all four code modules remain unchanged.
An independent native-version comparison proves all56existing bindings remain identical.
Only the encrypted `SCRAPELET_CLIENT_KEY_LOCALLEY` binding was added; production now has57bindings.
The source remains the previously released `a38fe6495a20711086dce6a56a96545aa057c639`.

After verifying APPROVALS and that receipt, the final proof used the corrected current baseline.
The old failed guards were not treated as successful verification.
Preview remains `a397be3d-8798-4c72-9abd-4975f4e6d855`, deployment `3268b368-4be2-43d6-a22d-fd4b976a46cf`.
The compatible application rollback remains `83366b0c-6a7f-4173-b569-3e4ad6f24780`.
Preserve the approved secret on later releases; its old value remains revoked.
This regression delivery created no fixtures, changed no policies and sent no mail.

Private evidence under `/home/dev/.local/state/localley`:

- `anonymous-regression-final-ci-result-20261017.json`.
- `anonymous-regression-column-guard-local-20261017.log`.
- `anonymous-regression-production-column-guard-20261017.json`.
- `anonymous-regression-reviewed-acceptance-20261017.json`.
- `anonymous-regression-approved-rotation-baseline-20261017.json`.
- `anonymous-regression-stable-approved-rotation-live-20261017.json`.
- `anonymous-regression-host-release-20261017.json`.
- `anonymous-regression-host-release-attempt1-20261017.json` and `attempt2` retain the superseded-baseline failures.

The historical exposure NEED and public-catalog scope NEED are closed.
This does not complete the Source-to-D1 migration or authorize Supabase deletion.
