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

## Verification gates

Twenty-five focused tests, TypeScript and scoped ESLint pass.
The first large-buffer assertion exceeded the default test timeout; size and hash checks replaced it.
Exact CI, pinned build, scoped release review and hosted proof remain required.
Hosted proof must upload three retained actual large PNG parts in one request, then compare storage hashes.
Remove exact owned storage/Source/Auth fixtures after verification and record the Worker and rollback.
No fresh paid image call, full media parity or production D1 switch is claimed.
