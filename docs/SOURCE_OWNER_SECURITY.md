# Source owner isolation repair

## Checkable scope

- Preserve every existing Source row and both real administrator identities.
- Enable owner RLS on six private tables; retain read-only public spots/challenges.
- Preserve explicit published itinerary reads without exposing unlisted share codes through the Data API.
- Revoke TRUNCATE from both public roles on these eight tables and both affiliate tables.
- Ship compatible application reads/counters before applying Source permissions.
- Pass real disposable Postgres owner/foreign/public/CRUD/rollback tests, focused route tests and required CI.
- Verify live private owner journeys and denied viewers, current public health, schema/row/admin/Worker guards and exact owned fixture cleanup.

This is a security repair of the live Source system, not a D1 data switch. The common migration gates remain open. Do not delete Source data or claim a completed incident investigation.

## Confirmed read-only findings — October 17, 2026

The official security advisor endpoint returned44findings. Eight application tables had RLS disabled, no policies and CRUD grants for both public roles. HEAD requests with `limit=0` proved anonymous visibility without returning user records:

| Relation | Rows | Required access |
| --- | ---: | --- |
| users |8| Own profile; explicit public projections through the app |
| itineraries |85| Owner; explicitly published reads; share-code app route |
| conversations |115| Owner |
| messages |173| Owner of parent conversation |
| user_challenges |6| Owner through UUID user_id |
| user_progress |0| Owner through UUID user_id |
| spots |3295| Public read, trusted server writes |
| challenges |10| Public read, trusted server writes |

No dependent views were found. The existing private-policy SQL was never applied and incorrectly expected clerk_user_id on the two UUID-linked tables. All85trips have a nonempty clerk owner, no conflicting UUID owner and no foreign conversation-to-trip link. Source has zero shared/public trips in this dated snapshot. Existing owner/query indexes cover trips, conversations and messages.

Both public roles also had TRUNCATE on all ten target tables. RLS does not protect TRUNCATE. This repair removes that privilege without changing other grants. Catalog evidence establishes privilege exposure; it does not show that the REST API exposes a truncate command or that anyone used it.

The security advisor's other findings include the PostGIS extension relation, mutable function search paths, extension placement, definer execution and legacy Source Auth configuration. This repair does not claim those findings are closed. No actual customer records, private messages or provider credentials were exported during the audit. Nils owns historical incident assessment and any required external notice.

## Permission rules

`scripts/d1-migration/source-owner-policy-guard.mjs` uses JWT `sub` as text, matching the Worker's existing server-minted tokens. It never uses editable user metadata or casts Clerk/Better Auth IDs to UUID.

- users: authenticated owner through clerk_id.
- itineraries: authenticated owner through clerk_user_id; user_id must be null or that owner's UUID profile. A separate authenticated SELECT policy admits is_public=true. No anonymous itinerary policy exists.
- conversations: authenticated owner; linked_itinerary_id must be null or an owned itinerary.
- messages: authenticated owner of the parent conversation in both USING and WITH CHECK.
- user_progress/user_challenges: authenticated owner through user_id -> users.id -> users.clerk_id.
- spots/challenges: anonymous/authenticated SELECT only. Existing server role retains trusted writes.

The guard locks all ten targets, validates the physical/RLS/policy state, server CRUD/bypass and public roles' lack of bypass/owner membership, and refuses inconsistent historical ownership. It creates nine policies, enables RLS on eight tables and removes twenty role/table TRUNCATE privileges in one transaction. Lock timeout2s; statement timeout8s. Full row fingerprints must remain identical inside the locked transaction. Existing columns, constraints, indexes and functions remain unchanged.

Emergency restore requires the exact current policy/RLS/ACL catalog fingerprint. It drops only the nine known policies and restores the previous flags/grants. It reopens the known exposure. Test it locally; never automatically restore or retry an unknown result. Keep the metadata repair when handling an unrelated Worker regression unless the reviewed recovery requires otherwise.

## Application compatibility and privacy

Personal mutations retain the authenticated database client. Lifetime Premium additionally requires the existing server owner allowlist; changing a Source profile email cannot grant paid access. The two approved owner IDs and email allowlist stay unchanged. A new tier-cache namespace prevents reuse of the old email-only grant; existing invalidation tags remain intact. Only bounded public projections and server-maintained counters use the trusted server client:

- Likes verify the target is shared/published before insertion, keep personal saved rows scoped to the actor, and compute/update the complete counter through the server. Private counters are not exposed through GET; an old like remains removable after sharing stops without returning the private count.
- Duplicate reads one target through the server, checks owner/shared/published status, then inserts as the actor. It no longer sends nonexistent daily_plans/preferences columns.
- Public friend/review author projections select only public names/level fields. Saved-trip details use only the actor's saved IDs and still require shared=true. Actual Source usernames replace nonexistent name/avatar columns.
- Shared export preserves its existing owner-or-shared check after the bounded server lookup.
- Review create/update/delete retain personal ownership, bind review ID to its spot, and refresh only that spot's cached count/rating through the server. Failed reads/zero affected updates cannot report a successful counter update.
- Normal itinerary detail and metadata now use the same owner-or-published rule as the existing API/story renderer. A foreign private title cannot escape through metadata. Unlisted sharing retains its separate share-code route. Owner metadata is noindex/nofollow. Detail and shared-page JSON-LD escape less-than signs so stored text cannot terminate a script element.
- Background URL reads also enforce owner-or-published access and private no-store responses. No generation, provider, media byte detection, WebP handling, image storage or rendering logic changes.

Targeted static caller review covers saved trips, export, revise, share, mail, generation, profile, gamification, subscription and friends. It found the compatibility and privacy changes above. Public profile/explore/leaderboard/shared pages use bounded application server queries. This static review is not proof of unknown external writers. Normal preview has no Source JWT binding; private Source access there must fail closed rather than weaken production privacy. Candidate D1 routing and storage are unchanged.

## Local evidence and release order

The isolated pinned Postgres proof uses synthetic policy-field fixtures, not a full clone of Source/PostGIS. It tests actual PostgreSQL RLS, both public roles, two owners, public catalogs, owner reassignment, cross-user links, published read/no foreign update, real TRUNCATE denial, exact rollback/reapply and drift refusal. Four actual route tests use database-backed client adapters with the real policies enabled: like/unlike, shared copy, private denial and review statistics. No network/provider calls are allowed there.

Corrected policy proof passes95checks. The extended actual-handler proof passes96checks, including the four route cases and owned container cleanup. First rollback proof caught a variable named current_catalog colliding with PostgreSQL's built-in expression; observed_catalog_md5 fixes it. That failure remains retained. Final focused routes/page/metadata/export/reviews/tier and existing quota checks pass92tests; TypeScript and ESLint pass. Existing unused _amount lint warning remains; there are no lint errors. The first mixed suite exposed a stale plain Request fixture after the route began requiring NextRequest; corrected real request fixtures pass. CI repeats both database proof and route tests. SQL review approves the guard. Runtime review found no visible P0/P1 and required confirmation of unchanged duplicate/export/background PATCH checks; all three private non-owner tests pass. Separate review approves the owner-bound lifetime grant. The initial broad review hit its output limit and was replaced by these bounded reviews. Read-only current eligibility is1before/1after, with0unlisted email grants.

1. Commit/push the isolated PR. Keep it draft until exact CI and final review pass.
2. Build/audit a public-only OpenNext artifact from that source. Preserve current account, bindings, both admin IDs and Source fingerprints.
3. Upload, perform the existing1% version override canary and real rollback, activate the compatible Worker and verify its default.
4. Announce the brief permission window. Retain exact catalog/ACL/row backups. Apply the merged guarded SQL once; reconcile any unknown result with read-only queries.
5. Verify only the intended metadata changed, all existing rows remain identical, public roles see no private rows, public catalogs remain readable and server counts remain complete. Prove real owned private journeys, second-owner denials and exact reserved fixture cleanup. Inspect desktop/mobile screenshots.
6. Record exact commit, required CI, merge, Worker/deployment, Source receipt and rollback limits in the canonical plan and release record. Remove owned worktrees/helpers only after evidence is retained.

Pre-release snapshot, superseded by the dated results below: production was19b90012/be8a200a and previewe08db2c5/7cdc7953. Affiliate435 was verified separately.

## Compatible runtime release and first permission attempt — October 17

PR436 source589272d2 passed required CI38999330578 and merged81357250 with an equal tree. The public-only pinned build passed. Its first artifact scan refused normal generated symlinks; the corrected confined scan inspected7809files,9owned links and71private values with zero hits. No secret entered the release build environment.

Worker2c328128-27cd-44dd-be51-e1d0dec9e91d passed the inactive upload's15checks, preserving all55bindings, Source48table fingerprints, Auth counts, both administrators and preview. Canary9b169dd8 at1% passed38real owner/login/save/reload/chat-storage/foreign-denial checks and exact cleanup. Rollback86c0e390 restored19b90012 at100%. The initial rollback health probe passed home200 then wrongly expected protected /explore200; corrected checks require its307login redirect. Four other current public routes return200. Defaultb5efe6f6 at100% passed the same38checks and exact cleanup. All eight desktop/mobile screenshots were inspected. The synthetic empty trip intentionally has no resolvable map stops; provider calls were blocked. This is not full generation/map/checkout acceptance.

The rollback watchdog is disarmed and both its timer and service are inactive. The one-time permission request then failed with HTTP400. Fresh read-only reconciliation proves all ten target catalogs and all48table row fingerprints stayed identical. Supabase Postgres logs identify SQLSTATE57014, statement timeout at04:12:41UTC. No write was retried. A read-only replay of the precondition/hash portion passes; ownership, grants and historical links are valid, with no current target locks.

Read-only EXPLAIN ANALYZE measures one original fingerprint at4824ms and the fixed-width digest form at1732ms against the current live rows. Two original full-JSON sorts exceeded the unchanged eight-second transaction budget. The follow-up changes only the two fingerprint expressions to sort32-character row digests. It keeps the two complete before/after comparisons, table locks, timeout and all permission/rollback guards. A disposable DDL trigger now attempts an unexpected row update; the proof must refuse and roll back both data and policies. The permission retry remains gated on this follow-up's review, exact green CI and merged source. The first failure receipt remains retained.

Private receipts use source-owner-* under /home/dev/.local/state/localley. No actual customer rows were copied into those receipts; metadata, row fingerprints and controlled synthetic records are separate. Full D1 migration and historical incident assessment remain open.


## Current permission repair — verified October 17

PR437 source `1de25ec1ed6a5f0c9157638dfb0502730ebf1b8a`, required CI `39002485732` SUCCESS and merge `e76a5f6d35b68c78ec39366566863fcc9b26ebf5` have equal trees. Local and downloaded exact-CI PostgreSQL proofs pass99checks, including the four actual handlers, attempted same-transaction row-write refusal, exact data/policy rollback and owned container cleanup. The fixed-width digest SQL SHA256 is `dff6f7bcc0d4c9bfc0c25d532c565d6904884b88500d2c7743e849702a08690f`. The superseded03a99d06 CI39002014713 was intentionally cancelled for the required current release record; it is not a passing run.

Before retrying, a separate live45check proof validates both real server-minted subjects against the already-installed saved_spots authenticated owner policies. It seeds only private reserved bookmarks, verifies owned reads and deletes, denies foreign reads/deletes and restores every Source/Auth count and fingerprint. No spot row changes; no application POST/XP, mail, partner, generation or paid calls. This confirms the live token path before enabling the new private-table rules.

Exactly two permission operations occurred: the first fully rolled back at8seconds; the second applied the merged guarded SQL once. No write followed an unknown result. The second operation creates only nine policies, enables RLS on eight targets and removes20public TRUNCATE grants. Complete raw ACL/column-ACL backups show that all other grants, grantors and grant options stay identical. All48Source table counts and complete row fingerprints remain identical, as do columns, constraints, indexes, triggers, existing affiliate policies, Auth counts, both actual admin rows and both Worker deployments.

The first verifier wrongly required HTTP200 for a valid HTTP206 on nonempty public catalogs. That error and an unchanged read-only repeat remain retained. The corrected read-only reconciliation passes187unique checks; its raw501entries include repeated checks and must not be presented as501distinct tests. Private target HEAD counts are all0; authenticated unknown-owner counts are all0; public challenges10/spots3295 match the original totals. Current policy/RLS/ACL catalog MD5 is `e97538abc7b5b27790a1fb844f44bfb8`. The actual operation succeeded before this verifier correction; no DDL was retried afterwards.

Post-policy live proof passes51checks: two real verified controlled logins, private owner save/reload, conversation/message persistence, foreign API denials, existing bookmark subject/ownership checks and desktop/mobile owner/denied pages. Stored script text does not execute or leak through a foreign title/metadata. All12successful screenshots across canary/default/post-policy were opened and inspected. Empty synthetic trips intentionally have no map stops; providers are blocked. This is not full provider/generation/maps or purchase acceptance. Every owned Source row and D1 user/account/session is removed; complete48table fingerprints, Auth counts and both admin hashes return to baseline.

Final read-only guard passes35checks. Production remains Worker2c328128/b5efe6f6 at100%; previewe08db2c5/7cdc7953 is unchanged. All55complete binding definitions match the prior Worker, four production schedules remain unchanged, preview has none, and all four proof cleanup timers plus the rollback timer/service are inactive. Current public home/spots/pricing/cities return200; protected explore retains its307login redirect. The security advisor scan falls44to36findings; the remaining RLS-disabled relation is the PostGIS extension table spatial_ref_sys. Other advisories are not closed by this repair.

The full48table role audit also finds three permissive PUBLIC saved_itineraries policies, with0current rows. Restricting those personal saved-trip rows is a separate builder follow-up. Subscriptions/usage retain owner SELECT-only policies, and saved_spots already requires authenticated ownership. No historical incident conclusion follows from empty current tables. Nils owns the existing historical exposure NEED; no external notice has been sent.

### Recovery and retained proof

Keep the compatible2c328128 runtime when handling unrelated incidents. The actually tested19b90012 rollback predates the privacy/permission change and is not an approved post-repair rollback. An exact-catalog emergency metadata restore is retained privately and was tested only on disposable Postgres; it reopens the known exposure. Never run it automatically. Full D1/data rollback, rehearsal, canary and production-switch gates remain separate and open. Supabase remains the live application data store and must not be cancelled or deleted.

Private durable receipts under /home/dev/.local/state/localley include source-owner-metadata-operation-attempt2-20261017.json, source-owner-final-readonly-reconciliation-20261017.json, source-owner-live-{canary,default,token-preflight,post-policy}-20261017.json, source-owner-final-guard-20261017.json, exact-CI PostgreSQL proof, screenshot hashes and review verdicts. Row fingerprints and exact catalogs are retained; no actual customer row content or credentials were copied into these audit receipts. The compatible runtime delivery record is docs/releases/seoul-discovery.md. This evidence update changes documentation only and needs no Worker deployment.
