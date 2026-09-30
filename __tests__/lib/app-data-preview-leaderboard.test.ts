// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewLeaderboardCandidate, parseLeaderboardLimit,
  previewLeaderboard } from "@/lib/app-data/preview-leaderboard";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });
const batch = "a".repeat(64);
const ids = ["550e8400-e29b-41d4-a716-446655440001", "550e8400-e29b-41d4-a716-446655440002",
  "550e8400-e29b-41d4-a716-446655440003"];
function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE legacy_import_batches (id TEXT, counts TEXT, importedAt INTEGER);
    CREATE TABLE owners (id TEXT, source TEXT);
    CREATE TABLE legacy_owners (ownerId TEXT, clerkUserId TEXT, hasSourceProfile INTEGER, batchId TEXT);
    CREATE TABLE profiles (id TEXT, ownerId TEXT);
    CREATE TABLE legacy_profile_stats (profileId TEXT, username TEXT, xp INTEGER, level INTEGER);`);
  db.sqlite.prepare("INSERT INTO legacy_import_batches VALUES (?, ?, 1)")
    .run(batch, JSON.stringify({ profiles: 3, legacy_profile_stats: 3 }));
  for (const [index, xp] of [40, 20, 10].entries()) {
    const owner = `user-${index + 1}`;
    db.sqlite.prepare("INSERT INTO owners VALUES (?, 'legacy-fixture')").run(owner);
    db.sqlite.prepare("INSERT INTO legacy_owners VALUES (?, ?, 1, ?)").run(owner, owner, batch);
    db.sqlite.prepare("INSERT INTO profiles VALUES (?, ?)").run(ids[index], owner);
    db.sqlite.prepare("INSERT INTO legacy_profile_stats VALUES (?, ?, ?, ?)")
      .run(ids[index], index === 2 ? null : `Explorer ${index + 1}`, xp, index + 1);
  }
  mocks.reader.mockReturnValue(db);
  return db;
}

describe("historical leaderboard", () => {
  it("gates the exact preview host and bounds the limit", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const req = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/leaderboard${flag ? "?data_candidate=d1" : ""}`);
    expect(isPreviewLeaderboardCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewLeaderboardCandidate(req("www.localley.io"))).toBe(false);
    expect(isPreviewLeaderboardCandidate(req("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    process.env.AUTH_MAIL_MODE = "cloudflare";
    expect(isPreviewLeaderboardCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(false);
    expect(parseLeaderboardLimit(null)).toBe(50);
    expect(parseLeaderboardLimit("100")).toBe(100);
    for (const value of ["0", "101", "-1", "NaN", "1.5", "1x", " 1", "001"]) {
      expect(parseLeaderboardLimit(value)).toBeNull();
    }
  });

  it("returns ordered historical profiles and a current rank outside the limit", async () => {
    database();
    const { leaderboard, currentUserRank } = await previewLeaderboard("user-3", 2);
    expect(leaderboard.map(row => [row.rank, row.clerkId, row.xp, row.isCurrentUser]))
      .toEqual([[1, "user-1", 40, false], [2, "user-2", 20, false]]);
    expect(currentUserRank).toMatchObject({ rank: 3, id: ids[2], clerkId: "user-3",
      username: "You", xp: 10, isCurrentUser: true });
    expect((await previewLeaderboard("user-1", 2)).currentUserRank).toBeNull();
    expect((await previewLeaderboard(null, 2)).currentUserRank).toBeNull();
  });

  it("refuses missing, partial and invalid archives", async () => {
    const db = database();
    db.sqlite.prepare("DELETE FROM legacy_import_batches").run();
    await expect(previewLeaderboard(null, 2)).rejects.toThrow("unavailable");
    db.sqlite.prepare("INSERT INTO legacy_import_batches VALUES (?, ?, 1)")
      .run(batch, JSON.stringify({ profiles: 3, legacy_profile_stats: 3 }));
    db.sqlite.prepare("DELETE FROM legacy_profile_stats WHERE profileId = ?").run(ids[2]);
    await expect(previewLeaderboard(null, 2)).rejects.toThrow("count mismatch");
    db.sqlite.prepare("INSERT INTO legacy_profile_stats VALUES (?, 'Explorer', -1, 1)").run(ids[2]);
    await expect(previewLeaderboard(null, 3)).rejects.toThrow("Invalid leaderboard profile");
  });
});
