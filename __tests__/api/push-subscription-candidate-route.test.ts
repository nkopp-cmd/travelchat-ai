// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { createECDH, randomBytes } from "node:crypto";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), reader: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/notifications", () => ({ savePushSubscription: mocks.save, removePushSubscription: mocks.remove }));
import { POST, DELETE } from "@/app/api/notifications/push/subscribe/route";
import { savePreviewPushSubscription } from "@/lib/app-data/preview-push-subscriptions";
const original = process.env;
let db: D1Sqlite;
const host = "localley-next-preview.nkopp.workers.dev";
function subscription(endpoint = "https://push.example.test/private/device-a") {
  const key = createECDH("prime256v1"); key.generateKeys();
  return { endpoint, keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}
const request = (method: string, value: unknown, hostname = host, candidate = true) => new NextRequest(
  `https://${hostname}/api/notifications/push/subscribe${candidate ? "?data_candidate=d1" : ""}`,
  { method, body: typeof value === "string" || value instanceof Uint8Array ? value : JSON.stringify(value) });
function owner(id = "owner-a", email = `${id}@preview.localley.test`) {
  mocks.auth.mockResolvedValue({ userId: id });
  mocks.user.mockResolvedValue({ id, emailVerified: true, primaryEmailAddress: { emailAddress: email } });
}
function rows() { return db.sqlite.prepare("SELECT * FROM preview_push_subscriptions ORDER BY endpointSha256").all(); }
beforeEach(() => {
  vi.clearAllMocks(); process.env = { ...original, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys=ON; CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT);`);
  db.sqlite.exec(readFileSync("migrations/app-preview/0032_preview_push_subscriptions.sql", "utf8"));
  mocks.reader.mockReturnValue(db); mocks.save.mockResolvedValue(true); mocks.remove.mockResolvedValue(true); owner();
});
afterEach(() => { process.env = original; db.sqlite.close(); });
describe("isolated D1 push storage without delivery", () => {
  it("saves, repeats and rotates without leaking endpoint or keys", async () => {
    const first = subscription();
    for (let i = 0; i < 2; i++) {
      const result = await POST(request("POST", { subscription: first }));
      expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store");
      expect(result.headers.get("x-localley-data-source")).toBe("d1-preview");
      expect(await result.json()).toEqual({ success: true, deliveryEnabled: false });
    }
    const rotated = subscription(first.endpoint);
    expect((await POST(request("POST", { subscription: rotated }))).status).toBe(200);
    expect(rows()).toHaveLength(1); expect(rows()[0]).toMatchObject({ ownerId: "auth:owner-a", ...rotated.keys });
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("refuses cross-owner reassignment without changing keys and makes foreign/missing deletes equal", async () => {
    const input = subscription(); await POST(request("POST", { subscription: input })); const before = rows(); owner("owner-b");
    const refusal = await POST(request("POST", { subscription: subscription(input.endpoint) }));
    expect(refusal.status).toBe(503); expect(await refusal.json()).toEqual({ success: false, deliveryEnabled: false, error: "push_storage_unavailable" });
    const foreign = await DELETE(request("DELETE", { endpoint: input.endpoint }));
    const absent = await DELETE(request("DELETE", { endpoint: "https://push.example.test/missing" }));
    expect(foreign.status).toBe(200); expect(await foreign.json()).toEqual(await absent.json()); expect(rows()).toEqual(before);
    owner(); expect((await DELETE(request("DELETE", { endpoint: input.endpoint }))).status).toBe(200); expect(rows()).toHaveLength(0);
  });
  it("caps new devices atomically, permits rotation at ten and returns the same refusal", async () => {
    const inputs = Array.from({ length: 11 }, (_, i) => subscription(`https://push.example.test/${i}`));
    const result = await Promise.all(inputs.map(input => savePreviewPushSubscription("owner-a", input).then(() => true, () => false)));
    expect(result.filter(Boolean)).toHaveLength(10); expect(rows()).toHaveLength(10);
    const saved = rows()[0] as { endpoint: string }; const rotated = subscription(saved.endpoint);
    expect((await POST(request("POST", { subscription: rotated }))).status).toBe(200);
    expect(rows().find(row => (row as { endpoint: string }).endpoint === saved.endpoint)).toMatchObject(rotated.keys);
    const capped = await POST(request("POST", { subscription: subscription("https://push.example.test/overflow") }));
    expect(capped.status).toBe(503); expect(await capped.json()).toEqual({ success: false, deliveryEnabled: false, error: "push_storage_unavailable" });
  });
  it("lets exactly one owner win a concurrent endpoint claim", async () => {
    const input = subscription(); const result = await Promise.all(["owner-a", "owner-b"].map(id =>
      savePreviewPushSubscription(id, input).then(() => true, () => false)));
    expect(result.filter(Boolean)).toHaveLength(1); expect(rows()).toHaveLength(1);
  });
  it("refuses a legacy owner inserted after admission within the SQL statement", async () => {
    const input = subscription(); await savePreviewPushSubscription("owner-a", input); const before = rows();
    const prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation(sql => {
      if (sql.startsWith("INSERT INTO preview_push_subscriptions")) db.sqlite.exec("INSERT INTO legacy_owners VALUES ('legacy-a','owner-a')");
      return prepare(sql);
    });
    await expect(savePreviewPushSubscription("owner-a", subscription(input.endpoint))).rejects.toThrow("Preview push storage unavailable");
    expect(rows()).toEqual(before);
  });
  it("cascades owner cleanup and enforces schema uniqueness/hash constraints", async () => {
    await POST(request("POST", { subscription: subscription() }));
    expect(() => db.sqlite.exec("UPDATE preview_push_subscriptions SET endpointSha256 = 'bad' ")).toThrow();
    db.sqlite.exec("DELETE FROM owners WHERE id='auth:owner-a'"); expect(rows()).toHaveLength(0);
  });
  it("rejects malformed, oversized and non-UTF8 bodies with no storage writes", async () => {
    for (const value of ["{", " ".repeat(8193), new Uint8Array([0xff]), {}, [], { subscription: {} },
      { subscription: subscription(), ownerId: "foreign" }]) {
      const response = await POST(request("POST", value)); expect(response.status).toBe(400);
      expect(response.headers.get("x-localley-data-source")).toBe("d1-preview");
    }
    expect(rows()).toHaveLength(0);
  });
  it("validates real curve points, canonical key encoding and endpoints", async () => {
    const good = subscription(); const invalidPoint = Buffer.alloc(65); invalidPoint[0] = 4;
    const variants = [
      { ...good, endpoint: "http://push.example.test/x" }, { ...good, endpoint: "https://user:pass@push.example.test/x" },
      { ...good, endpoint: "https://push.example.test/x#secret" }, { ...good, endpoint: " https://push.example.test/x" },
      { ...good, endpoint: "https://push.example.test/" + "x".repeat(2048) },
      { ...good, keys: { ...good.keys, p256dh: invalidPoint.toString("base64url") } },
      { ...good, keys: { ...good.keys, p256dh: good.keys.p256dh + "=" } },
      { ...good, keys: { ...good.keys, auth: randomBytes(15).toString("base64url") } },
      { ...good, keys: { ...good.keys, auth: "A".repeat(21) + "B" } },
      { ...good, expirationTime: 123 }, { ...good, keys: { ...good.keys, extra: "x" } },
    ];
    for (const input of variants) expect((await POST(request("POST", { subscription: input }))).status).toBe(400);
    expect(rows()).toHaveLength(0);
    expect((await POST(request("POST", { subscription: { ...good, expirationTime: null } }))).status).toBe(200);
  });
  it("refuses nonreserved, unverified, mismatched, legacy and conflicting owners before body access", async () => {
    const input = { subscription: subscription() };
    owner("owner-a", "a@example.com"); expect((await POST(request("POST", input))).status).toBe(503);
    owner(); mocks.user.mockResolvedValueOnce({ id: "owner-a", emailVerified: false }); expect((await POST(request("POST", input))).status).toBe(503);
    mocks.user.mockResolvedValueOnce({ id: "other", emailVerified: true }); expect((await POST(request("POST", input))).status).toBe(503);
    db.sqlite.exec("INSERT INTO owners VALUES ('legacy-a','legacy-fixture'); INSERT INTO legacy_owners VALUES ('legacy-a','owner-a')");
    expect((await POST(request("POST", input))).status).toBe(503); expect(rows()).toHaveLength(0);
  });
  it("does not log sensitive storage failures or fall back to Source", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {}), log = vi.spyOn(console, "log").mockImplementation(() => {});
    const input = subscription(); mocks.reader.mockImplementation(() => { throw Error(input.endpoint + input.keys.auth); });
    expect((await POST(request("POST", { subscription: input }))).status).toBe(503);
    expect(error).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    error.mockRestore(); log.mockRestore();
  });
  it.each(["www.localley.io", "localley.io", "lookalike.localley-next-preview.nkopp.workers.dev"])("keeps %s on the unchanged Source route", async hostname => {
    const input = subscription(); expect((await POST(request("POST", { subscription: input }, hostname))).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("owner-a", { endpoint: input.endpoint, ...input.keys, userAgent: undefined });
    expect((await DELETE(request("DELETE", { endpoint: input.endpoint }, hostname))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("owner-a", input.endpoint); expect(rows()).toHaveLength(0);
  });
  it("requires opt-in and both isolation flags; anonymous remains denied", async () => {
    const input = { subscription: subscription() };
    await POST(request("POST", input, host, false)); expect(mocks.save).toHaveBeenCalledTimes(1);
    process.env.AUTH_MAIL_MODE = "binding"; await POST(request("POST", input)); expect(mocks.save).toHaveBeenCalledTimes(2);
    process.env.AUTH_MAIL_MODE = "outbox"; process.env.SUPABASE_READ_ONLY = "false";
    await POST(request("POST", input)); expect(mocks.save).toHaveBeenCalledTimes(3);
    mocks.auth.mockResolvedValue({ userId: null }); expect((await POST(request("POST", input))).status).toBe(401);
  });
});
