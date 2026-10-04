import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ optedIn: true }));
vi.mock("@/lib/app-data/email-preferences-candidate-url", () => ({ previewEmailPreferencesUrl: () => mocks.optedIn ? "/api/user/email-preferences?data_candidate=d1" : null }));
import { PreviewEmailPreferences } from "@/components/settings/preview-email-preferences";
const defaults = { marketing: true, weekly_digest: true, product_updates: true, itinerary_shared: true };
beforeEach(() => { mocks.optedIn = true; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ preferences: defaults }), { status: 200 }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("preview email choices", () => {
  it("loads exact candidate choices and states delivery is inactive", async () => {
    render(<PreviewEmailPreferences />);await screen.findByRole("switch", { name: "Marketing" });
    expect(screen.getAllByRole("switch")).toHaveLength(4);expect(screen.getByText(/Emails are not sent/)).not.toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/user/email-preferences?data_candidate=d1", expect.objectContaining({ cache: "no-store" }));
  });
  it("saves one field, adopts the stored reply and persists on remount", async () => {
    let stored = { ...defaults };
    vi.mocked(fetch).mockImplementation(async (_url, init) => { if (init?.method === "PUT") stored = { ...stored, ...JSON.parse(String(init.body)).preferences };return new Response(JSON.stringify({ preferences: stored }), { status: 200 }); });
    const first = render(<PreviewEmailPreferences />);fireEvent.click(await screen.findByRole("switch", { name: "Weekly digest" }));
    await screen.findByText("Preview choices saved. No email was sent.");expect(screen.getByRole("switch", { name: "Weekly digest" }).getAttribute("aria-checked")).toBe("false");first.unmount();
    render(<PreviewEmailPreferences />);await waitFor(() => expect(screen.getByRole("switch", { name: "Weekly digest" }).getAttribute("aria-checked")).toBe("false"));
    expect(vi.mocked(fetch).mock.calls[1]).toEqual(["/api/user/email-preferences?data_candidate=d1", expect.objectContaining({ method: "PUT", body: '{"preferences":{"weekly_digest":false}}' })]);
  });
  it.each([new Response('{}', { status: 503 }), new Response('{"preferences":{"marketing":true}}', { status: 200 })])("hides controls on failed or malformed reads", async response => {
    vi.mocked(fetch).mockResolvedValue(response);render(<PreviewEmailPreferences />);await screen.findByText("Preview email preferences are unavailable.");expect(screen.queryByRole("switch")).toBeNull();
  });
  it("keeps saved choices on a failed write", async () => {
    render(<PreviewEmailPreferences />);const toggle = await screen.findByRole("switch", { name: "Marketing" });vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));fireEvent.click(toggle);
    await screen.findByText(/Could not confirm the save/);expect(toggle.getAttribute("aria-checked")).toBe("true");expect(screen.queryByText("Preview choices saved. No email was sent.")).toBeNull();
  });
  it("refuses a lost flag without a source PUT", async () => {
    render(<PreviewEmailPreferences />);const toggle = await screen.findByRole("switch", { name: "Marketing" });mocks.optedIn = false;fireEvent.click(toggle);await screen.findByText(/Could not confirm the save/);expect(fetch).toHaveBeenCalledTimes(1);expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
  it("does not claim an unchanged database or auto-retry a lost save reply", async () => {
    render(<PreviewEmailPreferences />);const toggle = await screen.findByRole("switch", { name: "Marketing" });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("lost response after server commit"));fireEvent.click(toggle);
    await screen.findByText("Could not confirm the save. Reload to check your saved choices.");
    expect(toggle.getAttribute("aria-checked")).toBe("true");expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/stay unchanged/)).toBeNull();expect(screen.queryByText("Preview choices saved. No email was sent.")).toBeNull();
  });
  it("blocks duplicate submits while the stored response is pending", async () => {
    render(<PreviewEmailPreferences />);const toggle = await screen.findByRole("switch", { name: "Marketing" });let resolve!: (r: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => { resolve = r; }));fireEvent.click(toggle);fireEvent.click(toggle);expect(fetch).toHaveBeenCalledTimes(2);expect(toggle.getAttribute("data-disabled")).not.toBeNull();
    resolve(new Response(JSON.stringify({ preferences: { ...defaults, marketing: false } }), { status: 200 }));await screen.findByText("Preview choices saved. No email was sent.");
  });
});
