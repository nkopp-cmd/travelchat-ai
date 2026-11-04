import assert from "node:assert/strict";
import test from "node:test";
import { areaCore, isAreaSpot, photoMatches, rankPhotos, searchUrl } from "./pexels-harvest-lib.mjs";

const spot = (en, city = "Tokyo") => ({ names: { en }, city });
const photo = (id, alt, extra = {}) => ({
    id, alt, width: 4000, height: 6000, photographer: "Aiko", url: `https://www.pexels.com/photo/${alt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id}/`,
    src: { large2x: `https://images.pexels.com/photos/${id}/x.jpeg?w=1880` }, ...extra,
});

test("only streets, alleys, districts and villages are area spots; venues never are", () => {
    assert.equal(isAreaSpot(spot("Togoshi Ginza Shopping Street")), true);
    assert.equal(isAreaSpot(spot("Garosu-gil", "Seoul")), true);
    assert.equal(isAreaSpot(spot("Seongbuk-dong", "Seoul")), true);
    assert.equal(isAreaSpot(spot("Ikebukuro Chinatown")), true);
    assert.equal(isAreaSpot(spot("Sing Kee Dai Pai Dong", "Hong Kong")), false);
    assert.equal(isAreaSpot(spot("Sendagi Alley Cafes")), false);
    assert.equal(isAreaSpot(spot("Chinatown Complex Food Centre", "Singapore")), false);
    assert.equal(isAreaSpot(spot("Beach Road Scissor Cut Curry Rice", "Singapore")), false);
    assert.equal(isAreaSpot(spot("Yeji-dong Night Owl", "Seoul")), false);
    assert.equal(isAreaSpot(spot("Ueno Park")), false);
});

test("the area core drops generic tail words and must stay specific", () => {
    assert.equal(areaCore(spot("Togoshi Ginza Shopping Street")), "Togoshi Ginza");
    assert.equal(areaCore(spot("Bukchon Hanok Village", "Seoul")), "Bukchon Hanok");
    assert.equal(areaCore(spot("Graham Street Market", "Hong Kong")), "");
    assert.equal(areaCore(spot("Ari Area", "Bangkok")), "");
    assert.match(searchUrl(spot("Yanaka Ginza Street")), /query=Yanaka\+Ginza\+Tokyo/);
});

test("a photo matches only when its text names the area and the city", () => {
    const yanaka = spot("Yanaka Ginza Street");
    assert.equal(photoMatches(yanaka, photo(1, "Bustling street scene in Yanaka Ginza, Tokyo")), true);
    assert.equal(photoMatches(yanaka, photo(2, "Bustling street scene in Tokyo")), false);
    assert.equal(photoMatches(yanaka, photo(3, "Yanaka Ginza style street in Osaka")), false);
    // "Ari" inside "vibrant" never counts: "Ari Area" has no specific core at all.
    assert.equal(photoMatches(spot("Ari Area", "Bangkok"), photo(4, "Vibrant Bangkok skyline")), false);
});

test("rankPhotos keeps matching photos, largest first, and nothing for a venue", () => {
    const body = { photos: [
        photo(10, "Night view of Yanaka Ginza in Tokyo", { width: 2000, height: 1500 }),
        photo(11, "Shoppers in Yanaka Ginza, Tokyo", { width: 6000, height: 4000 }),
        photo(12, "Cat in a Tokyo alley"),
        { id: 13, alt: "Yanaka Ginza Tokyo", width: 5000, height: 4000, src: {} },
    ] };
    const ranked = rankPhotos(spot("Yanaka Ginza Street"), body, 3);
    assert.deepEqual(ranked.map((row) => row.id), [11, 10]);
    assert.equal(ranked[0].author, "Aiko");
    assert.match(ranked[0].sourceUrl, /^https:\/\/www\.pexels\.com\/photo\//);
    assert.deepEqual(rankPhotos(spot("Yanaka Ginza Cafe"), body), []);
});
