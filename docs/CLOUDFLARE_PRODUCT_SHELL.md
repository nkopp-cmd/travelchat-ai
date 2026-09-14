# Cloudflare Localley product shell

Supergoal: the Cloudflare target must look and behave like Localley, not like a migration lab.

The protected preview at `https://preview.localley.io` is a Worker + D1 proof. It is not the full product. Public `localley.io` still serves the Next.js site. Do not point the public domain at this preview until the product shell, remaining routes, hosted accounts, and rollback pass.

## Goal

Visitors on the Cloudflare app should recognize Localley: logo, violet glass chrome, catalog cards, trips, and account access. The thin Arial proof layout is not the destination UI.

## Sequence

1. Apply Localley tokens, mark, glass header, and card surfaces to the existing preview routes. Keep Access, catalog UUIDs, and the hourly transfer unchanged.
2. Keep reusing real trip/editor/settings components. Do not invent a second button or dialog system.
3. Port remaining private routes (create, share, billing, media, chat) behind the same chrome.
4. Prove hosted human sign-in and recovery on this shell.
5. Switch `localley.io` only after that journey passes. Access is not consumer login.

## This increment

Visible preview chrome only. No DNS cutover, no Vercel deploy, no Clerk import, no paid generation.

Coverage limits: catalog, saves, trips, email preferences, and trends stay the available product slices. Chat, stories, billing, and admin remain unported.
