// Pure helpers for the Wikidata/Commons photo harvester (plan localley-map-photos-edge-pins item 2b GLOBAL).
// Real place only: a Wikidata item counts when one of its labels IS the spot's name (or contains it), or when the
// spot name contains the item's own name (an area spot such as "Shimokitazawa Theater District" -> Shimokitazawa).

/** Wikimedia asks every client for a descriptive User-Agent with contact details. */
export const USER_AGENT = "LocalleyPhotoHarvester/1.0 (https://www.localley.io; hello@localley.io)";
/** Search radius (km): an exact name may sit up to 1 km from our pin (park or temple centroids); a partial one less. */
export const EXACT_RADIUS_KM = 1.0;
export const PARTIAL_RADIUS_KM = 0.4;
export const MIN_SCORE = 0.7;

const LATIN = /^[\p{Script=Latin}\p{N}]+$/u;
// A station item shares the place name ("Toneri-kōen Station") but its photo is a platform, not the place.
const STATION = /station|stn|駅|站|역|สถานี/iu;

/** Lowercase, NFKC, no accents, spaces or punctuation. */
export function normName(text) {
    // Accents come off Latin letters only: NFD on Japanese kana would drop the dakuten (ブ -> フ).
    return String(text || "").normalize("NFKC")
        .replace(/\p{Script=Latin}/gu, (char) => char.normalize("NFD").replace(/\p{M}/gu, "")).toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Every name of the spot (en + local languages), normalized and deduplicated. */
export function spotNames(spot) {
    return [...new Set(Object.values(spot.names || {}).map(normName).filter(Boolean))];
}

/** A label that is long enough to be a real name, not "ueno" inside a random word: >= 4 latin or >= 2 other chars. */
function distinctive(label) {
    return LATIN.test(label) ? label.length >= 4 : [...label].length >= 2;
}

/**
 * How sure we are that a Wikidata item is the spot (or the area the spot is): 1 exact name, 0.9 the item name
 * contains the spot name ("nakanobroadway" in "nakanobroadwayshoppingcenter"), 0.7 + share for an item name inside
 * the spot name. Distance limits keep a same-name place elsewhere out.
 */
export function matchScore(spot, item) {
    const names = spotNames(spot);
    let best = 0;
    for (const raw of item.labels || []) {
        const label = normName(raw);
        if (!label || !distinctive(label) || (STATION.test(label) && !names.some((name) => STATION.test(name)))) continue;
        for (const name of names) {
            if (label === name) best = Math.max(best, 1);
            else if (distinctive(name) && label.includes(name)) best = Math.max(best, 0.9);
            else if (name.includes(label)) best = Math.max(best, 0.7 + 0.2 * ([...label].length / [...name].length));
        }
    }
    if (best >= 1 && item.distanceKm <= EXACT_RADIUS_KM) return best;
    if (best > 0 && item.distanceKm <= PARTIAL_RADIUS_KM) return Math.min(best, 0.99);
    return 0;
}

/** Items that match, best first (score, then distance), one per image file. */
export function rankItems(spot, items, limit = 3) {
    const seen = new Set();
    return items
        .map((item) => ({ ...item, score: matchScore(spot, item) }))
        .filter((item) => item.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
        .filter((item) => !seen.has(item.file) && seen.add(item.file))
        .slice(0, limit);
}

/** Commons licences we may show commercially with credit: CC0, public domain, CC BY and CC BY-SA. Never NC or ND. */
export function allowedLicence(shortName) {
    const value = String(shortName || "").trim();
    if (/\b(NC|ND)\b|non-?commercial|no-?deriv/i.test(value)) return null;
    if (/^CC0(\s1\.0)?$/i.test(value)) return "CC0";
    if (/^(public domain|pd\b.*)/i.test(value)) return "Public domain";
    const cc = /^CC BY(-SA)?\s*(\d\.\d)?/i.exec(value);
    if (cc) return `CC BY${cc[1] ? "-SA" : ""}${cc[2] ? ` ${cc[2]}` : ""}`;
    return null;
}

/** Plain-text author from Commons' Artist HTML (links and tags removed, max 120 chars). */
export function cleanArtist(html) {
    const text = String(html || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.slice(0, 120) || null;
}

/** Wikidata items with an image (P18) around a point, with their labels in the languages our spots use. */
export function aroundQuery(lat, lng, radiusKm = EXACT_RADIUS_KM) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("bad coordinates");
    return `SELECT ?item ?img ?dist (GROUP_CONCAT(DISTINCT ?l; separator="|") AS ?labels) WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" . bd:serviceParam wikibase:distance ?dist . }
  ?item wdt:P18 ?img .
  OPTIONAL { ?item rdfs:label|skos:altLabel ?l . FILTER(LANG(?l) IN ("en","ja","zh","zh-hant","zh-tw","zh-hk","ko","th","ms")) }
} GROUP BY ?item ?img ?dist ORDER BY ?dist LIMIT 80`;
}

/** SPARQL JSON bindings -> { item, file, distanceKm, labels }. */
export function parseAround(body) {
    return (body?.results?.bindings || []).map((row) => ({
        item: String(row.item?.value || "").split("/").pop(),
        file: decodeURIComponent(String(row.img?.value || "").split("/").pop()).replace(/_/g, " "),
        distanceKm: Number(row.dist?.value),
        labels: String(row.labels?.value || "").split("|").filter(Boolean),
    })).filter((row) => row.item && row.file && Number.isFinite(row.distanceKm));
}

export function reviewPrompt(spot) {
    const local = Object.entries(spot.names || {}).filter(([lang]) => lang !== "en").map(([, name]) => name).join(", ");
    return [
        `Does this photo clearly show "${spot.names?.en || ""}"${local ? ` (${local})` : ""}, a ${spot.category} place in ${spot.city}?`,
        "For a district, street, market, river or park, a photo of that real area counts.",
        "Answer \"no\" if it shows a different place, only a generic scene, a station, a map, a poster, text or a watermark, or people as the main subject.",
        "Answer with one word: yes or no.",
    ].join(" ");
}

/** SQL string literal (single quotes doubled); null/undefined -> NULL. */
export function sqlValue(value) {
    if (value === null || value === undefined || value === "") return "NULL";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("bad number");
        return String(Math.trunc(value));
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * One idempotent INSERT per approved, uploaded photo. A harvested photo goes after the spot's existing photos
 * (MAX(position) + 1), so a consented tip or own photo stays the lead. A key that already has a row is skipped.
 */
export function insertSql(photos, approvedBy) {
    if (!/^harvester-[a-z0-9-]+$/.test(approvedBy)) throw new Error("approvedBy must be harvester-<source>");
    return photos
        .filter((photo) => photo.review === "yes" && photo.uploaded)
        .map((photo) => {
            if (!/^spot-photos\/[^/]+\/[0-9a-f]{64}\.webp$/.test(photo.r2Key)) throw new Error(`bad r2 key ${photo.r2Key}`);
            if (!photo.licence) throw new Error(`no licence for ${photo.r2Key}`);
            const spot = sqlValue(photo.spotId);
            const key = sqlValue(photo.r2Key);
            return `INSERT INTO spot_photos (r2_key, spot_id, position, source, licence, author, source_url, width, height, approved_by) `
                + `SELECT ${key}, ${spot}, COALESCE((SELECT MAX(position) FROM spot_photos WHERE spot_id = ${spot}), -1) + 1, `
                + `${sqlValue(photo.source)}, ${sqlValue(photo.licence)}, ${sqlValue(photo.author)}, ${sqlValue(photo.sourceUrl)}, `
                + `${sqlValue(photo.width)}, ${sqlValue(photo.height)}, ${sqlValue(approvedBy)} `
                + `WHERE NOT EXISTS (SELECT 1 FROM spot_photos WHERE r2_key = ${key});`;
        });
}

/** Commons geosearch radius (m): a geotagged file must be near our pin AND name the place in its file name. */
export const GEO_RADIUS_M = 300;

/** Geotagged Commons files (namespace 6) around a point; used when Wikidata has no matching item with an image. */
export function geosearchUrl(lat, lng, radiusM = GEO_RADIUS_M) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("bad coordinates");
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    for (const [key, value] of Object.entries({ action: "query", format: "json", formatversion: "2", list: "geosearch",
        gsnamespace: "6", gscoord: `${lat}|${lng}`, gsradius: String(radiusM), gslimit: "100" })) url.searchParams.set(key, value);
    return url.toString();
}

/** Geosearch JSON -> { file, distanceKm } (file without the "File:" prefix). */
export function parseGeosearch(body) {
    return (body?.query?.geosearch || []).map((row) => ({
        file: String(row.title || "").replace(/^File:/, ""),
        distanceKm: Number(row.dist) / 1000,
    })).filter((row) => row.file && Number.isFinite(row.distanceKm));
}

/**
 * 0.9 when the file name contains one of the spot's names, else 0. The name must be long enough to be specific
 * (>= 6 latin or >= 3 other chars), so "Park" or "Cafe" never matches; a station file never stands in for a place.
 */
export function fileTitleScore(spot, file) {
    const title = normName(String(file || "").replace(/\.[a-z0-9]{3,4}$/i, ""));
    const names = spotNames(spot);
    if (!title || (STATION.test(title) && !names.some((name) => STATION.test(name)))) return 0;
    const specific = (name) => (LATIN.test(name) ? name.length >= 6 : [...name].length >= 3);
    return names.some((name) => specific(name) && title.includes(name)) ? 0.9 : 0;
}

/** Geosearch files whose name names the spot, nearest first, one per file. */
export function rankFiles(spot, files, limit = 3) {
    const seen = new Set();
    return files
        .map((row) => ({ item: "commons-geo", file: row.file, distanceKm: row.distanceKm, score: fileTitleScore(spot, row.file) }))
        .filter((row) => row.score >= MIN_SCORE && row.distanceKm <= GEO_RADIUS_M / 1000)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .filter((row) => !seen.has(row.file) && seen.add(row.file))
        .slice(0, limit);
}

/** Depicts fallback: only a near-exact item name (>= 0.9) may lend its "depicts" files, so an area never stands in for a venue. */
export const DEPICTS_MIN_SCORE = 0.9;

/** Wikidata items around a point WITHOUT the image requirement (their photos are found by "depicts" on Commons). */
export function aroundItemsQuery(lat, lng, radiusKm = EXACT_RADIUS_KM) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("bad coordinates");
    return `SELECT ?item ?dist (GROUP_CONCAT(DISTINCT ?l; separator="|") AS ?labels) WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" . bd:serviceParam wikibase:distance ?dist . }
  ?item rdfs:label|skos:altLabel ?l . FILTER(LANG(?l) IN ("en","ja","zh","zh-hant","zh-tw","zh-hk","ko","th","ms"))
} GROUP BY ?item ?dist ORDER BY ?dist LIMIT 150`;
}

/** SPARQL JSON bindings -> { item, file: item id, distanceKm, labels } (file only keys the one-per-item ranking). */
export function parseAroundItems(body) {
    return (body?.results?.bindings || []).map((row) => {
        const item = String(row.item?.value || "").split("/").pop();
        return { item, file: item, distanceKm: Number(row.dist?.value), labels: String(row.labels?.value || "").split("|").filter(Boolean) };
    }).filter((row) => /^Q\d+$/.test(row.item) && Number.isFinite(row.distanceKm));
}

/** Commons bitmap files whose structured data says they depict (P180) the item. */
export function depictsUrl(item, limit = 10) {
    if (!/^Q\d+$/.test(String(item))) throw new Error("bad item");
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    for (const [key, value] of Object.entries({ action: "query", format: "json", formatversion: "2", list: "search", srnamespace: "6",
        srlimit: String(limit), srsearch: `haswbstatement:P180=${item} filetype:bitmap` })) url.searchParams.set(key, value);
    return url.toString();
}

/** Search JSON -> matches that carry the item's score and distance. */
export function parseDepicts(body, match) {
    return (body?.query?.search || [])
        .map((row) => String(row.title || "").replace(/^File:/, ""))
        .filter(Boolean)
        .map((file) => ({ item: match.item, file, distanceKm: match.distanceKm, score: match.score }));
}

/** City name + center pairs from the source of lib/cities.ts: each numeric `center` takes the last `name: "..."` above it. */
export function parseCityCenters(source) {
    const centers = [];
    let name = "";
    for (const match of String(source).matchAll(/^\s*name:\s*"([^"]+)"|center:\s*\{\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)/gm)) {
        if (match[1]) name = match[1];
        else if (name) centers.push({ name, lat: Number(match[2]), lng: Number(match[3]) });
    }
    return centers;
}

/** Spots without a city get the nearest configured city within `maxKm` of its center, else "". */
export function nearestCity(lat, lng, centers, maxKm = 80) {
    let best = { name: "", km: maxKm };
    for (const center of centers) {
        const dLat = (center.lat - lat) * Math.PI / 180;
        const dLng = (center.lng - lng) * Math.PI / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(center.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        const km = 12742 * Math.asin(Math.sqrt(h));
        if (km <= best.km) best = { name: center.name, km };
    }
    return best.name;
}
