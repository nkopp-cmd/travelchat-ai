// Commons photo of an OSM notable place, for the candidate promoter (plan localley-mobile-map-ux-asia-growth item 6).
// discover-osm-places.mjs keeps only places whose Wikidata item has an image (P18) and stores that Commons file page.
// The P18 image is the curated photo of exactly that Wikidata item; the item must sit within 1 km of the OSM point (a wrong
// OSM wikidata tag fails it), and no vision check runs
// (localley-decisions.md 2026-11-16). Same rules as commons-harvest.mjs otherwise: CC0 / PD / CC BY / CC BY-SA only, no
// restrictions, photo mime, >= 1000 px and sharp enough; 1600 px webp plus the 480/144 card and pin copies in R2; one
// spot_photos row with author, licence and file page. The spot stores the /media/spot path, so the public photo rule
// (a real photo) and the credit line both hold from the first insert.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { allowedLicence, cleanArtist, USER_AGENT } from "./commons-harvest-lib.mjs";
import { qualityProblems, spotPhotoKey } from "./kto-harvest-lib.mjs";

sharp.cache(false);

const BUCKET = "localley-community-media";
const ACCOUNT = "664f242340bcec2f32daaeee15f58bde";
export const WIDTH = 1600;
export const COPIES = [
    { suffix: "-w480", resize: { width: 480, withoutEnlargement: true }, quality: 72 },
    { suffix: "-w144", resize: { width: 144, height: 144, fit: "cover", withoutEnlargement: true }, quality: 70 },
];
export const APPROVED_BY = "harvester-osm-p18";
const FILE_PAGE = "https://commons.wikimedia.org/wiki/File:";

/** Commons file page URL of a file name ("Wat Arun.jpg"). */
export function commonsFileUrl(file) {
    return FILE_PAGE + encodeURIComponent(String(file).trim().replace(/ /g, "_"));
}

/** File name of a Commons file page URL, or null. */
export function commonsFileName(url) {
    if (typeof url !== "string" || !url.startsWith(FILE_PAGE)) return null;
    try {
        const name = decodeURIComponent(url.slice(FILE_PAGE.length)).replace(/_/g, " ").trim();
        return name && !/[/\\|#<>[\]{}]/.test(name) ? name : null;
    } catch { return null; }
}

/** Wikidata wbgetentities URL for up to 50 item ids (claims only). */
export function wikidataClaimsUrl(qids) {
    const ids = [...new Set(qids)].filter((q) => /^Q\d+$/.test(q));
    if (!ids.length || ids.length > 50) throw new Error("1-50 Wikidata ids");
    return `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${ids.join("|")}`;
}

function bestValue(claims) {
    const live = (claims ?? []).filter((c) => c?.rank !== "deprecated");
    return (live.find((c) => c.rank === "preferred") ?? live[0])?.mainsnak?.datavalue?.value;
}

/**
 * { Q123: { file, lat, lng } } for items with an image (P18) and coordinates (P625). An item without coordinates is no
 * place (e.g. a people or a cuisine a wrong OSM tag points to), so its image would not show the spot.
 */
export function parseP18(json) {
    const out = {};
    for (const [qid, entity] of Object.entries(json?.entities ?? {})) {
        const file = bestValue(entity?.claims?.P18);
        const coord = bestValue(entity?.claims?.P625);
        const lat = Number(coord?.latitude), lng = Number(coord?.longitude);
        if (typeof file === "string" && file.trim() && Number.isFinite(lat) && Number.isFinite(lng)) out[qid] = { file: file.trim(), lat, lng };
    }
    return out;
}

/** Metres between two points (haversine). */
export function metresBetween(a, b) {
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** The item's image when the item sits within maxM of the OSM point, else null (wrong or broad wikidata tag). */
export const MAX_ITEM_M = 1000;
export function imageNear(item, point, maxM = MAX_ITEM_M) {
    return item && metresBetween(item, point) <= maxM ? item.file : null;
}

/** Commons imageinfo API URL of one file (1600 px thumbnail, licence metadata). */
export function imageInfoUrl(file) {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    for (const [key, value] of Object.entries({ action: "query", format: "json", formatversion: "2", prop: "imageinfo",
        iiprop: "url|size|mime|extmetadata", iiurlwidth: String(WIDTH), titles: `File:${file}` })) url.searchParams.set(key, value);
    return url.toString();
}

/** Licence, author and size of a Commons imageinfo answer; `problem` is set when the file must not be used. */
export function parseImageInfo(json) {
    const info = json?.query?.pages?.[0]?.imageinfo?.[0];
    if (!info) return { problem: "no-file-info" };
    const meta = info.extmetadata || {};
    const out = {
        thumbUrl: info.thumburl || info.url, width: info.width, height: info.height, mime: info.mime,
        sourceUrl: info.descriptionurl, licence: allowedLicence(meta.LicenseShortName?.value),
        author: cleanArtist(meta.Artist?.value), restrictions: String(meta.Restrictions?.value || "").trim(),
    };
    if (!out.licence) return { ...out, problem: "licence" };
    if (out.restrictions) return { ...out, problem: "restricted" };
    if (!/^image\/(jpeg|png|webp|tiff)$/.test(out.mime || "")) return { ...out, problem: "not-a-photo" };
    // Commons moved thumbnails to thumb.wikimedia.org in 2026 (originals stay on upload.); both are Wikimedia media hosts.
    if (!/^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(out.thumbUrl || "")) return { ...out, problem: "bad-url" };
    return out;
}

/** Public path of a spot photo key (lib/spots/own-photo.ts spotPhotoPath). */
export function spotPhotoPathOf(key) {
    const m = /^spot-photos\/([0-9a-f-]{36})\/([0-9a-f]{64})\.webp$/.exec(key);
    if (!m) throw new Error("not a spot photo key");
    return `/media/spot/${m[1]}/${m[2]}.webp`;
}

/** The spot_photos insert of a new spot's first photo (position 0, idempotent on r2_key). */
export function photoInsert(spotId, photo) {
    return {
        sql: `INSERT INTO spot_photos (r2_key, spot_id, position, source, licence, author, source_url, width, height, approved_by)
      SELECT ?, ?, 0, 'commons', ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM spot_photos WHERE r2_key = ?)`,
        params: [photo.r2Key, spotId, photo.licence, photo.author, photo.sourceUrl, photo.width, photo.height, APPROVED_BY, photo.r2Key],
    };
}

async function getJson(url) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
        if (response?.ok) return response.json();
        await response?.body?.cancel();
        await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1))); // Wikimedia asks clients to back off on 429/5xx
    }
    throw new Error(`fetch failed ${new URL(url).hostname}`);
}

/** Image + coordinates of Wikidata ids, 50 per request. */
export async function p18Files(qids) {
    const ids = [...new Set(qids)].filter((q) => /^Q\d+$/.test(q));
    const out = {};
    for (let i = 0; i < ids.length; i += 50) Object.assign(out, parseP18(await getJson(wikidataClaimsUrl(ids.slice(i, i + 50)))));
    return out;
}

async function sharpness(image) {
    const { channels } = await sharp(image).resize({ width: 1000, withoutEnlargement: true }).greyscale()
        .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }).stats();
    return channels[0].stdev;
}

function r2Put(key, file) {
    execFileSync("npx", ["-y", "wrangler@4", "r2", "object", "put", `${BUCKET}/${key}`, "--remote", "--jurisdiction", "eu", "--file", file,
        "--content-type", "image/webp", "--cache-control", "public, max-age=31536000, immutable"],
    { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT }, timeout: 120_000 });
}

/**
 * Downloads, checks and (with apply) uploads the Commons file of a new spot. Returns the photo
 * ({ r2Key, path, licence, author, sourceUrl, width, height }) or { problem }.
 */
export async function fetchSpotPhoto(file, spotId, { apply = false, put = r2Put } = {}) {
    const info = parseImageInfo(await getJson(imageInfoUrl(file)));
    if (info.problem) return { problem: info.problem };
    const response = await fetch(info.thumbUrl, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (!response?.ok) { await response?.body?.cancel(); return { problem: "download-failed" }; }
    const original = Buffer.from(await response.arrayBuffer());
    if (!(await sharp(original).metadata().catch(() => null))) return { problem: "not-an-image" };
    const problems = qualityProblems({ width: info.width, height: info.height, sharpness: await sharpness(original) });
    if (problems.length) return { problem: `quality: ${problems.join("; ")}` };
    const webp = await sharp(original).rotate().resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const meta = await sharp(webp).metadata();
    const sha = createHash("sha256").update(webp).digest("hex");
    const r2Key = spotPhotoKey(spotId, sha);
    if (apply) {
        // Host disk, not the RAM-backed /tmp.
        const dir = join(homedir(), ".cache/localley-osm-photo", sha);
        mkdirSync(dir, { recursive: true });
        try {
            writeFileSync(join(dir, "full.webp"), webp);
            put(r2Key, join(dir, "full.webp"));
            for (const copy of COPIES) {
                const small = join(dir, `${copy.suffix}.webp`);
                writeFileSync(small, await sharp(webp).resize(copy.resize).webp({ quality: copy.quality }).toBuffer());
                put(r2Key.replace(/\.webp$/, `${copy.suffix}.webp`), small);
            }
        } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    return { r2Key, path: spotPhotoPathOf(r2Key), licence: info.licence, author: info.author, sourceUrl: info.sourceUrl,
        width: meta.width, height: meta.height };
}
