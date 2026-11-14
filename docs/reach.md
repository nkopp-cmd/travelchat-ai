# Localley — reach map (reach-engine-20261114.md, R1)

Written 2026-11-14. Update this file when a query moves or a page changes; one query -> ONE page.

## Money
- Offer: Pro USD 9/month or 79/year (7-day trial), Premium USD 19/month or 159/year (Stripe Subscriptions, /pricing).
- Counted: `scripts/business-metrics.mjs` (payers, revenue, proprietary rows, ugc, owned_audience).
- Baseline 2026-11-14 (shared/plans/BUSINESS.md): class "adjust", 0 payers, 0 USD, data rows 26, ugc 0, audience 0.
  The paid path is live 25 days with 0 payments, so reach is the first lever: nobody arrives yet.

## Audience — who pays
1. **First-time visitor to Seoul, Tokyo, Bangkok or Singapore, trip booked, 2-8 weeks out.** Wants places that are not
   on every top-10 list. Types "hidden gems <city>", "non touristy things to do in <city>", "<city> cafe hidden".
   Pays Pro for an itinerary built from those spots.
2. **Repeat visitor / long stay (digital nomad, expat on a visa run).** Wants neighbourhood cafes and food, uses the map
   and "open now". Types "local cafes tokyo", "hidden gem bangkok restaurant".
3. **Visitor on the ground, today.** Needs to pay, order or check opening hours now. Types "how to pay in korea as a
   tourist", "korean menu translation". Low willingness to pay, high volume: the entry point for sign-up.

Where they read: Google (English), AI answers (ChatGPT/Claude/Perplexity), Reddit ("hidden gems <city> reddit" is in
the autocomplete for every city), TikTok/IG reels and Pinterest boards before a trip.

## Evidence used
- GSC 28 d to 2026-11-13: 4 query rows, 5 impressions, 0 clicks (claude-work/seo/localley.io.md). Too few rows to
  rank queries; the words below come from Google autocomplete.
- GSC URL Inspection 2026-11-14 (24 URLs): only / and /help indexed; hubs and spots "Discovered - currently not
  indexed" or "unknown to Google". Sitemap cut 3,161 -> 1,516 spot URLs the same day (weekend-sprint L2).
- Google autocomplete 2026-11-14 (suggestqueries, hl=en) for 13 seeds: "hidden gems <city>" + "<city> reddit" +
  "cafe" / "food" / "restaurant" variants exist for Seoul, Tokyo, Bangkok, Singapore; "non touristy things to do in
  seoul", "underrated places in seoul", "how to pay in south korea as a tourist", "korean menu translation".

## 15 money queries -> one page each
| # | Query (what they type) | Intent | Page | Status |
|---|---|---|---|---|
| 1 | hidden gems seoul | browse -> plan | /spots?city=seoul | live; title + H1 now "Hidden gems in Seoul" |
| 2 | hidden gems tokyo | browse -> plan | /spots?city=tokyo | live |
| 3 | bangkok hidden gems | browse -> plan | /spots?city=bangkok | live |
| 4 | hidden gems singapore | browse -> plan | /spots?city=singapore | live |
| 5 | non touristy things to do in seoul | browse | /spots?city=seoul | live (same hub as 1; answer in the hub intro) |
| 6 | hidden gem seoul cafe | browse | /spots?city=seoul | PR #764: "Hidden-gem cafes in Seoul" top-6 block on the hub |
| 7 | local cafes tokyo | browse | /spots?city=tokyo | PR #764 (cafe block) |
| 8 | hidden gems bangkok food | browse | /spots?city=bangkok | PR #764 ("Local food in Bangkok" block) |
| 9 | hidden gems kyoto | browse -> plan | /spots?city=kyoto | live |
| 10 | seoul local itinerary | plan -> buy | /templates | live; Seoul week template; Pro upsell |
| 11 | how to pay in south korea as a tourist | do now | /help/korea/pay | live |
| 12 | korean menu translation | do now | /help/korea/menu | live |
| 13 | how to pay in japan as a tourist | do now | /help/japan/pay | live |
| 14 | how to pay in thailand as a tourist | do now | /help/thailand/pay | live; /blog/paying-in-bangkok competes: link blog -> help page, keep help as the answer |
| 15 | is it open in korea today (holiday hours) | do now | /help/korea/open | live |

Rules: no new page per query; answer on the mapped page. Every mapped page links /pricing once and carries the
sign-up (R4). Gaps seen in the map: hubs have no category block for "cafe"/"food" queries (6-8); the blog and help
pages overlap on paying (14); none of the 15 pages is indexed except /help -> first work is indexing (L2/L3 of the
weekend sprint, live 2026-11-14) and internal links, not more pages.

## 3 channels
1. **Google + AI answers** (builder): index the hubs and 1,516 spots (sitemap cut, hub A-Z lists, nearest-spot links,
   own H1/title per hub, spot guides for thin spots). Weekly GSC pull; URL Inspection of 50 URLs on 2026-11-28.
   Bing + Naver after Nils' session (reach-engine "Nils session").
2. **TikTok / Instagram reels via PostLabz** (existing carousel pipeline, `tiktok-carousel-ledger.json`): one carousel
   per hub "hidden gems <city>", each linking the hub. Posting on the brand account follows the Nils-session approval.
3. **Pinterest** (needs the brand account from the Nils session): one pin per indexable spot with a photo, board per
   city, pin links to the spot page. Long-lived traffic for "hidden gems <city>" boards.

Reddit (r/seoul, r/koreatravel, r/JapanTravel, r/Bangkok): "<city> hidden gems reddit" shows up in every autocomplete,
so Reddit threads rank. Until Nils approves posting, the builder prepares copy-ready replies for the advisor's Telegram
list; no DMs, no paid placement.

## First link-earning asset (R3)
- **"Spots locals save" monthly index per city**, from our own save and view data (count of saves per spot, top 20 per
  city, month-on-month change). Method + date on the page; conclusions only, never raw rows (moat rule).
- Blocker: data rows 26 (BUSINESS.md 2026-11-14) is too thin for a credible index. First issue when a city has 200+
  saves; until then the asset is the "Hidden gems in <city>" hub itself with the Localley Score method explained.
