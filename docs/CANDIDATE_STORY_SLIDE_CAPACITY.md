# Candidate story slide capacity — 2026-10-05

## Release

PR [377](https://github.com/nkopp-cmd/travelchat-ai/pull/377) tested head `64e58806e40bfeca5b57e3b1b1502415ffeb865a`.
Required self-hosted [CI37321893022](https://github.com/nkopp-cmd/travelchat-ai/actions/runs/37321893022) passed in9m45s.
Merged source `978a1dc051ae9ae90dbf7c5e23f7c1a09ea971b5` has the identical tree `30107d9103ad438bda87aa5285d534958011eea8`.
The pinned OpenNext build and account guard passed.
Only `localley-next-preview.nkopp.workers.dev` received the release.
Preview version `6bb33686-6b1d-44c4-982a-a740ecda1167` runs100%.
Deployment `ead473e7-3af0-40ba-a949-5c85e3783d35` carries the exact merged source tag.
Rollback preview version `e13812dc-1c24-4c19-9aa5-bd7ecefc2cdf` remains available.

## Scope and tests

Candidate persistence and readiness accept PNGs up to8MiB, with64MiB aggregate capacity.
The body reader streams through a byte guard before native multipart parsing.
It permits at most64MiB plus128KiB request overhead.
Explicit `data_candidate=d1&gallery_candidate=fresh` writes require the exact preview host and a verified reserved owner.
Fresh authorization rejects historical mappings and foreign owners.
The guarded media upsert creates missing rows and changes only saved slides on existing rows.
Existing legacy behavior, normal www2MiB limits, PNG detection and WebP refusal remain.
No schema, provider selection, generation activation or production binding changed.

Twenty-seven focused tests passed, with TypeScript, focused lint, build and required CI.
Tests consume an actual `ImageResponse` PNG above2MiB, not a mocked renderer.
Real SQLite tests cover fresh trips without media, preserved fields, replacement cleanup and uncertain write replies.
Other tests cover ownership, request limits, missing/false lengths, readiness and normal routing.
The focused review's concrete memory finding was fixed before merge.
No concatenated full-body copy remains in the parser.

Pinned local Wrangler/workerd accepted32parts totaling64MiB without Content-Length.
It accepted exactly67239936request bytes and refused67239937bytes with400.
That probe covered the committed parser, separate from the full hosted application.

## Hosted acceptance

Two fresh non-admin accounts used reserved `preview.localley.test` addresses and the private verification outbox.
An actual saved one-day trip had no media row before persistence.
Three retained, real1080×1920 rendered PNGs, each5751967bytes, stored successfully.
Owned media reads returned identical bytes and SHA256 hashes, with PNG MIME.
The created media row retained null backgrounds and private/default counters.
Foreign writes and reads returned404; loss of the fresh opt-in returned404.
Anonymous persistence returned401; an8MiB+1upload returned400 without changing metadata.
Readiness queued exactly one private story-ready message. It sent no external email.

A separate actual14-day saved trip accepted16valid4MiB PNGs, totaling67108864bytes.
This exercised the full hosted OpenNext multipart parser, authorized writer, R2 objects and D1 metadata.
The padded PNG fixture decoded to1080×1920 in Chromium before this upload.
The hosted maximum test used16slides; the separate local parser probe used32parts.

Desktop1440px and mobile390px showed three decoded private slides without horizontal overflow.
Reload retained the slides. Foreign and anonymous pages exposed no private title or media.
Their streamed denial pages returned200; this is not an API authorization success.
Screenshots were inspected after awaiting image decode.
An initial reload assertion sampled transient duplicate nodes; the settled check passed.
An initial fixture save used an invalid score and returned400 before any trip write.
The corrected fixture reused the verified accounts.

## Evidence and limits

Private receipts under `cloudflare/auth-proof/.preview-private/` retain raw responses before assertions:

- `story-slide-wrangler-runtime-20261005.json`: local streaming boundary proof.
- `story-slide-hosted-accepted-20261005.json`: real large PNG storage, ownership and readiness.
- `story-slide-hosted-maximum-accepted-20261005.json`: full hosted64MiB persistence.
- `story-slide-browser-settled-20261005.json`: inspected desktop/mobile gallery proof.
- `story-slide-hosted-before-20261005.json`:55-table/source/AUTH/admin/Worker baseline.
- `story-slide-hosted-after-20261005.json`:14:37:38UTC restoration and exact release proof.

No provider or paid generation call occurred.
This acceptance proves persistence and readiness, not the full paid story pipeline.
Generation stays disabled until its separate tier, weighted usage, cache and provider acceptance gates pass.
Production application data remains Supabase; production auth remains D1.
Full cutover parity, executed rollback, canary and seven-day retention gates remain open.

## Cleanup and production proof

Both owned R2 prefixes are empty after deleting exactly their19objects.
Both test trips, media rows and new owners are absent.
Both preview users, sessions, accounts, verification entries and outbox messages read back as zero.
Fixture credentials were removed from retained receipts.
All55APP table counts, import hash, AUTH fingerprints and checked source hashes match the fresh baseline.
Foreign-key checks return no violations.
Production version `b42e8926-6b15-4875-85ec-44d39513832d` and deployment `6f22f0cb-a8b8-4e8f-bf76-19965611b471` are unchanged.
Both production admin IDs remain in AUTH and source.
Production rollback `a548f24e-1f17-4021-a830-219074baa337` and the previous preview version are available.
All three public roots return200 after following the apex redirect.
Preview remains read-only against Supabase, with private outbox mode and generation/bypass flags absent.

Fresh background-link row creation before slide persistence still needs its separate pipeline gate.
This release creates fresh media rows through slide persistence only.
