#!/usr/bin/env node
// Writes the 960 px hero copy (`<sha>-w960.webp`), the AVIF twins (`<sha>-w480.avif`, `-w960.avif`, `<sha>.avif`), the 480 px card copy (`spot-photos/<spot>/<sha>-w480.webp`) and the 144 px pin copy (`<sha>-w144.webp`) of every
// spot_photos row that has none yet. Cards and Nearby rows ask for the 480 copy (lib/spots/own-photo.ts
// spotPhotoThumbPath), map pins for the 144 copy (spotPhotoPinPath); /media/spot serves a larger one until the copy
// exists. Host script, needs sharp. Idempotent: done keys are kept in <out>/thumbs-done.json (`<key>@w480`, `<key>@w144`).
// The old `-480`/`-144` copies were made from a stale sharp file cache (wrong photos), so they are never served again.
// Usage: node scripts/photos/make-thumbs.mjs --out <dir> [--avif-only]   Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";

// sharp caches input files by path; one reused download path then turns every copy into the first photo.
sharp.cache(false);

const BUCKET = "localley-community-media";
const KEY = /^spot-photos\/[0-9a-f-]{36}\/[0-9a-f]{64}\.webp$/;
const at = process.argv.indexOf("--out");
const outDir = at > 0 ? process.argv[at + 1] : null;
if (!outDir) { console.error("usage: make-thumbs.mjs --out <dir>"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const wrangler = (...rest) => execFileSync("npx", ["-y", "wrangler@4", ...rest], { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });

const doneFile = path.join(outDir, "thumbs-done.json");
const done = new Set(fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, "utf8")) : []);
const rows = JSON.parse(wrangler("d1", "execute", "localley-app", "--remote", "--json", "--command", "SELECT r2_key FROM spot_photos"))[0].results;
let made = 0;
// The pin copy is a centre square: the round pin face crops with object-fit: cover the same way.
const SIZES = [
    // Hero copy: a phone hero is 390-430 CSS px at 2-3x; the full photo is often 500-600 KB (Push AL2).
    { width: 960, mark: (key) => `${key}@w960`, resize: { width: 960, withoutEnlargement: true }, quality: 70 },
    { width: 480, mark: (key) => `${key}@w480`, resize: { width: 480, withoutEnlargement: true }, quality: 72 },
    { width: 144, mark: (key) => `${key}@w144`, resize: { width: 144, height: 144, fit: "cover", withoutEnlargement: true }, quality: 70 },
    // AVIF twins (Push CI2): about half the WebP bytes at the same look (w480 31.7 KB WebP q72 -> 15.8 KB AVIF q45).
    // The hero <picture> lists them first; /media/spot serves the WebP copy until they exist.
    { width: 480, format: "avif", mark: (key) => `${key}@w480.avif`, resize: { width: 480, withoutEnlargement: true }, quality: 45 },
    { width: 960, format: "avif", mark: (key) => `${key}@w960.avif`, resize: { width: 960, withoutEnlargement: true }, quality: 45 },
    { width: 0, format: "avif", mark: (key) => `${key}@full.avif`, resize: null, quality: 50 },
];
const SIZE_ONLY = process.argv.includes("--avif-only") ? SIZES.filter((size) => size.format === "avif") : SIZES;
for (const { r2_key: key } of rows) {
    const todo = SIZE_ONLY.filter((size) => !done.has(size.mark(key)));
    if (!KEY.test(key) || !todo.length) continue;
    const full = path.join(outDir, "full.webp");
    const small = path.join(outDir, "small.webp");
    fs.rmSync(full, { force: true });
    wrangler("r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--jurisdiction", "eu", "--file", full);
    // Content-addressed: the download must hash to the sha in its key, or the copy would show another photo.
    const source = fs.readFileSync(full);
    const sha = crypto.createHash("sha256").update(source).digest("hex");
    if (!key.endsWith(`/${sha}.webp`)) throw new Error(`downloaded bytes do not match ${key}`);
    for (const size of todo) {
        const image = size.resize ? sharp(source).resize(size.resize) : sharp(source);
        const avif = size.format === "avif";
        fs.writeFileSync(small, await (avif ? image.avif({ quality: size.quality, effort: 4 }) : image.webp({ quality: size.quality })).toBuffer());
        const target = key.replace(/\.webp$/, `${size.width ? `-w${size.width}` : ""}.${avif ? "avif" : "webp"}`);
        wrangler("r2", "object", "put", `${BUCKET}/${target}`, "--remote", "--jurisdiction", "eu",
            "--file", small, "--content-type", avif ? "image/avif" : "image/webp", "--cache-control", "public, max-age=31536000, immutable");
        done.add(size.mark(key));
    }
    made += 1;
    if (made % 20 === 0) fs.writeFileSync(doneFile, JSON.stringify([...done]));
}
fs.writeFileSync(doneFile, JSON.stringify([...done]));
console.log(JSON.stringify({ rows: rows.length, made, done: done.size }));
