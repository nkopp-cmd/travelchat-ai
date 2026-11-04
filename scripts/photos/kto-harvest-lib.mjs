// Pure parts of the KTO photo harvester (plan localley-map-photos-edge-pins item 2b). No network, no files.
// Source: KTO Photo Korea gallery (PhotoGalleryService1), KOGL Type 1 = free use incl. edits, credit required
// (data.go.kr/data/15101914). Google, Naver, Kakao, Instagram, blogs and review sites are never sources.

export const KTO_LICENCE = "KOGL Type 1";
export const MIN_LONG_SIDE = 1000;
export const MIN_SHARPNESS = 1.2;
export const MATCH_MIN = 0.6;
export const MAX_HAMMING_DUPLICATE = 6;

const CITY_KO = { Seoul: ["서울"], Busan: ["부산"], Jeju: ["제주"], Gyeongju: ["경주", "경상북도"] };
// Words that say what a place is, not which one: they make every market look like every other market.
const GENERIC = /(서울특별시|서울시|서울|부산광역시|부산|전통시장|시장|거리|골목|공원|역사관|박물관|미술관|카페|식당)$/u;

export function normalizeKo(text) {
    return String(text || "").normalize("NFC").replace(/^(서울|부산|제주|경주)\s+/u, "").replace(/[\s·・()[\]{}"'.,!?\-_/]+/gu, "");
}

function bigrams(text) {
    const grams = [];
    for (let i = 0; i < text.length - 1; i += 1) grams.push(text.slice(i, i + 2));
    return grams.length ? grams : text ? [text] : [];
}

/** Dice similarity of Korean character bigrams, 0..1. Containment of a distinctive name counts as a full match. */
export function koSimilarity(a, b) {
    const x = normalizeKo(a);
    const y = normalizeKo(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    // The photo title names the whole spot ("노량진수산시장" in "노량진수산시장 야경"), or the spot is that place plus a
    // short qualifier ("낙산공원 일몰" -> "낙산공원"). An area name inside a venue name ("이태원" in "이태원 아프리카
    // 식당") is not a match: it would show the area, not the venue.
    if (x.replace(GENERIC, "").length >= 2 && y.includes(x)) return 1;
    if (y.replace(GENERIC, "").length >= 2 && x.startsWith(y) && y.length / x.length >= 0.6) return 1;
    const left = bigrams(x);
    const right = bigrams(y);
    const pool = new Map();
    for (const gram of right) pool.set(gram, (pool.get(gram) || 0) + 1);
    let shared = 0;
    for (const gram of left) {
        const count = pool.get(gram) || 0;
        if (count) { shared += 1; pool.set(gram, count - 1); }
    }
    return (2 * shared) / (left.length + right.length);
}

/** Search keywords, best first: the full name without spaces, then the name with its generic suffix removed. */
export function searchKeywords(nameKo) {
    const full = normalizeKo(nameKo);
    const words = String(nameKo || "").trim().split(/\s+/u).filter(Boolean);
    const out = [full];
    const core = full.replace(GENERIC, "");
    if (core.length >= 2 && core !== full) out.push(core);
    if (words.length > 1 && normalizeKo(words[0]).length >= 2) out.push(normalizeKo(words[0]));
    return [...new Set(out.filter((word) => word.length >= 2))];
}

/** The gallery photo is in the spot's city (empty location is accepted: many rows say only the title). */
export function cityMatches(city, location) {
    const names = CITY_KO[city];
    if (!names || !location) return true;
    return names.some((name) => String(location).includes(name));
}

/** Gallery rows that show this spot, best first; at most `limit`, one per gallery content id. */
export function matchGallery(spot, items, limit = 3) {
    const seen = new Set();
    return items
        .map((item) => ({
            item,
            score: koSimilarity(spot.nameKo, item.galTitle),
        }))
        .filter(({ item, score }) => score >= MATCH_MIN && cityMatches(spot.city, item.galPhotographyLocation) && /^https:\/\/tong\.visitkorea\.or\.kr\//.test(item.galWebImageUrl || ""))
        .sort((a, b) => b.score - a.score || String(b.item.galModifiedtime).localeCompare(String(a.item.galModifiedtime)))
        .filter(({ item }) => {
            const key = item.galContentId;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit)
        .map(({ item, score }) => ({
            contentId: String(item.galContentId),
            title: item.galTitle,
            url: item.galWebImageUrl,
            photographer: item.galPhotographer || "",
            location: item.galPhotographyLocation || "",
            month: item.galPhotographyMonth || "",
            score: Math.round(score * 100) / 100,
        }));
}

/** "Korea Tourism Organization / Kim Jiho"-style credit; the gallery gives "한국관광공사 김지호". */
export function ktoCredit(photographer) {
    const person = String(photographer || "").replace(/^한국관광공사\s*/u, "").trim();
    return person ? `Korea Tourism Organization / ${person}` : "Korea Tourism Organization";
}

/** Quality gate (code): big enough and sharp enough. */
export function qualityProblems({ width, height, sharpness }) {
    const problems = [];
    if (Math.max(width || 0, height || 0) < MIN_LONG_SIDE) problems.push(`long side ${Math.max(width || 0, height || 0)} < ${MIN_LONG_SIDE}`);
    if (!(sharpness >= MIN_SHARPNESS)) problems.push(`sharpness ${Number(sharpness || 0).toFixed(2)} < ${MIN_SHARPNESS}`);
    return problems;
}

/** 64-bit difference hash from a 9x8 greyscale buffer (row major), as 16 hex chars. */
export function dHash(pixels) {
    if (pixels.length !== 72) throw new Error("dHash needs 9x8 pixels");
    let bits = 0n;
    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            bits = (bits << 1n) | (pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? 1n : 0n);
        }
    }
    return bits.toString(16).padStart(16, "0");
}

export function hamming(a, b) {
    let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
    let count = 0;
    while (diff) { count += Number(diff & 1n); diff >>= 1n; }
    return count;
}

/** True when the hash is (almost) the same picture as one already used for another spot. */
export function isDuplicate(hash, usedHashes) {
    return usedHashes.some((used) => hamming(hash, used) <= MAX_HAMMING_DUPLICATE);
}

/** The vision check answer must be a clear yes; anything else (no, unsure, text) rejects the photo. */
export function reviewSaysYes(answer) {
    return /^\s*yes\b/i.test(String(answer || ""));
}

export function reviewPrompt(spot) {
    return [
        `Does this photo clearly show "${spot.nameEn}" (${spot.nameKo}), a ${spot.category} place in ${spot.city}, Korea?`,
        "Answer \"no\" if it shows a different place, only a generic scene, a map, a poster, text or a watermark, or people as the main subject.",
        "Answer with one word: yes or no.",
    ].join(" ");
}

export function spotPhotoKey(spotId, sha256Hex) {
    if (!/^[0-9a-f-]{36}$/.test(spotId) || !/^[0-9a-f]{64}$/.test(sha256Hex)) throw new Error("bad spot photo key");
    return `spot-photos/${spotId}/${sha256Hex}.webp`;
}

export const TOUR_RADIUS_M = 250;
const TOUR_LICENCE = { Type1: "KOGL Type 1", Type3: "KOGL Type 3" };

/** EngService2 titles read "Mangnidan Street (망리단길)": the Korean part, or the whole title when there is none. */
export function tourTitleKo(title) {
    const text = String(title || "").trim();
    // "Seoul Namsan Park (남산공원(서울))" nests a qualifier: take everything after the first "(" with Hangul.
    const start = text.search(/\((?=[^()]*[가-힣])/u);
    return start >= 0 && text.endsWith(")") ? text.slice(start + 1, -1).replace(/\([^()]*\)$/u, "").trim() : text;
}

/**
 * TourAPI (EngService2 locationBasedList2) rows that are this spot: Korean name >= MATCH_MIN, within the radius,
 * with an image and a free KOGL type (Type1 = edits allowed; Type3 = no edits, so resize/format only, no crop).
 */
export function matchTour(spot, items) {
    return items
        .map((item) => ({ item, score: koSimilarity(spot.nameKo, tourTitleKo(item.title)), dist: Number(item.dist) }))
        .filter(({ item, score, dist }) => score >= MATCH_MIN && !(dist > TOUR_RADIUS_M) && TOUR_LICENCE[item.cpyrhtDivCd]
            && /^https?:\/\/tong\.visitkorea\.or\.kr\//.test(item.firstimage || ""))
        .sort((a, b) => b.score - a.score || (a.dist || 0) - (b.dist || 0))
        .slice(0, 1)
        .map(({ item, score }) => ({
            contentId: String(item.contentid),
            title: item.title,
            url: String(item.firstimage).replace(/^http:/, "https:"),
            licence: TOUR_LICENCE[item.cpyrhtDivCd],
            score: Math.round(score * 100) / 100,
        }));
}
