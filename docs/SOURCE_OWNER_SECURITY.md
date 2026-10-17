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

Production is still Worker19b90012/be8a200a, preview e08db2c5/7cdc7953. Affiliate435 is already applied and verified separately. No broader permissions or runtime changes are live yet.
