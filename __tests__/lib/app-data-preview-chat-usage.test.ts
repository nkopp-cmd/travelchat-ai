// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), currentUser: vi.fn(), tier: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/app-data/preview-user-tier", () => ({ previewUserTier: mocks.tier }));
import { incrementPreviewChatUsage, isPreviewChatUsageCandidate } from "@/lib/app-data/preview-chat-usage";

let db: D1Sqlite;
const now = new Date("2026-09-30T23:59:00.000Z");
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT UNIQUE);
    INSERT INTO owners VALUES ('legacy-1','legacy-fixture');
    INSERT INTO legacy_owners VALUES ('legacy-1','legacy-1');
    CREATE TABLE legacy_usage(ownerId TEXT, usageType TEXT, periodType TEXT, periodStart TEXT, count INTEGER);
    CREATE TABLE legacy_import_batches(counts TEXT);
    INSERT INTO legacy_import_batches VALUES ('{"legacy_usage":0}');`);
  db.sqlite.exec(readFileSync(path.resolve(__dirname,
    "../../migrations/app-preview/0024_preview_chat_usage.sql"), "utf8"));
  db.sqlite.exec(readFileSync("migrations/app-preview/0026_preview_chat_usage_baseline.sql", "utf8"));
  mocks.tier.mockResolvedValue("free");
  mocks.reader.mockReturnValue(db);
  mocks.currentUser.mockResolvedValue({ id: "user-1", emailVerified: true,
    primaryEmailAddress: { emailAddress: "test@preview.localley.test" } });
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("preview daily chat counter", () => {
  it("increments atomically, denies the eleventh call, and resets on the next UTC day", async () => {
    for (let count = 1; count <= 10; count++) {
      expect(await incrementPreviewChatUsage("user-1", now)).toMatchObject({
        allowed: true, currentUsage: count, limit: 10, remaining: 10 - count,
        periodResetAt: "2026-10-01T00:00:00.000Z",
      });
    }
    expect(await incrementPreviewChatUsage("user-1", now)).toMatchObject({
      allowed: false, currentUsage: 10, remaining: 0,
    });
    expect(await incrementPreviewChatUsage("user-1", new Date("2026-10-01T00:00:00.000Z")))
      .toMatchObject({ allowed: true, currentUsage: 1, periodResetAt: "2026-10-02T00:00:00.000Z" });
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_chat_usage").get()).toEqual({ n: 2 });
  });

  it("keeps owners separate and admits mapped historical and rejects unverified identities", async () => {
    await incrementPreviewChatUsage("user-1", now);
    mocks.currentUser.mockResolvedValue({ id: "user-2", emailVerified: true,
      primaryEmailAddress: { emailAddress: "second@preview.localley.test" } });
    expect(await incrementPreviewChatUsage("user-2", now)).toMatchObject({ currentUsage: 1 });
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_chat_usage").get()).toEqual({ n: 2 });
    mocks.currentUser.mockResolvedValue({ id: "legacy-1", emailVerified: true,
      primaryEmailAddress: { emailAddress: "legacy@preview.localley.test" } });
    expect(await incrementPreviewChatUsage("legacy-1", now)).toMatchObject({ currentUsage: 1 });
    mocks.currentUser.mockResolvedValue({ id: "user-3", emailVerified: false,
      primaryEmailAddress: { emailAddress: "third@preview.localley.test" } });
    await expect(incrementPreviewChatUsage("user-3", now)).rejects.toThrow("verified");
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_chat_usage").get()).toEqual({ n: 3 });
  });

  it("seeds history once, preserves source rows and rejects changed baselines", async () => {
    db.sqlite.exec("INSERT INTO legacy_usage VALUES ('legacy-1','chat_messages','daily','2026-09-30',8); UPDATE legacy_import_batches SET counts='{\"legacy_usage\":1}'");
    mocks.currentUser.mockResolvedValue({ id: "legacy-1", emailVerified: true,
      primaryEmailAddress: { emailAddress: "legacy@preview.localley.test" } });
    expect(await incrementPreviewChatUsage("legacy-1", now)).toMatchObject({ currentUsage: 9 });
    expect(await incrementPreviewChatUsage("legacy-1", now)).toMatchObject({ currentUsage: 10 });
    expect(await incrementPreviewChatUsage("legacy-1", now)).toMatchObject({ allowed: false, currentUsage: 10 });
    expect(db.sqlite.prepare("SELECT count FROM legacy_usage").get()).toEqual({ count: 8 });
    db.sqlite.exec("UPDATE legacy_usage SET count=7");
    await expect(incrementPreviewChatUsage("legacy-1", now)).rejects.toThrow("unavailable");
    expect(db.sqlite.prepare("SELECT count FROM preview_chat_usage").get()).toEqual({ count: 10 });
  });

  it("bounds concurrent requests and honors the counted tier", async () => {
    const results = await Promise.all(Array.from({ length: 16 }, () => incrementPreviewChatUsage("user-1", now)));
    expect(results.filter(r => r.allowed)).toHaveLength(10);
    expect(db.sqlite.prepare("SELECT count FROM preview_chat_usage").get()).toEqual({ count: 10 });
    mocks.tier.mockResolvedValue("pro");
    expect(await incrementPreviewChatUsage("user-1", now)).toMatchObject({ limit: 100, currentUsage: 11 });
    mocks.tier.mockResolvedValue("premium");
    expect(await incrementPreviewChatUsage("user-1", now)).toMatchObject({ limit: 999, currentUsage: 12 });
  });

  it("rejects incomplete imports, duplicate baseline keys and invalid counts", async () => {
    db.sqlite.exec("UPDATE legacy_import_batches SET counts='{\"legacy_usage\":1}'");
    await expect(incrementPreviewChatUsage("user-1", now)).rejects.toThrow("incomplete");
    db.sqlite.exec("INSERT INTO legacy_usage VALUES ('auth:user-1','chat_messages','daily','2026-09-30',-1)");
    await expect(incrementPreviewChatUsage("user-1", now)).rejects.toThrow("Invalid");
    db.sqlite.exec("INSERT INTO legacy_usage VALUES ('auth:user-1','chat_messages','daily','2026-09-30',0); UPDATE legacy_import_batches SET counts='{\"legacy_usage\":2}'");
    await expect(incrementPreviewChatUsage("user-1", now)).rejects.toThrow("Ambiguous");
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_chat_usage").get()).toEqual({ n: 0 });
  });

  it("denies already over-limit historical counts without resetting them", async () => {
    db.sqlite.exec("INSERT INTO legacy_usage VALUES ('legacy-1','chat_messages','daily','2026-09-30',12); UPDATE legacy_import_batches SET counts='{\"legacy_usage\":1}'");
    mocks.currentUser.mockResolvedValue({ id: "legacy-1", emailVerified: true,
      primaryEmailAddress: { emailAddress: "legacy@preview.localley.test" } });
    expect(await incrementPreviewChatUsage("legacy-1", now)).toMatchObject({ allowed: false, currentUsage: 12, remaining: 0 });
  });

  it("requires the exact preview candidate host and isolation flags", () => {
    vi.stubEnv("AUTH_MAIL_MODE", "outbox");
    vi.stubEnv("SUPABASE_READ_ONLY", "true");
    const request = (host: string, query = "?data_candidate=d1") =>
      new NextRequest(`https://${host}/api/test-app-data/chat-usage${query}`);
    expect(isPreviewChatUsageCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewChatUsageCandidate(request("www.localley.io"))).toBe(false);
    expect(isPreviewChatUsageCandidate(request("localley-next-preview.nkopp.workers.dev", ""))).toBe(false);
    vi.stubEnv("SUPABASE_READ_ONLY", "false");
    expect(isPreviewChatUsageCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("fails closed when its preview schema is unavailable", async () => {
    db.sqlite.exec("DROP TABLE preview_chat_usage");
    await expect(incrementPreviewChatUsage("user-1", now)).rejects.toThrow();
  });
});
