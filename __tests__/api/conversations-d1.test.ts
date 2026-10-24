// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown, userId: "user_alice" }));
vi.mock("@/lib/auth/server", () => ({ auth: async () => ({ userId: mocks.userId }) }));
vi.mock("@/lib/supabase-server", async () => {
  const { d1Client } = await import("@/lib/app-data/d1-postgrest");
  return { createSupabaseServerClient: async () => d1Client(mocks.db as never, { role: "user", userId: mocks.userId }) };
});
import { GET } from "@/app/api/conversations/route";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "d1");
  const db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  db.sqlite.exec(`INSERT INTO owners VALUES ('user_alice', 'new'), ('user_bob', 'new');
    INSERT INTO conversations (id, ownerId, title, createdAt, updatedAt) VALUES
      ('${id(1)}', 'user_alice', 'Older', '2026-10-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00'),
      ('${id(2)}', 'user_alice', 'Newer', '2026-10-02T00:00:00+00:00', '2026-10-03T00:00:00+00:00'),
      ('${id(3)}', 'user_bob', 'Bob', '2026-10-02T00:00:00+00:00', '2026-10-04T00:00:00+00:00');
    INSERT INTO messages (id, conversationId, role, content, createdAt) VALUES
      ('${id(12)}', '${id(1)}', 'assistant', 'second', '2026-10-01T00:00:02+00:00'),
      ('${id(11)}', '${id(1)}', 'user', 'first', '2026-10-01T00:00:01+00:00'),
      ('${id(13)}', '${id(3)}', 'user', 'bob secret', '2026-10-02T00:00:01+00:00');`);
  mocks.db = db;
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/conversations on D1", () => {
  it("returns the caller's conversations newest first with their messages, in the Supabase embed shape", async () => {
    const response = await GET(new NextRequest("https://www.localley.io/api/conversations"));
    expect(response.status).toBe(200);
    const { conversations } = await response.json();
    expect(conversations).toEqual([
      { id: id(2), title: "Newer", created_at: "2026-10-02T00:00:00+00:00", updated_at: "2026-10-03T00:00:00+00:00", linked_itinerary_id: null, messages: [] },
      { id: id(1), title: "Older", created_at: "2026-10-01T00:00:00+00:00", updated_at: "2026-10-01T00:00:00+00:00", linked_itinerary_id: null, messages: [
        { id: id(11), role: "user", content: "first", created_at: "2026-10-01T00:00:01+00:00" },
        { id: id(12), role: "assistant", content: "second", created_at: "2026-10-01T00:00:02+00:00" },
      ] },
    ]);
    expect(JSON.stringify(conversations)).not.toContain("bob secret");
  });
});
