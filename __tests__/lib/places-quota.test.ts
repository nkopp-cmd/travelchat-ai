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
import { isAutomatedPlacesRequest } from "@/lib/places-guard";
import { GET as galleryGET } from "@/app/api/spots/[id]/photos/route";
import { GET } from "@/app/api/places/photo/route";

const browser = { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" } };
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
    const request = () => new NextRequest(`https://www.localley.io/api/places/photo?name=${encodeURIComponent("places/ChIJabc/photos/p1")}`, browser);
    expect((await GET(request())).status).toBe(200);
    const googleCalls = () => fetchSpy.mock.calls.filter(([url]) => String(url).includes("places.googleapis.com")).length;
    expect(googleCalls()).toBe(1);
    expect((await GET(request())).status).toBe(503);
    expect(googleCalls()).toBe(1);
  });
});

describe("automated requests never cost a Places call", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  // Real user agents from the 2026-10-31 Worker logs (all 273 calls of that day).
  const lighthouse = "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse";
  const headless = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36";
  const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

  it("classifies Lighthouse, headless, crawlers, empty UA and speculative loads as automated", () => {
    for (const ua of [lighthouse, headless, "Googlebot/2.1 (+http://www.google.com/bot.html)", "facebookexternalhit/1.1", "curl/8.5.0", "python-requests/2.32", ""])
      expect(isAutomatedPlacesRequest(h({ "user-agent": ua })), ua).toBe(true);
    expect(isAutomatedPlacesRequest(h({ "user-agent": chrome, "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isAutomatedPlacesRequest(h({ "user-agent": chrome, purpose: "prefetch" }))).toBe(true);
    expect(isAutomatedPlacesRequest(h({ "user-agent": chrome }))).toBe(false);
    expect(isAutomatedPlacesRequest(h({ "user-agent": browser.headers["user-agent"] }))).toBe(false);
  });

  it("the photo proxy and the gallery refuse automated requests before reserving or fetching", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const name = encodeURIComponent("places/ChIJabc/photos/p1");
    const photo = await GET(new NextRequest(`https://www.localley.io/api/places/photo?name=${name}`, { headers: { "user-agent": lighthouse } }));
    expect(photo.status).toBe(404);
    const id = "3d08de9a-87b8-428c-bc7b-972a05000000";
    const gallery = await galleryGET(new NextRequest(`https://www.localley.io/api/spots/${id}/photos`, { headers: { "user-agent": chrome, "sec-purpose": "prefetch" } }), { params: Promise.resolve({ id }) });
    expect(await gallery.json()).toMatchObject({ status: "unavailable", photos: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(d1.sqlite.prepare("SELECT COUNT(*) AS n FROM places_api_usage").get()).toEqual({ n: 0 });
  });
});
