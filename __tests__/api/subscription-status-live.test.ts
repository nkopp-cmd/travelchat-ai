import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), supabase: vi.fn(), early: vi.fn(), started: [] as string[] }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.user }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.supabase }));
vi.mock("@/lib/early-adopters", () => ({ isBetaMode: () => false, getEarlyAdopterStatus: mocks.early }));

import { GET } from "@/app/api/subscription/status/route";

// Every read records its start and resolves only after all reads have started, so a
// sequential await chain would deadlock the test (fails by timeout) instead of passing.
let release!: () => void;
let gate: Promise<void>;
const later = <T,>(label: string, value: T) => { mocks.started.push(label); return gate.then(() => value); };

function query(table: string, rows: Record<string, unknown>) {
  const filters: string[] = [];
  const chain = {
    select: () => chain,
    eq: (_column: string, value: string) => { filters.push(value); return chain; },
    single: () => later(`${table}:single`, { data: rows.subscription ?? null }),
    then: (resolve: (value: unknown) => unknown) => later(`${table}:${filters.at(-1)}`, table === "saved_spots"
      ? { count: 4 } : { data: [{ usage_type: "itinerary", count: Number(rows[filters.at(-1) ?? ""] ?? 0) }] }).then(resolve),
  };
  return chain;
}

describe("GET /api/subscription/status (live source)", () => {
  beforeEach(() => {
    mocks.started.length = 0;
    gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.user.mockImplementation(() => later("user", { id: "user-1", emailAddresses: [{ emailAddress: "traveler@example.com" }] }));
    mocks.early.mockImplementation(() => later("early", { isEarlyAdopter: false, position: null, slotsRemaining: 0 }));
    mocks.supabase.mockResolvedValue({
      from: (table: string) => query(table, { subscription: { tier: "pro", status: "active", stripe_customer_id: "cus_1" } }),
    });
  });

  it("starts the user, subscription, early-adopter and usage reads together and keeps the response", async () => {
    const pending = GET(new NextRequest("https://www.localley.io/api/subscription/status"));
    await vi.waitFor(() => expect(mocks.started.length).toBe(7));
    expect(mocks.started).toEqual(expect.arrayContaining(["user", "subscriptions:single", "early", "saved_spots:user-1"]));
    release();
    const response = await pending;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ tier: "pro", isActive: true, hasBillingPortal: true, isEarlyAdopter: false });
  });

  it("still refuses a signed-out request before any read", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET(new NextRequest("https://www.localley.io/api/subscription/status"));
    expect(response.status).toBe(401);
    expect(mocks.started).toEqual([]);
  });
});
