import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SpotInteractions } from "@/components/spots/spot-interactions";
import { AppSessionProvider } from "@/providers/app-session-provider";
import type { AppSessionValue } from "@/lib/auth/session-contract";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const session: AppSessionValue = {
  provider: "better-auth", status: "ready", accountKey: "opaque", sessionId: "session-a", authUserId: "auth-a",
  ownerId: "owner-a", userRecordId: "profile-a", canBookmark: true, requestSignIn: vi.fn(), refresh: vi.fn(),
};
beforeEach(() => { vi.restoreAllMocks(); toast.mockReset(); });

it.each(["ready", "unverified", "signedout"] as const)("shares without a legacy private write in Better Auth %s mode", async (status) => {
  Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(Response.json({ saved: false }));
  render(<AppSessionProvider value={{ ...session, status, canBookmark: status === "ready" }}><SpotInteractions spotId="one" spotName="One" /></AppSessionProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Share One" }));
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  expect(navigator.share).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls.every(([path]) => String(path).startsWith("/api/spots/save?"))).toBe(true);
  expect(toast.mock.calls[0][0].description).not.toContain("XP");
});

it.each([false, true])("claims Clerk share XP only with confirmed success: %s", async (success) => {
  Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  vi.spyOn(global, "fetch").mockImplementation(async (path) => String(path).includes("gamification")
    ? Response.json({ success, xpAwarded: 10 }) : Response.json({ saved: false }));
  render(<AppSessionProvider value={{ ...session, provider: "clerk" }}><SpotInteractions spotId="one" spotName="One" /></AppSessionProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Share One" }));
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  expect(toast.mock.calls[0][0].description.includes("XP")).toBe(success);
});

it("keeps clipboard sharing available when private writes are blocked", async () => {
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  const fetchMock = vi.spyOn(global, "fetch");
  render(<AppSessionProvider value={{ ...session, status: "blocked", canBookmark: false }}><SpotInteractions spotId="one" spotName="One" /></AppSessionProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Share One" }));
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href);
  expect(fetchMock).not.toHaveBeenCalled();
});
