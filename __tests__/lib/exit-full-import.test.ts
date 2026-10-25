// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

vi.mock("server-only", () => ({}));
import { d1Client, TABLES } from "@/lib/app-data/d1-postgrest";
// @ts-expect-error plain .mjs script
import { baselineRows, dumpSql, loadAndCompare, migratedDatabase } from "../../scripts/d1-migration/exit-full-import.mjs";

const conv = "10000000-0000-4000-8000-000000000001";
const source: Record<string, Record<string, unknown>[]> = {
  conversations: [{ id: conv, clerk_user_id: "user_a", title: "Trip", created_at: "2026-01-01T00:00:00+00:00", updated_at: "2026-01-02T00:00:00+00:00", linked_itinerary_id: null }],
  messages: [{ id: "10000000-0000-4000-8000-000000000002", conversation_id: conv, role: "user", content: "hi", created_at: "2026-01-01T00:00:01+00:00" }],
};
const read = async (table: string) => source[table] ?? [];
// Geography tables are loaded from the catalog select; empty here.
const geoRows = { geo_destinations: [], geo_local_areas: [] };

describe("exit-full-import", () => {
  it("copies rows exactly: loading messages does not move the conversation's updated_at", async () => {
    const db = migratedDatabase(D1Sqlite);
    const results = await loadAndCompare({ d1Client, TABLES, D1Sqlite }, db, { read, geoRows });
    expect(results.conversations).toMatchObject({ source: 1, loaded: 1, equal: true });
    expect(results.messages).toMatchObject({ equal: true });
    expect(results.foreignKeyViolations).toBe(0);
    expect(db.sqlite.prepare("SELECT updatedAt FROM conversations").get()).toEqual({ updatedAt: "2026-01-02T00:00:00+00:00" });
  });

  it("dumps parents before children and skips rows the migrations already seed", async () => {
    const db = migratedDatabase(D1Sqlite);
    const baseline = baselineRows(db);
    await loadAndCompare({ d1Client, TABLES, D1Sqlite }, db, { read, geoRows });
    const { sql, tables } = dumpSql(db, baseline);
    expect(tables.indexOf("owners")).toBeLessThan(tables.indexOf("conversations"));
    expect(tables.indexOf("conversations")).toBeLessThan(tables.indexOf("messages"));
    const seeded = [...baseline.entries()].filter(([, rows]) => (rows as Set<string>).size > 0).map(([t]) => t);
    for (const table of seeded) expect(sql).not.toContain(`INSERT INTO "${table}"`);
    expect(sql.match(/INSERT INTO "messages"/g)).toHaveLength(1);
  });

  it("reports a foreign-key violation in the source", async () => {
    const db = migratedDatabase(D1Sqlite);
    const orphan = { ...source, conversations: [] };
    const results = await loadAndCompare({ d1Client, TABLES, D1Sqlite }, db, { read: async (t: string) => orphan[t] ?? [], geoRows });
    expect(results.foreignKeyViolations).toBeGreaterThan(0);
  });
});
