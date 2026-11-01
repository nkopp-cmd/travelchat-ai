// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown, limit: vi.fn(), userId: null as string | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app-data/backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-data/backend")>()),
  appDataDb: () => mocks.db,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => mocks.limit, strictPlatformLimit: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: async () => ({ userId: mocks.userId, sessionId: mocks.userId ? "s" : null }) }));

import { POST } from "@/app/api/help/menu/route";
import { MENU_GLOBAL_DAILY_LIMIT, MENU_USER_DAILY_LIMIT, parseMenuImage, parseMenuResponse } from "@/lib/help/menu";
import { MENU_GLOBAL_OWNER, MENU_USAGE_TYPE, reserveMenuScan } from "@/lib/help/menu-quota";

// A 1x1 JPEG header followed by filler: parseMenuImage checks only length, alphabet and magic bytes.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString("base64");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200, 1)]).toString("base64");
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(200, 1)]).toString("base64");
const dishes = { language: "ko", notes: ["Side dishes are free to refill."], dishes: [
  { original: "돼지국밥", english: "Pork rice soup", description: "Pork broth with rice.", price: "9,000원", tags: ["pork", "made_up"] },
  { original: "", english: "Nameless", description: "", price: null, tags: [] },
] };
const gemini = (body: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] });
let db: D1Sqlite;
const fetchMock = vi.fn();

const post = (body: unknown) => POST(new NextRequest("https://www.localley.io/api/help/menu", { method: "POST", body: JSON.stringify(body) }));
const count = (owner: string) => (db.sqlite.prepare("SELECT count FROM legacy_usage WHERE ownerId = ? AND usageType = ?").get(owner, MENU_USAGE_TYPE) as { count: number } | undefined)?.count ?? 0;

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "d1");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  mocks.limit.mockResolvedValue(null);
  mocks.userId = "user-1";
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  mocks.db = db;
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); fetchMock.mockReset(); });

describe("menu helper parts", () => {
  it("accepts JPEG and PNG by magic bytes and rejects other data", () => {
    expect(parseMenuImage(JPEG)?.mime).toBe("image/jpeg");
    expect(parseMenuImage(PNG)?.mime).toBe("image/png");
    expect(parseMenuImage(GIF)).toBeNull();
    expect(parseMenuImage("not base64!")).toBeNull();
    expect(parseMenuImage("A".repeat(2_100_000))).toBeNull();
  });

  it("keeps only valid dishes and allowed tags", () => {
    const result = parseMenuResponse(gemini(dishes));
    expect(result).toEqual({ language: "ko", notes: ["Side dishes are free to refill."],
      dishes: [{ original: "돼지국밥", english: "Pork rice soup", description: "Pork broth with rice.", price: "9,000원", tags: ["pork"] }] });
    expect(parseMenuResponse({ candidates: [{ content: { parts: [{ text: "not json" }] } }] })).toBeNull();
    expect(parseMenuResponse({})).toBeNull();
  });
});

describe("menu scan quota", () => {
  it("stops each user at the daily limit and gives the global slot back", async () => {
    for (let i = 0; i < MENU_USER_DAILY_LIMIT; i++) expect((await reserveMenuScan("user-1")).status).toBe("ok");
    expect(await reserveMenuScan("user-1")).toEqual({ status: "user_limit" });
    expect(count("user-1")).toBe(MENU_USER_DAILY_LIMIT);
    expect(count(MENU_GLOBAL_OWNER)).toBe(MENU_USER_DAILY_LIMIT);
    expect(await reserveMenuScan("user-2")).toEqual({ status: "ok", remaining: MENU_USER_DAILY_LIMIT - 1 });
  });

  it("stops all users at the global limit and starts again the next UTC day", async () => {
    db.sqlite.prepare("INSERT INTO owners (id, source) VALUES (?, 'new')").run(MENU_GLOBAL_OWNER);
    db.sqlite.prepare("INSERT INTO legacy_usage (id, ownerId, usageType, periodStart, periodType, count) VALUES ('g', ?, ?, '2026-11-01', 'daily', ?)")
      .run(MENU_GLOBAL_OWNER, MENU_USAGE_TYPE, MENU_GLOBAL_DAILY_LIMIT);
    expect(await reserveMenuScan("user-3", undefined, new Date("2026-11-01T12:00:00Z"))).toEqual({ status: "global_limit" });
    expect(count("user-3")).toBe(0);
    expect((await reserveMenuScan("user-3", undefined, new Date("2026-11-02T00:00:01Z"))).status).toBe("ok");
  });

  it("fails closed when D1 fails", async () => {
    mocks.db = { prepare: () => { throw new Error("D1 down"); }, batch: async () => { throw new Error("D1 down"); } };
    expect(await reserveMenuScan("user-1")).toEqual({ status: "unavailable" });
  });
});

describe("POST /api/help/menu", () => {
  it("asks visitors to sign in and never calls the model", async () => {
    mocks.userId = null;
    const res = await post({ image: JPEG });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ status: "signin" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-image before it uses a scan", async () => {
    const res = await post({ image: GIF });
    expect(res.status).toBe(400);
    expect(count("user-1")).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the dishes, no-store, and counts one scan", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(gemini(dishes)), { status: 200 }));
    const res = await post({ image: JPEG });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.remaining).toBe(MENU_USER_DAILY_LIMIT - 1);
    expect(body.result.dishes).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("gemini-2.5-flash:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body).contents[0].parts[0].inline_data.mime_type).toBe("image/jpeg");
    expect(count("user-1")).toBe(1);
  });

  it("gives the user's scan back when the model fails", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const res = await post({ image: JPEG });
    expect(res.status).toBe(502);
    expect(count("user-1")).toBe(0);
    expect(count(MENU_GLOBAL_OWNER)).toBe(1);
  });

  it("answers unreadable for a photo without dishes", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(gemini({ language: null, notes: [], dishes: [] })), { status: 200 }));
    expect(await (await post({ image: JPEG })).json()).toEqual({ status: "unreadable" });
  });

  it("answers limit after the daily scans", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(gemini(dishes)), { status: 200 }));
    for (let i = 0; i < MENU_USER_DAILY_LIMIT; i++) expect((await post({ image: JPEG })).status).toBe(200);
    const res = await post({ image: JPEG });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ status: "limit" });
    expect(fetchMock).toHaveBeenCalledTimes(MENU_USER_DAILY_LIMIT);
  });
});
