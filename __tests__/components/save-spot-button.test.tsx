import { act, fireEvent, render as renderComponent, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveSpotButton } from "@/components/spots/save-spot-button";
import { AppSessionProvider } from "@/providers/app-session-provider";
import type { AppSessionValue } from "@/lib/auth/session-contract";
import { useSavedSpot } from "@/hooks/use-saved-spot";

const mockPush = vi.fn();
const mockToast = vi.fn();
let session: AppSessionValue;
const ready = (id = "a", sessionId = "session-a"): AppSessionValue => ({
  ...session, status: "ready", provider: "better-auth", canBookmark: true,
  authUserId: `auth-${id}`, ownerId: `owner-${id}`, userRecordId: `profile-${id}`,
  accountKey: JSON.stringify(["better-auth", id, `owner-${id}`, sessionId]), sessionId,
});
const render = (children: ReactNode) => renderComponent(<AppSessionProvider value={session}>{children}</AppSessionProvider>);

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("SaveSpotButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockToast.mockReset();
    session = { status: "signedout", provider: "clerk", canBookmark: false,
      authUserId: null, sessionId: null, ownerId: null, userRecordId: null, accountKey: null,
      requestSignIn: mockPush, refresh: vi.fn().mockResolvedValue(undefined) };
  });

  it("gives repeated controls distinct names using each spot name", () => {
    render(
      <>
        <SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" />
        <SaveSpotButton spotId="spot-kissa" spotName="Kissa You" />
      </>,
    );

    expect(screen.getByRole("button", { name: "Save LADRIO" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Kissa You" })).toBeTruthy();
  });

  it("returns to the selected spot after sign-in without saving automatically", () => {
    const fetchMock = vi.spyOn(global, "fetch");
    render(<SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" />);
    fireEvent.click(screen.getByRole("button", { name: "Save LADRIO" }));
    expect(mockPush).toHaveBeenCalledWith("/spots/spot-ladrio");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes pressed and loading state while preserving native button behavior", async () => {
    session = ready();

    let resolveSave: ((response: Response) => void) | undefined;
    const pendingSave = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: false }), { status: 200 }))
      .mockReturnValueOnce(pendingSave);

    render(<SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" />);

    const button = screen.getByRole("button", { name: "Save LADRIO" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-busy")).toBe("true");

    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    button.focus();
    fireEvent.click(button, { detail: 0 });

    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);

    resolveSave?.(new Response(JSON.stringify({ saved: true }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByRole("button", {
        name: "Remove LADRIO from saved spots",
      }).getAttribute("aria-pressed")).toBe("true");
    });
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ "x-localley-session-id": "session-a" });
    expect(mockToast.mock.calls[0][0].description).not.toContain("XP");
  });

  it("provides a 44px mobile hit area without changing its layout dimensions", () => {
    render(
      <SaveSpotButton
        spotId="spot-ladrio"
        spotName="LADRIO"
        className="h-7 w-7"
      />,
    );

    const button = screen.getByRole("button", { name: "Save LADRIO" });
    expect(button.className).toContain("after:size-11");
    expect(button.className).toContain("h-7");
    expect(button.className).toContain("w-7");
  });

  it.each(["account", "session", "spot"])("discards pending reads after a %s change", async (change) => {
    session = ready();
    let finish!: (response: Response) => void;
    const fetchMock = vi.spyOn(global, "fetch")
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(Response.json({ saved: false }));
    const view = render(<SaveSpotButton spotId="one" />);
    const next = change === "account" ? ready("b") : change === "session" ? ready("a", "session-b") : session;
    view.rerender(<AppSessionProvider value={next}><SaveSpotButton spotId={change === "spot" ? "two" : "one"} /></AppSessionProvider>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    await act(async () => { finish(Response.json({ saved: true })); });
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    expect(mockToast).not.toHaveBeenCalled();
  });

  it.each(["account", "session"])("discards pending mutations and finalizers after a %s change", async (change) => {
    session = ready();
    let finishOld!: (response: Response) => void;
    let finishNew!: (response: Response) => void;
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json({ saved: false }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve; }))
      .mockResolvedValueOnce(Response.json({ saved: true }));
    const view = render(<SaveSpotButton spotId="one" />);
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    view.rerender(<AppSessionProvider value={change === "account" ? ready("b") : ready("a", "session-b")}><SaveSpotButton spotId="one" /></AppSessionProvider>);
    await act(async () => { finishOld(Response.json({ saved: true })); });
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
    await act(async () => { finishNew(Response.json({ saved: false })); });
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[3][1]?.method).toBe("POST");
  });

  it("clears an old saved heart before the new account's read completes", async () => {
    session = ready();
    let finish!: (response: Response) => void;
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json({ saved: true }))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(Response.json({ saved: true }));
    const view = render(<SaveSpotButton spotId="one" />);
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true"));
    view.rerender(<AppSessionProvider value={ready("b")}><SaveSpotButton spotId="one" /></AppSessionProvider>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { finish(Response.json({ saved: false })); });
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[2][1]?.method).toBe("POST");
  });

  it("suppresses pending mutation errors after unmount", async () => {
    session = ready();
    let fail!: (reason: Error) => void;
    vi.spyOn(global, "fetch").mockResolvedValueOnce(Response.json({ saved: false }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const view = render(<SaveSpotButton spotId="one" />);
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button"));
    view.unmount();
    await act(async () => { fail(new Error("offline")); });
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("returns only current mutation results and serializes calls before rerender", async () => {
    session = ready();
    let finish!: (response: Response) => void;
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(Response.json({ saved: false }))
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(Response.json({ saved: false }))
      .mockResolvedValueOnce(Response.json({ saved: true }));
    const hook = renderHook(() => useSavedSpot("one"), { wrapper: ({ children }) => <AppSessionProvider value={session}>{children}</AppSessionProvider> });
    await waitFor(() => expect(hook.result.current.disabled).toBe(false));
    let old!: Promise<boolean | undefined>;
    let duplicate!: Promise<boolean | undefined>;
    act(() => { old = hook.result.current.toggle(); duplicate = hook.result.current.toggle(); });
    expect(await duplicate).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    session = ready("b");
    hook.rerender();
    await act(async () => { finish(Response.json({ saved: true })); expect(await old).toBeUndefined(); });
    expect(mockToast).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.result.current.disabled).toBe(false));
    await act(async () => { expect(await hook.result.current.toggle()).toBe(true); });
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it.each([500, 401, 403, 409, 428, "malformed"])("requires a fresh read after %s, never a guessed DELETE", async (failure) => {
    session = ready();
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(failure === "malformed" ? Response.json({ saved: "true" }) : new Response(null, { status: failure as number }))
      .mockResolvedValueOnce(Response.json({ saved: false }))
      .mockResolvedValueOnce(Response.json({ saved: true }));
    render(<SaveSpotButton spotId="one" />);
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
    expect(fetchMock.mock.calls[1][1]?.method).toBe("GET");
    expect(mockToast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[2][1]?.method).toBe("POST");
  });

  it.each([401, 403, 409, 428, "malformed"])("clears saved state after mutation failure %s", async (failure) => {
    session = ready();
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json({ saved: true }))
      .mockResolvedValueOnce(failure === "malformed" ? Response.json({ saved: 1 }) : new Response(null, { status: failure as number }))
      .mockResolvedValueOnce(Response.json({ saved: false }));
    render(<SaveSpotButton spotId="one" />);
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false"));
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0].variant).toBe("destructive");
    fireEvent.click(screen.getByRole("button"));
    expect(fetchMock.mock.calls[2][1]?.method).toBe("GET");
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
  });

  it.each([401, 403, 409, 428].flatMap((status) => [
    { status, mutate: false }, { status, mutate: true },
  ]))("refreshes context before retrying status $status, mutation=$mutate", async ({ status, mutate }) => {
    session = ready();
    let finishRefresh!: () => void;
    session.refresh = vi.fn(() => new Promise<void>((resolve) => { finishRefresh = resolve; }));
    const fetchMock = vi.spyOn(global, "fetch");
    if (mutate) fetchMock.mockResolvedValueOnce(Response.json({ saved: true }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(Response.json({ saved: false }));
    const hook = renderHook(() => useSavedSpot("one"), { wrapper: ({ children }) => <AppSessionProvider value={session}>{children}</AppSessionProvider> });
    let mutation: Promise<boolean | undefined> | undefined;
    if (mutate) {
      await waitFor(() => expect(hook.result.current.isSaved).toBe(true));
      act(() => { mutation = hook.result.current.toggle(); });
    }
    await waitFor(() => expect(session.refresh).toHaveBeenCalledTimes(1));
    expect(hook.result.current.isSaved).toBe(false);
    expect(hook.result.current.disabled).toBe(true);
    expect(mockToast).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.retry(); await hook.result.current.toggle(); });
    expect(fetchMock).toHaveBeenCalledTimes(mutate ? 2 : 1);
    await act(async () => { finishRefresh(); await mutation; });
    await waitFor(() => expect(hook.result.current.disabled).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(mutate ? 2 : 1);
    expect(mockToast).toHaveBeenCalledTimes(mutate ? 1 : 0);
    await act(async () => { await hook.result.current.toggle(); });
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method !== "GET")).toHaveLength(mutate ? 1 : 0);
  });

  it.each([false, true])("keeps unknown state blocked after refresh failure, mutation=%s", async (mutate) => {
    session = ready();
    session.refresh = vi.fn().mockRejectedValue(new Error("offline"));
    const fetchMock = vi.spyOn(global, "fetch");
    if (mutate) fetchMock.mockResolvedValueOnce(Response.json({ saved: true }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 428 }));
    const hook = renderHook(() => useSavedSpot("one"), { wrapper: ({ children }) => <AppSessionProvider value={session}>{children}</AppSessionProvider> });
    if (mutate) {
      await waitFor(() => expect(hook.result.current.isSaved).toBe(true));
      await act(async () => { expect(await hook.result.current.toggle()).toBeUndefined(); });
    }
    await waitFor(() => expect(hook.result.current.error).toContain("Could not refresh your account"));
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(hook.result.current.isSaved).toBe(false);
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.disabled).toBe(true);
    await act(async () => { await hook.result.current.retry(); await hook.result.current.toggle(); });
    expect(fetchMock).toHaveBeenCalledTimes(mutate ? 2 : 1);
    expect(mockToast).toHaveBeenCalledTimes(mutate ? 1 : 0);
  });

  it.each(["resolve", "reject"])("suppresses late refresh %s after a scope change", async (outcome) => {
    session = ready();
    let finishRefresh!: () => void;
    let failRefresh!: (error: Error) => void;
    let finishRead!: (response: Response) => void;
    session.refresh = vi.fn(() => new Promise<void>((resolve, reject) => { finishRefresh = resolve; failRefresh = reject; }));
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json({ saved: false }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    const hook = renderHook(() => useSavedSpot("one"), { wrapper: ({ children }) => <AppSessionProvider value={session}>{children}</AppSessionProvider> });
    await waitFor(() => expect(hook.result.current.disabled).toBe(false));
    let mutation!: Promise<boolean | undefined>;
    act(() => { mutation = hook.result.current.toggle(); });
    await waitFor(() => expect(session.refresh).toHaveBeenCalledTimes(1));
    session = ready("b", "session-b");
    hook.rerender();
    await act(async () => {
      if (outcome === "resolve") finishRefresh();
      else failRefresh(new Error("offline"));
      expect(await mutation).toBeUndefined();
    });
    expect(hook.result.current.isSaved).toBe(false);
    expect(hook.result.current.isLoading).toBe(true);
    expect(hook.result.current.disabled).toBe(true);
    expect(hook.result.current.error).toBeNull();
    expect(mockToast).not.toHaveBeenCalled();
    await act(async () => { finishRead(Response.json({ saved: true })); });
    expect(hook.result.current.isSaved).toBe(true);
    expect(hook.result.current.disabled).toBe(false);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("retries a network read failure without refreshing context or writing", async () => {
    session = ready();
    const fetchMock = vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ saved: true }));
    const hook = renderHook(() => useSavedSpot("one"), { wrapper: ({ children }) => <AppSessionProvider value={session}>{children}</AppSessionProvider> });
    await waitFor(() => expect(hook.result.current.error).toBe("offline"));
    await act(async () => { expect(await hook.result.current.toggle()).toBeUndefined(); });
    expect(hook.result.current.isSaved).toBe(true);
    expect(session.refresh).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "GET"]);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it.each(["unverified", "unlinked", "incomplete", "blocked", "error"] as const)("does not fetch for %s accounts", (status) => {
    session = { ...ready(), status, canBookmark: false };
    const fetchMock = vi.spyOn(global, "fetch");
    render(<SaveSpotButton spotId="one" />);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
