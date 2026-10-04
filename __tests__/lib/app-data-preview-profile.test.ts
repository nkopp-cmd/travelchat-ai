// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn(), billing: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-billing-settings", () => ({ previewBillingSettings: mocks.billing }));
import { previewProfile } from "@/lib/app-data/preview-profile";
let db: D1Sqlite;
const id = "550e8400-e29b-41d4-a716-446655440000";
beforeEach(() => {
  vi.clearAllMocks(); db = new D1Sqlite(); mocks.reader.mockReturnValue(db);
  mocks.user.mockResolvedValue({ id: "one", emailVerified: true, primaryEmailAddress: { emailAddress: "one@preview.localley.test" } });
  mocks.billing.mockResolvedValue({ plan: "Pro" });
  db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT);
    CREATE TABLE itineraries(id TEXT,ownerId TEXT,title TEXT,subtitle TEXT,city TEXT,days INTEGER,
      local_score REAL,created_at TEXT,status TEXT,is_favorite INTEGER);
    INSERT INTO owners VALUES ('auth:one','new'),('auth:two','new');
    INSERT INTO itineraries VALUES ('${id}','auth:one','Owned',NULL,'Seoul',1,NULL,'2026-10-04T00:00:00Z',NULL,0),
    ('550e8400-e29b-41d4-a716-446655440001','auth:two','Foreign',NULL,'Tokyo',1,NULL,'2026-10-04T00:00:00Z',NULL,0);`);
});
afterEach(() => db.sqlite.close());
describe("private candidate profile", () => {
  it("reads only exact fresh trips and uses the same owner for billing without writes", async () => {
    const before = db.sqlite.prepare("SELECT count(*) n FROM owners").get();
    const result = await previewProfile("one");
    expect(result.trips.map(t => t.title)).toEqual(["Owned"]); expect(result.billing).toEqual({ plan: "Pro" });
    expect(mocks.billing).toHaveBeenCalledWith("one"); expect(db.sqlite.prepare("SELECT count(*) n FROM owners").get()).toEqual(before);
  });
  it.each([
    null,
    { id: "two", emailVerified: true, primaryEmailAddress: { emailAddress: "one@preview.localley.test" } },
    { id: "one", emailVerified: false, primaryEmailAddress: { emailAddress: "one@preview.localley.test" } },
    { id: "one", emailVerified: true, primaryEmailAddress: { emailAddress: "one@example.com" } },
  ])("refuses an ineligible authenticated identity before storage", async user => {
    mocks.user.mockResolvedValue(user); await expect(previewProfile("one")).rejects.toThrow("owner unavailable");
    expect(mocks.reader).not.toHaveBeenCalled(); expect(mocks.billing).not.toHaveBeenCalled();
  });
  it("refuses a missing owner without creating one", async () => {
    db.sqlite.exec("DELETE FROM owners WHERE id='auth:one'");
    await expect(previewProfile("one")).rejects.toThrow("owner unavailable"); expect(mocks.billing).not.toHaveBeenCalled();
  });
  it("refuses historical mappings even when a fresh owner exists", async () => {
    db.sqlite.exec("INSERT INTO owners VALUES ('legacy','legacy-fixture'); INSERT INTO legacy_owners VALUES ('legacy','one')");
    await expect(previewProfile("one")).rejects.toThrow("owner unavailable"); expect(mocks.billing).not.toHaveBeenCalled();
  });
  it("refuses malformed private trips rather than hiding corruption as empty", async () => {
    db.sqlite.exec("UPDATE itineraries SET days=0 WHERE ownerId='auth:one'");
    await expect(previewProfile("one")).rejects.toThrow("Invalid preview itinerary");
  });
  it("refuses oversized histories rather than silently presenting partial counts", async () => {
    for (let i=0;i<101;i++) db.sqlite.prepare("INSERT INTO itineraries SELECT id,ownerId,title,subtitle,city,days,local_score,created_at,status,is_favorite FROM itineraries WHERE ownerId='auth:one' LIMIT 1").run();
    await expect(previewProfile("one")).rejects.toThrow("list unavailable");
  });
  it("does not substitute free billing when the billing reader fails", async () => {
    mocks.billing.mockRejectedValue(new Error("billing unavailable")); await expect(previewProfile("one")).rejects.toThrow("billing unavailable");
  });
});
