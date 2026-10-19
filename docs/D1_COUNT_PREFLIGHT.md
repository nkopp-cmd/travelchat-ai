# Read-only candidate count preflight

The former PR484 release helper joined table counts with `UNION ALL`. Its first
provider failure reported `too many terms in compound SELECT`; a smaller batch
also returned400. Those archived release helpers stay inert.

Run `scripts/d1-migration/count-preflight.mjs` with mode `preflight`, then mode
`audit` only after the first receipt passes. Supply a new absolute private JSON
output path and `CLOUDFLARE_API_TOKEN` through the process environment. Never
put the token in a command argument or receipt.

The tool is pinned to Localley's existing candidate D1 database. Preflight reads
`owners` and `itineraries` separately. Audit repeats these checks, validates a
41–64-table catalog, then issues one sequential count per table. There are no
compound count queries, retries, release actions or data writes. The total
deadline is45seconds; each request has a five-second deadline. Partial or invalid
results fail closed and remain in the receipt.

Counts are observed at different times. This proves read compatibility and
catalog coverage; it does not prove an atomic snapshot, row-value parity,
stable data, owner isolation or authorization to release UI changes.
