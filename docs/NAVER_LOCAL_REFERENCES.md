# Korean local-search references

`GET /api/places/naver-local?city=seoul&name=남대문시장` returns up to five source-backed name/address references.
Supported query cities: Seoul, Busan, Jeju and Gyeongju. Results do not imply these are all enabled public markets.
The endpoint never imports a spot, rewrites a location, declares a venue verified, copies descriptions, or changes map providers.
Use the reference name, address and source link for human confirmation. No coordinate or directions claim is made.

## Safety and operation

- `NCP_APIHUB_KEY_ID` and `NCP_APIHUB_KEY` are Worker secrets, never browser keys.
- `NAVER_REFERENCE_DB` is the dedicated D1 `localley-reference-cache` (`44b8b59c-a44d-4b42-ac03-40508c3eee89`).
- Preview and production share this database, so the app-wide UTC cap cannot double.
- Apply only `migrations/references/0001_naver_local.sql` to this dedicated database. No auth/app/source schema changes.
- Atomic claim/budget reservation limits external calls to2000/day and one per normalized query per seven days.
- Success, failure and unknown outcomes retain the same seven-day hold. Pending claims fail closed. There are no provider retries.
- Missing database, keys or platform rate limiter returns503 before a provider call. The IP limiter permits10requests/minute.
- Invalid queries return400; IP or daily quota refusal returns429. Results use no-store/noindex.
- Request timeout10seconds, redirect refusal and64KiB response limit bound remote work. Names/addresses remain plain JSON.
- Unsafe/empty business links become an explicit Naver map-search link; no arbitrary URL is fetched.
- Expired cache cleanup deletes at most50rows per admitted request. Old daily counters expire after32days. No scheduler was added.

## Verification and rollback

Focused SQLite tests prove concurrency, last-slot quota admission, UTC reset, transactional reservation faults, repeated failure holds and uncertain persistence.
Route tests cover invalid/limited/unavailable cases, safe output and withheld upstream errors.
Before live acceptance retain the active Worker and rollback versions, database count and public health.
Verify one real KR reference query and its repeat; the repeat must have `cacheHit=true` and leave the counter unchanged.
Rollback deploys the retained Worker. Keep quota/cache holds intact; deleting them can repeat a possibly billed call.
The existing map cascade and production Supabase data remain unchanged.

Sources: [Naver local-search API](https://api.ncloud-docs.com/docs/naver-api-hub-search-local), [D1 transaction batches](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Live acceptance — 2026-10-12

PR396 (`ccf8ca19`) adds the reference client, dedicated schema and route catalog entry.
Its final head `0e5b570e` passed required CI38257530031, thirteen focused tests and41health tests.
The first live lookup exposed a Worker runtime constraint: fetch rejects redirect mode `error`.
PR397 (`4990d725`, exact head `3046ed9b`) uses `manual` and rejects every non-OK response, including redirects.
Fourteen focused tests pass, including credential-preserving redirect refusal and the seven-day failure hold.
Required CI38261980776 passed11m55s. The exact pinned OpenNext build and supplied-source review passed.
The merged and tested Git trees match `8d2f7a07d84f54e530f3363fa3e31fcdb83ba46c`.

Worker `d37e80b7-c717-49a7-98a4-11bde0ea7dc3` passed reference acceptance but was withdrawn after a safety audit.
Deployment `a79d8a19-bf10-4df0-b589-397574f5ba5d` started14:32:51UTC.
The stable pre-feature rollback is `0a81e48c-8490-4dbc-a311-c187789f8b94`.
The immediately preceding version `e1987f4d-4a7a-478e-a278-75a18fb47a44` has the rejected redirect mode.
Use the stable rollback if needed. Retain database holds and counters through rollback.

Real public Seoul, Busan and Jeju responses returned source-linked references, no coordinates or verification claims.
Eighty-six checks passed: bounded fields, regional addresses, safe source links, no key values, no-store/noindex,
repeat cache hits, unchanged repeat counters, invalid cities400, IP quota429 and inaccessible server artifact values.
Two new public provider reservations moved the UTC counter4to6; Jeju used the protected native probe's cached result.
Three earlier failed query holds stay intact for seven days. No failed query was repeated externally.
The protected probe was deleted after diagnosis. It made no application database or source writes.

The scoped artifact audit checked2329files/76878605bytes against92configured key values.
It found zero unexpected matches and zero Naver keys. Four existing server-only Kakao public-key aliases were pinned explicitly.
Both tested server artifact URL responses contained no key values. No browser key exception was allowed.
Public root/spots/sign-in/cities returned200. Both admin IDs and source counts8/5/33/85/3295 stayed unchanged.
Preview remains `b9086f9a-768a-487a-8e93-bba8fca88220`; production application data remains Supabase.
Maps subscription and the full D1/R2 cutover gates remain separate.

Private receipts: `/home/dev/.local/state/localley/naver-live-proof-corrected-20261012.json`,
`naver-redirect-release-after-20261012.json`, `naver-redirect-artifact-audit-20261012.json`,
`naver-native-probe-result2-20261012.json` and `naver-native-probe-delete-20261012.log`.

Safety correction: the public-only build embedded `SUPABASE_READ_ONLY=true`.
OpenNext fills missing runtime variables from those build defaults. Production lacked an explicit override.
The audit identified a possible source-write refusal before claiming full release safety.
Production was restored to stable `0a81e48c-8490-4dbc-a311-c187789f8b94`; the reference gate is open again.
The configuration now explicitly pins productionfalse and previewtrue, with a parsed-config and writable-client regression.
Reactivation requires exact CI, binding readback and a controlled signed-in write proof. Keep all six reservations and holds intact.
