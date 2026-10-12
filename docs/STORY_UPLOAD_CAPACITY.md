# Normal story upload capacity

## Observed fault

The actual preview story renderer produced a valid1080x1920 PNG of3518698bytes.
The normal owned Source persistence route refused it because its per-slide limit was2MiB.
The controlled production refusal returned400 and left saved metadata empty.
Source/Auth fixture cleanup passed; no new paid image request was needed.

## Scoped correction

Normal persistence shares the existing bounded multipart reader with the candidate.
The total request allows64MiB of slides plus128KiB multipart overhead.
Actual stream length enforces the bound even when Content-Length is absent or false.
Each slide allows8MiB, with at most32 multipart entries and a checked PNG signature.
Files with WebP signatures remain refused. This is signature checking, not full PNG decoding.
Existing Source ownership, storage keys, partial-save warnings and tier retention remain.
The explicit D1 candidate retains its existing owner/media behavior and uses no Source fallback.

## Delivered verification — 2026-10-12

PR406 rebased sourcef76ddb044b241ce9140212bfee2f408a88f58048 includes the Source serving correction.
Required CI38290914810 passed11m56s;38 focused tests, TypeScript and scoped ESLint passed.
Original sourcef2ebd28 also passed CI38286829934 and a pinned build; it was not deployed.
Scoped capacity and Source serving reviews found no concrete P0/P1; the final pinned build passed.
Final artifact audit:2327files/76757438bytes/92private values/zero unexpected hits.
Only the same five existing public Kakao server aliases appeared.
Artifact SHA256:3962a740b0bbccb3048190adcd40818878bb810fe74db017f69e2259c4d594b8.
PR406 merged as4a030a7 with equal runtime code.

Workerb4d426e2-1952-4f7b-9989-67142b47053f serves100%.
Deployment0385cd50-8091-4ab4-aec7-f208d15cb496; rollback8b4db9c2-8117-46e1-a2a4-f887942c5b4f.
Fifty-three live checks passed with two fresh verified nonadmin owners.
One multipart request saved three retained actual3518698-byte PNG parts without warnings.
Each signed media URL returned200, image/png and the exact original size/hash.
PNG SHA256:1e46cb5118710affb3e869230f68081757ac46b0a3a65b23f54c711d31741de0.
Saved metadata, free7day retention, reload, anonymous401 and second-owner404 passed.
Exact three objects were deleted; authenticated reads returned unavailable400.
Both Source/auth fixtures were removed; four public200, both admins and8/5/33/85/3295 source counts remain.
The independent capacity proof used no browser and no new paid image-generation call.
Device acceptance remains open after the two Source serving harness failures.
Production application data remains Supabase; no full media parity or D1 cutover is claimed.
Private receipts: /home/dev/.local/state/localley/story-upload-*20261012*.
