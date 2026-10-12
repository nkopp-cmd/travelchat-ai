# Korean local-search references

`GET /api/places/naver-local?city=seoul&name=광장시장` returns up to five source-backed name/address references.
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
