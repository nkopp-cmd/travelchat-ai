import assert from "node:assert/strict";
import test from "node:test";
import { cityMatches, dHash, hamming, isDuplicate, koSimilarity, ktoCredit, matchGallery, qualityProblems, reviewSaysYes, searchKeywords, spotPhotoKey } from "./kto-harvest-lib.mjs";

const spot = { nameKo: "망원시장", nameEn: "Mangwon Market", category: "Market", city: "Seoul" };
const item = (over) => ({ galContentId: "1", galTitle: "망원시장", galSearchKeyword: "", galPhotographer: "한국관광공사 김지호", galPhotographyLocation: "서울특별시 마포구", galWebImageUrl: "https://tong.visitkorea.or.kr/cms2/website/1.jpg", galModifiedtime: "20240101", ...over });

test("Korean name similarity: exact, spaced and distinctive containment match; other markets do not", () => {
  assert.equal(koSimilarity("망원 시장", "망원시장"), 1);
  assert.equal(koSimilarity("노량진수산시장", "노량진 수산시장 야경"), 1);
  assert.ok(koSimilarity("망원시장", "경동시장") < 0.6);
  assert.ok(koSimilarity("시장", "경동시장") < 1);
  assert.equal(koSimilarity("", "망원시장"), 0);
});

test("search keywords start with the full name and add the core without a generic suffix", () => {
  assert.deepEqual(searchKeywords("서대문 독립공원"), ["서대문독립공원", "서대문독립", "서대문"]);
  assert.deepEqual(searchKeywords("망원시장"), ["망원시장", "망원"]);
});

test("gallery match keeps the spot's own photos, in its city, from the KTO image host, best first", () => {
  const rows = [item({}), item({ galContentId: "2", galTitle: "경동시장" }), item({ galContentId: "3", galPhotographyLocation: "부산광역시" }),
    item({ galContentId: "4", galWebImageUrl: "https://example.com/x.jpg" }), item({ galContentId: "1", galTitle: "망원시장 입구" })];
  const out = matchGallery(spot, rows);
  assert.deepEqual(out.map((row) => row.contentId), ["1"]);
  assert.equal(out[0].photographer, "한국관광공사 김지호");
  assert.ok(cityMatches("Seoul", ""));
  assert.ok(!cityMatches("Seoul", "부산광역시 해운대구"));
});

test("credit names KTO and the photographer", () => {
  assert.equal(ktoCredit("한국관광공사 김지호"), "Korea Tourism Organization / 김지호");
  assert.equal(ktoCredit(""), "Korea Tourism Organization");
});

test("quality gate rejects small or blurred photos", () => {
  assert.deepEqual(qualityProblems({ width: 1280, height: 853, sharpness: 9 }), []);
  assert.equal(qualityProblems({ width: 800, height: 600, sharpness: 9 }).length, 1);
  assert.equal(qualityProblems({ width: 1280, height: 853, sharpness: 0.5 }).length, 1);
  assert.equal(qualityProblems({ width: 1280, height: 853 }).length, 1);
});

test("dHash finds the same picture again and keeps different pictures apart", () => {
  const ramp = Array.from({ length: 72 }, (_, i) => (i % 9) * 10);
  const noisy = ramp.map((v, i) => (i === 5 ? v + 3 : v));
  const flipped = ramp.map((v) => 100 - v);
  assert.equal(hamming(dHash(ramp), dHash(noisy)), 0);
  assert.ok(isDuplicate(dHash(noisy), [dHash(ramp)]));
  assert.ok(!isDuplicate(dHash(flipped), [dHash(ramp)]));
  assert.throws(() => dHash([1, 2, 3]));
});

test("vision answer must be a clear yes; R2 key is spot-scoped", () => {
  assert.ok(reviewSaysYes("yes"));
  assert.ok(reviewSaysYes(" Yes."));
  for (const answer of ["no", "unsure", "", null, "I think yes"]) assert.ok(!reviewSaysYes(answer));
  const id = "0b9c4b52-3c33-4e0e-9a43-6a3c1f7e2d10";
  assert.equal(spotPhotoKey(id, "a".repeat(64)), `spot-photos/${id}/${"a".repeat(64)}.webp`);
  assert.throws(() => spotPhotoKey("../x", "a".repeat(64)));
});

import { matchTour, tourTitleKo } from "./kto-harvest-lib.mjs";

test("TourAPI match uses the Korean title part, the 250 m radius and only free KOGL types", () => {
  assert.equal(tourTitleKo("Mangnidan Street (망리단길)"), "망리단길");
  assert.equal(tourTitleKo("Seoul Forest"), "Seoul Forest");
  assert.equal(tourTitleKo("Seoul Namsan Park (남산공원(서울))"), "남산공원");
  const row = (over) => ({ title: "Mangwon Market (망원시장)", contentid: "9", dist: "120", firstimage: "http://tong.visitkorea.or.kr/cms/resource/1.jpg", cpyrhtDivCd: "Type1", ...over });
  const [hit] = matchTour(spot, [row({})]);
  assert.equal(hit.url, "https://tong.visitkorea.or.kr/cms/resource/1.jpg");
  assert.equal(hit.licence, "KOGL Type 1");
  assert.equal(matchTour(spot, [row({ cpyrhtDivCd: "Type3" })])[0].licence, "KOGL Type 3");
  for (const over of [{ dist: "400" }, { cpyrhtDivCd: "Type2" }, { cpyrhtDivCd: "" }, { firstimage: "" }, { title: "Gyeongdong Market (경동시장)" }])
    assert.deepEqual(matchTour(spot, [row(over)]), []);
});

test("an area name inside a venue name is not a match; a place plus a short qualifier is", () => {
  assert.ok(koSimilarity("이태원 아프리카 식당", "이태원") < 0.6);
  assert.ok(koSimilarity("이태원 아프리카 식당", "이태원거리") < 0.6);
  assert.equal(koSimilarity("낙산공원 일몰", "낙산공원"), 1);
  assert.ok(koSimilarity("북한산 우이동 입구", "북한산") < 0.6);
});

import { distanceM, enNameMatch, koreanNameFromEng, korDetailImages, KOR_RADIUS_M, matchKor, TOURAPI_MIN_LONG_SIDE } from "./kto-harvest-lib.mjs";

const korSpot = { nameKo: "광장시장", nameEn: "Gwangjang Market", category: "Market", city: "Seoul", lat: 37.5700, lng: 126.9996 };
const kor = (over) => ({ contentid: "132183", title: "광장시장", cpyrhtDivCd: "Type1", firstimage: "http://tong.visitkorea.or.kr/cms/resource/1.jpg", mapx: "126.9996", mapy: "37.5701", addr1: "서울특별시 종로구", ...over });

test("KorService2 match: same name near the spot, free licence, KTO image; https image url", () => {
  const out = matchKor(korSpot, [kor({ contentid: "9", title: "경동시장" }), kor({}), kor({ contentid: "8", cpyrhtDivCd: "" })]);
  assert.deepEqual(out.map((row) => row.contentId), ["132183"]);
  assert.equal(out[0].licence, "KOGL Type 1");
  assert.ok(out[0].url.startsWith("https://tong.visitkorea.or.kr/"));
});

test("KorService2 match rejects a same-name place far away, a foreign image host and, without coordinates, another city", () => {
  assert.deepEqual(matchKor(korSpot, [kor({ mapy: "35.1" })]), []);
  assert.deepEqual(matchKor(korSpot, [kor({ firstimage: "https://example.com/1.jpg" })]), []);
  const noPoint = { ...korSpot, lat: NaN, lng: NaN };
  assert.equal(matchKor(noPoint, [kor({})]).length, 1);
  assert.deepEqual(matchKor(noPoint, [kor({ addr1: "부산광역시 중구" })]), []);
  assert.ok(distanceM(37.57, 126.9996, 37.574, 126.9996) < KOR_RADIUS_M);
  assert.ok(distanceM(37.57, 126.9996, 37.58, 126.9996) > KOR_RADIUS_M);
});

test("detailImage2 rows become extra candidates with their own licence; unknown licences drop", () => {
  const [hit] = matchKor(korSpot, [kor({})]);
  const out = korDetailImages(hit, [{ originimgurl: "http://tong.visitkorea.or.kr/2.jpg", cpyrhtDivCd: "Type3" }, { originimgurl: "http://tong.visitkorea.or.kr/3.jpg", cpyrhtDivCd: "Type4" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].licence, "KOGL Type 3");
  assert.equal(out[0].contentId, "132183");
});

test("Korean name from the EngService2 row with the same English name only", () => {
  const rows = [{ title: "Gwangjang Market (광장시장)", dist: "40" }, { title: "Mangnidan Street (망리단길)", dist: "10" }];
  assert.equal(koreanNameFromEng(korSpot, rows), "광장시장");
  assert.equal(koreanNameFromEng({ nameEn: "Gwangjang" }, rows), "");
  assert.equal(koreanNameFromEng(korSpot, [{ title: "Gwangjang Market (광장시장)", dist: "900" }]), "");
  assert.equal(koreanNameFromEng(korSpot, [{ title: "Gwangjang Market", dist: "5" }]), "");
});

test("TourAPI 940 px images pass the TourAPI size gate, not the gallery gate", () => {
  assert.deepEqual(qualityProblems({ width: 940, height: 625, sharpness: 9 }, TOURAPI_MIN_LONG_SIDE), []);
  assert.equal(qualityProblems({ width: 940, height: 625, sharpness: 9 }).length, 1);
});

test("enNameMatch: equal names or all words of the shorter name, two words at least", () => {
  assert.equal(enNameMatch("Ahopsan Bamboo Forest", "Ahopsan Forest"), true);
  assert.equal(enNameMatch("Songjeong Beach", "Songjeong Beach"), true);
  assert.equal(enNameMatch("Cafe Rooftop (Haeundae)", "Haeundae Beach"), false);
  assert.equal(enNameMatch("Haeundae", "Haeundae Beach"), false);
  assert.equal(enNameMatch("Busan Museum of Art", "Busan Museum"), false);
});

test("koreanNameFromEng: keyword rows use mapx/mapy distance within the radius", () => {
  const spot = { nameEn: "Songjeong Beach", lat: 35.1786, lng: 129.1997 };
  const near = { title: "Songjeong Beach (송정해수욕장)", mapy: "35.1790", mapx: "129.2000" };
  const far = { title: "Songjeong Beach (송정해수욕장)", mapy: "35.2000", mapx: "129.2000" };
  assert.equal(koreanNameFromEng(spot, [near], KOR_RADIUS_M), "송정해수욕장");
  assert.equal(koreanNameFromEng(spot, [far], KOR_RADIUS_M), "");
  assert.equal(koreanNameFromEng({ nameEn: "Songjeong Beach" }, [near], KOR_RADIUS_M), "");
});
