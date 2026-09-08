# Story Video Font

## Source

- Font: Noto Sans KR Regular, version 2.004, static OpenType with CFF outlines, weight 400.
- Copyright notice from the font: Copyright (c) 2014-2021 Adobe (http://www.adobe.com/).
- The binary retains the original copyright symbol and all upstream name records.
- License: SIL Open Font License 1.1. The complete upstream license is in `OFL.txt`.
- Repository: https://github.com/notofonts/noto-cjk
- Immutable commit: `f8d157532fbfaeda587e826d4cd5b21a49186f7c`.
- Upstream file: `Sans/SubsetOTF/KR/NotoSansKR-Regular.otf`.
- Download: https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf
- Upstream license: https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/LICENSE
- Acquired: 2026-09-07, with `curl --fail --location --proto '=https' --tlsv1.2`.
- Asset size: **4,644,748 bytes** (about 4.43 MiB).
- Asset SHA-256: `69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68`.
- `OFL.txt` SHA-256: `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`.

This is the upstream Korean regional subset, not a locally generated subset.
Localley did not modify, convert, rename internally, or further subset the font.
No font tools or packages were installed.
The host had no FontTools module or `pyftsubset` command.
The upstream regional subset avoids shipping the 16,433,112-byte full CJK Regular file.
Only one weight is included.

## Compatibility

The official format guide recommends regional subset OTF files for one region:
https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/README.md

Satori documents TTF, OTF, and WOFF support, but not WOFF2:
https://github.com/vercel/satori#fonts

Fontsource's Noto Sans KR catalog was reviewed:
https://fontsource.org/fonts/noto-sans-kr

Its version 5.2.8 static Latin CSS was also inspected:
https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-kr@5.2.8/latin-400.css

That CSS specifies WOFF2 first, then WOFF, for a Latin-only file.
The WOFF fallback has a supported format, but cannot supply Korean coverage by itself.
The catalog also offers a variable family.
A family name or CSS import does not establish Satori compatibility.
Localley uses the pinned upstream static OTF instead of Fontsource CSS, remote loading, or variable fonts.
No Fontsource package was added.
Tests confirm a `CFF ` table and no `fvar` or `CFF2` table.
Real rendering passed with installed `@vercel/og` 0.8.5 and Satori 0.16.0.
The existing transitive `@shuding/opentype.js` 1.4.0-beta.0 validates outlines in tests.

## Text Contract

`formatStoryVideoText` stays synchronous for validation before provider calls.
Title and caption retain their original 200/160 UTF-16 code-unit limits, before NFC normalization.
Modern decomposed Hangul normalizes to composed syllables before wrapping and rendering.
The renderer uses a fixed local URL and caches verified font bytes.
It checks the asset hash before use and never fetches runtime fonts.
`font`, when specified, must be `noto-sans-kr`.

Accepted normalized characters:

- Printable ASCII U+0020-U+007E, except `<` and `>`.
- LF for explicit, non-empty lines. All other controls are rejected.
- All 11,172 Hangul syllables: U+AC00-U+D7A3.
- Modern conjoining Jamo: U+1100-U+1112, U+1161-U+1175, U+11A8-U+11C2.
- Modern compatibility Jamo: U+3131-U+3163.
- Middle dot: U+00B7.
- Dashes and quotes: U+2013-U+2014, U+2018-U+2019, U+201C-U+201D.
- Ellipsis: U+2026.
- CJK comma, period, and brackets: U+3001-U+3002, U+3008-U+300F.

Other scripts, accented Latin, emoji, variation selectors, bidi controls, and invisible fillers remain unsupported.
Archaic Jamo remain outside the text contract, although this font contains them.
An individual grapheme must fit the line's cell limit.
This rejects excessive uncomposed Jamo clusters without splitting them or stalling the wrapper.
ASCII uses one cell; accepted non-ASCII uses two cells.
Wrapping preserves graphemes, two title lines, three caption lines, and truncation ellipses.
The supplied `AI-generated travel scene` disclosure survives truncation.
The formatter does not invent a disclosure when the caller omits it.

## Evidence

Coverage tests inspect every accepted visible BMP character with Satori's existing font parser.
Each accepted character has a nonzero glyph index and a non-empty outline after normalization.
Tests also cover Korean phrases, mixed long text, Jamo normalization, punctuation, and rejected HTML or controls.
PNG tests check safe bounds and no network calls.
All 83 focused overlay and encoder tests passed on 2026-09-07.
Focused strict TypeScript and ESLint checks passed.

Run the local tests:

```sh
node node_modules/vitest/vitest.mjs run __tests__/lib/story-video-overlay.test.ts __tests__/lib/story-video-encoder.test.ts --maxWorkers=1
node --import tsx scripts/test-story-video-overlay.tsx
```

The proof script uses the actual encoder and existing Docker image with no paid calls.
Containers retain network isolation, 0.5 CPU, 512 MiB memory, and the existing security limits.
The output is synthetic solid-color footage, not generated travel footage.
The caption labels it `TEST / SYNTHETIC INPUT` and retains the AI disclosure.
The proof output is H.264, 1080x1920, yuv420p, 24 fps, 96 frames, and four seconds.
All 9,086 sampled opaque text pixels appear in the decoded video.
The test also verifies unchanged safe zones and encoder directory cleanup.

Artifacts: `test-results/story-video-overlay/{sample.mp4,frame.png,overlay.png,evidence.json}`.
The decoded `frame.png` was opened and reviewed on 2026-09-07.
Both Korean phrases show distinct, readable glyphs, not missing-glyph boxes.
The English disclosure and synthetic label are visible without clipping.
These checks do not establish production deployment or real-provider delivery.

## Redistribution

Retain `OFL.txt` and the copyright notice whenever distributing this font with the worker or application.
Keep the font under OFL 1.1; do not sell the font by itself.
Do not use the authors' names to endorse a modified font.
Check reserved-name restrictions before distributing any future modified version.
Rendered PNG and MP4 documents do not inherit the font license.
Deployment packaging must include the OTF and these notices beside the overlay's fixed asset path.
