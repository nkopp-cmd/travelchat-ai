import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SaveSpotButton } from "@/components/spots/save-spot-button";
import { useAppSession } from "@/providers/app-session-provider";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

function Refresh() {
  const session = useAppSession();
  return <button onClick={() => { void session.refresh(); }}>Refresh {session.authUserId}</button>;
}

it("runs the installed Better Auth React client with the existing bookmark control", async () => {
  const date = new Date().toISOString();
  let authUserId = "auth-real-client";
  let sessionId = "session-real-client";
  const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    expect(url.origin).toBe(window.location.origin);
    if (url.pathname === "/api/auth/get-session") return Response.json({
      user: { id: authUserId, email: "test@example.invalid", name: "Test", emailVerified: true, createdAt: date, updatedAt: date },
      session: { id: sessionId, userId: authUserId, token: "test-only", expiresAt: new Date(Date.now() + 3600000).toISOString(), createdAt: date, updatedAt: date },
    });
    if (url.pathname === "/api/session") return Response.json({
      state: "ready", authUserId, sessionId, ownerId: `owner-${authUserId}`, userRecordId: `profile-${authUserId}`,
    });
    if (url.pathname === "/api/spots/save") return Response.json({ saved: init?.method === "POST" });
    throw new Error(`Unexpected path: ${url.pathname}`);
  });
  const { BetterAuthSessionProvider } = await import("@/providers/better-auth-session-provider");
  const view = render(<BetterAuthSessionProvider><SaveSpotButton spotId="one" /><Refresh /></BetterAuthSessionProvider>);
  const saveButton = screen.getByRole("button", { name: "Save one" });
  await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
  fireEvent.click(saveButton);
  await waitFor(() => expect(saveButton.getAttribute("aria-pressed")).toBe("true"));
  const mutation = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  expect(mutation?.[1]?.headers).toMatchObject({ "x-localley-session-id": "session-real-client" });
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("disableCookieCache=true"))).toBe(true);
  authUserId = "auth-new";
  sessionId = "session-new";
  fireEvent.click(screen.getByRole("button", { name: "Refresh auth-real-client" }));
  expect(saveButton.getAttribute("aria-pressed")).toBe("false");
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh auth-new" })).toBeTruthy());
  await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
  expect(saveButton.getAttribute("aria-pressed")).toBe("false");
  view.unmount();
  fetchMock.mockRestore();
});
