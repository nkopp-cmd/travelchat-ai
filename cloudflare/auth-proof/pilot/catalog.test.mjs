import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const bundle = await build({ entryPoints: [new URL("src/catalog.ts", root).pathname], bundle: true, write: false, format: "esm", platform: "neutral" });
const { catalog } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("catalog nullable additions, visibility, pagination, safe public credits, and schema bounds", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of ["0001_local.sql", "0002_application.sql", "0004_pilot_catalog.sql", "0005_itineraries.sql"]) {
      db.exec(await readFile(new URL(`migrations/${file}`, root), "utf8"));
    }
    const env = { DB: { prepare(sql) { return { bind(...args) { return { async all() {
      return { results: db.prepare(sql).all(...args) };
    } }; } }; } } };
    const get = (query = "") => catalog(new URL(`https://preview.test/api/spots${query}`), env);
    assert.deepEqual(await (await get()).json(), { spots: [], nextOffset: null });
    const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
    for (const [i, id] of ids.entries()) db.prepare("INSERT INTO spots (id,name,description,category,localley_score,photos,visible) VALUES (?, ?, ?, 'cafe', NULL, NULL, ?)").run(id, '{"en":"Synthetic cafe"}', '{"en":"Not a real place"}', i === 2 ? 0 : 1);
    const first = await (await get("?limit=1")).json();
    assert.equal(first.nextOffset, 1);
    assert.deepEqual(first.spots[0], { id: ids[0], name: { en: "Synthetic cafe" }, description: { en: "Not a real place" }, category: "cafe", localley_score: null, photos: null, city: null, address: null, latitude: null, longitude: null, photoCredits: [], sourceUrls: [] });
    assert.deepEqual((await (await get("?limit=1&offset=1")).json()).spots.map(x => x.id), [ids[1]]);
    assert.equal((await (await get()).json()).nextOffset, null);
    for (const query of ["?limit=0", "?limit=101", "?offset=-1", "?offset=10001", "?limit=1&limit=2", "?city=Seoul"]) assert.equal((await get(query)).status, 400);
    const credit = { url: "/pilot/test.jpg", author: "<b>Author</b>&lt;\n", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Test.jpg", privateValue: "not-public" };
    const invalid = ["javascript:alert(1)", "https://user:password@example.test/photo", "https://example.test/photo?key=secret", "//example.test/photo", "/pilot/../secret.jpg"];
    db.prepare("UPDATE spots SET photo_credits = ?, source_urls = ?, city = ?, address = ? WHERE id = ?").run(JSON.stringify([credit, ...invalid.map(url => ({ ...credit, url })), null, 4]), JSON.stringify([credit.sourceUrl, ...invalid]), "<b>Seoul</b>", "<img src=x>Street", ids[0]);
    const safe = (await (await get()).json()).spots[0];
    assert.deepEqual(safe.photoCredits, [{ url: credit.url, author: "Author", license: credit.license, licenseUrl: credit.licenseUrl, sourceUrl: credit.sourceUrl }]);
    assert.deepEqual(safe.sourceUrls, [credit.sourceUrl]);
    assert.equal(safe.city, "Seoul");
    assert.equal(safe.address, "Street");
    for (const [field, value] of [["latitude", 91], ["latitude", -91], ["longitude", 181], ["longitude", -181], ["latitude", "bad"], ["photo_credits", "{}"], ["source_urls", "not-json"]]) assert.throws(() => db.prepare(`UPDATE spots SET ${field} = ? WHERE id = ?`).run(value, ids[0]));
    db.prepare("UPDATE spots SET latitude = 90, longitude = -180 WHERE id = ?").run(ids[0]);
    assert.equal((await (await get()).json()).spots[0].latitude, 90);
    assert.equal((await get()).headers.get("Cache-Control"), "no-store");
  } finally { db.close(); }
});
