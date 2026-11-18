// @vitest-environment node
// AK2: the public share card for /shared/<code>. Crawlers got 401 from /api/og; this card reads only shared rows.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase", async () => {
  const { d1Client } = await import("@/lib/app-data/d1-postgrest");
  return { createSupabaseAdmin: () => d1Client(mocks.db as never, { role: "service" }) };
});
const { GET } = await import("@/app/og/shared/[shareCode]/route");

let db: D1Sqlite;
beforeEach(() => {
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  db.sqlite.exec(`INSERT INTO owners VALUES ('user_alice', 'new');
    INSERT INTO itineraries (id, ownerId, title, city, days, activities) VALUES
      ('30000000-0000-4000-8000-000000000001', 'user_alice', 'Seoul markets and late-night food alleys', 'Seoul', 3, '[]'),
      ('30000000-0000-4000-8000-000000000002', 'user_alice', 'Private Tokyo plan', 'Tokyo', 2, '[]');
    UPDATE itineraries SET shared = 1, share_code = 'abcd1234' WHERE id = '30000000-0000-4000-8000-000000000001';
    UPDATE itineraries SET shared = 0, share_code = 'zzzz9999' WHERE id = '30000000-0000-4000-8000-000000000002';`);
  mocks.db = db;
});
afterEach(() => db.sqlite.close());

const call = (shareCode: string) =>
  GET(new Request(`https://www.localley.io/og/shared/${shareCode}`), { params: Promise.resolve({ shareCode }) });

describe("GET /og/shared/[shareCode]", () => {
  it("renders a cacheable 1200x630 PNG for a shared trip", async () => {
    const response = await call("abcd1234");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=3600");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
  });

  it("answers 404 for an unknown, unshared or malformed code", async () => {
    expect((await call("nope0000")).status).toBe(404);
    expect((await call("zzzz9999")).status).toBe(404); // has a code but shared = 0
    expect((await call("ABCD1234")).status).toBe(404);
    expect((await call("abcd1234x")).status).toBe(404);
  });
});
