import assert from "node:assert/strict";
import test from "node:test";
import { km, matchAttraction, parseAttractions, photoCredit, sourceUrlOf } from "./taiwan-opendata-lib.mjs";

const image = (url) => ({ Name: "x", Description: "照片提供｜臺北市政府觀光傳播局", URL: url });
const data = (attractions) => `﻿${JSON.stringify({ Attractions: attractions })}`;
const attraction = (name, lat, lng, images = [image("https://example.gov.tw/a.jpg")], extra = {}) => ({
    AttractionID: `Attraction_${name}`, AttractionName: name, AlternateNames: [], PositionLat: lat, PositionLon: lng, Images: images, ...extra,
});

test("parseAttractions keeps rows with a position and an image only (BOM ok)", () => {
    const list = parseAttractions(data([
        attraction("龍山寺", 25.0371, 121.4999),
        attraction("無圖", 25.03, 121.5, []),
        attraction("無座標", null, null),
        attraction("壞網址", 25.03, 121.5, [image("ftp://x/y.jpg")]),
    ]));
    assert.deepEqual(list.map((item) => item.name), ["龍山寺"]);
});

test("a spot matches the attraction with its own name nearby, never a same-name place far away", () => {
    const list = parseAttractions(data([
        attraction("艋舺龍山寺", 25.0371, 121.4999),
        attraction("龍山寺", 24.07, 120.54),
        attraction("剝皮寮歷史街區", 25.0369, 121.5016),
    ]));
    const spot = { names: { en: "Longshan Temple", zh: "龍山寺" }, lat: 25.0372, lng: 121.4998 };
    assert.equal(matchAttraction(spot, list)?.attraction.name, "艋舺龍山寺");
    assert.equal(matchAttraction({ ...spot, lat: 25.2, lng: 121.7 }, list), null);
    assert.equal(matchAttraction({ names: { en: "Ximending" }, lat: 25.04, lng: 121.5 }, list), null);
});

test("a station attraction never stands in for a place of the same name", () => {
    const list = parseAttractions(data([attraction("北投站", 25.1321, 121.4987)]));
    assert.equal(matchAttraction({ names: { zh: "北投" }, lat: 25.132, lng: 121.499 }, list), null);
});

test("the credit names the provider and the photo source; only https links are kept", () => {
    assert.equal(photoCredit("照片提供｜宜蘭分署"), "Taiwan Tourism Administration / 宜蘭分署");
    assert.equal(photoCredit("攝影：王小明"), "Taiwan Tourism Administration / 王小明");
    assert.equal(photoCredit(""), "Taiwan Tourism Administration");
    assert.equal(sourceUrlOf({ URL: "http://x.gov.tw/a.jpg" }), null);
    assert.equal(sourceUrlOf({ URL: "https://x.gov.tw/a.jpg" }), "https://x.gov.tw/a.jpg");
});

test("km is about 1.1 km per 0.01 degree latitude", () => {
    assert.ok(Math.abs(km(25, 121.5, 25.01, 121.5) - 1.112) < 0.01);
});

test("larger copies come first; unknown hosts keep the listed URL only", async () => {
    const { imageVariants } = await import("./taiwan-opendata-lib.mjs");
    assert.deepEqual(imageVariants("https://www.travel.taipei/content/images/attractions/64883/640x480_attractions-image-k.jpg"), [
        "https://www.travel.taipei/content/images/attractions/64883/attractions-image-k.jpg",
        "https://www.travel.taipei/content/images/attractions/64883/1920x1080_attractions-image-k.jpg",
        "https://www.travel.taipei/content/images/attractions/64883/640x480_attractions-image-k.jpg",
    ]);
    assert.deepEqual(imageVariants("https://newtaipei.travel/image/29/640x480"), ["https://newtaipei.travel/image/29", "https://newtaipei.travel/image/29/640x480"]);
    assert.deepEqual(imageVariants("https://www.northguan-nsa.gov.tw/att/pic/1.JPG"), ["https://www.northguan-nsa.gov.tw/att/pic/1.JPG"]);
});
