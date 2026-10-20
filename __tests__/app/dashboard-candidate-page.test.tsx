import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), auth: vi.fn(), gate: vi.fn(), recent: vi.fn(), admin: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/app-data/preview-itinerary-list", () => ({
  isPreviewItineraryListCandidate: mocks.gate, previewRecentItineraries: mocks.recent,
}));
vi.mock("@/components/chat/chat-interface", () => ({ ChatInterface: () => null }));
vi.mock("@/components/chat/mobile-chat-fab", () => ({ MobileChatFAB: () => null }));
vi.mock("@/components/dashboard/recent-stories", () => ({ RecentStories: () => null }));
vi.mock("@/components/dashboard/onboarding-panel", () => ({ OnboardingPanel: () => null }));
vi.mock("@/components/dashboard/mobile-dashboard-content", () => ({ MobileDashboardContent: () => null }));
import DashboardPage from "@/app/dashboard/page";
import { MobileDashboardContent } from "@/components/dashboard/mobile-dashboard-content";

const row = { id: "550e8400-e29b-41d4-a716-446655440000", title: "D1 trip", city: "Seoul", days: 2,
  created_at: "2026-10-01T00:00:00Z" };
function findMobile(node: React.ReactNode): React.ReactElement<{ itineraries: unknown[] }> | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === MobileDashboardContent) return node as React.ReactElement<{ itineraries: unknown[] }>;
  for (const child of React.Children.toArray((node.props as { children?: React.ReactNode }).children)) {
    const found = findMobile(child);
    if (found) return found;
  }
  return null;
}
beforeEach(() => {
  mocks.headers.mockResolvedValue(new Headers({ host: "localley-next-preview.nkopp.workers.dev" }));
  mocks.auth.mockResolvedValue({ userId: "user_one" });
  mocks.gate.mockReturnValue(true);
  mocks.recent.mockResolvedValue([row]);
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [{ ...row, title: "Supabase trip" }] }) };
  mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
});
afterEach(() => vi.clearAllMocks());

describe("dashboard preview candidate page", () => {
  it("reads recent itineraries from D1 without opening Supabase", async () => {
    const page = await DashboardPage({ searchParams: Promise.resolve({ data_candidate: "d1" }) });
    expect(mocks.gate).toHaveBeenCalledWith("localley-next-preview.nkopp.workers.dev", "d1");
    expect(mocks.recent).toHaveBeenCalledWith("user_one");
    expect(findMobile(page)?.props.itineraries).toEqual([row]);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("keeps normal routing on the existing Supabase read", async () => {
    mocks.gate.mockReturnValue(false);
    const page = await DashboardPage({ searchParams: Promise.resolve({}) });
    expect(findMobile(page)?.props.itineraries).toMatchObject([{ title: "Supabase trip" }]);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.recent).not.toHaveBeenCalled();
  });

  it("fails closed when candidate D1 cannot read", async () => {
    mocks.recent.mockRejectedValue(new Error("D1 unavailable"));
    await expect(DashboardPage({ searchParams: Promise.resolve({ data_candidate: "d1" }) })).rejects.toThrow("D1 unavailable");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("shows no rows to signed-out visitors on either path", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const page = await DashboardPage({ searchParams: Promise.resolve({ data_candidate: "d1" }) });
    expect(findMobile(page)?.props.itineraries).toEqual([]);
    expect(mocks.recent).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
