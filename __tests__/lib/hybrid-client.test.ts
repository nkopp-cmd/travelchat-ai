// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/app-data/backend", async (original) => ({
  ...(await original<typeof import("@/lib/app-data/backend")>()), appDataDb: () => mocks.db,
}));
import { withMigratedTables } from "@/lib/app-data/hybrid-client";

afterEach(() => vi.unstubAllEnvs());

describe("withMigratedTables", () => {
  const supabaseFrom = vi.fn((table: string) => ({ supabaseTable: table }));
  const client = { from: supabaseFrom, storage: { from: vi.fn(() => "bucket") }, rpc: vi.fn() };

  it("returns the Supabase client unchanged unless DATA_BACKEND=d1", () => {
    vi.stubEnv("DATA_BACKEND", "");
    expect(withMigratedTables(client, { role: "service" })).toBe(client);
  });

  it("routes migrated tables to D1 with the client's role and leaves the rest on Supabase", async () => {
    vi.stubEnv("DATA_BACKEND", "d1");
    const db = new D1Sqlite();
    db.sqlite.exec(`CREATE TABLE itineraries (id TEXT, ownerId TEXT, is_public INTEGER, title TEXT);
      INSERT INTO itineraries VALUES ('a', 'u1', 0, 'mine'), ('b', 'u2', 0, 'theirs');`);
    mocks.db = db;
    const hybrid = withMigratedTables(client, { role: "user", userId: "u1" });
    const { data } = await (hybrid.from("itineraries") as unknown as PromiseLike<{ data: unknown }> & { select: (c: string) => PromiseLike<{ data: unknown }> }).select("title");
    expect(data).toEqual([{ title: "mine" }]);
    expect(hybrid.from("spots")).toEqual({ supabaseTable: "spots" });
    expect(hybrid.storage.from("generated-images" as never)).toBe("bucket");
    expect(supabaseFrom).toHaveBeenCalledTimes(1);
    expect(() => withMigratedTables(client, { role: "user", userId: "" }).from("itineraries")).toThrow("user id");
  });
});
