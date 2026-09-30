import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), auth: vi.fn(), gate: vi.fn(), list: vi.fn(),
  admin: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/app-data/preview-itinerary-list", () => ({
  isPreviewItineraryListCandidate: mocks.gate, previewItineraryList: mocks.list,
}));
import ItinerariesPage from "@/app/itineraries/page";
import { ItineraryList } from "@/components/itineraries/itinerary-list";

const row = { id: "550e8400-e29b-41d4-a716-446655440000", title: "D1 trip", city: "Seoul",
  days: 1, local_score: 7, created_at: "2026-09-30T00:00:00Z" };
function findList(node: React.ReactNode): React.ReactElement<{ initialItineraries: unknown[] }> | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === ItineraryList) return node as React.ReactElement<{ initialItineraries: unknown[] }>;
  const children = (node.props as { children?: React.ReactNode }).children;
  for (const child of React.Children.toArray(children)) {
    const found = findList(child);
    if (found) return found;
  }
  return null;
}
beforeEach(() => {
  mocks.headers.mockResolvedValue(new Headers({ host: "localley-next-preview.nkopp.workers.dev" }));
  mocks.auth.mockResolvedValue({ userId: "user_one" });
  mocks.gate.mockReturnValue(true);
  mocks.list.mockResolvedValue([row]);
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [{ ...row, title: "Supabase trip" }], error: null }) };
  mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
});
afterEach(() => vi.clearAllMocks());

describe("My Itineraries preview candidate page", () => {
  it("passes candidate rows to the existing list without opening Supabase", async () => {
    const page = await ItinerariesPage({ searchParams: Promise.resolve({ data_candidate: "d1" }) });
    expect(mocks.gate).toHaveBeenCalledWith("localley-next-preview.nkopp.workers.dev", "d1");
    expect(mocks.list).toHaveBeenCalledWith("user_one");
    expect(findList(page)?.props.initialItineraries).toEqual([row]);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("keeps normal routing on the existing Supabase read", async () => {
    mocks.gate.mockReturnValue(false);
    const page = await ItinerariesPage({ searchParams: Promise.resolve({}) });
    expect(findList(page)?.props.initialItineraries).toMatchObject([{ title: "Supabase trip" }]);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("fails closed when candidate D1 cannot read", async () => {
    mocks.list.mockRejectedValue(new Error("D1 unavailable"));
    await expect(ItinerariesPage({ searchParams: Promise.resolve({ data_candidate: "d1" }) }))
      .rejects.toThrow("D1 unavailable");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("redirects signed-out candidate visitors before either database", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(ItinerariesPage({ searchParams: Promise.resolve({ data_candidate: "d1" }) }))
      .rejects.toThrow("redirect");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
