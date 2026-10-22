# Landing hero

The hero is a poster of the Localley map of Seoul (`seoul-map-v1-*`), not a
photograph. It was rendered offline on 2026-10-22 with MapLibre GL 5.24 and
the Localley style (`lib/maps/localley-map-style.ts`) on OpenFreeMap vector
tiles (OpenMapTiles schema, OpenStreetMap data). Phone: 414x736 CSS px at 2x,
centre 126.9855,37.570, zoom 11.1 -> `m-828`. Desktop: 1920x1080 at 1x, centre
126.951,37.551, zoom 12.55 -> `d-1280`, `d-1920`. AVIF quality 45 and WebP
quality 72. The pin positions in `components/landing/hero.tsx` are projected
from the same cameras; re-render both together. Use a new versioned filename
when replacing a poster. The Tokyo photo hero (`tokyo-hero-v1-*`) was removed.

## Preset photographs

The landing presets reuse these existing city photographs:

- Seoul: https://images.unsplash.com/photo-1538485399081-7191377e8241
- Tokyo: https://images.unsplash.com/photo-1540959733332-eab4deabeeaf
- Bangkok: https://images.unsplash.com/photo-1508009603885-50cf7c579365

Retrieved 2026-10-18. The preset variants are 480×160 and 960×320 pixels,
center cropped, WebP quality 58. They use native responsive image selection and
lazy loading. Cloudflare serves them directly, without an Unsplash fetch or an
image optimization request at page load. No generated imagery or new source is
introduced. The six preset files total 182,824 bytes before CDN compression.
