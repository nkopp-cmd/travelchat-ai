import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), visible: vi.fn(() => true) }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/spots/public-quality", () => ({
  PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS: ["%Residential%"],
  shouldShowPublicSpot: mocks.visible,
}));
import { isPreviewCitiesCandidate, previewImportedCities } from "@/lib/app-data/preview-cities";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

function rows(source: object[], expected = source.length) {
  const prepare = vi.fn((sql: string) => ({
    first: async () => sql.includes("legacy_import_batches") ? { expected } : { actual: source.length },
    bind: (offset: number) => ({ all: async () => ({ results: source.slice(offset, offset + 500)
      .map(value => ({ payload: JSON.stringify(value), visible: (value as { visible?: number }).visible ?? 1 })) }) }),
  }));
  mocks.reader.mockReturnValue({ prepare });
  return prepare;
}

const spot = (name: string, address: string) => ({
  name: { en: name }, address: { en: address }, photos: ["https://example.com/photo.jpg"],
});

describe("preview imported city catalog", () => {
  it("requires the exact preview host, flag, and isolated environment", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag: string) => new NextRequest(`https://${host}/api/cities${flag}`);
    expect(isPreviewCitiesCandidate(request("localley-next-preview.nkopp.workers.dev", "?data_candidate=d1"))).toBe(true);
    expect(isPreviewCitiesCandidate(request("www.localley.io", "?data_candidate=d1"))).toBe(false);
    expect(isPreviewCitiesCandidate(request("localley-next-preview.nkopp.workers.dev", ""))).toBe(false);
    process.env = { ...process.env, SUPABASE_READ_ONLY: "false" };
    expect(isPreviewCitiesCandidate(request("localley-next-preview.nkopp.workers.dev", "?data_candidate=d1"))).toBe(false);
  });

  it("refuses missing and incomplete imports", async () => {
    const prepare = rows([spot("One", "Seoul")], 2);
    await expect(previewImportedCities()).rejects.toThrow("incomplete");
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("counts imported public source rows using the same city address match", async () => {
    rows([spot("One", "Seoul, Korea"), spot("Residential Tower", "Seoul"),
      spot("Two", "Tokyo"), spot("Three", "Seoul, Tokyo"), spot("Four", "Bangkok")]);
    const cities = await previewImportedCities();
    expect(cities.find(city => city.slug === "seoul")?.spotCount).toBe(2);
    expect(cities.find(city => city.slug === "tokyo")?.spotCount).toBe(2);
    expect(cities.find(city => city.slug === "bangkok")?.spotCount).toBe(1);
    expect(cities.find(city => city.slug === "singapore")?.status).toBe("hidden");
  });

  it("does not publish imported hidden spots", async () => {
    rows([{ ...spot("Hidden", "Seoul"), visible: 0 }, spot("Visible", "Seoul")]);
    const cities = await previewImportedCities();
    expect(cities.find(city => city.slug === "seoul")?.spotCount).toBe(1);
  });
});
