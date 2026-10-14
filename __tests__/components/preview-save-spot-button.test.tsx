import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: { isLoaded: true, isSignedIn: true, user: { id: "owner-a" } }, fetch: vi.fn(), url: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ useUser: () => mocks.user }));
vi.mock("@/lib/app-data/saved-spot-candidate-url", () => ({ savedSpotCandidateUrl: mocks.url }));
import { PreviewSaveSpotButton } from "@/components/spots/preview-save-spot-button";
const id = "11111111-1111-4111-8111-111111111111";
const props = { spotId: id, spotName: "Local Market", actorId: "owner-a" };
const reply = (saved: boolean, marker = "d1-preview") => ({ ok: true, headers: new Headers({ "X-Localley-Data-Source": marker }), json: async () => ({ success: true, saved }) });
beforeEach(() => { mocks.user = { isLoaded: true, isSignedIn: true, user: { id: "owner-a" } }; mocks.url.mockReturnValue("/api/spots/save?data_candidate=d1"); vi.stubGlobal("fetch", mocks.fetch); });
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe("candidate spot saving", () => {
  it("reads, saves and removes with opt-in and actor binding without XP claims", async () => {
    mocks.fetch.mockResolvedValueOnce(reply(false)).mockResolvedValueOnce(reply(true)).mockResolvedValueOnce(reply(false));
    render(<PreviewSaveSpotButton {...props} />);
    const save = await screen.findByRole("button", { name: "Save Local Market" });
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    fireEvent.click(save);
    const remove = await screen.findByRole("button", { name: "Remove Local Market from saved spots" });
    expect(remove.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(remove);
    await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false"));
    expect(mocks.url).toHaveBeenCalledWith(id);
    expect(mocks.fetch.mock.calls[1]).toEqual(["/api/spots/save?data_candidate=d1", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json", "X-Localley-Preview-Actor": "owner-a" }, body: JSON.stringify({ spotId: id }) })]);
    expect(mocks.fetch.mock.calls[2][1].method).toBe("DELETE");
    expect(screen.queryByText(/XP/)).toBeNull();
  });
  it("restores saved status on a fresh mount", async () => {
    mocks.fetch.mockResolvedValue(reply(true)); render(<PreviewSaveSpotButton {...props} />);
    expect(await screen.findByRole("button", { name: /Remove Local Market/ })).toBeTruthy();
  });
  it("locks immediate duplicate clicks and never retries an uncertain write", async () => {
    let finish!: (value: unknown) => void;
    mocks.fetch.mockResolvedValueOnce(reply(false)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<PreviewSaveSpotButton {...props} />);
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button")); fireEvent.click(screen.getByRole("button"));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await act(async () => finish({ ok: false, json: async () => ({ error: "unavailable" }) }));
    expect(await screen.findByText("Save result unknown. Reload to check.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button")); expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["missing marker", "invalid body", "failed read"])("disables mutations after %s", async reason => {
    mocks.fetch.mockResolvedValue(reason === "missing marker" ? reply(false, "supabase") : reason === "invalid body" ? { ...reply(false), json: async () => ({ saved: "false" }) } : { ok: false, json: async () => ({}) });
    render(<PreviewSaveSpotButton {...props} />);
    expect(await screen.findByText("Saving unavailable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button")); expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses lost opt-in without any normal request", async () => {
    mocks.fetch.mockResolvedValue(reply(false)); render(<PreviewSaveSpotButton {...props} />);
    await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
    mocks.url.mockReturnValue(null); fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Saving unavailable.")).toBeTruthy(); expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses another signed-in actor", async () => {
    mocks.user.user.id = "owner-b"; render(<PreviewSaveSpotButton {...props} />);
    expect(await screen.findByText("Saving unavailable.")).toBeTruthy(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("discards a read response after the actor changes", async () => {
    let finish!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<PreviewSaveSpotButton {...props} />);
    mocks.user.user.id = "owner-b"; rerender(<PreviewSaveSpotButton {...props} />);
    await act(async () => finish(reply(true)));
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });
});
