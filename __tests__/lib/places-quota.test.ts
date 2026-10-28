// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/app-data/backend", () => ({ appDataDb: () => mocks.db }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => async () => null, strictPlatformLimit: async () => "allowed" }));
import { PLACES_DAILY_CAP_DEFAULT, placesDailyCap, reservePlacesCall } from "@/lib/places-quota";
import { GET } from "@/app/api/places/photo/route";

let d1: D1Sqlite;
const day1 = new Date("2026-10-28T08:00:00Z");
const day2 = new Date("2026-10-29T00:00:01Z");
type Db = Parameters<typeof reservePlacesCall>[1];

beforeEach(() => {
  d1 = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) d1.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  mocks.db = d1;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Places daily cap (hard stop)", () => {
  it("allows exactly cap calls a day, refuses the next, and starts again the next UTC day", async () => {
    vi.stubEnv("PLACES_DAILY_CAP", "3");
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await reservePlacesCall("photo", d1 as unknown as Db, day1));
    expect(results).toEqual([true, true, true, false, false]);
    expect(d1.sqlite.prepare("SELECT day, calls, cap FROM places_api_usage").all()).toEqual([{ day: "2026-10-28", calls: 3, cap: 3 }]);
    expect(await reservePlacesCall("photo", d1 as unknown as Db, day2)).toBe(true);
  });

  it("parallel requests never pass the cap", async () => {
    vi.stubEnv("PLACES_DAILY_CAP", "10");
    const results = await Promise.all(Array.from({ length: 25 }, () => reservePlacesCall("search", d1 as unknown as Db, day1)));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(d1.sqlite.prepare("SELECT calls FROM places_api_usage").get()).toEqual({ calls: 10 });
  });

  it("fails closed when the counter is unavailable", async () => {
    const broken = { prepare: () => { throw new Error("D1 down"); } } as unknown as Db;
    expect(await reservePlacesCall("photo", broken, day1)).toBe(false);
    mocks.db = undefined;
    expect(await reservePlacesCall("photo", undefined, day1)).toBe(false);
  });

  it("uses the default unless PLACES_DAILY_CAP is a positive integer", () => {
    for (const value of ["", "0", "-5", "abc", "2.5"]) {
      vi.stubEnv("PLACES_DAILY_CAP", value);
      expect(placesDailyCap()).toBe(PLACES_DAILY_CAP_DEFAULT);
    }
    vi.stubEnv("PLACES_DAILY_CAP", "120");
    expect(placesDailyCap()).toBe(120);
  });

  it("the photo proxy stops before Google once the cap is reached", async () => {
    vi.stubEnv("PLACES_DAILY_CAP", "1");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    const fetchSpy = vi.fn(async (url: string) => String(url).includes("places.googleapis.com")
      ? Response.json({ photoUri: "https://lh3.googleusercontent.com/p" })
      : new Response(new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0]), { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const request = () => new NextRequest(`https://www.localley.io/api/places/photo?name=${encodeURIComponent("places/ChIJabc/photos/p1")}`);
    expect((await GET(request())).status).toBe(200);
    const googleCalls = () => fetchSpy.mock.calls.filter(([url]) => String(url).includes("places.googleapis.com")).length;
    expect(googleCalls()).toBe(1);
    expect((await GET(request())).status).toBe(503);
    expect(googleCalls()).toBe(1);
  });
});
