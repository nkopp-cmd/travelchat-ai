// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
import { queuePreviewStoryMail } from "@/lib/app-data/preview-story-mail";
const symbol = Symbol.for("__cloudflare-context__");
const environment = process.env;
const id = "00000000-0000-4000-8000-000000000001";
let db: D1Sqlite;
let outbox: D1Sqlite;
beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true",
    BETTER_AUTH_URL: "https://localley-next-preview.nkopp.workers.dev" };
  db = new D1Sqlite(); outbox = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT);
    INSERT INTO owners VALUES('auth:a','new'),('auth:b','new');
    INSERT INTO itineraries VALUES('${id}','auth:a');`);
  outbox.sqlite.exec(`CREATE TABLE auth_mail_outbox(id INTEGER PRIMARY KEY, kind TEXT,email TEXT,url TEXT,createdAt INTEGER);`);
  mocks.reader.mockReturnValue(db);
  mocks.user.mockResolvedValue({ id: "a", emailVerified: true,
    primaryEmailAddress: { emailAddress: "A@preview.localley.test" } });
  Object.assign(globalThis, { [symbol]: { env: { AUTH_DB: outbox, AUTH_EMAIL: { send: () => { throw new Error("No provider calls"); } } } } });
});
afterEach(() => { db.sqlite.close(); outbox.sqlite.close(); process.env = environment;
  Reflect.deleteProperty(globalThis, symbol); vi.clearAllMocks(); });
const count = () => outbox.sqlite.prepare("SELECT count(*) AS n FROM auth_mail_outbox").get().n;

describe("candidate story outbox", () => {
  it("queues only session recipient and canonical candidate itinerary link in the real SQL outbox", async () => {
    expect(await queuePreviewStoryMail("a", id.toUpperCase())).toBe(true);
    const row = outbox.sqlite.prepare("SELECT * FROM auth_mail_outbox").get();
    expect(row).toMatchObject({ kind: "story-ready", email: "a@preview.localley.test",
      url: `https://localley-next-preview.nkopp.workers.dev/itineraries/${id}?data_candidate=d1` });
    expect(row.createdAt).toBeGreaterThan(0);
  });
  it("refuses a second owner and missing itinerary without writing", async () => {
    mocks.user.mockResolvedValue({ id: "b", emailVerified: true,
      primaryEmailAddress: { emailAddress: "b@preview.localley.test" } });
    expect(await queuePreviewStoryMail("b", id)).toBe(false);
    expect(await queuePreviewStoryMail("b", "00000000-0000-4000-8000-000000000002")).toBe(false);
    expect(count()).toBe(0);
  });
  it("refuses legacy or conflicting identity even when a fresh itinerary exists", async () => {
    db.sqlite.exec("INSERT INTO owners VALUES('legacy-a','legacy-fixture'); INSERT INTO legacy_owners VALUES('legacy-a','a')");
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("Historical");
    expect(count()).toBe(0);
  });
  it("refuses real, malformed, oversized, unverified and mismatched recipients", async () => {
    for (const user of [
      { id: "a", emailVerified: false, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } },
      { id: "b", emailVerified: true, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } },
      ...["real@example.com", "x\n@preview.localley.test", `${"a".repeat(200)}@preview.localley.test`, "x@evil@preview.localley.test"]
        .map(emailAddress => ({ id: "a", emailVerified: true, primaryEmailAddress: { emailAddress } })),
    ]) { mocks.user.mockResolvedValue(user); await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("recipient"); }
    expect(count()).toBe(0);
  });
  it("fails closed for missing outbox, invalid ID and production auth URL", async () => {
    Reflect.deleteProperty(globalThis, symbol);
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("database");
    await expect(queuePreviewStoryMail("a", "../../other")).rejects.toThrow("ID");
    process.env.BETTER_AUTH_URL = "https://www.localley.io";
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("outbox");
    expect(count()).toBe(0);
  });
});
