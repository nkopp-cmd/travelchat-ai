#!/usr/bin/env node
// Writes spot_photos rows for the approved, uploaded photos of a harvester manifest (commons-harvest.mjs or
// kto-harvest.mjs). Idempotent: a key that already has a row is skipped. Run only after the photo credits are live.
// Usage: node scripts/photos/insert-photos.mjs --manifest <dir>/manifest.json --approved-by harvester-commons [--apply]
// Without --apply it prints the SQL file path and the row count only.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { insertSql } from "./commons-harvest-lib.mjs";

const args = process.argv.slice(2);
const value = (name) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : undefined; };
const manifest = value("manifest");
const approvedBy = value("approved-by");
if (!manifest || !approvedBy) {
    console.error("usage: insert-photos.mjs --manifest <file> --approved-by harvester-<source> [--apply]");
    process.exit(2);
}
const data = JSON.parse(fs.readFileSync(manifest, "utf8"));
// commons-harvest writes `photos`, kto-harvest writes `results`.
const statements = insertSql(data.photos ?? data.results ?? [], approvedBy);
const sqlFile = path.join(path.dirname(manifest), `insert-${approvedBy}.sql`);
fs.writeFileSync(sqlFile, `${statements.join("\n")}\n`);
console.log(`${statements.length} rows -> ${sqlFile}`);
if (args.includes("--apply") && statements.length) {
    execFileSync("npx", ["-y", "wrangler@4", "d1", "execute", "localley-app", "--remote", "--yes", "--file", sqlFile], { stdio: "inherit" });
}
