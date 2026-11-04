#!/usr/bin/env node
// Writes the 480 px card copy (`spot-photos/<spot>/<sha>-480.webp`) and the 144 px pin copy (`<sha>-144.webp`) of every
// spot_photos row that has none yet. Cards and Nearby rows ask for the 480 copy (lib/spots/own-photo.ts
// spotPhotoThumbPath), map pins for the 144 copy (spotPhotoPinPath); /media/spot serves a larger one until the copy
// exists. Host script, needs sharp. Idempotent: done keys are kept in <out>/thumbs-done.json (`<key>` = 480 copy made,
// `<key>@144` = pin copy made).
// Usage: node scripts/photos/make-thumbs.mjs --out <dir>   Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

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
    { width: 480, mark: (key) => key, resize: { width: 480, withoutEnlargement: true }, quality: 72 },
    { width: 144, mark: (key) => `${key}@144`, resize: { width: 144, height: 144, fit: "cover", withoutEnlargement: true }, quality: 70 },
];
for (const { r2_key: key } of rows) {
    const todo = SIZES.filter((size) => !done.has(size.mark(key)));
    if (!KEY.test(key) || !todo.length) continue;
    const full = path.join(outDir, "full.webp");
    const small = path.join(outDir, "small.webp");
    wrangler("r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--jurisdiction", "eu", "--file", full);
    for (const size of todo) {
        await sharp(full).resize(size.resize).webp({ quality: size.quality }).toFile(small);
        wrangler("r2", "object", "put", `${BUCKET}/${key.replace(/\.webp$/, `-${size.width}.webp`)}`, "--remote", "--jurisdiction", "eu",
            "--file", small, "--content-type", "image/webp", "--cache-control", "public, max-age=31536000, immutable");
        done.add(size.mark(key));
    }
    made += 1;
    if (made % 20 === 0) fs.writeFileSync(doneFile, JSON.stringify([...done]));
}
fs.writeFileSync(doneFile, JSON.stringify([...done]));
console.log(JSON.stringify({ rows: rows.length, made, done: done.size }));
