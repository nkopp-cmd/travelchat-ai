# Preview tier and real story acceptance

## Runtime controls

OpenNext fills missing runtime values from its bundled build environment.
The local development environment enabled the image tier bypass.
Missing Worker bindings therefore did not prove a disabled runtime bypass.
PR383 pins preview beta and bypass flags to `false`.
The generation flag also needs an explicit `false` default after controlled tests.
Production uses its separate environment configuration.

Build preview releases with public environment values only.
Private runtime credentials belong in the isolated Worker's secret bindings.
The clean build audit checked 2316 files and 76497543 bytes.
It found no matches for 18 existing private credential values.

## Delivered evidence, 2026-10-06

PR383 head `43bac3966a6f118f0a9c48a5e647bed7e9c7ee46` merged as `82d30d299f521241f5e1f68256d6219627306ffe`.
Required CI37483494358 passed11m46s on that exact head.
Feature and merge trees equal `c34d3a2d4594fc80ad40644f5c88019c237f9bb2`.
Twenty-three focused tests, pinned OpenNext build and scoped review passed.
The review found no P0/P1.

Two verified reserved owners used the real candidate save API.
Their eligibility used a synthetic Pro overlay and a free account.
Free requests returned200/successfalse with bypassfalse, without usage or cache writes.
Pro requests returned503 while generation was disabled; anonymous requests returned401.

Receipt `31fa6a78495d` reserved$0.50 before one explicit FLUX request.
The response returned200/providerflux/sourceai/cachedfalse, without fallback.
D1 recorded one weighted credit and a3573227-byte private PNG in R2.
The identical request returned its cache entry without another credit.
Foreign and anonymous media requests failed; the foreign account acquired no usage.
The fresh background link survived reload.
The existing renderer produced an inspected1080x1920 PNG of3519515 bytes.
Fifty-eight hosted checkpoints passed. No paid retry occurred.

Exact cleanup restored55APP counts, the import hash and five AUTH table fingerprints.
Source users, subscriptions and usage hashes remained equal; the spots count remained3295.
Both production admin IDs remained present in source and AUTH.
The owned R2 delete succeeded; its remote read confirmed the key does not exist.

Operational preview version `ceff1750-8fa5-4d4a-a28c-2963ddbf0b61` runs at100%.
Deployment `45567ae1-90b8-4ef6-a35e-e8885f9602e1` explicitly sets all three flagsfalse.
An earlier rollback selected the disabled version, but script settings still showed the latest uploaded flagtrue.
Verify active deployment/version bindings; do not infer active flags from script settings alone.

Production version `b42e8926-6b15-4875-85ec-44d39513832d` and deployment `6f22f0cb-a8b8-4e8f-bf76-19965611b471` stayed unchanged.
Production rollback `a548f24e-1f17-4021-a830-219074baa337` remains retained.
Apex, www and preview health checks returned200 after cleanup.

Private receipts and images: `~/.local/state/localley/preview-tier-flags-20261006/`.
The$0.50 reservation remains counted; actual provider billing is not reconciled.
Full current-data parity, remaining product adapters, executed rollback and signed-in canary remain open.
Production application data continues to use Supabase.

## Permanent default release

PR384 head `3ba42517a1b4e75c17ba4eeb612abb6ebc4ecb38` merged as `8601a39e847b86b476bb415a2e985622b83958d6`.
Required CI37488571870 passed9m57s; feature and merge trees equal `3fae2d05f3728b2727011a4b6b95caee6b2f454d`.
Only configuration and this document changed; application source and dependencies match the validated public-only build.

Current preview version `e57f957e-f43e-4501-91f4-0de6ca98611c` serves100%.
Deployment `e913a0d4-317c-4d44-8b6a-507fe1d8106e` uses source `8601a39e847b86b476bb415a2e985622b83958d6`.
All three flags explicitly readfalse in active version bindings.
Safe preview rollback `ceff1750-8fa5-4d4a-a28c-2963ddbf0b61` remains available with all flagsfalse.
The real generation ran on application source `82d30d299f521241f5e1f68256d6219627306ffe`.

Final release checks repeat APP55/import/source/AUTH fingerprints, foreign keys, both admins and public200 checks.
The remote R2 object remains absent. Production deployment and rollback remain unchanged.
Private `real-generation-acceptance.json` preserves the original58 checkpoints separately from final release checks.
