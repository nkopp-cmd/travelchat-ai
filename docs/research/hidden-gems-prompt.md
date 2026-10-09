# Localley hidden-gems research job

## Installation status and cadence

This is a portable job contract, not a Hermes API request or an installed cron.
Apply it to the existing `localley-hidden-gems-database-builder` job, ID
`ce47f4e1f43c`, after locating that scheduler and its canonical dataset.
Do not create a second job or an empty replacement dataset.

Use **daily 03:17 Asia/Seoul**, equivalent to **18:17 UTC on the previous date**.
Daily batches keep source checks and reviews small. Target **15 new places** in
three coherent batches of five. Ship fewer, including zero, when evidence is weak.
Never fill a quota with invented or duplicate entries. The reported 1,225-row
October 6 count is historical context; read the files to establish current counts.
Leave the separate social job `4d19d5d3541d` unchanged.

## Runtime instructions

### Preflight

1. Resolve the existing absolute dataset path. The supplied reference is
   `CoreMachine/01 - Projects/Cowork/Localley/Data/`.
2. Acquire an exclusive dataset lock shared by every writer. If a run is already
   active, skip this run and record that fact. Never overlap writers.
3. Read the complete canonical JSON, CSV, SQLite and source manifest. Inspect
   their actual schema and exact CSV column order. Do not assume production
   columns from this prompt. Do not initialize missing canonical files.
4. Verify all three record sets agree before research. On missing, unreadable or
   inconsistent data, stop without writing canonical files and report the issue.
5. Record current counts and country/city coverage. Retain a recoverable copy of
   the complete current generation before replacing exports.
6. Select three coherent city, country-cluster or regional-theme batches. Check
   every candidate against the complete dataset before expensive research.

### Market priorities

Primary: South Korea, Japan, Taiwan, Hong Kong, Macau, China, useful Mongolia,
Thailand, Vietnam, Indonesia, Malaysia, Philippines, Singapore, Cambodia and Laos.
Prefer undercovered cities in these markets.

Secondary: Central Asia and the Caucasus, after primary coverage is saturated or
temporarily blocked. South/West Asia, the Middle East and Gulf have lowest priority.
Research coverage does not expand the approved public marketing lane.

### Source and location checks

Use public sources only. Confirm place identity, existence/current operation and
location. Keep source URLs and access dates with the claims they support. Prefer
an official place or municipal page, corroborated by another reliable source when
needed. A plausible search result alone does not establish an exact pin.

Use conservative Localley scores and local percentages. Explain their evidence
and uncertainty; do not invent statements that locals love a place.

Set `verified=true` only when existence/current operation, identity and location
have adequate source evidence. Coordinates must identify the actual place.
If a pin is uncertain, leave both coordinates null, or disclose a district,
corridor or compound anchor in source metadata. In either case set
`verified=false`, mark `needs_review` using the existing review structure and
explain the uncertainty. Never invent coordinates or silently pin another business.

For Korea, preserve sourced Korean content within the existing localized JSON
fields for name, address, description, best_times and tips. Do not add `name_ko`
or other improvised production columns. Use actual-place coordinates suitable for
Kakao map links when verified.

Elsewhere, retain sourced local-script names. OSM/Nominatim and legitimate public
map coordinate references are acceptable; record coordinate provenance and obey
the source's access/rate rules. Retry weak English-name geocoding with the sourced
local name. Never invent a translation. Keep coordinates null if still uncertain.

Keep photos empty unless the source and intended reuse are safe. Do not hotlink
random blog photos, imply a generic photo depicts a specific place, or suppress
required attribution. Missing photos do not justify unsafe images.

### Record preparation

Use the canonical dataset's established import representation for name,
description, city, neighborhood, address, category, subcategories, Localley score,
local percentage, best times, photos, tips, verified status, trending score,
latitude, longitude, price tier, Google place ID and source metadata.
Preserve localized objects and all existing fields; never flatten translations.

Reject duplicate normalized place/city combinations. Also check sourced place
IDs, aliases, local-script names and location evidence so renamed listings do not
become duplicates. Do not merge distinct nearby venues solely because pins match.
Log skipped candidates and reasons in the source/candidate history.

Append only accepted, nonduplicate records. Preserve every existing record.
Do not edit old records as a side effect of the append. Keep uncertain records
explicitly marked for review. Accepted count must be between zero and fifteen.

### Export validation and commit

Build replacement JSON, CSV and SQLite in a staging generation on the same
filesystem. Build SQLite from the complete replacement JSON, never by deleting
the active cache first. Preserve the exact established CSV columns and order.

Before promotion, prove:

- JSON, CSV and SQLite record counts and identities agree.
- Every exported record agrees across formats after decoding structured fields.
- No canonical record has missing source URLs.
- No helper columns appear in exports and no SQLite-only records exist.
- Existing records remain unchanged; the new count equals the logged accepted count.
- No duplicate normalized place/city pair exists.
- Coordinates, review flags, localized fields and photo provenance obey this contract.

Do not promote on a failed check. Keep the original generation intact and retain
the failure report. Replace the SQLite file atomically only after validation.
Publish the full generation under the shared lock and use the existing dataset
transaction/recovery convention. Individual file renames do not make a multi-file
commit atomic: interrupted promotion must restore or complete the whole generation
before any reader uses it. Confirm this recovery behavior with a controlled test
before unattended activation. Recheck alignment after promotion.

Maintain only the established outputs:

- `localley_hidden_gems.json`
- `localley_hidden_gems.csv`
- `localley_hidden_gems.sqlite`
- `sources_manifest.jsonl`
- `run_logs/YYYY-MM-DD_hidden_gems.md`

Use the Asia/Seoul date for the run report. Record the UTC start/end time, selected
batches, before/after counts, added identities, source URLs, skipped candidates,
verification/review totals, coordinate uncertainty, validation results and rollback
generation. Append separate attempts if the same date is rerun. Make reruns
idempotent. Release the lock on completion or failure.

### Hard boundaries

Allowed: public-source research and mutations of the established local review
dataset, source manifest and run logs.

Forbidden: production imports or app writes, paid APIs, public posting, messages
to people, access-control bypass, fabricated evidence/coordinates/local claims,
changes to other projects, and scheduler/cron modifications from inside this job.
Do not load production credentials or call Localley write endpoints.

Bound the run to 45 minutes. Stop when the batch limit or deadline is reached.
Use at most two source/geocoding retries per candidate with a delay between
requests. Never retry an unknown write result blindly. Report incomplete work;
preserve validated data and never pad the dataset.

## Activation evidence required

Record the actual scheduler host, saved existing job ID, saved timezone/schedule,
absolute canonical path, installed prompt revision and previous prompt for rollback.
Verify one controlled run against the real files, including before/after counts,
cross-format alignment, dedupe, report and interrupted-promotion recovery.
Only then report the cron as configured or active. A local contract file does not
prove scheduler installation or that any records were added.

Correct any stale 50-record daily contract to 15 when that canonical document is
accessible. Do not silently create a competing copy of Hermes notes here.
