// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown, limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app-data/backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-data/backend")>()),
  appDataDb: () => mocks.db,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => mocks.limit, strictPlatformLimit: vi.fn() }));

import { GET } from "@/app/api/help/open/route";
import { boundingBox, distanceMeters, mapLinks, parseNearbyPoint } from "@/lib/help/open-nearby";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PHOTO = '["https://lh3.googleusercontent.com/p/AF1QipNtest=w1600"]';
let db: D1Sqlite;

function spot(n: number, name: Record<string, string>, lat: number, lng: number, extra: { visible?: number; photos?: string } = {}) {
  db.sqlite.prepare(`INSERT INTO spots (id, name, description, category, localley_score, photos, visible, city, address, latitude, longitude,
    subcategories, local_percentage, verified, trending_score) VALUES (?, ?, '{"en":"x"}', 'Food', 5, ?, ?, NULL, '9 Insadong-gil, Jongno-gu, Seoul', ?, ?, '[]', 70, 1, 0)`)
    .run(id(n), JSON.stringify(name), extra.photos ?? PHOTO, extra.visible ?? 1, lat, lng);
}
const get = (query: string) => GET(new NextRequest(`https://www.localley.io/api/help/open?${query}`));

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "d1");
  mocks.limit.mockResolvedValue(null);
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  mocks.db = db;
  spot(1, { en: "Tosokchon Samgyetang", ko: "토속촌 삼계탕" }, 37.5779, 126.9707);
  spot(2, { en: "Near Noodles" }, 37.5760, 126.9850);
  spot(3, { en: "Hidden Bar" }, 37.5770, 126.9770, { visible: 0 });
  spot(4, { en: "Far Cafe" }, 37.4979, 127.0276); // Gangnam, ~10 km
  spot(5, { en: "Corner Cafe" }, 37.5925, 126.9930); // inside the box corner, > 2 km away
  db.sqlite.prepare("INSERT INTO spot_listing_places (spot_id, provider, place_id, source) VALUES (?, 'google', 'ChIJtosok123', 'test')").run(id(1));
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("helper 5 pure parts", () => {
  it("rounds the visitor position and rejects junk", () => {
    expect(parseNearbyPoint("37.57654321", "126.97712")).toEqual({ lat: 37.577, lng: 126.977 });
    expect(parseNearbyPoint("91", "0")).toBeNull();
    expect(parseNearbyPoint("1e3", "0")).toBeNull();
    expect(parseNearbyPoint(null, "1")).toBeNull();
  });

  it("measures distance and boxes the radius", () => {
    expect(distanceMeters({ lat: 37.5665, lng: 126.978 }, { lat: 37.5665, lng: 126.978 })).toBe(0);
    expect(Math.abs(distanceMeters({ lat: 37.5665, lng: 126.978 }, { lat: 37.4979, lng: 127.0276 }) - 8_800)).toBeLessThan(300);
    const box = boundingBox({ lat: 37.5, lng: 127 }, 2);
    expect(distanceMeters({ lat: 37.5, lng: 127 }, { lat: box.maxLat, lng: 127 })).toBeGreaterThanOrEqual(1_990);
    expect(distanceMeters({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: box.maxLng })).toBeGreaterThanOrEqual(1_990);
  });

  it("links the Google listing by place ID and Naver Map only in Korea", () => {
    const links = mapLinks({ name: "Tosokchon", localName: "토속촌", lat: 37.5, lng: 127, googlePlaceId: "ChIJx" }, "KR");
    expect(new URL(links.google).searchParams.get("query_place_id")).toBe("ChIJx");
    expect(new URL(links.google).searchParams.get("query")).toBe("토속촌");
    expect(links.naver).toContain(encodeURIComponent("토속촌"));
    const jp = mapLinks({ name: "Cafe", localName: null, lat: 35.1, lng: 139.2, googlePlaceId: "bad id!" }, "JP");
    expect(new URL(jp.google).searchParams.get("query_place_id")).toBeNull();
    expect(new URL(jp.google).searchParams.get("query")).toBe("Cafe 35.1,139.2");
    expect(jp.naver).toBeNull();
  });
});

describe("GET /api/help/open", () => {
  it("returns visible spots within 2 km, nearest first, with local names and map links", async () => {
    const response = await get("country=korea&lat=37.5772&lng=126.9768");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.spots.map((s: { name: string }) => s.name)).toEqual(["Tosokchon Samgyetang", "Near Noodles"]);
    expect(body.spots[0]).toMatchObject({ id: id(1), localName: "토속촌 삼계탕" });
    expect(body.spots[0].google).toContain("query_place_id=ChIJtosok123");
    expect(body.spots[0].naver).toContain("map.naver.com");
    expect(body.spots[1].distanceM).toBeGreaterThan(body.spots[0].distanceM);
  });

  it("rejects bad input and refuses when limited", async () => {
    expect((await get("country=mars&lat=37.5&lng=127")).status).toBe(400);
    expect((await get("country=korea&lat=abc&lng=127")).status).toBe(400);
    mocks.limit.mockResolvedValue(new Response(null, { status: 429 }));
    const limited = await get("country=korea&lat=37.5772&lng=126.9768");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("no-store");
  });

  it("answers an empty list far from every spot", async () => {
    const body = await (await get("country=japan&lat=35.6762&lng=139.6503")).json();
    expect(body).toEqual({ status: "ok", spots: [] });
  });
});
