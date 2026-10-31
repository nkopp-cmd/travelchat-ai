# Localley launch kit

Source of truth for directory listings, launch posts and press notes.
Copy follows the live site https://localley.io (home, /spots, /help, /pricing) as of 2026-10-31.
Contact: hello@localley.io. No em dashes. Do not claim a free trial: checkout has none.

Status: prepared, nothing submitted. Order and account rules: shared/plans/launch-marketing.md.
Listing fields per directory: directories.md. Post drafts: posts.md.

## One-line pitch

Travel Asia like a local friend planned it: the spots locals rate, on one map, turned into a day-by-day route.

## 50 words

Localley is a travel planner for Asia built on 2,574 curated, local-first spots in Seoul, Tokyo,
Bangkok, Singapore and more. Pick a city and a vibe, browse the places locals actually rate, and
leave with a day-by-day route, exact directions and phrase cards for the driver. Plans from $9 a month.

## 160 words

Localley replaces the 47 open tabs of trip planning with one map of places locals rate. The
catalog holds 2,574 curated spots across Asia: alleys, markets, cafes, restaurants and night spots,
with the most in Singapore, Tokyo, Seoul, Bangkok, Taipei, Kyoto and Osaka.

Pick a city and a vibe (food, cafes, nightlife, markets, outdoor). Localley turns the spots you
like into a day-by-day route that keeps travel time short and fits the weather. Every spot has
exact directions and a "Show to driver" card. The "Help me say this" cards cover Korea, Japan,
Thailand, Vietnam, Taiwan and Singapore and keep working offline once the page is open. Korean
cities use Kakao Maps, because Google Maps routes are weak there.

Browsing the map and the phrase cards is free. Pro costs $9 a month or $79 a year; Premium costs
$19 a month or $159 a year and adds collaborative trips and richer maps. Refunds within 14 days.

## 500 words

**Travel like a local friend planned it.**

Planning a trip to an Asian city usually means 47 browser tabs: lists, reels, maps, forum threads
and reviews written for tourists. The result is a route through the same crowded places everyone
else visits, with long gaps on the metro between them. Localley starts from the other end: the
places locals rate, on one map.

**What is inside.** 2,574 curated spots across Asia. Singapore (442), Tokyo (429), Seoul (386),
Bangkok (317), Taipei (244), Kyoto (221), Osaka (220) and Hong Kong (144) are the deepest; Busan,
Chiang Mai, Kuala Lumpur and smaller cities follow. Each spot is a real venue with an exact
address: alleys, markets, cafes, restaurants and night spots. A "Trending now" rail shows the
places worth a detour this week.

**How it works.**

1. Pick a city and a vibe: food, cafes, nightlife, markets or outdoor.
2. Browse the map and save the places you like.
3. Localley builds a day-by-day route from them. It keeps travel time short, groups nearby stops
   and plans around the weather.
4. On the day, open a spot for exact directions, or tap "Show to driver" for a card a taxi driver
   can read.

**Help when you are there.** The "Help me say this" phrase cards cover South Korea, Japan,
Thailand, Vietnam, Taiwan and Singapore: ordering, directions, allergies and emergencies, in the
local script. They keep working offline once the page is open. In Korean cities Localley uses
Kakao Maps, because Google Maps walking and driving routes are limited in Korea.

**Who it is for.** Independent travelers who want neighborhoods, not checklists: first-time
visitors to Seoul or Tokyo who want more than the top ten, repeat visitors looking for new places,
and friends planning one trip together.

**Plans.**

- Browse the map, spots and phrase cards free, without an account.
- Pro, $9 per month or $79 per year: unlimited itineraries, 100 chats per day, local-first routes,
  full addresses and cleaner exports, weather-aware planning, no ads.
- Premium, $19 per month or $159 per year: everything in Pro, plus unlimited chat and saved spots,
  richer maps, pins and directions, collaborative trips and priority support.

Yearly plans save up to 30%. Payments run through Stripe; manage or cancel in the Stripe billing
portal. Refunds within 14 days of the first payment.

Start at https://localley.io. Questions: hello@localley.io.

## Screenshots

No Google Places photos appear in any asset (Places terms). Mobile (390x844 at 3x, 1170x2532), in `screenshots/`:

| File | Shows |
|---|---|
| mobile-1-hero.png | Home hero: H1, vibe chips, Seoul map |
| mobile-2-spots.png | /spots: Discover Hidden Gems, cities with spot counts |
| mobile-3-plan.png | Planner, trip details step (Seoul) |
| mobile-4-help.png | "Help me say this" country cards |
| mobile-5-pricing.png | Pricing, Pro card |

Desktop (1280x800), in `screenshots/`:

| File | Shows |
|---|---|
| desktop-1-home.png | Home hero with the map |
| desktop-2-spots.png | /spots city list and trending rail |
| desktop-3-plan.png | Planner, trip details step |
| desktop-4-pricing.png | Pro and Premium cards |

## Demo video

55 s, 1280x720, WebM (VP8), no audio, recorded on the live site: home, spots, planner, phrase
cards, pricing.

- Video: `demo/localley-demo-v1.webm`
- Poster: `demo/localley-demo-poster.png`
- Directories that need MP4 or YouTube: upload the WebM to YouTube (unlisted) or convert with a
  full ffmpeg build (the agent host's Playwright ffmpeg has no H.264 encoder).

## Logo

App icon in `logo/`: 512, 256, 128, 64 and 32 px PNG (from `public/icons/android-chrome-512x512.png`)
and `localley-icon.svg` (from `public/icons/icon.svg`). Word mark: "Localley", violet on dark.

## Pricing summary

| Plan | Monthly | Yearly | Includes |
|---|---|---|---|
| Browse | Free | Free | Map, spots, phrase cards, no account |
| Pro | $9 | $79 | Unlimited itineraries, 100 chats/day, local-first routes, full addresses, exports, weather-aware planning, no ads |
| Premium | $19 | $159 | Pro plus unlimited chat and saved spots, richer maps, collaborative trips, priority support |

## FAQ

**Which cities are covered?** Seoul, Tokyo, Bangkok, Singapore, Osaka, Kyoto, Taipei, Hong Kong,
Busan, Chiang Mai, Kuala Lumpur and smaller cities across Asia. 2,574 curated spots in total.

**Is there a free trial?** No. Browsing the map, spots and phrase cards is free; planning features
need Pro or Premium. Refunds within 14 days of the first payment.

**Do the phrase cards work offline?** Yes, once the page is open on the phone.

**Why Kakao Maps in Korea?** Google Maps routes are limited in Korea; Kakao Maps has full walking
and driving directions there.

**How do I cancel?** In the Stripe billing portal, linked from Settings. Access continues to the
end of the paid period.

**Where do the spots come from?** A curated catalog of real venues, checked for exact addresses,
plus places that trend in local news and social posts.

## Links per source (UTM)

`https://localley.io/?utm_source=<source>&utm_medium=directory&utm_campaign=launch-2026`

| Source | utm_source |
|---|---|
| Product Hunt | producthunt |
| BetaList | betalist |
| AlternativeTo | alternativeto |
| SaaSHub | saashub |
| There's An AI For That | taaft |
| Futurepedia | futurepedia |
| Indie Hackers | indiehackers |
| Hacker News (Show HN) | hn |
