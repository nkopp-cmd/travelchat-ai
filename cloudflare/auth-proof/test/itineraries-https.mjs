import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isEditableItineraryPlan } from "./plan-contract.mjs";

export async function itineraryHTTPSChecks({ db, page, call }) {
  const session = (await call("/api/session")).data;
  assert.equal(session.state, "ready");
  const sourceSpot = randomUUID();
  const policy = "https://archive.visitseoul.net/en/page/copyright?_ID=200100";
  const heritage = "https://www.heritage.go.kr/heri/cul/imgHeritage.do?ccimId=6405753&ccbaKdcd=11&ccbaAsno=02270000&ccbaCtcd=11";
  const sources = [policy, heritage, "https://example.test/?token=private", `${policy}&token=private`,
    `${policy}&_ID=200100`, heritage.replace("6405753", "not-a-number"), `${heritage}&ccimId=6405753`];
  await db.prepare("INSERT INTO spots(id,name,description,category,localley_score,photos,visible,source_urls) VALUES (?, ?, ?, 'culture', NULL, '[]', 1, ?)")
    .bind(sourceSpot, JSON.stringify({ en: "Synthetic source validation" }), JSON.stringify({ en: "Fixture only" }), JSON.stringify(sources)).run();
  try {
    const result = await call("/api/spots?limit=100");
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.spots.find((spot) => spot.id === sourceSpot).sourceUrls, [policy, heritage]);
  } finally { await db.prepare("DELETE FROM spots WHERE id = ?").bind(sourceSpot).run(); }
  for (const stops of [42, 56]) {
    const id = randomUUID();
    const days = [{ day: 1, activities: Array.from({ length: stops }, () => ({ name: "\uc11c\uc6b8", title: "Unknown title", notes: "\ud55c\uad6d\uc5b4 ".repeat(100), spotId: randomUUID() })) }];
    await db.prepare("INSERT INTO itineraries (id, ownerId, title, city, days, activities) VALUES (?, ?, 'Synthetic HTTPS', 'Seoul', 7, ?)")
      .bind(id, session.ownerId, JSON.stringify(days)).run();
    const path = `/api/itineraries/${id}`;
    const row = (await call(path)).data;
    const expected = Object.fromEntries(["title", "city", "activities", "highlights", "estimated_cost"].map((key) => [key, row[key]]));
    const body = { title: "Synthetic HTTPS edited", city: "Seoul", days, expected };
    assert.ok(Buffer.byteLength(JSON.stringify(body)) > 16384);
    const saved = await call(path + "/update", "PATCH", body, session.sessionId);
    assert.equal(saved.status, 200);
    assert.equal(isEditableItineraryPlan(saved.data.itinerary.activities), true);
    assert.deepEqual((await call(path)).data.activities, days);
    const before = await db.prepare("SELECT * FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, session.ownerId).first();
    const statuses = await page.evaluate(async ({ path, body, sessionId }) => {
      const statuses = [];
      for (const [endpoint, method, raw] of [[path + "/update", "PATCH", JSON.stringify({ ...body, title: "\ud55c".repeat(180000) })],
        ["/api/auth/sign-in/email", "POST", " ".repeat(16385)], [path, "PATCH", " ".repeat(16385)]]) {
        statuses.push((await fetch(endpoint, { method, headers: { "Content-Type": "application/json", "x-localley-session-id": sessionId }, body: raw })).status);
      }
      return statuses;
    }, { path, body, sessionId: session.sessionId });
    assert.deepEqual(statuses, [413, 413, 413]);
    assert.deepEqual(await db.prepare("SELECT * FROM itineraries WHERE id = ? AND ownerId = ?").bind(id, session.ownerId).first(), before);
  }
}
