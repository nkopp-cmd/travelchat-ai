import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useAppSession } from "@/providers/app-session-provider";
import { BetterAuthSessionProvider } from "@/providers/better-auth-session-provider";
import { ClerkSessionProvider } from "@/providers/clerk-session-provider";
import { localReturnTo } from "@/lib/auth/session-contract";
import { Providers } from "@/providers";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), useSession: vi.fn(), refetch: vi.fn(), create: vi.fn(), useAuth: vi.fn(), reload: vi.fn(), push: vi.fn() }));
vi.mock("better-auth/react", () => ({ createAuthClient: (options: unknown) => {
  mocks.create(options);
  return { getSession: mocks.getSession, useSession: () => ({ ...mocks.useSession(), refetch: mocks.refetch }) };
} }));
vi.mock("@clerk/nextjs", () => ({ useAuth: mocks.useAuth, useClerk: () => ({ session: { reload: mocks.reload } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/query-client", () => ({ QueryProvider: ({ children }: { children: ReactNode }) => <div data-testid="query-provider">{children}</div> }));
vi.mock("@/providers/subscription-provider", () => ({ SubscriptionProvider: ({ children }: { children: ReactNode }) => <div data-testid="subscription-provider">{children}</div> }));
vi.mock("@/providers/service-worker-registration", () => ({ ServiceWorkerRegistration: () => <span>Service worker registration</span> }));

function Consumer() {
  const session = useAppSession();
  return <><output>{JSON.stringify(session)}</output>
    <button onClick={() => session.requestSignIn("/spots/one")}>Sign in</button>
    <button onClick={() => { void session.refresh(); }}>Refresh</button></>;
}
const value = () => JSON.parse(screen.getByRole("status").textContent!);
const identity = (id = "auth-a", sessionId = "session-a", emailVerified = true) => ({
  user: { id, emailVerified }, session: { id: sessionId, userId: id },
});
const mapping = { state: "ready", authUserId: "auth-a", sessionId: "session-a", ownerId: "owner-a", userRecordId: "profile-a" };

describe("explicit app session adapters", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockReset().mockResolvedValue({ data: identity(), error: null });
    mocks.refetch.mockReset().mockResolvedValue(undefined);
    mocks.useSession.mockReturnValue({ data: identity(), isPending: false, error: null });
    mocks.useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "clerk-a", sessionId: "clerk-session" });
    mocks.push.mockReset();
    mocks.reload.mockReset().mockResolvedValue(undefined);
  });

  it("throws without a provider instead of falling back to Clerk", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow("useAppSession requires an AppSessionProvider");
  });

  it.each(["https://other.invalid/", "//other.invalid/", "/\\other.invalid", "/\n/other.invalid", "/\t/other.invalid"])("rejects a non-local sign-in return: %j", (path) => {
    expect(localReturnTo(path)).toBe("/");
  });

  it("keeps Clerk and every existing provider in the default composition", () => {
    render(<Providers><Consumer /></Providers>);
    expect(value().provider).toBe("clerk");
    expect(screen.getByTestId("query-provider").contains(screen.getByTestId("subscription-provider"))).toBe(true);
    expect(screen.getByTestId("subscription-provider").contains(screen.getByRole("status"))).toBe(true);
    expect(screen.getByText("Service worker registration")).toBeTruthy();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("uses real Clerk session and legacy owner IDs without inventing a profile ID", async () => {
    render(<ClerkSessionProvider><Consumer /></ClerkSessionProvider>);
    expect(value()).toMatchObject({ provider: "clerk", status: "ready", authUserId: "clerk-a", ownerId: "clerk-a",
      userRecordId: null, sessionId: "clerk-session", canBookmark: true });
    fireEvent.click(screen.getByText("Sign in"));
    expect(mocks.push).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fspots%2Fone");
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledTimes(1));
  });

  it("uses the official same-origin client and matches fresh auth to the mapping", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(Response.json(mapping));
    render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe("ready"));
    expect(value()).toMatchObject({ provider: "better-auth", authUserId: "auth-a", sessionId: "session-a",
      ownerId: "owner-a", userRecordId: "profile-a", canBookmark: true });
    expect(value().accountKey).toBe(JSON.stringify(["better-auth", "auth-a", "owner-a", "session-a"]));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ basePath: "/api/auth",
      fetchOptions: expect.objectContaining({ baseURL: "/api/auth", credentials: "same-origin", redirect: "error" }) }));
    expect(mocks.getSession).toHaveBeenCalledWith(expect.objectContaining({ query: { disableCookieCache: true } }));
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
  });

  it.each([
    { ...mapping, authUserId: "other" }, { ...mapping, sessionId: "other" },
    { ...mapping, ownerId: "" }, { ...mapping, ownerId: 123 }, { ...mapping, userRecordId: null },
    { ...mapping, userRecordId: {} }, { ...mapping, state: "unknown" }, null,
    { ...mapping, state: "unlinked" }, { ...mapping, state: "incomplete" },
  ])("blocks an invalid or mismatched mapping: %j", async (body) => {
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json(body));
    render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe("blocked"));
    expect(value()).toMatchObject({ canBookmark: false, ownerId: null, accountKey: null });
  });

  it.each([401, 403, 409, 500])("blocks mapping response %s", async (status) => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status }));
    render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe("blocked"));
  });

  it.each(["unlinked", "incomplete"])("exposes %s without bookmark access", async (state) => {
    vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ state, authUserId: "auth-a", sessionId: "session-a" }));
    render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe(state));
    expect(value().canBookmark).toBe(false);
  });

  it.each(["signedout", "unverified", "blocked"])("does not request mappings for %s auth", async (status) => {
    const data = status === "signedout" ? null : identity("auth-a", "session-a", status !== "unverified");
    mocks.useSession.mockReturnValue({ data, isPending: false, error: null });
    mocks.getSession.mockResolvedValue({ data, error: status === "blocked" ? { status: 500 } : null });
    const fetchMock = vi.spyOn(global, "fetch");
    const onSignIn = vi.fn();
    render(<BetterAuthSessionProvider onSignIn={onSignIn}><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe(status));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Sign in"));
    expect(onSignIn).toHaveBeenCalledWith("/spots/one");
  });

  it("blocks when fresh auth differs from the observed session", async () => {
    mocks.getSession.mockResolvedValue({ data: identity("auth-b"), error: null });
    const fetchMock = vi.spyOn(global, "fetch");
    render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe("blocked"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "false", 0])("blocks malformed verification instead of inventing unverified status: %j", async emailVerified => {
    mocks.getSession.mockResolvedValue({ data: { ...identity(), user: { id: "auth-a", emailVerified } }, error: null });
    const fetchMock = vi.spyOn(global, "fetch");
    render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe("blocked"));
    expect(value()).toMatchObject({ authUserId: null, sessionId: null, canBookmark: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds a stalled observer refresh without starting another mapping request", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(Response.json(mapping));
    render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe("ready"));
    mocks.refetch.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      await act(async () => { fireEvent.click(screen.getByText("Refresh")); });
      expect(value().status).toBe("loading");
      await act(async () => { await vi.advanceTimersByTimeAsync(20001); });
      expect(value()).toMatchObject({ status: "blocked", ownerId: null, canBookmark: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mocks.getSession).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("discards a pending mapping when the observed session changes", async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.spyOn(global, "fetch")
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(Response.json({ ...mapping, sessionId: "session-b" }));
    const view = render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    mocks.useSession.mockReturnValue({ data: identity("auth-a", "session-b"), isPending: false, error: null });
    mocks.getSession.mockResolvedValue({ data: identity("auth-a", "session-b"), error: null });
    view.rerender(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    expect(value().canBookmark).toBe(false);
    await waitFor(() => expect(value().sessionId).toBe("session-b"));
    await act(async () => { finish(Response.json(mapping)); });
    expect(value().sessionId).toBe("session-b");
  });

  it("clears ready capabilities while refreshing and blocks network failures", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(Response.json(mapping)).mockRejectedValueOnce(new Error("offline"));
    render(<BetterAuthSessionProvider><Consumer /></BetterAuthSessionProvider>);
    await waitFor(() => expect(value().status).toBe("ready"));
    fireEvent.click(screen.getByText("Refresh"));
    expect(value().canBookmark).toBe(false);
    await waitFor(() => expect(value().status).toBe("blocked"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
