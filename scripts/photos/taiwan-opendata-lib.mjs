// Pure helpers for the Taiwan Tourism Administration open-data photo harvester (plan localley-map-photos-edge-pins
// item 2b b). Source: media.taiwan.net.tw XMLReleaseAll_public v2.0 Attraction-json (Government Open Data License
// v1.0: commercial use with credit). Real place only: the attraction's own name must match the spot (commons rules).
import { MIN_SCORE, matchScore } from "./commons-harvest-lib.mjs";

export const DATA_URL = "https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip";
export const OPENDATA_LICENCE = "Open Government Data License v1.0 (Taiwan)";
export const OPENDATA_PROVIDER = "Taiwan Tourism Administration";

/** Great-circle distance in km (equirectangular; exact enough below 5 km). */
export function km(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
    const y = (lat2 - lat1) * rad;
    return 6371 * Math.hypot(x, y);
}

/** Attraction-json -> attractions with a position and at least one http(s) image. */
export function parseAttractions(text) {
    const body = JSON.parse(String(text).replace(/^﻿/, ""));
    return (body.Attractions || []).flatMap((item) => {
        // Number(null) is 0: a missing position must not become a point in the Gulf of Guinea.
        const lat = item.PositionLat == null || item.PositionLat === "" ? NaN : Number(item.PositionLat);
        const lng = item.PositionLon == null || item.PositionLon === "" ? NaN : Number(item.PositionLon);
        const images = (item.Images || []).filter((image) => /^https?:\/\//.test(String(image?.URL || "")));
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !images.length || !item.AttractionName) return [];
        return [{ id: String(item.AttractionID), name: String(item.AttractionName), alternateNames: (item.AlternateNames || []).map(String), lat, lng, images }];
    });
}

/** The best matching attraction for a spot (score >= MIN_SCORE inside the commons radius rules), or null. */
export function matchAttraction(spot, attractions) {
    let best = null;
    for (const attraction of attractions) {
        if (Math.abs(attraction.lat - spot.lat) > 0.05 || Math.abs(attraction.lng - spot.lng) > 0.05) continue;
        const distanceKm = km(spot.lat, spot.lng, attraction.lat, attraction.lng);
        const score = matchScore(spot, { labels: [attraction.name, ...attraction.alternateNames], distanceKm });
        if (score >= MIN_SCORE && (!best || score > best.score || (score === best.score && distanceKm < best.distanceKm))) {
            best = { attraction, score, distanceKm };
        }
    }
    return best;
}

/** "照片提供｜宜蘭分署" / "攝影：王小明" -> "宜蘭分署"; the credit is "<photo provider> / Taiwan Tourism Administration". */
export function photoCredit(description) {
    const text = String(description || "").replace(/\s+/g, " ").trim();
    const match = /(?:照片提供|圖片提供|攝影|拍攝|提供)\s*[｜|:：]\s*(.+)$/u.exec(text);
    const provider = match ? match[1].trim().slice(0, 80) : "";
    return provider ? `${OPENDATA_PROVIDER} / ${provider}` : OPENDATA_PROVIDER;
}

/** Vision check question: the photo must show this very place. */
export function reviewPrompt(spot) {
    return [
        `Does this photo clearly show "${spot.nameEn}" (${spot.nameZh}), a ${spot.category} place in ${spot.city}, Taiwan?`,
        "Answer \"no\" if it shows a different place, only a generic scene, a map, a poster, text or a watermark, or people as the main subject.",
        "Answer with one word: yes or no.",
    ].join(" ");
}

/** Only https image URLs are kept as the photo's source link (the credits page shows https links only). */
export function sourceUrlOf(image) {
    const url = String(image?.URL || "");
    return url.startsWith("https://") ? url : null;
}

/**
 * Larger copies of the same open-data photo, best first, then the listed URL. The feed lists 640x480 thumbnails;
 * travel.taipei serves the original without the size prefix, newtaipei.travel without the size path.
 */
export function imageVariants(url) {
    const text = String(url || "");
    const variants = [];
    const taipei = /^(https:\/\/www\.travel\.taipei\/content\/images\/attractions\/\d+\/)\d+x\d+_(.+)$/.exec(text);
    if (taipei) variants.push(`${taipei[1]}${taipei[2]}`, `${taipei[1]}1920x1080_${taipei[2]}`);
    const newTaipei = /^(https:\/\/newtaipei\.travel\/image\/\d+)\/\d+x\d+$/.exec(text);
    if (newTaipei) variants.push(newTaipei[1]);
    return [...new Set([...variants, text])];
}
