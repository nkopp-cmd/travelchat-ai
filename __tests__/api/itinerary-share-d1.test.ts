// @vitest-environment node
// AK5: the share button on production D1. 0 of 110 trips were shared, so this proves the owner path end to end.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown, userId: "user_alice" as string | null }));
vi.mock("@/lib/auth/server", () => ({ auth: async () => ({ userId: mocks.userId }) }));
vi.mock("@/lib/supabase-server", async () => {
  const { d1Client } = await import("@/lib/app-data/d1-postgrest");
  return { createSupabaseServerClient: async () => mocks.userId
    ? d1Client(mocks.db as never, { role: "user", userId: mocks.userId })
    : d1Client(mocks.db as never, { role: "anon" }) };
});
import { DELETE, POST } from "@/app/api/itineraries/[id]/share/route";

const mine = "20000000-0000-4000-8000-000000000001";
const bobPrivate = "20000000-0000-4000-8000-000000000002";
const bobPublic = "20000000-0000-4000-8000-000000000003";
let db: D1Sqlite;

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "d1");
  mocks.userId = "user_alice";
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  db.sqlite.exec(`INSERT INTO owners VALUES ('user_alice', 'new'), ('user_bob', 'new');
    INSERT INTO itineraries (id, ownerId, title, city, days, activities) VALUES
      ('${mine}', 'user_alice', 'Seoul', 'Seoul', 1, '[]'),
      ('${bobPrivate}', 'user_bob', 'Tokyo', 'Tokyo', 1, '[]'),
      ('${bobPublic}', 'user_bob', 'Bangkok', 'Bangkok', 1, '[]');
    UPDATE itineraries SET is_public = 1 WHERE id = '${bobPublic}';`);
  mocks.db = db;
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); });

const call = (handler: typeof POST, id: string) =>
  handler(new NextRequest(`https://www.localley.io/api/itineraries/${id}/share`, { method: handler === POST ? "POST" : "DELETE" }),
    { params: Promise.resolve({ id }) });
const row = (id: string) => db.sqlite.prepare("SELECT shared, share_code FROM itineraries WHERE id = ?").get(id) as { shared: number; share_code: string | null };

describe("POST/DELETE /api/itineraries/:id/share on D1", () => {
  it("shares the owner's trip with an 8-char code and returns the same code on a repeat", async () => {
    const first = await call(POST, mine);
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.shareCode).toMatch(/^[a-z0-9]{8}$/);
    expect(body.shareUrl).toBe(`https://www.localley.io/shared/${body.shareCode}`);
    expect(row(mine)).toEqual({ shared: 1, share_code: body.shareCode });

    const again = await (await call(POST, mine)).json();
    expect(again.shareCode).toBe(body.shareCode);
  });

  it("unshares the owner's trip", async () => {
    await call(POST, mine);
    const off = await call(DELETE, mine);
    expect(off.status).toBe(200);
    expect(row(mine)).toEqual({ shared: 0, share_code: null });
  });

  it("refuses another user's trip and leaves it unchanged", async () => {
    expect((await call(POST, bobPublic)).status).toBe(403);
    expect((await call(DELETE, bobPublic)).status).toBe(403);
    expect((await call(POST, bobPrivate)).status).toBe(404); // a private row does not exist for other users
    expect(row(bobPublic)).toEqual({ shared: 0, share_code: null });
    expect(row(bobPrivate)).toEqual({ shared: 0, share_code: null });
  });

  it("answers 401 to anonymous callers", async () => {
    mocks.userId = null;
    expect((await call(POST, mine)).status).toBe(401);
    expect((await call(DELETE, mine)).status).toBe(401);
    expect(row(mine)).toEqual({ shared: 0, share_code: null });
  });
});
