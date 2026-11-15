// Money path (push-localley P4): the second anonymous planner request must answer the code that
// components/itineraries/wizard maps to /sign-up?redirect_url=... (see planner-auth-return.test.tsx).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ userId: null as string | null, anonCookie: undefined as string | undefined }));

vi.mock("@/lib/rate-limit", () => ({ rateLimiters: { strict: vi.fn(async () => null) } }));
vi.mock("@/lib/auth/server", () => ({ auth: vi.fn(async () => ({ userId: state.userId })) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "localley_anon_usage" && state.anonCookie !== undefined ? { name, value: state.anonCookie } : undefined),
    set: vi.fn(),
  })),
}));

const post = (body: unknown) => new NextRequest("https://www.localley.io/api/itineraries/generate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("POST /api/itineraries/generate anonymous limit", () => {
  beforeEach(() => {
    state.userId = null;
    state.anonCookie = undefined;
  });

  it("answers 401 unauthorized with the sign-up URL after the one free anonymous itinerary", async () => {
    state.anonCookie = "1";
    const { POST } = await import("@/app/api/itineraries/generate/route");
    const response = await POST(post({ city: "Seoul", days: 2 }));
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error.code).toBe("unauthorized");
    expect(json.error.details.signupUrl).toBe("/sign-up");
  });

  it("does not ask an anonymous visitor to sign up before the free itinerary", async () => {
    const { POST } = await import("@/app/api/itineraries/generate/route");
    const response = await POST(post({}));
    expect(response.status).not.toBe(401);
  });
});
