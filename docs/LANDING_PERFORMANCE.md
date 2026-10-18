# Landing performance

## Scope

Retain the existing dark Localley layout, typography, gradients, controls and Tokyo photo.
This change affects delivery. It adds no new visual system, dependency, font or data request.

The existing home page hydrates its static marketing sections and imports the complete city configuration.
Its CSS background requests the raw 2400-pixel photo, independently of optimized city thumbnails.
The root navigation imports user, notification and subscription UI even when it returns nothing on home.
Visible marketing links also prefetch destination routes before the visitor chooses one.

## Candidate

- Render static marketing sections on the server.
- Keep planner state in client islands; pass only city name, slug and vibe.
- Preserve shared selection, presets, search encoding and trip/browse URL contracts.
- Load the existing app navigation only on routes that render it. Keep its default server rendering.
- Disable speculative marketing-link navigation. Explicit link navigation still uses Next.js.
- Serve versioned WebP hero variants through the existing Cloudflare static-asset CDN.
- Use identical responsive preload and image attributes, high priority, empty decorative alt and intrinsic dimensions.
- Keep the existing gradients over the image. Keep all city cards and image rules unchanged.

Source photo and sizes: public/images/landing/README.md.

## Acceptance

Advisor mobile baseline: LCP9315.536ms and approximately363KB transferred JavaScript.
The paragraph is the LCP element;8179.926ms is render delay. Image removal alone cannot prove a budget pass.
Shared three-run check before this change: home median1054ms, HTTP200; already above200ms.

Require focused control tests, lint/type checks, compiled desktop/mobile browser checks and inspected screenshots.
Require matched Lighthouse runs, a single CDN hero request, no raw hero request, retained navigation and no overflow.
Check the exact CI source, artifact secret audit, bindings and schedules before upload.
Use a guarded zero-percent candidate with explicit version overrides, compatible rollback and default live proof.
Normal traffic stays on the old version during comparison. This avoids mixed-version asset requests.
Cloudflare documents this mode: https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/ Keep measured budget debt open.
Full receipts and later release results belong in the root performance plan; do not infer completion from local code.
