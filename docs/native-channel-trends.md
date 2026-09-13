# Native Current-Week Channel Trends

## Real Source

The source-to-eligible-venue gate was resolved by an official Tokyo source, not by relaxing the Seoul rejection decisions.
https://www.tsukiji.or.jp/english/shoplist/ links directly to YouTube channel `UCrmRlqJ0soRq3GpBL5yT5IA`.
The public feed is `https://www.youtube.com/feeds/videos.xml?channel_id=UCrmRlqJ0soRq3GpBL5yT5IA`.
It supplied current post `J0K2Vpm7JEw`, published `2026-09-09T08:00:21+00:00`, explicitly about the Tsukiji Outer Market's autumn produce.
The observed feed contained 565 views. Likes, comments, shares, and saves were not reported and remain null.
The RSS star-rating count is not treated as likes. Fourteen older publications were excluded even when their update dates were newer.

The match retains canonical Localley UUID `65063bf2-32ad-44e8-8de4-8918fe074755`, name, address, and coordinates.
The existing production row was already verified with Localley score 4 and passed the unchanged public-quality gate.
No verification flag, score, photo, or location was changed. The canonical place link returned HTTP 200.
Official channel ownership, the exact post content digest, canonical identity digest, and a week-bounded approval are pinned in `cloudflare/auth-proof/pilot/channel-trends.json`.
The canonical database response supplies the exact stored name/address excerpt; it is not presented as a quotation from the market website.
Independent association is established by the market website's channel link and the post's explicit market name.

No source photograph, thumbnail, video, or unlicensed business image is republished. The UI is text and source links only.
Earlier Pixelfed and Mastodon candidates remain separate research evidence, not substitutes for this approved source.

## Pipeline

`scripts/native-channel-trends.mjs` is a native host collector/publisher, independent of paid providers and the existing venue-transfer schedule.
It fetches only the pinned official page, public YouTube feed, and exact canonical production venue row.
Source reads have one twenty-second whole-response deadline, a 512 KiB byte cap, fatal UTF-8 decoding, and no redirects.
XML validation rejects malformed input, DTD/entity declarations, excessive markup, ambiguous IDs, wrong channels, and invalid counters.
`fast-xml-parser` 5.11.1 is pinned as a host-side development dependency under MIT. It is not imported into the frontend or Worker reader.
The parser audit reported no advisory for this package; unrelated existing repository audit findings were not silently fixed.
The public response contract uses the existing Zod Mini export to avoid loading the full validation library into the UI.
Measured built JavaScript is 815,512 bytes; the first full-Zod draft was about 1.2 MB. Existing lockfile platform metadata was preserved.

The existing native social review and ranking logic is reused with an explicit Tokyo scope. Default Seoul behavior remains scoped to Seoul.
No cross-city normalization or country/quality bypass is allowed. Updated time is never substituted for publication time.
The collector accepts only the reviewed video and unchanged content/identity digests. New videos or changed source content require a new review.
Each capture has its own identity and raw feed digest; later observed counts may decrease. Old maxima are not retained.

Dry run:

```sh
node --import tsx scripts/native-channel-trends.mjs --live --dry-run --out /private/new-report.json
```

Publication, only after release gates and migration 0008:

```sh
node --import tsx scripts/native-channel-trends.mjs --live --apply --out /private/new-publication.json
```

Outputs are exclusive, mode 0600. Source and acceptance evidence is saved before a write attempt.
An uncertain write is not automatically retried. Inspect the retained attempt, source report, and D1 row before reconciling it.
Production Supabase is read-only in this path. The only write target is the pinned preview D1 database with the correct purpose marker.
The single-row CAS prevents stale/concurrent observations from replacing a newer snapshot. No public spot, user, itinerary, or existing ranking table is mutated.

## Visible Contract

Additive D1 table: `native_current_trends`, one reviewed snapshot per supported city, with a 64 KiB payload cap.
GET `/api/trends/current?city=tokyo` is read-only and remains behind the existing Access protection.
The Worker checks the compiled review, canonical UUID, links, coordinates, publication time, metrics, week, and expiry before returning a ranking.
Other cities return an explicit validation response rather than fabricated coverage.

The Current-week trends view displays the rank within this monitored sample, the canonical place link, post timestamp, observation time, and expiry.
It does not display the provisional normalized score as a popularity or confidence percentage.
Venue-owned updates are explicitly distinguished from independent recommendations. Missing metrics say `Not reported`.
The UI hides expired data, clears failed responses, and rechecks on focus/visibility. It does not fill empty coverage with old posts.

## Coverage Limits

Initial coverage is one reviewed post from one official venue-owned YouTube channel in Tokyo.
It is not representative of Tokyo, all four enabled cities, all YouTube posts, or independent visitor sentiment.
Publication freshness does not establish the recording date or current venue conditions.
Each snapshot expires within 24 hours and no later than the approved week boundary, `2026-09-14T00:00:00Z`.
Refresh is an explicit bounded host command. No new scheduler was added, and the existing hourly venue transfer was not changed.
After expiry, the page honestly shows no fresh reviewed snapshot until a new qualified capture is published.
This code and the successful live dry run alone do not complete the outcome. Migration, checked deployment, actual D1 publication, and hosted browser acceptance are still required.

## Verification

The real dry run accepted one post and produced one candidate rank with 565 observed views and four null metrics.
Private source files: `.preview-private/tsukiji-feed.xml`, `tsukiji-owner.html`, `tsukiji-live-venue.json`, `tsukiji-source-review.json`, and `tsukiji-accepted-dry-run.json`.
Synthetic tests remain visibly separate. Thirty new source/publisher tests and 86 existing native-social tests passed.
Fifteen native D1 read/freshness/identity tests passed after adapting the harness to the project's Miniflare 5 worker shape.
The combined native package check passed 244 tests without skips, with types, lint, environment isolation, and build checks.
Root TypeScript passed after handling the parser's typed matcher-path union.
An empty XML statistics element was corrected to represent missing metrics, not a malformed count.
The first test launch used the browser environment for node:sqlite; the test now explicitly uses the Node environment.
All three native HTTPS browser suites passed, including ready, unknown metrics, failure, empty, malformed, and expiry UI states.
Browser fixtures are not live evidence. Their output is retained in `test-results/cloudflare-frontend/run-RxOrpA/`.
Advisor read-only review was unavailable because the installed wrapper could not find `codex`. No new builder or paid fallback was started.

## Release Gates

Before activation: retain a private D1 backup, restore it, rehearse migration 0008 and the real accepted snapshot, and verify unrelated tables stay unchanged.
The first real-source preflight passed: `.preview-private/channel-release-XDLOG7/`, backup SHA-256 `69f90ce719fa0bad255ecc0acb8c095330e4b5ea2ea3a46c0fe82aeac1f113f0`.
On that restored snapshot, migration 0008 and repeated real-payload publication preserved all existing tables and retained one trend row.
Deploy checked source to the documented Cloudflare preview only. Then run the explicit publisher and verify the actual current-week API and browser.
Retain source, write-attempt, CI, deployment, and browser evidence. Record repeat behavior separately from the initial publication.
Rollback restores the preceding Worker while retaining the additive table and all receipts. A targeted snapshot clear must never restore an old database over newer data.
The six image-rights items remain deferred. No outreach, paid fallback, production cutover, or external social post is authorized by this release.
