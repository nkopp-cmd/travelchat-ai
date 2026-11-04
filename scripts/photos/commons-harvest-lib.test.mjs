import assert from "node:assert/strict";
import test from "node:test";
import { DEPICTS_MIN_SCORE, allowedLicence, aroundItemsQuery, aroundQuery, depictsUrl, parseAroundItems, parseDepicts, cleanArtist, fileTitleScore, geosearchUrl, insertSql, matchScore, nearestCity, normName, parseAround, parseCityCenters, parseGeosearch, rankFiles, rankItems, reviewPrompt } from "./commons-harvest-lib.mjs";

const nakano = { names: { en: "Nakano Broadway", ja: "中野ブロードウェイ" }, category: "Shopping", city: "Tokyo" };
const item = (over) => ({ item: "Q1", file: "a.jpg", distanceKm: 0.05, labels: [], ...over });

test("names normalize across scripts, accents and punctuation", () => {
  assert.equal(normName("Toneri-kōen  Park!"), "tonerikoenpark");
  assert.equal(normName("中野 ブロードウェイ"), "中野ブロードウェイ");
  assert.equal(normName("ＴＯＫＹＯ"), "tokyo");
});

test("an exact name in any language matches up to 1 km; a same-name place farther away does not", () => {
  assert.equal(matchScore(nakano, item({ labels: ["中野ブロードウェイ"] })), 1);
  assert.equal(matchScore(nakano, item({ labels: ["Nakano Broadway"], distanceKm: 0.9 })), 1);
  assert.equal(matchScore(nakano, item({ labels: ["Nakano Broadway"], distanceKm: 1.2 })), 0);
});

test("area spots take the real area item; partial matches need to be near and distinctive", () => {
  const shimo = { names: { en: "Shimokitazawa Theater District", ja: "下北沢シアター街" }, category: "Culture", city: "Tokyo" };
  assert.ok(matchScore(shimo, item({ labels: ["Shimokitazawa", "下北沢"], distanceKm: 0.03 })) >= 0.7);
  assert.equal(matchScore(shimo, item({ labels: ["Shimokitazawa"], distanceKm: 0.6 })), 0);
  // A short or unrelated label never matches by containment.
  const vinyl = { names: { en: "The Vinyl Archive" }, category: "Nightlife", city: "Tokyo" };
  assert.equal(matchScore(vinyl, item({ labels: ["Shibuya Cross Tower", "渋谷"], distanceKm: 0.1 })), 0);
  assert.equal(matchScore(vinyl, item({ labels: ["The"], distanceKm: 0.01 })), 0);
  assert.equal(matchScore({ names: { en: "Ueno Park" } }, item({ labels: ["Uen"] })), 0);
  // A station named after the place shows a platform, not the place.
  assert.equal(matchScore({ names: { en: "Toneri Park", ja: "舎人公園" } }, item({ labels: ["Toneri-kōen Station", "舎人公園駅"] })), 0);
  assert.equal(matchScore({ names: { en: "Tokyo Station" } }, item({ labels: ["Tokyo Station"] })), 1);
});

test("ranking: best score first, then nearest, one per image, never below the minimum", () => {
  const ranked = rankItems(nakano, [
    item({ item: "Q3", file: "far.jpg", labels: ["Nakano"], distanceKm: 0.3 }),
    item({ item: "Q2", file: "entrance.jpg", labels: ["ジラフ"], distanceKm: 0.01 }),
    item({ item: "Q1", file: "entrance.jpg", labels: ["Nakano Broadway"], distanceKm: 0.01 }),
    item({ item: "Q4", file: "entrance.jpg", labels: ["中野ブロードウェイ"], distanceKm: 0.02 }),
  ]);
  assert.deepEqual(ranked.map((row) => row.item), ["Q1", "Q3"]);
});

test("licences: CC0, public domain, CC BY and CC BY-SA only; never NC, ND or unknown", () => {
  assert.equal(allowedLicence("CC BY-SA 4.0"), "CC BY-SA 4.0");
  assert.equal(allowedLicence("CC BY 2.0"), "CC BY 2.0");
  assert.equal(allowedLicence("CC0"), "CC0");
  assert.equal(allowedLicence("Public domain"), "Public domain");
  assert.equal(allowedLicence("CC BY-NC-SA 2.0"), null);
  assert.equal(allowedLicence("CC BY-ND 4.0"), null);
  assert.equal(allowedLicence("GFDL"), null);
  assert.equal(allowedLicence(""), null);
});

test("author text drops HTML and entities", () => {
  assert.equal(cleanArtist('<a href="//commons.wikimedia.org/wiki/User:Kakidai">Kakidai</a> &amp; friend'), "Kakidai & friend");
  assert.equal(cleanArtist(""), null);
});

test("the SPARQL query takes numbers only and parses into items", () => {
  assert.throws(() => aroundQuery(Number.NaN, 1));
  assert.match(aroundQuery(35.7, 139.66), /Point\(139\.66 35\.7\)/);
  const rows = parseAround({ results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q11" },
    img: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/Nakano%20broadway%20entrance.JPG" }, dist: { value: "0.012" }, labels: { value: "Nakano Broadway|中野ブロードウェイ" } }] } });
  assert.deepEqual(rows, [{ item: "Q11", file: "Nakano broadway entrance.JPG", distanceKm: 0.012, labels: ["Nakano Broadway", "中野ブロードウェイ"] }]);
});

test("the vision prompt names the place in every language and accepts real areas", () => {
  const prompt = reviewPrompt(nakano);
  assert.match(prompt, /"Nakano Broadway" \(中野ブロードウェイ\), a Shopping place in Tokyo/);
  assert.match(prompt, /real area counts/);
});

test("insert SQL: approved + uploaded only, after existing photos, quotes escaped, idempotent", () => {
    const sha = "a".repeat(64);
    const base = { spotId: "s'1", r2Key: `spot-photos/s1/${sha}.webp`, source: "commons", licence: "CC BY-SA 4.0",
        author: "O'Brien", sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg", width: 1600, height: 1067, review: "yes", uploaded: true };
    const rows = insertSql([base, { ...base, review: "no" }, { ...base, uploaded: false }], "harvester-commons");
    assert.equal(rows.length, 1);
    assert.match(rows[0], /'O''Brien'/);
    assert.match(rows[0], /COALESCE\(\(SELECT MAX\(position\) FROM spot_photos WHERE spot_id = 's''1'\), -1\) \+ 1/);
    assert.match(rows[0], /WHERE NOT EXISTS \(SELECT 1 FROM spot_photos WHERE r2_key = /);
    assert.throws(() => insertSql([{ ...base, r2Key: "x/../y" }], "harvester-commons"));
    assert.throws(() => insertSql([{ ...base, licence: "" }], "harvester-commons"));
    assert.throws(() => insertSql([base], "nils"));
});

test("geosearch fallback: a nearby file that names the place matches; generic, far and station files do not", () => {
    assert.throws(() => geosearchUrl(Number.NaN, 1));
    assert.match(geosearchUrl(35.7, 139.66), /gscoord=35\.7%7C139\.66.*gsradius=300/);
    const files = parseGeosearch({ query: { geosearch: [
        { title: "File:Nakano Broadway 2019-05.jpg", dist: 40.2 },
        { title: "File:中野ブロードウェイ入口.jpg", dist: 12 },
        { title: "File:Nakano Broadway far.jpg", dist: 450 },
        { title: "File:Shop sign.jpg", dist: 5 },
    ] } });
    assert.deepEqual(files[0], { file: "Nakano Broadway 2019-05.jpg", distanceKm: 0.0402 });
    assert.deepEqual(rankFiles(nakano, files).map((row) => row.file), ["中野ブロードウェイ入口.jpg", "Nakano Broadway 2019-05.jpg"]);
    assert.equal(fileTitleScore({ names: { en: "Park" } }, "Ueno Park.jpg"), 0);
    assert.equal(fileTitleScore({ names: { en: "Toneri Park" } }, "Toneri Park Station platform.jpg"), 0);
    assert.equal(fileTitleScore({ names: { en: "Toneri Park" } }, "Toneri park cherry blossoms.JPG"), 0.9);
});

test("a spot without a city takes the nearest configured city within 80 km, else none", () => {
    const centers = parseCityCenters(`
    // Hong Kong
    { slug: "hong-kong",
        name: "Hong Kong",
        neighborhoods: ["Central"],
        center: { lat: 22.3193, lng: 114.1694 }, },
    { slug: "hanoi",
        name: "Hanoi",
        stats: { spots: { min: 1, ideal: 2 } },
        center: { lat: 21.0285, lng: 105.8542 }, }`);
    assert.deepEqual(centers.map((row) => row.name), ["Hong Kong", "Hanoi"]);
    assert.equal(nearestCity(22.28, 114.16, centers), "Hong Kong");
    assert.equal(nearestCity(21.0, 105.8, centers), "Hanoi");
    assert.equal(nearestCity(10.77, 106.7, centers), "");
});

test("depicts fallback: items without an image, a strict name gate, and bitmap files that depict the item", () => {
    assert.throws(() => aroundItemsQuery(1, Number.NaN));
    assert.doesNotMatch(aroundItemsQuery(35.7, 139.66), /P18/);
    const items = parseAroundItems({ results: { bindings: [
        { item: { value: "http://www.wikidata.org/entity/Q42" }, dist: { value: "0.05" }, labels: { value: "Nakano Broadway|中野ブロードウェイ" } },
        { item: { value: "http://www.wikidata.org/entity/Q7" }, dist: { value: "0.02" }, labels: { value: "Nakano" } },
        { item: { value: "http://www.wikidata.org/entity/bad" }, dist: { value: "0.01" }, labels: { value: "Nakano Broadway" } },
    ] } });
    assert.deepEqual(items.map((row) => row.item), ["Q42", "Q7"]);
    // The area item ("Nakano") scores below the depicts gate; only the exact item may lend its files.
    const strict = rankItems(nakano, items).filter((row) => row.score >= DEPICTS_MIN_SCORE);
    assert.deepEqual(strict.map((row) => row.item), ["Q42"]);
    const bukchon = { names: { en: "Osulloc Tea House Bukchon" } };
    assert.ok(rankItems(bukchon, [item({ labels: ["Bukchon Hanok Village", "Bukchon"] })]).every((row) => row.score < DEPICTS_MIN_SCORE));
    assert.throws(() => depictsUrl("Q1 OR 1"));
    assert.match(depictsUrl("Q42"), /srsearch=haswbstatement%3AP180%3DQ42\+filetype%3Abitmap/);
    assert.deepEqual(parseDepicts({ query: { search: [{ title: "File:Nakano Broadway 2.jpg" }] } }, strict[0]),
        [{ item: "Q42", file: "Nakano Broadway 2.jpg", distanceKm: 0.05, score: 1 }]);
});
