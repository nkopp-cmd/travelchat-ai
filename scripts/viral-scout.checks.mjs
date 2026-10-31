// node --test scripts/viral-scout.checks.mjs — pure parts of the viral spots scout (no network).
import assert from "node:assert/strict";
import test from "node:test";
import {
  NAVER_SCOUT_DAILY, NAVER_SHARED_STOP, articleId, buildSpotRows, cleanText, eventLabel, eventSlug, ewkbPoint, insertStatements,
  isRecentMonth, loadWatchlist, mergeEvents, normalizeNaverNews, parseCopy, parseExtraction, parseGoogleNewsRss, pickNaverMatch, planQueries, publicEvents,
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
