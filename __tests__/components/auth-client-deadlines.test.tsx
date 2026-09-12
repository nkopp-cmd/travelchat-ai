import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BetterAuthSessionProvider } from "@/providers/better-auth-session-provider";
import { useAppSession } from "@/providers/app-session-provider";

function Probe() {
  const session = useAppSession();
  return <><output data-user={session.authUserId}>{session.status}</output><button onClick={() => void session.refresh()}>Refresh</button></>;
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it.each(["headers", "body"])("bounds actual SDK observer/refetch/getSession and mapping %s, then recovers", async (phase) => {
  let target = "observer";
  let authCalls = 0;
  let authUserId = "auth";
  const date = new Date().toISOString();
  const fetch = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path === "/api/auth/get-session") authCalls++;
    const stall = path === "/api/session" ? target === "mapping"
      : target === "observer" || target === "refetch" || (target === "getSession" && authCalls === 2);
    if (stall) return phase === "headers" ? new Promise<Response>(() => {}) : new Response(new ReadableStream());
    if (path === "/api/session") return Response.json({ state: "ready", authUserId, sessionId: "session", ownerId: "owner", userRecordId: "profile" });
    return Response.json({ user: { id: authUserId, email: "test@example.invalid", name: "Test", emailVerified: true, createdAt: date, updatedAt: date },
      session: { id: "session", userId: authUserId, token: "test", expiresAt: new Date(Date.now() + 3600000).toISOString(), createdAt: date, updatedAt: date } });
  });
  vi.useFakeTimers();
  const view = render(<BetterAuthSessionProvider><Probe /></BetterAuthSessionProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(20010); });
  expect(screen.getByRole("status").textContent).toBe("blocked");
  for (const next of ["refetch", "getSession", "mapping"]) {
    target = "none";
    await act(async () => { fireEvent.click(screen.getByText("Refresh")); await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByRole("status").textContent).toBe("ready");
    authCalls = 0; target = next;
    await act(async () => { fireEvent.click(screen.getByText("Refresh")); await vi.advanceTimersByTimeAsync(20010); });
    expect(screen.getByRole("status").textContent).toBe("blocked");
  }
  target = "none";
  await act(async () => { fireEvent.click(screen.getByText("Refresh")); await vi.advanceTimersByTimeAsync(10); });
  expect(screen.getByRole("status").textContent).toBe("ready");
  target = "mapping";
  await act(async () => { fireEvent.click(screen.getByText("Refresh")); await vi.advanceTimersByTimeAsync(19000); });
  authUserId = "other-account"; target = "none";
  await act(async () => { fireEvent.click(screen.getByText("Refresh")); await vi.advanceTimersByTimeAsync(1010); });
  expect(screen.getByRole("status").textContent).toBe("ready");
  expect(screen.getByRole("status").getAttribute("data-user")).toBe("other-account");
  expect(fetch).toHaveBeenCalled(); view.unmount();
});
