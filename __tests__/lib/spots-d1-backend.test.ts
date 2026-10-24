// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown, supabase: vi.fn(() => { throw new Error("Supabase must not be called on D1"); }) }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (callback: () => unknown) => callback }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase, createSupabaseClient: mocks.supabase }));
vi.mock("@/lib/app-data/backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-data/backend")>()),
  appDataDb: () => mocks.db,
}));

import { dataBackend } from "@/lib/app-data/backend";
import { fetchFilterOptions, fetchFilteredSpots, getTotalSpotCount, parseFilterParams } from "@/lib/spots/queries";
import { fetchWeeklyTrendingSpots } from "@/lib/spots/weekly-trending";
import { getWeekStart } from "@/lib/weekly-social-trends";
import { d1CommunitySubmission, d1RelatedSpotSources, d1SpotSource } from "@/lib/spots/d1-queries";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: D1Sqlite;

function spot(n: number, values: { name: string; address: string; category?: string; score?: number | null; visible?: number;
  trending?: number; local?: number | null; description?: string }) {
  db.sqlite.prepare(`INSERT INTO spots (id, name, description, category, localley_score, photos, visible, city, address, latitude,
    longitude, subcategories, local_percentage, verified, trending_score) VALUES (?, ?, ?, ?, ?, '[]', ?, NULL, ?, 37.57, 126.99, '["tea"]', ?, 1, ?)`)
    .run(id(n), JSON.stringify({ en: values.name }), JSON.stringify({ en: values.description ?? `${values.name} description` }),
      values.category ?? "Cafe", values.score === undefined ? 5 : values.score, values.visible ?? 1, values.address,
      values.local === undefined ? 70 : values.local, values.trending ?? 0);
}

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "d1");
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  mocks.db = db;
  spot(1, { name: "Ikseon Tea Room", address: "17 Supyo-ro, Jongno-gu, Seoul", score: 6, trending: 0.9 });
  spot(2, { name: "Hidden Bar", address: "1 Itaewon-ro, Seoul", visible: 0 });
  spot(3, { name: "Gangnam Station Area", address: "Gangnam-gu, Seoul" }); // excluded name pattern
  spot(4, { name: "ikseon tea room ", address: "17 supyo-ro, jongno-gu, seoul", score: 4 }); // duplicate of 1
  spot(5, { name: "Shibuya Coffee", address: "2 Dogenzaka, Shibuya, Tokyo", score: null, category: "Coffee", local: null });
  spot(6, { name: "100% Local Noodles", address: "9 Euljiro, Jung-gu, Seoul", score: 4, category: "Food", description: "Cold noodles" });
  db.sqlite.prepare("INSERT INTO spot_listing_places (spot_id, provider, place_id, source) VALUES (?, 'google', 'ChIJabc123', 'test')").run(id(1));
  db.sqlite.prepare("INSERT INTO spot_contributors (id, email, public_credit_name) VALUES (?, 'a@b.test', 'A')").run(id(90));
  db.sqlite.prepare(`INSERT INTO social_spot_submissions (contributor_id, spot_id, source_url, canonical_url, platform, status, contributor_credit)
    VALUES (?, ?, 'https://www.instagram.com/p/x', 'https://www.instagram.com/p/x', 'instagram', 'spot_created', 'A')`).run(id(90), id(6));
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("DATA_BACKEND switch", () => {
  it("defaults to Supabase and only an exact 'd1' selects D1", () => {
    vi.stubEnv("DATA_BACKEND", "");
    expect(dataBackend()).toBe("supabase");
    vi.stubEnv("DATA_BACKEND", "D1");
    expect(dataBackend()).toBe("supabase");
    vi.stubEnv("DATA_BACKEND", "d1");
    expect(dataBackend()).toBe("d1");
  });

  it("fails loudly when D1 is selected without the APP_DB binding", async () => {
    const real = await vi.importActual<typeof import("@/lib/app-data/backend")>("@/lib/app-data/backend");
    expect(() => real.appDataDb()).toThrow("APP_DB is not configured");
  });
});

describe("public spots list on D1", () => {
  it("hides invisible, excluded and duplicate rows; orders like Postgres (NULL scores first); never calls Supabase", async () => {
    const result = await fetchFilteredSpots(parseFilterParams({}));
    expect(result.spots.map((s) => s.name)).toEqual(["Shibuya Coffee", "Ikseon Tea Room", "100% Local Noodles"]);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("maps D1 columns onto the card shape", async () => {
    const { spots } = await fetchFilteredSpots(parseFilterParams({ city: "seoul" }));
    const tea = spots.find((s) => s.id === id(1))!;
    expect(tea).toMatchObject({ googlePlaceId: "ChIJabc123", cityName: "Seoul", category: "Cafe", localleyScore: 6, verified: true,
      trending: true, subcategories: ["tea"], location: { lat: 37.57, lng: 126.99, address: "17 Supyo-ro, Jongno-gu, Seoul" } });
    expect(tea.description).toBe("Ikseon Tea Room description");
    expect(spots.find((s) => s.id === id(6))!.communitySubmitted).toBe(true);
    expect(tea.communitySubmitted).toBe(false);
  });

  it("applies city, category, score threshold, search (with literal %) and paging", async () => {
    const names = async (params: Record<string, string>) => (await fetchFilteredSpots(parseFilterParams(params))).spots.map((s) => s.name);
    expect(await names({ city: "tokyo" })).toEqual(["Shibuya Coffee"]);
    expect(await names({ category: "Food" })).toEqual(["100% Local Noodles"]);
    expect(await names({ score: "5" })).toEqual(["Ikseon Tea Room"]);
    expect(await names({ search: "100%" })).toEqual(["100% Local Noodles"]);
    expect(await names({ search: "0%" })).toEqual(["100% Local Noodles"]);
    expect(await names({ search: "x%y" })).toEqual([]);
    expect(await names({ search: "cold noodles" })).toEqual(["100% Local Noodles"]);
    expect(await names({ sort: "trending" })).toEqual(["Ikseon Tea Room", "Shibuya Coffee", "100% Local Noodles"]);
    const page = await fetchFilteredSpots({ ...parseFilterParams({}), limit: 2, page: 2 });
    expect(page.spots.map((s) => s.name)).toEqual(["100% Local Noodles"]);
    expect(page.total).toBe(3);
  });

  it("counts filter options and the total from public rows only", async () => {
    const options = await fetchFilterOptions();
    expect(options.cities.map((c) => [c.slug, c.count])).toEqual([["seoul", 2], ["tokyo", 1]]);
    expect(options.categories).toEqual([{ name: "Cafe", count: 1 }, { name: "Coffee", count: 1 }, { name: "Food", count: 1 }]);
    expect(options.scores.map((s) => s.count)).toEqual([1, 1, 2, 3]);
    expect(await getTotalSpotCount()).toBe(3);
  });

  it("shows weekly trending spots from D1 rankings and skips hidden spots", async () => {
    vi.stubEnv("WEEKLY_SOCIAL_TRENDS_ENABLED", "true");
    const insert = db.sqlite.prepare("INSERT INTO weekly_city_spot_rankings (week_start, city_slug, spot_id, rank, score) VALUES (?, 'seoul', ?, ?, ?)");
    insert.run(getWeekStart(), id(1), 1, 80);
    insert.run(getWeekStart(), id(2), 2, 70);
    const rows = await fetchWeeklyTrendingSpots("seoul");
    expect(rows.map((r) => [r.spot.name, r.rank])).toEqual([["Ikseon Tea Room", 1]]);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
});

describe("spot detail sources on D1", () => {
  const source = (n: number, extra: Record<string, unknown> = {}) => db.sqlite.prepare("INSERT INTO legacy_spot_source (spotId, payload, publicIssue) VALUES (?, ?, NULL)")
    .run(id(n), JSON.stringify({ id: id(n), name: { en: `Spot ${n}` }, photos: [`/api/places/photo?name=places%2FChIJ${n}%2Fphotos%2Fp`], category: "Cafe", ...extra }));

  it("returns the exact imported source row by id (case-insensitive) and null when missing", async () => {
    source(1, { google_place_id: "ChIJabc123", trending_score: 0.95 });
    expect(await d1SpotSource(id(1).toUpperCase())).toMatchObject({ id: id(1), google_place_id: "ChIJabc123", trending_score: 0.95 });
    expect(await d1SpotSource(id(77))).toBeNull();
  });

  it("finds the oldest direct submission, else one whose research created the spot", async () => {
    expect(await d1CommunitySubmission(id(6))).toMatchObject({ platform: "instagram", status: "spot_created", contributor_credit: "A" });
    db.sqlite.prepare(`INSERT INTO social_spot_submissions (contributor_id, source_url, canonical_url, platform, status, contributor_credit, research, created_at)
      VALUES (?, 'u2', 'https://www.tiktok.com/v/2', 'tiktok', 'needs_review', 'B', ?, '2026-10-01T00:00:00.000Z')`)
      .run(id(90), JSON.stringify({ createdCandidates: [{ spotId: id(5), status: "spot_created" }] }));
    const viaCandidate = await d1CommunitySubmission(id(5));
    expect(viaCandidate).toMatchObject({ canonical_url: "https://www.tiktok.com/v/2" });
    expect(viaCandidate!.research!.createdCandidates![0].spotId).toBe(id(5));
    expect(await d1CommunitySubmission(id(1))).toBeNull();
  });

  it("related candidates: same city, score floor, source photos required, excluded names and self skipped", async () => {
    for (const n of [1, 2, 3, 4, 6]) source(n);
    db.sqlite.prepare("UPDATE legacy_spot_source SET payload = json_set(payload, '$.photos', json('[]')) WHERE spotId = ?").run(id(4));
    const rows = await d1RelatedSpotSources("Seoul", id(6), 4, 24);
    // 2 is hidden by the import verdict but still a candidate (the page re-checks); 3 has an excluded name; 4 has no photos.
    expect(rows.map((r) => r.id)).toEqual([id(1), id(2)]);
  });
});

