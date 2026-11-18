// @vitest-environment node
// AK4: the "Download" button on /shared/<code> on production D1 (anonymous since AK1). Shared rows export for
// anyone; an unshared row is 403 for everyone but its owner, so a guessed id never leaks a private trip.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown, userId: null as string | null }));
vi.mock("@/lib/auth/server", () => ({ auth: async () => ({ userId: mocks.userId }) }));
vi.mock("@/lib/supabase", async () => {
  const { d1Client } = await import("@/lib/app-data/d1-postgrest");
  return { createSupabaseAdmin: () => d1Client(mocks.db as never, { role: "service" }) };
});
import { GET } from "@/app/api/itineraries/[id]/export/route";

const shared = "40000000-0000-4000-8000-000000000001";
const priv = "40000000-0000-4000-8000-000000000002";
let db: D1Sqlite;

beforeEach(() => {
  mocks.userId = null;
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  db.sqlite.exec(`INSERT INTO owners VALUES ('user_alice', 'new'), ('user_bob', 'new');
    INSERT INTO itineraries (id, ownerId, title, city, days, activities) VALUES
      ('${shared}', 'user_alice', 'Seoul food <b>walk</b>', 'Seoul', 1, '[]'),
      ('${priv}', 'user_alice', 'Private Tokyo plan', 'Tokyo', 1, '[]');
    UPDATE itineraries SET shared = 1, share_code = 'abcd1234' WHERE id = '${shared}';`);
  mocks.db = db;
});
afterEach(() => db.sqlite.close());

const call = (id: string) =>
  GET(new NextRequest(`https://www.localley.io/api/itineraries/${id}/export`), { params: Promise.resolve({ id }) });

describe("GET /api/itineraries/:id/export on D1", () => {
  it("exports a shared trip to an anonymous visitor, with the title escaped", async () => {
    const response = await call(shared);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Seoul food &lt;b&gt;walk&lt;/b&gt;");
    expect(html).not.toContain("<b>walk</b>");
  });

  it("refuses an unshared trip with 403 to anonymous visitors and other users", async () => {
    expect((await call(priv)).status).toBe(403);
    mocks.userId = "user_bob";
    expect((await call(priv)).status).toBe(403);
  });

  it("exports the unshared trip to its owner", async () => {
    mocks.userId = "user_alice";
    expect((await call(priv)).status).toBe(200);
  });

  it("answers 404 for an unknown id", async () => {
    expect((await call("40000000-0000-4000-8000-00000000ffff")).status).toBe(404);
  });
});
