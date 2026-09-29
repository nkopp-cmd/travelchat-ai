// Read-only gate: compare a hash-pinned private D1 import with the live city API.
// Only aggregate city counts are printed. No source rows or credentials are written.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { projectImportedCities } from "../../lib/app-data/city-counts.ts";

export function readPinnedCatalog(sql, report) {
  const digest = createHash("sha256").update(sql).digest("hex");
  if (digest !== report.sqlSha256 || !Number.isSafeInteger(report.statements) ||
      !Number.isSafeInteger(report.counts?.spots) ||
      !Number.isSafeInteger(report.counts?.legacy_spot_source)) {
    throw new Error("Import report does not match SQL");
  }
  const lines = sql.toString("utf8").trimEnd().split("\n");
  if (lines.length !== report.statements || lines.some(line => !line.endsWith(";"))) {
    throw new Error("Import statement count mismatch");
  }
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE spots (id TEXT PRIMARY KEY, name TEXT, description TEXT,
      category TEXT, localley_score INTEGER, photos TEXT, visible INTEGER, city TEXT,
      address TEXT, latitude REAL, longitude REAL, photo_credits TEXT, source_urls TEXT);
      CREATE TABLE legacy_spot_source (spotId TEXT PRIMARY KEY, payload TEXT, publicIssue TEXT);`);
    for (const line of lines) {
      if (line.startsWith("INSERT OR IGNORE INTO spots ") ||
          line.startsWith("INSERT OR IGNORE INTO legacy_spot_source ")) db.exec(line);
    }
    const spots = db.prepare("SELECT count(*) AS n FROM spots").get().n;
    const source = db.prepare("SELECT count(*) AS n FROM legacy_spot_source").get().n;
    if (spots !== report.counts.spots || source !== report.counts.legacy_spot_source || source < 1) {
      throw new Error("Imported catalog count mismatch");
    }
    const rows = db.prepare(`SELECT s.payload, p.visible FROM legacy_spot_source s
      JOIN spots p ON p.id = s.spotId ORDER BY s.spotId`).all();
    if (rows.length !== source) throw new Error("Imported catalog has missing spot links");
    return rows;
  } finally {
    db.close();
  }
}

export function compareCityCounts(imported, live) {
  const actual = new Map(live.map(row => [row.slug, row.spotCount]));
  if (actual.size !== live.length || imported.length !== live.length ||
      live.some(row => !Number.isSafeInteger(row.spotCount) || row.spotCount < 0)) {
    throw new Error("Live city response is incomplete");
  }
  return imported.flatMap(city => {
    const liveCount = actual.get(city.slug);
    if (liveCount === undefined) throw new Error("Live city response is incomplete");
    return liveCount === city.spotCount ? [] : [{ slug: city.slug, live: liveCount,
      imported: city.spotCount, delta: city.spotCount - liveCount }];
  });
}

export async function compareCurrentCities(sqlPath, reportPath, request = fetch) {
  const [sql, reportBytes] = await Promise.all([readFile(sqlPath), readFile(reportPath)]);
  const rows = readPinnedCatalog(sql, JSON.parse(reportBytes.toString("utf8")));
  if (rows.length === 0) throw new Error("Imported catalog join is empty");
  const imported = projectImportedCities(rows);
  const response = await request("https://www.localley.io/api/cities?noCache=true&includeHidden=true",
    { method: "GET", headers: { "Accept": "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Live city request failed: ${response.status}`);
  const body = await response.json();
  if (body.success !== true || !Array.isArray(body.cities) || body.total !== body.cities.length) {
    throw new Error("Live city response is invalid");
  }
  return { importedSpots: rows.length, cityCount: imported.length,
    differences: compareCityCounts(imported, body.cities) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--sql" || args[2] !== "--report") {
    throw new Error("Usage: node --import tsx scripts/d1-migration/compare-cities.mjs --sql PRIVATE_IMPORT.sql --report PRIVATE_REPORT.json");
  }
  compareCurrentCities(resolve(args[1]), resolve(args[3])).then(result => {
    console.log(JSON.stringify(result));
    if (result.differences.length) process.exitCode = 2;
  }).catch(() => {
    console.error("City comparison failed; verify the pinned import and live API.");
    process.exitCode = 1;
  });
}
