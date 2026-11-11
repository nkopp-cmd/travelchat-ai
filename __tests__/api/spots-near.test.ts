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

import { GET } from "@/app/api/spots/near/route";
import { formatDistance, NEAR_LIMIT } from "@/lib/spots/near";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PHOTO = '["https://lh3.googleusercontent.com/p/AF1QipNtest=w1600"]';
let db: D1Sqlite;

function spot(n: number, name: string, lat: number, lng: number, visible = 1) {
  db.sqlite.prepare(`INSERT INTO spots (id, name, description, category, localley_score, photos, visible, city, address, latitude, longitude,
    subcategories, local_percentage, verified, trending_score) VALUES (?, ?, '{"en":"x"}', 'Food', 5, ?, ?, 'Seoul', '9 Insadong-gil, Jongno-gu, Seoul', ?, ?, '[]', 70, 1, 0)`)
    .run(id(n), JSON.stringify({ en: name }), PHOTO, visible, lat, lng);
}
const get = (query: string) => GET(new NextRequest(`https://www.localley.io/api/spots/near?${query}`));

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "d1");
  mocks.limit.mockResolvedValue(null);
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  mocks.db = db;
  spot(1, "City Hall Noodles", 37.5668, 126.9785); // ~40 m
  spot(2, "Insadong Tea", 37.5740, 126.9850); // ~1 km
  spot(3, "Hidden Bar", 37.5666, 126.9781, 0);
  spot(4, "Gangnam Cafe", 37.4979, 127.0276); // ~8.8 km
  spot(5, "Corner Cafe", 37.6080, 127.0300); // in the 5 km box corner, > 5 km away
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("GET /api/spots/near", () => {
  it("returns visible spots within 5 km, nearest first, with a distance, private cache only", async () => {
    const response = await get("lat=37.5665&lng=126.978");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.spots.map((s: { name: string }) => s.name)).toEqual(["City Hall Noodles", "Insadong Tea"]);
    const distances = body.spots.map((s: { distanceM: number }) => s.distanceM);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(distances[0]).toBeLessThan(100);
    expect(body.spots.length).toBeLessThanOrEqual(NEAR_LIMIT);
  });

  it("returns an empty list far from every spot", async () => {
    const body = await (await get("lat=1.29&lng=103.85")).json();
    expect(body).toEqual({ status: "ok", spots: [] });
  });

  it("rejects a bad position and a rate-limited caller without caching", async () => {
    const bad = await get("lat=95&lng=0");
    expect(bad.status).toBe(400);
    expect(bad.headers.get("cache-control")).toBe("no-store");
    mocks.limit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await get("lat=37.5665&lng=126.978")).status).toBe(429);
  });

  it("formats distances for the card label", () => {
    expect(formatDistance(3)).toBe("10 m");
    expect(formatDistance(444)).toBe("440 m");
    expect(formatDistance(1520)).toBe("1.5 km");
  });
});
