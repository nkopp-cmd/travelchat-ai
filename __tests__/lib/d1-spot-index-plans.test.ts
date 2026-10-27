// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "../helpers/d1-sqlite";

// Index rule (shared/plans/perf-speed-of-light.md "Database index check"): no "SCAN spots" without an index on the
// hot spot queries. The plan is read from the SQL the code really sends, on the real migrations.
const db = new D1Sqlite();
const sent: { sql: string; params: unknown[] }[] = [];
vi.mock("@/lib/app-data/backend", () => ({
  appDataDb: () => ({
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => {
        sent.push({ sql, params });
        return db.prepare(sql).bind(...params);
      },
    }),
  }),
}));
import { d1RelatedSpotSources } from "@/lib/spots/d1-queries";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const plan = (sql: string, params: unknown[]) =>
  (db.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[]).map((row) => row.detail);

beforeAll(() => {
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".sql")).sort()) {
    db.sqlite.exec(readFileSync(path.join(dir, name), "utf8"));
  }
  const spot = db.sqlite.prepare(`INSERT INTO spots (id, name, description, category, localley_score, photos, visible, address, local_percentage)
    VALUES (?, ?, '{}', 'Market', ?, '["p.jpg"]', 1, ?, ?)`);
  const source = db.sqlite.prepare("INSERT INTO legacy_spot_source (spotId, payload) VALUES (?, ?)");
  const rows: [number, number, string, number | null][] = [
    [1, 6, "Seoul", 40], [2, 6, "Seoul", null], [3, 6, "Seoul", 90], [4, 5, "Seoul", null], [5, 5, "Busan", 99],
    [6, 4, "Seoul", 10], [7, 2, "Seoul", 50],
  ];
  for (const [n, score, city, local] of rows) {
    spot.run(id(n), JSON.stringify({ en: `Spot ${n}` }), score, JSON.stringify({ en: `Street ${n}, ${city}` }), local);
    source.run(id(n), JSON.stringify({ id: id(n), photos: ["p.jpg"] }));
  }
});

describe("D1 spot query plans", () => {
  it("related spots walk spots_related_order and stop at LIMIT (no full scan, no sort)", async () => {
    const result = await d1RelatedSpotSources("Seoul", id(1), 3, 24);
    // Postgres order: score DESC, local_percentage DESC NULLS FIRST, id; score 2 is below the minimum, Busan is out.
    expect(result.map((row) => row.id)).toEqual([id(2), id(3), id(4), id(6)]);
    const { sql, params } = sent.at(-1)!;
    const detail = plan(sql, params);
    expect(detail.some((line) => /USING INDEX spots_related_order/.test(line))).toBe(true);
    expect(detail.some((line) => /^SCAN s\b/.test(line))).toBe(false);
    expect(detail.some((line) => /TEMP B-TREE/.test(line))).toBe(false);
  });
});
