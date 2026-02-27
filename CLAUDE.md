# Claude Code Configuration

## Project
- **Domain**: `localley.io`
- **Platform**: Next.js on Vercel + Supabase + Clerk
- **All fallback URLs must use `https://localley.io`** (NOT localley.app)

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

### Story Image Pipeline — STABLE, DO NOT MODIFY WITHOUT EXPLICIT REQUEST

> **WARNING**: This pipeline is production-stable after extensive debugging.
> Every constraint below exists because of a real bug that was encountered and fixed.
> **DO NOT refactor, "improve", or change ANY image generation code unless the user explicitly requests it.**

#### Architecture Overview
```
User triggers story → POST /api/images/story-background (generate + store)
                    → PATCH /api/itineraries/[id]/ai-backgrounds (save URLs to DB)
                    → GET /api/itineraries/[id]/story?slide=X (render PNG via Satori)
```

#### File Map (do not reorganize)
| File | Purpose |
|------|---------|
| `app/api/images/story-background/route.ts` | Background generation API (AI + stock fallback) |
| `app/api/itineraries/[id]/story/route.tsx` | Satori PNG rendering (Node.js runtime) |
| `app/api/itineraries/[id]/ai-backgrounds/route.ts` | Save/retrieve background URLs in DB |
| `lib/image-provider.ts` | Provider router — dispatches to correct AI provider |
| `lib/flux.ts` | FLUX via FAL AI (`fal-ai/flux-2-flex`) |
| `lib/seedream.ts` | Seedream 4.5 via Bytedance ARK (OpenAI-compatible API) |
| `lib/imagen.ts` | Gemini 2.5 Flash Image via `@google/genai` |
| `lib/model-credits.ts` | Per-provider credit costs + tier access rules |
| `lib/story-backgrounds.ts` | Stock photo fallbacks (TripAdvisor + Pexels) |
| `components/itineraries/story-dialog.tsx` | Client-side orchestration UI |

#### AI Provider Priority (cascading fallback)
1. **FLUX** (`FAL_KEY`, `lib/flux.ts`) — 1 credit/image, Pro+ tiers
2. **Seedream** (`ARK_API_KEY`, `lib/seedream.ts`) — 2 credits/image, Premium tier
3. **Gemini** (`GEMINI_API_KEY`, `lib/imagen.ts`) — 3 credits/image, Premium tier
- If one provider fails, tries next in list automatically
- Provider routing in `lib/image-provider.ts`

#### Stock Photo Fallback (when AI unavailable or fails)
1. **TripAdvisor** (`TRIPADVISOR_API_KEY`) — paid tiers only, real location photos
2. **Pexels** (`PEXELS_API_KEY`) — all tiers, curated travel photos
- Unsplash has been **REMOVED** (was masking AI failures with hardcoded images)
- `excludeUrls` parameter prevents duplicate images across slides

#### Credit & Tier System (`lib/model-credits.ts`)
- Free: no AI images
- Pro: FLUX only (1 credit each)
- Premium: all providers (1/2/3 credits)
- `BYPASS_IMAGE_TIER_CHECK=true` skips tier restrictions
- Usage tracked via `checkAndIncrementUsageWeighted()` with advisory locks

#### CRITICAL CONSTRAINTS — Each one prevents a real production bug

1. **Satori does NOT support WebP** — reject WebP at every stage (prefetch, upload, detection). Silent corruption otherwise.
2. **Magic byte detection is mandatory** — never trust HTTP Content-Type headers. Providers may return JPEG when PNG was requested. `detectImageContentType()` checks buffer header bytes (`89 50 4E 47` = PNG, `FF D8 FF` = JPEG, `RIFF...WEBP` = WebP). Storage file extension must match detected format.
3. **`ImageResponse` uses a lazy ReadableStream** — must `await response.arrayBuffer()` to force-consume and catch render errors. Returning the Response object directly produces corrupt/partial PNGs on failure.
4. **Satori's built-in fetch is unreliable on Node.js** — `prefetchImage()` and `prefetchFromSupabase()` convert URLs to base64 data URIs BEFORE passing to Satori `<img src>`. Do NOT pass raw URLs to Satori.
5. **Story route must use `runtime = "nodejs"`** — required for `next/og` ImageResponse + Satori.
6. **Use `select("*")` for itinerary queries** — safely handles missing columns (e.g., `ai_backgrounds` before migration). Do NOT use named column selects.
7. **No base64 in the database** — `ai_backgrounds` stores Supabase Storage URLs only. Base64 data URLs cause 413 Payload Too Large.
8. **Seedream uses `response_format: "b64_json"`** — avoids extra fetch round-trip to SE Asia BytePlus servers. Critical for latency.
9. **Slide deduplication** — `slotIndex` (cover=0, day1=1, ..., summary=N+1) + `excludeUrls` guarantee unique images per slide.

#### Database Schema
- `itineraries.ai_backgrounds` (jsonb): `{ cover?: URL, day1?: URL, day2?: URL, ..., summary?: URL }`
- PATCH merges new backgrounds with existing (preserves other days)
- Story route reads from this column at render time

#### Story Slide Rendering (`/api/itineraries/[id]/story`)
- Dimensions: 1080x1920 (Instagram/TikTok story format)
- Three slide types: cover, day (1-N), summary
- Safe zones for social platform UI overlays (top: 180px, bottom: 320px)
- Gradient fallback if background image fails to load
- `?debug=true` query param returns JSON diagnostics instead of PNG

#### End-to-End Flow
1. Client fetches available sources + models → auto-selects provider
2. Phase 1: generate cover background (POST story-background)
3. Phase 2: generate day + summary backgrounds in parallel (with excludeUrls)
4. Save all URLs to DB (PATCH ai-backgrounds)
5. Render each slide as PNG via Satori (GET story?slide=X)
6. Prefetch background → base64 data URI → Satori `<img>` → ImageResponse → `arrayBuffer()` → Response
7. Optionally persist rendered PNGs via POST story/save

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
