// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { previewUserTier } from "@/lib/app-data/preview-user-tier";

let db: D1Sqlite;
beforeEach(() => {
  vi.stubEnv("BETA_MODE", "false");
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE profiles(id TEXT PRIMARY KEY,ownerId TEXT);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT);
    CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT);
    CREATE TABLE legacy_subscriptions(ownerId TEXT,tier TEXT,status TEXT,stripeCustomerId TEXT,stripeSubscriptionId TEXT,currentPeriodEnd TEXT,cancelAtPeriodEnd INTEGER,trialEnd TEXT,updatedAt TEXT);
    CREATE TABLE legacy_usage(ownerId TEXT,usageType TEXT,periodType TEXT,periodStart TEXT,count INTEGER);
    CREATE TABLE preview_story_usage(ownerId TEXT,periodStart TEXT,count INTEGER);
    CREATE TABLE preview_chat_usage(ownerId TEXT,periodStart TEXT,count INTEGER);
    INSERT INTO owners VALUES('legacy-a','legacy-fixture'),('legacy-b','legacy-fixture');
    CREATE TABLE legacy_import_batches(counts TEXT);
    INSERT INTO profiles VALUES('profile-a','legacy-a'),('profile-b','legacy-b');
    INSERT INTO legacy_owners VALUES('legacy-a','auth-a'),('legacy-b','auth-b');
    INSERT INTO legacy_subscriptions(ownerId,tier,status) VALUES('legacy-a','pro','active');
    INSERT INTO legacy_import_batches VALUES('{"profiles":2,"legacy_subscriptions":1}');`);
  db.sqlite.exec(readFileSync("migrations/app-preview/0025_preview_profile_emails.sql", "utf8"));
  db.sqlite.exec(`INSERT INTO legacy_profile_emails VALUES('profile-a','ordinary@example.test'),
    ('profile-b','hello@localley.io');`);
  db.sqlite.exec(readFileSync("migrations/app-preview/0014_preview_stripe_events.sql","utf8"));
  db.sqlite.exec(readFileSync("migrations/app-preview/0029_preview_subscription_state.sql","utf8"));
  mocks.reader.mockReturnValue(db);
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("counted preview user tier", () => {
  it("uses exact reconciled owners, source lifetime email and active subscriptions", async () => {
    expect(await previewUserTier("auth-a")).toBe("pro");
    expect(await previewUserTier("auth-b")).toBe("premium");
    expect(await previewUserTier("legacy-a")).toBe("free");
    expect(await previewUserTier("fresh-auth")).toBe("free");
  });
  it("admits trialing tiers and rejects inactive paid status", async () => {
    db.sqlite.exec("UPDATE legacy_subscriptions SET tier='premium',status='trialing'");
    expect(await previewUserTier("auth-a")).toBe("premium");
    db.sqlite.exec("UPDATE legacy_subscriptions SET status='canceled'");
    expect(await previewUserTier("auth-a")).toBe("free");
    db.sqlite.exec("UPDATE legacy_subscriptions SET tier='invalid',status='active'");
    await expect(previewUserTier("auth-a")).rejects.toThrow("tier");
  });
  it("keeps the beta override but requires a complete import", async () => {
    vi.stubEnv("BETA_MODE", "true");
    expect(await previewUserTier("fresh-auth")).toBe("premium");
    db.sqlite.exec("DELETE FROM legacy_profile_emails WHERE profileId='profile-a'");
    await expect(previewUserTier("fresh-auth")).rejects.toThrow("incomplete");
  });
  it("refuses duplicate owners and missing batch evidence", async () => {
    db.sqlite.exec("UPDATE legacy_owners SET clerkUserId='auth-a'");
    await expect(previewUserTier("auth-a")).rejects.toThrow("Ambiguous");
    db.sqlite.exec("DELETE FROM legacy_import_batches");
    await expect(previewUserTier("auth-a")).rejects.toThrow("unavailable");
  });
});
