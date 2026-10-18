# Landing hero

These variants retain the existing Tokyo photograph:
https://images.unsplash.com/photo-1540959733332-eab4deabeeaf

Retrieved 2026-10-18; resized to 640, 1280 and 1920 pixels, WebP quality 58.
No generated imagery or new external image source is introduced.
The existing Cloudflare Worker static-assets CDN serves these files.
The responsive preload and image use the same source set and sizes.
Use a new versioned filename when replacing an image.

## Preset photographs

The landing presets reuse these existing city photographs:

- Seoul: https://images.unsplash.com/photo-1538485399081-7191377e8241
- Tokyo: the existing hero asset above.
- Bangkok: https://images.unsplash.com/photo-1508009603885-50cf7c579365

Retrieved 2026-10-18. The preset variants are 480×160 and 960×320 pixels,
center cropped, WebP quality 58. They use native responsive image selection and
lazy loading. Cloudflare serves them directly, without an Unsplash fetch or an
image optimization request at page load. No generated imagery or new source is
introduced. The six preset files total 182,824 bytes before CDN compression.
