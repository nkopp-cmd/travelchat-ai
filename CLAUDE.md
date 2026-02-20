# Claude Code Configuration

## Important Notes for Claude

### Environment Variables
All environment variables are already configured in Vercel. **DO NOT add duplicate environment variables via CLI.**

#### Currently Configured in Vercel (as of Feb 2026):

| Variable | Purpose | Status |
|----------|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Active |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Active |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access (bypasses RLS) | Active |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk authentication (frontend) | Active |
| `CLERK_SECRET_KEY` | Clerk authentication (backend) | Active |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps JavaScript API | Active |
| `NEXT_PUBLIC_KAKAO_MAPS_APP_KEY` | Kakao Maps for Korea | Active |
| `NEXT_PUBLIC_KAKAO_REST_API_KEY` | Kakao REST API for Korea | Active |
| `ANTHROPIC_API_KEY` | Claude AI for itinerary generation | Active |
| `OPENAI_API_KEY` | OpenAI fallback | Active |
| `GEMINI_API_KEY` | Google Gemini for image generation | Active |
| `FAL_KEY` | FAL AI for FLUX image generation (story backgrounds) | Active |
| `ARK_API_KEY` | Bytedance ARK API for Seedream 4.5 image generation | Active |
| `VIATOR_API_KEY` | Viator tours/experiences API | Active |
| `TRIPADVISOR_API_KEY` | TripAdvisor API | Active |
| `PEXELS_API_KEY` | Stock photos | Active |
| `RESEND_API_KEY` | Email sending | Active |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox maps | Active |
| `UPSTASH_REDIS_REST_URL` | Redis caching | Active |
| `UPSTASH_REDIS_REST_TOKEN` | Redis authentication | Active |

#### Stripe Payment Keys (added Feb 13, 2026):
| Variable | Purpose | Status |
|----------|---------|--------|
| `STRIPE_SECRET_KEY` | Stripe server-side API key | Active |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification | Active |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Pro monthly plan price ID | Active |
| `STRIPE_PRO_YEARLY_PRICE_ID` | Pro yearly plan price ID | Active |
| `STRIPE_PREMIUM_MONTHLY_PRICE_ID` | Premium monthly plan price ID | Active |
| `STRIPE_PREMIUM_YEARLY_PRICE_ID` | Premium yearly plan price ID | Active |

#### Feature Flags:
| Variable | Purpose |
|----------|---------|
| `BETA_MODE` | Enable beta features |
| `ENABLE_MULTI_LLM` | Enable multi-LLM support |
| `MULTI_LLM_PRO_TIER` | Pro tier LLM config |
| `MULTI_LLM_PREMIUM_TIER` | Premium tier LLM config |
| `BYPASS_IMAGE_TIER_CHECK` | Skip image tier restrictions |
| `LLM_CACHE_TTL` | LLM response cache duration |
| `LLM_CACHE_LOCATIONS_TTL` | Location cache duration |
| `CIRCUIT_BREAKER_THRESHOLD` | Error threshold for circuit breaker |
| `CIRCUIT_BREAKER_RESET_MS` | Circuit breaker reset time |

### Database
- **Supabase** with PostGIS for location data
- Spots table has no `city` column - city is inferred from address field
- City queries use: `.ilike("address->>'en'", '%CityName%')`

### Maps
- **OpenStreetMap/Leaflet**: Default for most cities
- **Kakao Maps**: Auto-switches for Korean cities (Seoul, Busan, Jeju, Gyeongju)
- Detection via `countryCode: "KR"` in `lib/cities.ts`

### Import Scripts
- `scripts/import-curated-spots.ts` - Import from Google Sheets with Places API enrichment
- `scripts/import-spots.ts` - Import JSON batch files to Supabase
- Cache file at `data/.enrichment-cache.json` saves API quota

### Story Image Pipeline
- **CRITICAL**: Satori/resvg (used by `next/og` ImageResponse) does NOT support WebP
- Story route uses `runtime = "nodejs"` with `import { ImageResponse } from "next/og"`
- On Node.js, Satori's built-in fetch is unreliable — `prefetchImage()` converts URLs to base64 data URIs before passing to Satori
- **CRITICAL**: `ImageResponse` uses a lazy ReadableStream — must `await response.arrayBuffer()` to force-consume and catch render errors. Returning the Response directly produces corrupt/partial PNGs on failure.
- All Unsplash URLs MUST include `&fm=jpg` to force JPEG format
- `ensureJpegFormat()` is a safety net that adds `&fm=jpg` to any Unsplash URL missing it
- The story route uses `select("*")` to safely handle missing columns (e.g., `ai_backgrounds` before migration)
- `getFallbackImage()` uses slot-based index selection (cover=0, day1=1, …, summary=last) to guarantee unique images per slide
- Image pipeline: `story-background POST` → saves URL to `ai_backgrounds` in DB → `story GET` reads URL, pre-fetches as base64, passes data URI to Satori `<img src>`
- **AI image providers** (priority order): FLUX (`FAL_KEY`, via `lib/flux.ts`) → Seedream (`ARK_API_KEY`, via `lib/seedream.ts`) → Gemini (`GEMINI_API_KEY`, via `lib/imagen.ts`)
- Provider routing in `lib/image-provider.ts`, stock photo fallback: TripAdvisor → Pexels → Unsplash

### Stripe Payments & Subscriptions
- **Stripe SDK**: `lib/stripe.ts` — client, customer CRUD, checkout sessions, billing portal, webhook verification
- **API routes** in `app/api/subscription/`: checkout, portal, status, webhook
- **Tiers**: Free ($0), Pro ($9/mo or $79/yr with 7-day trial), Premium ($19/mo or $159/yr)
- **Tier config**: `lib/subscription.ts` — limits, features, pricing per tier
- **DB schema**: `supabase/subscriptions-schema.sql` — `subscriptions`, `usage_tracking`, `affiliate_clicks` tables
- **Usage tracking**: `lib/usage-tracking.ts` — atomic check-and-increment with advisory locks
- **Client hook**: `hooks/use-subscription.ts` — `useSubscription()` with checkout/portal/tier helpers
- **Context**: `providers/subscription-provider.tsx` — app-wide subscription context
- **UI**: `app/pricing/page.tsx` (tier cards + FAQ), `app/settings/page.tsx` (subscription card + usage bars)
- **Webhook events**: checkout.session.completed, subscription.created/updated/deleted, invoice.payment_succeeded/failed
- **Post-checkout**: Redirects to `/settings?subscription=success`, `SubscriptionSuccessHandler` invalidates cache
- **Emails**: `emails/subscription-email.tsx` — 6 event types (upgrade, downgrade, cancel, renew, trial_ending, payment_failed)
- **Early adopters**: `lib/early-adopters.ts` — first 100 users get permanent premium, beta mode overrides
- **CRITICAL**: Webhook route at `/api/subscription/webhook` must be in middleware public routes (Clerk blocks unsigned requests)

### City Configuration
- Ring 1 (enabled): Seoul, Tokyo, Bangkok, Singapore
- Ring 2-3: Other cities exist but `isEnabled: false`
- Config in `lib/cities.ts`
