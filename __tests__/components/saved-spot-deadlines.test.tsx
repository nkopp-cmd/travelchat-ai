import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSavedSpot } from "@/hooks/use-saved-spot";
import { AppSessionProvider } from "@/providers/app-session-provider";
import type { AppSessionValue } from "@/lib/auth/session-contract";
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
function Probe() {
  const spot = useSavedSpot("one");
  return <><output>{JSON.stringify(spot)}</output><button onClick={() => void spot.toggle()}>Toggle</button><button onClick={() => void spot.retry()}>Retry</button></>;
}
function view(id = "a", refresh = vi.fn()) {
  const value: AppSessionValue = { provider: "clerk", status: "ready", accountKey: id, sessionId: id, authUserId: id,
    ownerId: id, userRecordId: null, canBookmark: true, refresh, requestSignIn: vi.fn() };
  return <AppSessionProvider value={value}><Probe /></AppSessionProvider>;
}
const state = () => JSON.parse(screen.getByRole("status").textContent!);
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); toast.mockReset(); });
it.each(["headers", "body"])("recovers bookmark GET %s timeout with a scoped manual read", async (phase) => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockImplementationOnce(() => phase === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream())))
    .mockResolvedValueOnce(Response.json({ saved: true }));
  vi.stubGlobal("fetch", fetch); render(view());
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(state()).toMatchObject({ isLoading: false, disabled: false });
  expect(state().error).toContain("timed out");
  await act(async () => { fireEvent.click(screen.getByText("Retry")); });
  expect(state()).toMatchObject({ isSaved: true, error: null });
  expect(fetch.mock.calls[0][1].headers).toEqual({ "x-localley-session-id": "a" });
});
it.each(["headers", "body"])("does not replay an ambiguous mutation with stalled %s", async (phase) => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ saved: false }))
    .mockImplementationOnce(() => phase === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream())))
    .mockResolvedValueOnce(Response.json({ saved: true }));
  vi.stubGlobal("fetch", fetch); await act(async () => { render(view()); });
  await act(async () => { fireEvent.click(screen.getByText("Toggle")); });
  await act(async () => { await vi.advanceTimersByTimeAsync(100000); });
  expect(state()).toMatchObject({ isLoading: false, disabled: false });
  expect(state().error).toContain("may have been saved"); expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => { fireEvent.click(screen.getByText("Toggle")); });
  expect(fetch.mock.calls[2][1].method).toBe("GET"); expect(state().isSaved).toBe(true);
});
it("suppresses old-account timeout errors and toasts", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ saved: false })).mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValueOnce(Response.json({ saved: true }));
  vi.stubGlobal("fetch", fetch);
  const rendered = render(view()); await act(async () => {});
  await act(async () => { fireEvent.click(screen.getByText("Toggle")); });
  await act(async () => { rendered.rerender(view("b")); });
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(state()).toMatchObject({ isSaved: true, error: null, isLoading: false }); expect(toast).not.toHaveBeenCalled();
});
it("clears busy state when a session refresh stalls and permits a manual preconditioned read", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 428 })).mockResolvedValueOnce(Response.json({ saved: false }));
  const refresh = vi.fn(() => new Promise<void>(() => {}));
  vi.stubGlobal("fetch", fetch); render(view("a", refresh));
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(state()).toMatchObject({ isLoading: false, disabled: false });
  await act(async () => { fireEvent.click(screen.getByText("Retry")); });
  expect(state()).toMatchObject({ isSaved: false, error: null });
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: "GET", headers: { "x-localley-session-id": "a" } });
});
