import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function chatTests(t, { db, call, aliceCookie, bobCookie }) {
  const session = async (cookie = aliceCookie) => (await call("/api/session", { cookie })).json();
  const headers = { "x-localley-session-id": (await session()).sessionId };

  await t.test("catalog chat answers from published spots and requires a current session", async () => {
    const id = randomUUID();
    await db.prepare("INSERT INTO spots(id,name,description,category,visible,city) VALUES (?, ?, ?, 'culture', 1, 'Seoul')")
      .bind(id, JSON.stringify({ en: "Gyeongbokgung Palace" }), JSON.stringify({ en: "Royal palace in Seoul." })).run();
    const asked = await call("/api/chat", { method: "POST", cookie: aliceCookie, headers, body: { message: "palace in Seoul" } });
    assert.equal(asked.status, 200);
    const data = await asked.json();
    assert.match(data.reply, /Gyeongbokgung Palace/);
    assert.ok(data.places.some((place) => place.name === "Gyeongbokgung Palace"));
    assert.equal((await call("/api/chat", { method: "POST", cookie: aliceCookie, headers, body: { message: "zzzz not a place" } })).status, 200);
    assert.equal((await call("/api/chat", { method: "POST", cookie: aliceCookie, body: { message: "palace" } })).status, 428);
    assert.equal((await call("/api/chat", { method: "POST", cookie: bobCookie, headers: { "x-localley-session-id": (await session(bobCookie)).sessionId }, body: { message: "palace" } })).status, 200);
    assert.equal((await call("/api/chat", { method: "GET", cookie: aliceCookie, headers })).status, 405);
    assert.equal((await call("/api/chat", { method: "POST", cookie: aliceCookie, headers, body: { prompt: "palace" } })).status, 400);
  });
}
