// node --test scripts/viral-scout.checks.mjs — pure parts of the viral spots scout (no network).
import assert from "node:assert/strict";
import test from "node:test";
import {
  NAVER_SCOUT_DAILY, NAVER_SHARED_STOP, articleId, buildSpotRows, cleanText, eventLabel, eventSlug, ewkbPoint, insertStatements,
  isAreaName, isRecentMonth, loadWatchlist, mergeEvents, normalizeNaverNews, parseCopy, parseExtraction, parseGoogleNewsRss, pickNaverMatch, planQueries, publicEvents,
  SOCIAL_RUN_USD, normalizeSocialPosts, pickSocialEvent, socialBudget, socialHashtags, socialOnlyWeak, virality,
} from "./viral-scout.mjs";

const naverNews = { items: [
  { title: "<b>저스틴 비버</b>, 안국동 삼계탕집 &quot;포착&quot;", originallink: "https://www.mt.co.kr/a/1", link: "https://n.news.naver.com/1",
    description: "비버가 <b>서울</b> 종로구의 한 식당에서", pubDate: "Fri, 23 Oct 2026 22:32:00 +0900" },
  { title: "no url", originallink: "javascript:alert(1)", link: "", description: "", pubDate: "" },
] };

test("Naver news: tags and entities stripped, publisher link kept, bad urls dropped", () => {
  const [a, ...rest] = normalizeNaverNews(naverNews);
  assert.equal(rest.length, 0);
  assert.equal(a.title, '저스틴 비버, 안국동 삼계탕집 "포착"');
  assert.equal(a.url, "https://www.mt.co.kr/a/1");
  assert.equal(a.publisher, "mt.co.kr");
  assert.equal(a.publishedAt, "2026-10-23T13:32:00.000Z");
  assert.equal(a.id, articleId("https://www.mt.co.kr/a/1"));
});

test("Google News RSS: publisher suffix removed from the title", () => {
  const xml = `<rss><channel><item><title>Justin Bieber pops up at SKYLRK in Seongsu - Hypebeast</title>
    <link>https://news.google.com/rss/articles/abc</link><pubDate>Sat, 24 Oct 2026 10:00:00 GMT</pubDate>
    <description>&lt;a href="x"&gt;Justin&lt;/a&gt;</description><source url="https://hypebeast.com">Hypebeast</source></item>
    <item><title>No link</title></item></channel></rss>`;
  const items = parseGoogleNewsRss(xml, "en");
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Justin Bieber pops up at SKYLRK in Seongsu");
  assert.equal(items[0].publisher, "Hypebeast");
  assert.equal(items[0].summary, "Justin");
});

test("cleanText removes markup that entities decode into", () => {
  assert.equal(cleanText("&lt;script&gt;x&lt;/script&gt; ok"), "x ok");
});

test("query plan: triggers every run, people rotate, stays inside the Naver soft cap", () => {
  const watchlist = loadWatchlist();
  const first = planQueries(watchlist, 0), second = planQueries(watchlist, first.nextRotation);
  assert.ok(first.naver.includes("저스틴 비버 맛집"));
  assert.ok(!second.naver.includes("저스틴 비버 맛집"));
  assert.ok(second.naver.includes("내한 맛집"));
  // 12 runs a day, news queries + at most 20 local look-ups each.
  assert.ok(12 * (first.naver.length + 20) <= NAVER_SCOUT_DAILY + 50);
  assert.ok(NAVER_SHARED_STOP <= 2000 - 400);
  for (const p of watchlist.people) assert.ok(p.en && p.ko, JSON.stringify(p));
});

const articles = [
  { id: "a1", url: "https://www.mt.co.kr/a/1", title: "t1", publisher: "mt.co.kr", publishedAt: "2026-10-23T13:32:00.000Z" },
  { id: "a2", url: "https://hypebeast.com/b", title: "t2", publisher: "Hypebeast", publishedAt: "2026-10-24T10:00:00.000Z" },
];
const extraction = JSON.stringify({ events: [
  { personEn: "Justin Bieber", personKo: "저스틴 비버", city: "seoul", month: "2026-10", summaryEn: "He visited Seoul.", articleIds: ["a1", "a2", "zz"],
    places: [
      { nameKo: "도산회관", nameEn: "Dosan Hoegwan", district: "강남구", kind: "restaurant", note: "ate samgyetang", confidence: "named", searchHintKo: "", articleIds: ["a1"] },
      { nameKo: "", nameEn: "", district: "종로구", kind: "restaurant", note: "ate", confidence: "described", searchHintKo: "저스틴 비버 안국동 삼계탕", articleIds: ["a1"] },
      { nameKo: "가짜", nameEn: "", district: "", kind: "cafe", note: "", confidence: "named", searchHintKo: "", articleIds: ["zz"] },
    ] },
  { personEn: "Nobody", personKo: "", city: "tokyo", month: "2026-10", summaryEn: "", articleIds: ["a1"], places: [] },
  { personEn: "No evidence", personKo: "", city: "seoul", month: "2026-10", summaryEn: "", articleIds: ["zz"], places: [] },
] });

test("extraction: unknown cities, unknown article ids and unsupported places are dropped", () => {
  const events = parseExtraction(`noise ${extraction} noise`, articles);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].articleIds, ["a1", "a2"]);
  assert.deepEqual(events[0].places.map((p) => p.confidence), ["named", "described"]);
  assert.equal(parseExtraction("not json", articles).length, 0);
});

test("merge: named places wait for resolution, described ones go to review; re-merge keeps state", () => {
  const extracted = parseExtraction(extraction, articles);
  const events = mergeEvents({}, extracted, articles, "2026-10-31T00:00:00.000Z");
  const event = events["justin-bieber-seoul-2026-10"];
  assert.equal(eventSlug(extracted[0]), "justin-bieber-seoul-2026-10");
  assert.equal(eventLabel(event), "Justin Bieber in Seoul, Oct 2026");
  assert.equal(Object.keys(event.sources).length, 2);
  const [named, described] = Object.values(event.places);
  assert.equal(named.status, "pending");
  assert.equal(described.status, "review");
  named.status = "matched"; named.spotId = "s1";
  const again = mergeEvents(events, extracted, articles, "2026-11-01T00:00:00.000Z");
  assert.equal(Object.values(again["justin-bieber-seoul-2026-10"].places)[0].status, "matched");
  assert.equal(again["justin-bieber-seoul-2026-10"].firstSeen, "2026-10-31T00:00:00.000Z");
});

const local = [
  { title: "<b>도산</b>공원", roadAddress: "서울특별시 강남구 압구정로 1", address: "서울특별시 강남구 신사동 649-9", category: "공원", mapx: "1270352000", mapy: "375242000" },
  { title: "도산회관", roadAddress: "부산광역시 해운대구 1", address: "", category: "한식", mapx: "1291600000", mapy: "351600000" },
  { title: "도산회관 본점", roadAddress: "서울특별시 강남구 도산대로45길 8-7", address: "서울특별시 강남구 신사동 1", category: "한식>삼계탕", mapx: "1270371000", mapy: "375226000" },
];

test("Naver match: name containment + city address; district raises confidence", () => {
  const match = pickNaverMatch(local, { nameKo: "도산회관", district: "강남구" }, "seoul");
  assert.equal(match.title, "도산회관 본점");
  assert.equal(match.confidence, "high");
  assert.ok(Math.abs(match.lat - 37.5226) < 1e-6 && Math.abs(match.lng - 127.0371) < 1e-6);
  assert.equal(pickNaverMatch(local, { nameKo: "도산회관", district: "" }, "seoul").confidence, "name_only");
  assert.equal(pickNaverMatch(local, { nameKo: "도산회관", district: "강남구" }, "busan").title, "도산회관");
  assert.equal(pickNaverMatch(local, { nameKo: "도산 공원", district: "" }, "seoul").confidence, "high");
  const palace = [{ title: "경복궁 방이점", roadAddress: "서울특별시 송파구 올림픽로 348", address: "", category: "한식", mapx: "1271100000", mapy: "375140000" }];
  assert.equal(pickNaverMatch(palace, { nameKo: "경복궁", district: "" }, "seoul").confidence, "name_only");
  assert.equal(pickNaverMatch(palace, { nameKo: "경복궁", district: "종로구" }, "seoul").confidence, "name_only");
  assert.equal(pickNaverMatch(local, { nameKo: "스타벅스", district: "" }, "seoul"), null);
  assert.equal(pickNaverMatch(local, { nameKo: "도", district: "" }, "seoul"), null);
  const mochi = [{ title: "성수동 수제모찌", roadAddress: "서울특별시 성동구 왕십리로 98-1", address: "", category: "디저트", mapx: "1270450000", mapy: "375440000" }];
  assert.equal(pickNaverMatch(mochi, { nameKo: "성수동", district: "성수동" }, "seoul"), null);
  assert.equal(pickNaverMatch(mochi, { nameKo: "성수동", district: "" }, "seoul"), null);
  const river = [{ title: "한강", roadAddress: "서울특별시 영등포구 여의동로 300-2", address: "", category: "강", mapx: "1269340000", mapy: "375280000" }];
  assert.equal(pickNaverMatch(river, { nameKo: "한강", district: "" }, "seoul"), null);
});

test("area names are not venues", () => {
  for (const name of ["성수동", "강남구", "한강", "을지로", "익선동"]) assert.equal(isAreaName(name), true, name);
  for (const name of ["도산회관", "남산", "도산공원", "조선팰리스", "달맞이광장바베큐"]) assert.equal(isAreaName(name), false, name);
  assert.equal(isAreaName("안국", "안국"), true);
});

test("EWKB point: little endian, SRID 4326, lng then lat", () => {
  const hex = ewkbPoint(127.0371, 37.5226);
  assert.equal(hex.length, 50);
  assert.ok(hex.startsWith("0101000020E6100000"));
  const buffer = Buffer.from(hex, "hex");
  assert.equal(buffer.readDoubleLE(9), 127.0371);
  assert.equal(buffer.readDoubleLE(17), 37.5226);
});

const candidate = { key: "justin-bieber-seoul-2026-10:도산회관", city: "seoul", personEn: "Justin Bieber", note: "ate samgyetang", kind: "restaurant",
  naver: pickNaverMatch(local, { nameKo: "도산회관", district: "강남구" }, "seoul") };

test("copy: city suffix, street number and category are required", () => {
  const good = { key: candidate.key, nameEn: "Dosan Hoegwan", descriptionEn: "A samgyetang house.", category: "Food", subcategories: ["Korean", "Soup", "x", "y"],
    tipsEn: ["Go early"], bestTimesEn: "Lunch", addressEn: "8-7 Dosan-daero 45-gil, Gangnam-gu, Seoul, South Korea", localPercentage: 95 };
  const parsed = parseCopy(JSON.stringify({ spots: [good] }), [candidate]).get(candidate.key);
  assert.equal(parsed.localPercentage, 80);
  assert.equal(parsed.subcategories.length, 3);
  for (const bad of [{ addressEn: "Gangnam-gu, Seoul, South Korea" }, { addressEn: "8-7 Dosan-daero, Gangnam-gu, Busan, South Korea" }, { category: "Hotel" }, { key: "other" }]) {
    assert.equal(parseCopy(JSON.stringify({ spots: [{ ...good, ...bad }] }), [candidate]).size, 0, JSON.stringify(bad));
  }
});

test("spot rows: derived columns, no photo reference, place id in both tables, bound params match", () => {
  const copy = parseCopy(JSON.stringify({ spots: [{ key: candidate.key, nameEn: "Dosan Hoegwan", descriptionEn: "A samgyetang house.", category: "Food",
    subcategories: ["Korean"], tipsEn: ["Go early"], bestTimesEn: "Lunch", addressEn: "8-7 Dosan-daero 45-gil, Gangnam-gu, Seoul, South Korea", localPercentage: 60 }] }), [candidate]).get(candidate.key);
  const rows = buildSpotRows({ id: "11111111-2222-4333-8444-555555555555", candidate, copy, placeId: "ChIJKSeave2jfDURRQ0ZYtkO1t4",
    sourceUrls: ["https://www.mt.co.kr/a/1", "https://hypebeast.com/b"], now: "2026-10-31T00:00:00.000Z" });
  assert.deepEqual(rows.spot.photos, []);
  assert.equal(rows.spot.city, "Seoul");
  assert.equal(rows.spot.address, "8-7 Dosan-daero 45-gil, Gangnam-gu, Seoul, South Korea");
  assert.equal(rows.spot.name_en_normalized, "dosan hoegwan");
  assert.equal(rows.spot.trending_score, 0.7);
  assert.equal(rows.payload.location, ewkbPoint(rows.spot.longitude, rows.spot.latitude));
  assert.equal(rows.payload.google_place_id, "ChIJKSeave2jfDURRQ0ZYtkO1t4");
  assert.equal(rows.listing.place_id, "ChIJKSeave2jfDURRQ0ZYtkO1t4");
  for (const s of insertStatements(rows)) assert.equal((s.sql.match(/\?/g) || []).length, s.params.length, s.sql);
});

test("public file: only events with live spots, review items never published, newest first", () => {
  const events = mergeEvents({}, parseExtraction(extraction, articles), articles, "2026-10-31T00:00:00.000Z");
  assert.equal(publicEvents(events, "2026-10-31T01:00:00.000Z").events.length, 0);
  const place = Object.values(events["justin-bieber-seoul-2026-10"].places)[0];
  Object.assign(place, { status: "created", spotId: "s1" });
  const file = publicEvents(events, "2026-10-31T01:00:00.000Z");
  assert.equal(file.events.length, 1);
  const [event] = file.events;
  assert.deepEqual(event.spots, [{ spotId: "s1", note: "ate samgyetang" }]);
  assert.equal(event.label, "Justin Bieber in Seoul, Oct 2026");
  assert.equal(event.sources[0].publisher, "Hypebeast");
  assert.ok(!JSON.stringify(file).includes("review"));
});

test("recency: visits of the current and the 2 previous months only", () => {
  const now = new Date("2026-10-31T00:00:00Z");
  assert.ok(isRecentMonth("2026-10", now) && isRecentMonth("2026-08", now));
  assert.ok(!isRecentMonth("2026-07", now) && !isRecentMonth("2025-11", now) && !isRecentMonth("2026-11", now));
  assert.ok(isRecentMonth("2025-12", new Date("2026-01-15T00:00:00Z")));
  const old = parseExtraction(extraction.replace('"month":"2026-10"', '"month":"2025-10"'), articles);
  assert.equal(Object.keys(mergeEvents({}, old, articles, "2026-10-31T00:00:00.000Z")).length, 0);
});

// Social boost (step 4). Fixtures are invented; no real caption text.
const socialEvent = { slug: "test-star-seoul-2026-10", personEn: "Test Star", personKo: "테스트 스타", city: "seoul", month: "2026-10",
  firstSeen: "2026-10-30T00:00:00.000Z", lastSeen: "2026-10-31T00:00:00.000Z",
  sources: { n1: { title: "t", url: "https://news.test/1", publisher: "News", date: "2026-10-31" } },
  places: { x: { nameKo: "", status: "review", reason: "described_only", articleIds: ["n1"] } } };

test("social: hashtags, due event, budget ceilings", () => {
  assert.deepEqual(socialHashtags(socialEvent), ["테스트스타", "teststarseoul"]);
  const now = new Date("2026-10-31T12:00:00.000Z");
  assert.equal(pickSocialEvent({ a: socialEvent }, {}, now)?.slug, socialEvent.slug);
  assert.equal(pickSocialEvent({ a: socialEvent }, { events: { [socialEvent.slug]: "2026-10-31T06:00:00.000Z" } }, now), null);
  const done = { ...socialEvent, places: { x: { ...socialEvent.places.x, status: "matched", reason: undefined } } };
  assert.equal(pickSocialEvent({ a: done }, {}, now), null);
  assert.equal(pickSocialEvent({ a: socialEvent }, {}, new Date("2026-11-20T00:00:00.000Z")), null);
  assert.equal(socialBudget({}, now).runs, 0);
  assert.equal(socialBudget({ month: "2026-10", usd: 4 - SOCIAL_RUN_USD + 0.01, day: "2026-10-31", runs: 0 }, now), null);
  assert.equal(socialBudget({ month: "2026-10", usd: 0, day: "2026-10-31", runs: 2 }, now), null);
  assert.equal(socialBudget({ month: "2026-09", usd: 4, day: "2026-10-30", runs: 2 }, now).usd, 0);
});

test("social: posts must be Instagram, in the visit window and name the person", () => {
  const now = new Date("2026-10-31T12:00:00.000Z");
  const posts = normalizeSocialPosts([
    { url: "https://www.instagram.com/p/AAA/", timestamp: "2026-10-25T10:00:00Z", caption: "met Test Star here", hashtags: [], ownerUsername: "one<x>", locationName: "Cafe Placeholder", likesCount: 10, commentsCount: 2 },
    { url: "https://www.instagram.com/p/BBB/", timestamp: "2026-09-25T10:00:00Z", caption: "Test Star", ownerUsername: "old" },
    { url: "https://www.instagram.com/p/CCC/", timestamp: "2026-10-25T10:00:00Z", caption: "nobody", hashtags: ["seoul"], ownerUsername: "other" },
    { url: "https://evil.test/p/DDD/", timestamp: "2026-10-25T10:00:00Z", caption: "Test Star", ownerUsername: "x" },
    { url: "https://www.instagram.com/reel/EEE/", timestamp: "2026-10-26T10:00:00Z", caption: "", hashtags: ["테스트스타"], ownerUsername: "two", likesCount: -5 },
  ], socialEvent, now);
  assert.deepEqual(posts.map((p) => p.social.owner), ["one", "two"]);
  assert.ok(posts[0].summary.includes("[location tag: Cafe Placeholder]"));
  assert.equal(posts[1].social.likes, 0);
});

test("social: social-only events never start, one account is weak, public file has news only", () => {
  const social = [{ id: "s1", url: "https://www.instagram.com/p/S1/", title: "Instagram post", publisher: "Instagram @a", publishedAt: "2026-10-30T00:00:00.000Z", social: { owner: "a", likes: 99, comments: 0 } },
    { id: "s2", url: "https://www.instagram.com/p/S2/", title: "Instagram post", publisher: "Instagram @b", publishedAt: "2026-10-30T00:00:00.000Z", social: { owner: "b", likes: 0, comments: 0 } }];
  const place = (ids) => ({ nameKo: "테스트식당", nameEn: "", district: "종로구", kind: "restaurant", note: "", confidence: "named", searchHintKo: "", articleIds: ids });
  const only = [{ personEn: "Social Only", personKo: "", city: "seoul", month: "2026-10", summaryEn: "", articleIds: ["s1"], places: [place(["s1"])] }];
  assert.deepEqual(mergeEvents({}, only, social, "2026-10-31T00:00:00.000Z"), {});

  const base = mergeEvents({}, parseExtraction(extraction, articles), articles, "2026-10-31T00:00:00.000Z");
  const bieber = { personEn: "Justin Bieber", personKo: "저스틴 비버", city: "seoul", month: "2026-10", summaryEn: "", articleIds: ["s1"], places: [place(["s1"])] };
  const merged = mergeEvents(base, [bieber], [...articles, ...social], "2026-10-31T01:00:00.000Z");
  const event = merged["justin-bieber-seoul-2026-10"];
  assert.equal(event.sources.s1.social, true);
  assert.equal(event.sources.s1.engagement, 99);
  const p = event.places["테스트식당"];
  assert.equal(socialOnlyWeak(event, p), true);
  const twice = mergeEvents(merged, [{ ...bieber, articleIds: ["s2"], places: [place(["s2"])] }], [...articles, ...social], "2026-10-31T02:00:00.000Z");
  assert.equal(socialOnlyWeak(twice["justin-bieber-seoul-2026-10"], twice["justin-bieber-seoul-2026-10"].places["테스트식당"]), false);

  const v = virality(event, new Date("2026-10-31T12:00:00.000Z"));
  assert.deepEqual([v.articles, v.socialPosts, v.engagement], [2, 1, 99]);
  Object.assign(Object.values(event.places)[0], { status: "created", spotId: "s1" });
  const [pub] = publicEvents(merged, "2026-10-31T03:00:00.000Z").events;
  assert.equal(pub.articleCount, 2);
  assert.ok(pub.sources.every((s) => !s.url.includes("instagram")));
  assert.equal(pub.virality.socialPosts, 1);
});
