import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), gate: vi.fn(), list: vi.fn(), cities: vi.fn(), admin: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/app-data/preview-itinerary-list", () => ({ isPreviewItineraryListCandidate: mocks.gate }));
vi.mock("@/lib/app-data/preview-explore", () => ({ previewPublicItineraries: mocks.list, previewPopularCities: mocks.cities }));
vi.mock("@/app/explore/explore-content", () => ({ ExploreContent: () => null }));
import ExplorePage from "@/app/explore/page";
import { ExploreContent } from "@/app/explore/explore-content";

type Props = { itineraries: unknown[]; popularCities: string[] };
function findContent(node: React.ReactNode): React.ReactElement<Props> | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === ExploreContent) return node as React.ReactElement<Props>;
  for (const child of React.Children.toArray((node.props as { children?: React.ReactNode }).children)) {
    const found = findContent(child);
    if (found) return found;
  }
  return null;
}
const card = { id: "550e8400-e29b-41d4-a716-446655440000", title: "D1 trip" };
beforeEach(() => {
  mocks.headers.mockResolvedValue(new Headers({ host: "localley-next-preview.nkopp.workers.dev" }));
  mocks.gate.mockReturnValue(true);
  mocks.list.mockResolvedValue([card]);
  mocks.cities.mockResolvedValue(["Seoul"]);
  const query: Record<string, unknown> = {};
  for (const name of ["select", "eq", "not", "ilike", "gte", "lte", "order"]) query[name] = vi.fn(() => query);
  query.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  (query as { then?: unknown }).then = undefined;
  mocks.admin.mockReturnValue({ from: vi.fn(() => ({ ...query, select: vi.fn((cols: string) => cols === "city"
    ? { eq: () => ({ not: () => Promise.resolve({ data: [{ city: "Tokyo" }] }) }) } : query) })) });
});
afterEach(() => vi.clearAllMocks());

describe("explore preview candidate page", () => {
  it("reads public itineraries and cities from D1 without opening Supabase", async () => {
    const page = await ExplorePage({ searchParams: Promise.resolve({ city: "seoul", duration: "2-3", sort: "likes", data_candidate: "d1" }) });
    expect(mocks.gate).toHaveBeenCalledWith("localley-next-preview.nkopp.workers.dev", "d1");
    expect(mocks.list).toHaveBeenCalledWith("seoul", "2-3", "likes");
    const content = findContent(page);
    expect(content?.props.itineraries).toEqual([card]);
    expect(content?.props.popularCities).toEqual(["Seoul"]);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("keeps normal routing on Supabase", async () => {
    mocks.gate.mockReturnValue(false);
    const page = await ExplorePage({ searchParams: Promise.resolve({}) });
    expect(findContent(page)?.props.popularCities).toEqual(["Tokyo"]);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.admin).toHaveBeenCalled();
  });

  it("fails closed when candidate D1 cannot read", async () => {
    mocks.list.mockRejectedValue(new Error("D1 unavailable"));
    await expect(ExplorePage({ searchParams: Promise.resolve({ data_candidate: "d1" }) })).rejects.toThrow("D1 unavailable");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
