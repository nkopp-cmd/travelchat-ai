# Weekend picks photos

City photos for the landing "Weekend pick" selector
(`components/landing/weekend-picks.tsx`). They are the same Unsplash
photographs `lib/city-images.ts` already uses for each city:

- Seoul: https://images.unsplash.com/photo-1538485399081-7191377e8241
- Tokyo: https://images.unsplash.com/photo-1540959733332-eab4deabeeaf
- Bangkok: https://images.unsplash.com/photo-1508009603885-50cf7c579365
- Singapore: https://images.unsplash.com/photo-1525625293386-3f8f99389edd
- Osaka: https://images.unsplash.com/photo-1590559899731-a382839e5549
- Kyoto: https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e
- Taipei: https://images.unsplash.com/photo-1470004914212-05527e49370b

Retrieved 2026-10-22 at 1600 px, cropped to 3:2 (sharp `attention`), saved as
480x320 and 960x640, AVIF quality 45 and WebP quality 60. The static-asset CDN
serves them; they load lazily. Use a new versioned filename when replacing one.
