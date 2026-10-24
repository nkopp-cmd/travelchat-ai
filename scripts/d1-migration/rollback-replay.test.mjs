import assert from "node:assert/strict";
import test from "node:test";
import { journalKeys, replaySql } from "./rollback-replay.mjs";

test("journal keys: one per table+key, first-seen order, latest seq kept", () => {
  const keys = journalKeys([
    { seq: 3, table_name: "itineraries", pk: '{"id":"a"}' },
    { seq: 1, table_name: "conversations", pk: '{"id":"c"}' },
    { seq: 2, table_name: "itineraries", pk: '{"id":"a"}' },
  ]);
  assert.deepEqual(keys, [{ table: "conversations", key: { id: "c" }, lastSeq: 1 }, { table: "itineraries", key: { id: "a" }, lastSeq: 3 }]);
});

test("replay SQL deletes rows D1 no longer has and upserts the rest, with quoting", () => {
  const meta = { columns: ["id", "title", "created_at"], primaryKey: ["id"] };
  const sql = replaySql("itineraries", { id: "a" }, [{ id: "a", title: "O'Brien's trip", created_at: "2026-01-01T00:00:00+00:00" }], meta);
  assert.match(sql, /^DELETE FROM public\."itineraries" WHERE "id"::text = 'a' AND \("id"\) NOT IN \(SELECT "id" FROM jsonb_populate_recordset/);
  assert.match(sql, /O''Brien''s trip/);
  assert.match(sql, /ON CONFLICT \("id"\) DO UPDATE SET "title" = EXCLUDED\."title", "created_at" = EXCLUDED\."created_at";$/);
  assert.equal(replaySql("itineraries", { id: "gone" }, [], meta), `DELETE FROM public."itineraries" WHERE "id"::text = 'gone';`);
  assert.throws(() => replaySql("itineraries; drop", { id: "a" }, [], meta), /Unexpected identifier/);
});

test("set keys replay the whole set (weekly rankings week/city)", () => {
  const meta = { columns: ["id", "week_start", "city_slug", "rank"], primaryKey: ["id"] };
  const sql = replaySql("weekly_city_spot_rankings", { week_start: "2026-10-19", city_slug: "seoul" }, [{ id: "r1", week_start: "2026-10-19", city_slug: "seoul", rank: 1 }], meta);
  assert.match(sql, /WHERE "week_start"::text = '2026-10-19' AND "city_slug"::text = 'seoul' AND \("id"\) NOT IN/);
});
