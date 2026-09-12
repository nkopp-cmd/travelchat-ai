# Native Social Dry-Run

## Current Live Check

### Delivered Integrity Check

PR https://github.com/nkopp-cmd/travelchat-ai/pull/131 merged into `cloudflare/full-migration` as `4293c5d2c8af90414cb1a915a3301098d81cce34`.
Source commit: `b5a8e31df73c5d92657fd3dada3084805959d1cc`; source and merge trees match.
GitHub verify passed on the PR (`34701039542`) and the exact merge (`34701338235`).
The host checkout installed `scripts/native-social-review.mjs`, Git blob `6874cbdfec1855727a3d711b4700f3e16859757c`.
This is host command delivery, not a new Worker deployment.

The installed command read the actual native feed: one page, 58,588 bytes, 25 venue observations, and zero accepted social posts or ranks.
It kept `publicationReady=false`, `applied=false`, and `publicRankingsAction=unchanged`. It made zero paid-provider calls.
The private report is `cloudflare/auth-proof/.preview-private/social-review-4293c5d.json`.
Report SHA-256: `953c16ce8169002ae4a01ec6e0c1a26cc6ee92a88f3ba19ea4f4574fc405bb61`.
The accompanying host/preview receipt is `.preview-private/social-release-131.json`; live identity verification ran at `2026-09-12T15:10:29.491Z`.
All eight public catalog records matched their existing manifests. The user-manager interface reported the unchanged transfer timer active.
Preview version remains `5bf95956-8bba-4158-9c8a-c2e8a81f6b51`, deployment `f521bb8d-553b-4c31-9429-86bb08fe9b04`, tagged `b2cabd6c75a7e1b055c7537a3553ab2a4c95fc26`.
No database write, asset update, schedule change, or ingestion operation ran for this increment.
Host CLI rollback reference: `eb43077c904a4fde55adf3bb64e775442af3b9bc`. Preserve all private reports; no database rollback is needed.

Gravity accepted `verify-commit Localley venue-social-next 4293c5d2c8af90414cb1a915a3301098d81cce34`.
That establishes coding evidence, not six new licensed images or real current-week ranking coverage.
Those publication gates remain blocked on exact asset rights and accessible supported-platform post evidence.

### Venue-Social Continuation

The authorized `venue-social-next` task retained the existing owner, published UUIDs, and hourly transfer.
Two additional tourism-channel candidates were probed: `https://www.youtube.com/@VisitSeoulTV` and `https://www.youtube.com/@ImagineYourKorea`.
Both returned HTTP 302 to `consent.youtube.com`. The collector did not follow the consent flow or synthesize a consent cookie.
No channel ownership, channel ID, exact post, publication timestamp, or engagement count was established by these responses.
No RSS request, collection job, paid fallback, or public ranking write followed those redirects.
These are blocked discovery attempts, not accepted social coverage. Earlier sampled Mastodon posts also remain outside the supported three-platform intake.

The native review CLI now rejects invalid UTF-8 in feed bytes and selected input, spot, or manifest files.
Previously, Node's replacement decoding could change corrupted evidence text before review. The new decoder fails before producing a report.
Valid Korean text, an explicitly encoded replacement character, and multibyte characters split across network chunks remain unchanged.
Six added cases cover invalid encoding and a full wire-to-ranking synthetic journey with Unicode, exact timestamps, nulls, zero, and provenance.
The focused regression set contains 141 tests, including existing manual-match and ranking protections.
The decoder change belongs to the host review command, not the deployed preview Worker. It does not change publication or scheduling.

After Scrapelet PR4 deployment on 2026-09-12, the actual additive feed read succeeded.
One page returned 58,588 bytes and 25 venue observations, with zero social records, discovery leads, or source diagnostics.
The result was `unready`, with zero accepted posts and zero ranks. `publicationReady` and `applied` stayed false.
Existing public rankings were unchanged. This verifies feed compatibility, not social coverage.
Earlier HTTP 400 results below are historical checks against the previous feed contract.

This path reviews private Scrapelet evidence. It cannot publish rankings or clear existing rankings.
It does not import paid ingestion, database clients, schedulers, jobs, or production adapters.
No source requests, paid APIs, AI calls, authentication bypasses, or asset publication occur.

## Commands

```sh
node --import tsx scripts/native-social-review.mjs --dry-run --live
node --import tsx scripts/native-social-review.mjs --dry-run --input /private/feed.json --spots /private/spots.json --manifest /private/review.json --out /private/report.json
```

The operator must supply `--dry-run` and exactly one input source.
`--manifest` explicitly selects the trusted manual review file. Feed-body approval fields have no authority.
`--spots` supplies existing public spot rows as a JSON array. Omission means no eligible spots.
There is no database mode, service key loading, generic URL fallback, `--apply`, or publication RPC.
Optional output uses exclusive creation and mode `0600`. Existing files cannot be overwritten.
Console output contains counts and reasons, not post text, source URLs, or credentials.

## Feed Contract

The fixed private endpoint is `http://100.112.156.12:3010/api/localley/staged` with `city=seoul`.
The reader requires `socialEvidenceVersion=localley-social-evidence-v1` and `publicationReady=false`.
It reads `records`, `discoveryLeads`, `socialSources`, `nextOffset`, and `nextSocialOffset`.
It follows both cursors, including empty record pages. It ignores repeated pages from an exhausted stream.
Bounds: 100 entries per stream/page, 51 requests, 5,000 total entries, and 8 MiB total response bytes.
Each GET has a 20-second timeout and rejects redirects. Invalid or incomplete pagination fails closed.
This offset contract is not a transactional snapshot. Concurrent staging can shift pages; publication stays disabled.

## Intake And Review

`lib/native-social-trends.ts` exports:

- `reviewNativeSocial`: pure intake, conflict handling, matching, and provisional ranking.
- `validateNativeSocialPost`: structural identity, timestamps, nullable metric shape, and coherent source-evidence checks, not ranking eligibility.
- `validateNativeSocialManifest`: operator review schema and binding checks.
- `nativeSocialIdentity`, `exactNativeSocialTime`, and `nativeSocialWeek`: strict identity and UTC-week helpers.
- `nativeContentDigest`, `nativeSocialDigest`, and `nativeVenueIdentity`: review binding helpers.
- `metricWeights`, `NATIVE_SOCIAL_VERSION`, `NativeSocialPost`, and `NativeSocialMapping`.

Post URLs require exact allowlisted platform hosts and supported permalink paths.
Canonical URL, platform, external ID, and provenance URL must identify the same exact post.
Publication and observation require valid timezone-qualified timestamps, with seconds and no unknown `-00:00` offset.
Publication must fall within the current UTC Monday week. Neither timestamp can be future-dated.
Metric values must be numeric, safe, nonnegative integers or explicit `null`. Numeric strings and K/M abbreviations fail.
A single excerpt must support the complete metric vector, including an all-null vector.
Conflicting evidence fails. Counts are never assembled across jobs.

All valid raw observations remain in the report, including source IDs, timestamp strings, and null metrics.
For each post, the latest coherent observation wins, including metric declines.
Selection precedes ranking metric eligibility. At least one metric must be observed before matching or ranking.
An all-null latest observation stays in the evidence and receives `metrics_unavailable`; older known counts never replace it.
The producer's `rejected` state with only `engagement_unavailable` issues can enter structural selection when all metrics are null.
Other producer rejection issues remain ineligible. Equal-time unknown-versus-zero or unknown-versus-known vectors still conflict.
An unchanged content binding remains valid during an unknown refresh, but cannot make that refresh rankable.
Any same-instant content/evidence/metric conflict rejects the whole post group, even if another observation is newer.
Equal coherent observations count once. Source evidence changes invalidate review, even if counts increase.
Discovery leads always remain `discovery_only`; their metrics cannot enter ranking.

The trusted manifest has this structure:

```text
version: "localley-native-social-review-v1"
operator: nonempty reviewer identity
reviewedAt: exact timestamp, at or after the reviewed observation
mappings[]:
  platform, externalId, canonicalUrl
  contentDigest: nativeContentDigest(reviewedObservation)
  sourcePin: { jobId, sourceUrl, observedAt }
  reviewedObservation: complete reviewed social observation, including kind: "social"
  spotId: approved existing spot UUID
  canonicalVenueIdentity: { name, address, location, google_place_id, destination_id, local_area_id }
  review:
    scope: "exact_venue_and_branch"
    excerpt: actual excerpt within the post's source evidence
    venueName, venueAddress: exact values from the canonical spot identity
    venueSourceUrl: reviewed HTTPS venue source
    venueSourceExcerpt: source excerpt containing that exact venue name and address
    assessment: "positive" | "ambiguous" | "negative"
    decision: "exact_venue_recommendation" | "exact_context_review"
    rationale: manual review reason
  bindingHash: nativeSocialDigest(mapping without bindingHash)
```

The source pin must match the stored reviewed observation. Its metrics do not pin later refreshes.
The immutable digest includes platform, post ID, permalink, caption, publication, source identity, and evidence text/locators.
It excludes observation time, job ID, and changing metrics. A refresh can reuse the review without retaining its old feed page.
Evidence order and raw publication strings remain pinned. Changed evidence representation requires a new review.
The binding hash also pins the canonical venue identity and the review evidence.
Hashes detect binding mismatch; they are not signatures or proof that human review occurred.
Trust comes only from the operator's explicit local manifest file selection.

There is no name-substring matching. A market is not its food stall. A museum is not another branch.
The reviewer must check actual venue identity, branch, address, and the claim's meaning.
Ambiguous or negative assessments require an explicit `exact_context_review` decision and rationale.
A small English negative-word guard adds rejection checks. It is not a multilingual semantic classifier.
The operator remains responsible for truthful claim assessment and reviewed source excerpts.

Existing spots must retain `verified=true` and a numeric `localley_score>=4`.
Intake uses the existing public-quality helper, requires stored genuine photos, and checks coordinates plus Seoul address evidence.
The conservative Seoul coordinate envelope is latitude 37.4-37.72 and longitude 126.76-127.19.
Spot identity fields must exactly match the reviewed manifest. No rating or verification value is invented.

## Formula Parity

The existing formula is in `lib/weekly-social-trends.ts`, `engagementValue` and `rebuildCityRankings`.
The dry-run does not import that module because it includes paid and publication code.

```text
observed weighted contribution = views + 8*likes + 12*comments + 20*shares + 16*saves
normalized signal = log1p(contribution) / log1p(max(1, platform/city maximum))
corroboration = min(1, (postCount-1)/3 + (platformCount-1)/2)
recency = fraction published within eight days
score = min(100, 100 * (0.55*peak + 0.20*mean + 0.15*corroboration + 0.10*recency))
```

Only observed counts contribute. Unknown counts remain `null`, not observed zero, in every output observation.
`weightedScoreLowerBound` describes observed contributions, not a measured total.
Normalized scores and ranks are provisional; normalization means they are not mathematical lower bounds on final scores.
As before, zero-contribution posts do not rank. Accepted zero-metric observations remain in the audit report.
Platform maxima include valid unmatched city posts, matching the existing normalization scope.
The top five use descending unrounded score, then spot UUID for stable ties.

Intentional differences: no substring matching, no metric-max merging, nullable metrics, strict evidence review, and stable ties.
The narrower Seoul geography gate and single-excerpt coherence check reject uncertain evidence conservatively.
No production SQL exists here. Nullable producer design and native coverage remain prerequisites for future publication work.

## Live Check History

Recorded read-only check on 2026-09-12, before the parent's Scrapelet deployment:

- The additive request returned HTTP 400: `Use city, limit, and offset only.`
- A separate legacy-contract GET returned HTTP 200, 25 records, total 25, and `nextOffset=null`.
- All 25 records were non-social. The live legacy feed contained exactly **zero social posts**.
- It lacked `socialEvidenceVersion`, `discoveryLeads`, `socialSources`, and `nextSocialOffset`.
- The strict CLI therefore failed closed. A complete additive-feed live dry-run remains blocked by the live server version.
- No ranks were produced. No public rankings changed. No service was restarted and no job was created.

The local Scrapelet source already contains the additive contract in `src/lib/localley.ts`, `localley-social.ts`, and `localley-store.ts`.
Serving that code remains the parent Scrapelet owner's task. This implementation does not deploy or modify Scrapelet.
The parent will deploy Scrapelet and rerun the dry-run later. No additive-feed contract success has been observed here.
The P2 correction made no production requests; the HTTP 400 above remains the last actual Localley additive-feed result.

Separate public-source probe history, reported by the parent/user, describes source coverage gaps:

- YouTube required login; its RSS probe returned HTTP 404.
- Bluesky returned HTTP 403.
- Mastodon returned two unrelated items.

These probes were separate from the Localley staged-feed request. They do not establish additive-feed success or failure.
They also do not establish accepted Localley posts. This correction did not repeat those probes.

## Verification

All fixtures in `__tests__/lib/native-social-*.test.ts` are explicitly synthetic.
Initial checks on 2026-09-12: 71 native tests and 55 existing quality/ranking tests passed, 126 total.
After the P2 correction, 80 native tests and 55 existing quality/ranking tests passed, 135 total.
The nine added regressions cover unknown refreshes, producer rejection flags, input-order permutations, conflicts, and normalization.
Focused ESLint and repository TypeScript checks passed. Heavy checks used the shared resource gate.
The historical strict live CLI reported `unready`, accepted posts `0`, ranks `0`, and `publicRankingsAction=unchanged`.
Its failure count describes the failed run, not complete coverage of unavailable auxiliary streams.
The P2 correction ran local checks only. It did not rerun the live CLI or any public-source probe.
Run focused tests through the shared resource gate:

```sh
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh npx vitest run __tests__/lib/native-social-trends.test.ts __tests__/lib/native-social-feed.test.ts --maxWorkers=1 --no-file-parallelism
/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh npx tsc --noEmit --incremental false
```
