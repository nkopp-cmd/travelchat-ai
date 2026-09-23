import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// better-fetch keeps the fetch reference it sees at import time: install a stable stub first.
const net = vi.hoisted(() => {
  const state = { handler: (async () => new Response(null, { status: 500 })) as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
  const fetchStub = vi.fn((input: RequestInfo | URL, init?: RequestInit) => state.handler(input, init));
  globalThis.fetch = fetchStub as unknown as typeof fetch;
  return { state, fetchStub };
});

import { authClient, safeRedirect, useAuth, useUser } from "@/lib/auth/client";

const date = new Date().toISOString();
function mockSession(user: Record<string, unknown> | null) {
  net.fetchStub.mockClear();
  net.state.handler = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input), window.location.origin);
    if (url.pathname === "/api/auth/get-session") {
      return Response.json(user ? { user: { emailVerified: true, createdAt: date, updatedAt: date, ...user }, session: { id: "s1", userId: user.id, token: "t", expiresAt: new Date(Date.now() + 3600e3).toISOString(), createdAt: date, updatedAt: date } } : null);
    }
    if (url.pathname === "/api/auth/update-user") return Response.json({ status: true, body: init?.body });
    throw new Error(`unexpected ${url.pathname}`);
  };
  return net.fetchStub;
}

afterEach(() => { vi.clearAllMocks(); });

describe("client auth adapter", () => {
  it("maps a signed-in session to the Clerk-shaped hooks and updates the profile", async () => {
    const fetchMock = mockSession({ id: "user_38VR1", name: "Nils Kopp", email: "n@test.invalid", firstName: "Nils", lastName: "Kopp", image: "https://img/x", bio: "Hi" });
    const { result } = renderHook(() => ({ user: useUser(), auth: useAuth() }));
    await waitFor(() => expect(result.current.user.isLoaded).toBe(true));
    expect(result.current.user.isSignedIn).toBe(true);
    expect(result.current.user.user).toMatchObject({ id: "user_38VR1", firstName: "Nils", lastName: "Kopp", imageUrl: "https://img/x", unsafeMetadata: { bio: "Hi" } });
    expect(result.current.auth).toMatchObject({ isLoaded: true, isSignedIn: true, userId: "user_38VR1" });

    await result.current.user.user!.update({ firstName: "N", lastName: "K", unsafeMetadata: { bio: "New" } });
    const call = fetchMock.mock.calls.find(([u]) => String(u instanceof Request ? u.url : u).includes("/update-user"))!;
    const body = JSON.parse(String((call[1] as RequestInit | undefined)?.body ?? (call[0] instanceof Request ? await call[0].clone().text() : "{}")));
    expect(body).toMatchObject({ firstName: "N", lastName: "K", name: "N K", bio: "New" });
  });

  it("reports signed-out", async () => {
    mockSession(null);
    const { result } = renderHook(() => useAuth());
    authClient.$store.notify("$sessionSignal"); // the session store is a singleton: force a refetch
    await waitFor(() => expect(result.current).toMatchObject({ isLoaded: true, isSignedIn: false, userId: null }));
  });

  it.each([["/dashboard?x=1", "/dashboard?x=1"], ["//evil.test", "/dashboard"], ["https://evil.test", "/dashboard"], ["/\\evil", "/dashboard"], [null, "/dashboard"]])("safeRedirect(%s)", (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
