// Pure helpers for pexels-harvest.mjs (tested in pexels-harvest-lib.test.mjs).
// Rule (Nils 2026-11-04): Pexels only for AREA spots (a street, alley, district, village) and only when the photo
// shows that real area; a Pexels photo never stands in for a venue.
import { normName } from "./commons-harvest-lib.mjs";

export const PEXELS_LICENCE = "Pexels License";

const LATIN = /^[\p{Script=Latin}\p{N}]+$/u;
/** Last English word that makes a spot an area. */
const AREA_WORD = /^(district|area|street|alley|lane|soi|village|neighbou?rhood|quarter|town|chinatown)$/i;
/** Korean area names: "Garosu-gil", "Seongbuk-dong" (a hyphen, so "Dai Pai Dong" stays a venue). */
const AREA_SUFFIX = /-(gil|dong|ro)$/i;
/** A name with one of these words is a venue, whatever its last word is. */
const VENUE_WORD = /\b(cafe|cafes|coffee|restaurant|bar|bars|pub|hotel|hostel|museum|gallery|mall|centre|center|complex|building|tower|station|store|shop|shops|stall|curry|rice)\b/i;
/** Generic words stripped from the end of the name; what is left must appear in the photo text. */
const GENERIC_TAIL = /^(district|area|street|alley|lane|quarter|neighbou?rhood|village|shopping|market)$/i;

const englishName = (spot) => String(spot.names?.en || "").trim();

/** True for a street, alley, district or village spot; false for a venue. */
export function isAreaSpot(spot) {
    const name = englishName(spot);
    if (!name || VENUE_WORD.test(name)) return false;
    const last = name.split(/\s+/).pop();
    return AREA_WORD.test(last) || AREA_SUFFIX.test(last);
}

/** The specific part of an area name ("Togoshi Ginza Shopping Street" -> "Togoshi Ginza"), or "" when too generic. */
export function areaCore(spot) {
    const words = englishName(spot).split(/\s+/).filter(Boolean);
    while (words.length > 1 && GENERIC_TAIL.test(words[words.length - 1])) words.pop();
    const core = normName(words.join(" "));
    const specific = LATIN.test(core) ? core.length >= 8 : [...core].length >= 3;
    return specific ? words.join(" ") : "";
}

/** Pexels search URL for an area spot. */
export function searchUrl(spot, perPage = 30) {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", `${areaCore(spot)} ${spot.city || ""}`.trim());
    url.searchParams.set("per_page", String(perPage));
    return url.toString();
}

/** The photo's own words: its alt text and the slug of its page URL. */
function photoText(photo) {
    const slug = String(photo.url || "").replace(/^https?:\/\/[^/]+\/photo\//, "").replace(/-?\d+\/?$/, "");
    return normName(`${photo.alt || ""} ${slug}`);
}

/** The photo text names the area core AND the city, so a same-name street elsewhere never matches. */
export function photoMatches(spot, photo) {
    const core = normName(areaCore(spot));
    const city = normName(spot.city || "");
    if (!core || !city) return false;
    const text = photoText(photo);
    return text.includes(core) && text.includes(city);
}

/** Search JSON -> matching photos (largest first), as harvester matches. */
export function rankPhotos(spot, body, limit = 3) {
    if (!isAreaSpot(spot)) return [];
    return (body?.photos || [])
        .filter((photo) => photo?.id && photo.src?.large2x && photoMatches(spot, photo))
        .sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height))
        .slice(0, limit)
        .map((photo) => ({
            id: photo.id, downloadUrl: photo.src.large2x, width: photo.width, height: photo.height,
            author: String(photo.photographer || "").trim() || null, sourceUrl: photo.url, alt: photo.alt || "",
        }));
}
