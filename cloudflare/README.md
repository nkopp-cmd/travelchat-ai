# Cloudflare Migration

Final target: Workers, D1, R2, and Cloudflare background services, with Better Auth replacing Clerk.
Vercel, Supabase, and Clerk are temporary live dependencies only.
Stripe and the selected AI APIs remain external product providers, not hosting dependencies.

Packages in this directory are independent of the existing Next.js installation.
They must use separate lockfiles, explicit configuration, and their own tests and type checks.
Do not copy production environment files, customer exports, or credentials into package source.

The initial auth proof uses local Workers and D1 with synthetic accounts and a private test outbox.
It now includes the first application port: owned saved places, atomic quotas, and durable local save events.
It is not an account migration or a public authentication service.
Do not deploy it or switch the live domain until its separate activation requirements pass.
