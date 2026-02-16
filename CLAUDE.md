# Claude Code Configuration

## Important Notes for Claude

### Environment Variables
All environment variables are already configured in Vercel. **DO NOT add duplicate environment variables via CLI.**

#### Currently Configured in Vercel (as of Jan 2026):

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
| `VIATOR_API_KEY` | Viator tours/experiences API | Active |
| `TRIPADVISOR_API_KEY` | TripAdvisor API | Active |
| `PEXELS_API_KEY` | Stock photos | Active |
| `RESEND_API_KEY` | Email sending | Active |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox maps | Active |
| `UPSTASH_REDIS_REST_URL` | Redis caching | Active |
| `UPSTASH_REDIS_REST_TOKEN` | Redis authentication | Active |

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
- **CRITICAL**: Satori/resvg (used by `@vercel/og` ImageResponse) does NOT support WebP
- All Unsplash URLs MUST include `&fm=jpg` to force JPEG format
- Image URLs are passed directly to `<img src={url}>` in Satori JSX — Satori fetches them at render time
- Do NOT pre-fetch images and convert to base64 data URIs — this approach caused cascading failures (WebP incompatibility, large payloads crashing Satori, timeout issues)
- The story route uses `select("*")` to safely handle missing columns (e.g., `ai_backgrounds` before migration)
- `ensureJpegFormat()` is a safety net that adds `&fm=jpg` to any Unsplash URL missing it
- Image pipeline: `story-background POST` → saves URL to `ai_backgrounds` in DB → `story GET` reads URL, passes directly to Satori `<img src>`

### City Configuration
- Ring 1 (enabled): Seoul, Tokyo, Bangkok, Singapore
- Ring 2-3: Other cities exist but `isEnabled: false`
- Config in `lib/cities.ts`
