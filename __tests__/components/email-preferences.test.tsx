import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmailPreferencesSection } from "@/components/settings/email-preferences";
import { AppSessionProvider } from "@/providers/app-session-provider";
import type { AppSessionValue } from "@/lib/auth/session-contract";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const preferences = { marketing: false, weekly_digest: false, product_updates: true, itinerary_shared: true };
function view(id = "a", status: AppSessionValue["status"] = "ready") {
  const value: AppSessionValue = { provider: "better-auth", status, accountKey: id, sessionId: id, authUserId: id,
    ownerId: id, userRecordId: id, canBookmark: true, refresh: vi.fn(), requestSignIn: vi.fn() };
  return <AppSessionProvider value={value}><EmailPreferencesSection /></AppSessionProvider>;
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); toast.mockReset(); });

it.each([401, 409, 500])("does not display assumed preferences after HTTP %s", async status => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(Response.json({ preferences }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => { render(view()); });
  expect(screen.queryAllByRole("switch")).toHaveLength(0);
  await act(async () => { fireEvent.click(screen.getByText("Retry email preferences")); });
  expect(screen.getByRole("switch", { name: "Marketing Emails" }).getAttribute("aria-checked")).toBe("false");
  expect(fetch.mock.calls[0][1].headers["x-localley-session-id"]).toBe("a");
});

it("waits for confirmed persisted booleans and prevents double submissions", async () => {
  let complete!: (value: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ preferences }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => { render(view()); });
  const button = screen.getByRole("switch", { name: "Marketing Emails" });
  await act(async () => { fireEvent.click(button); fireEvent.click(button); });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(button.getAttribute("aria-checked")).toBe("false");
  expect(button.hasAttribute("disabled")).toBe(true);
  await act(async () => { complete(Response.json({ success: true, preferences: { ...preferences, marketing: true } })); });
  expect(button.getAttribute("aria-checked")).toBe("true");
  expect(toast).toHaveBeenCalledTimes(1);
});

it("suppresses delayed old-account updates and does not show their success", async () => {
  let complete!: (value: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ preferences }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }))
    .mockResolvedValueOnce(Response.json({ preferences }));
  vi.stubGlobal("fetch", fetch);
  const rendered = render(view()); await act(async () => {});
  await act(async () => { fireEvent.click(screen.getByRole("switch", { name: "Marketing Emails" })); });
  await act(async () => { rendered.rerender(view("b")); });
  await act(async () => { complete(Response.json({ success: true, preferences: { ...preferences, marketing: true } })); });
  expect(screen.getByRole("switch", { name: "Marketing Emails" }).getAttribute("aria-checked")).toBe("false");
  expect(toast).not.toHaveBeenCalled();
});

it("clears uncertain writes and requires a read instead of replay", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ preferences })).mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValueOnce(Response.json({ preferences: { ...preferences, marketing: true } }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => { render(view()); });
  await act(async () => { fireEvent.click(screen.getByRole("switch", { name: "Marketing Emails" })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(screen.queryAllByRole("switch")).toHaveLength(0);
  expect(screen.getByRole("alert").textContent).toContain("It may have saved");
  await act(async () => { fireEvent.click(screen.getByText("Retry email preferences")); });
  expect(fetch.mock.calls[2][1].method).toBe("GET");
  expect(screen.getByRole("switch", { name: "Marketing Emails" }).getAttribute("aria-checked")).toBe("true");
  expect(toast).not.toHaveBeenCalled();
});

it.each([{}, { preferences: { ...preferences, marketing: "false" } }])("rejects malformed successful response %j", async body => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(body)));
  await act(async () => { render(view()); });
  expect(screen.queryAllByRole("switch")).toHaveLength(0);
  expect(screen.getByRole("alert").textContent).toContain("Invalid email preferences");
});

it.each(["signedout", "loading", "unlinked", "blocked"] as const)("makes no private requests when %s", async status => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await act(async () => { render(view("a", status)); });
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryAllByRole("switch")).toHaveLength(0);
});
