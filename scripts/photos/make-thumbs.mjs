#!/usr/bin/env node
// Writes the 480 px card copy (`spot-photos/<spot>/<sha>-480.webp`) of every spot_photos row that has none yet.
// Cards, pins and Nearby rows ask for it (lib/spots/own-photo.ts spotPhotoThumbPath); /media/spot serves the full
// photo until the copy exists. Host script, needs sharp. Idempotent: done keys are kept in <out>/thumbs-done.json.
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
for (const { r2_key: key } of rows) {
    if (!KEY.test(key) || done.has(key)) continue;
    const full = path.join(outDir, "full.webp");
    const small = path.join(outDir, "small.webp");
    wrangler("r2", "object", "get", `${BUCKET}/${key}`, "--remote", "--jurisdiction", "eu", "--file", full);
    await sharp(full).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toFile(small);
    wrangler("r2", "object", "put", `${BUCKET}/${key.replace(/\.webp$/, "-480.webp")}`, "--remote", "--jurisdiction", "eu",
        "--file", small, "--content-type", "image/webp", "--cache-control", "public, max-age=31536000, immutable");
    done.add(key);
    made += 1;
    if (made % 20 === 0) fs.writeFileSync(doneFile, JSON.stringify([...done]));
}
fs.writeFileSync(doneFile, JSON.stringify([...done]));
console.log(JSON.stringify({ rows: rows.length, made, done: done.size }));
