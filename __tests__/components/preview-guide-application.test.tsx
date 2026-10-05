import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ optedIn: true }));
vi.mock("@/lib/app-data/guide-application-candidate-url", () => ({ previewGuideApplicationUrl: () => mocks.optedIn ? "/api/connect/onboard?data_candidate=d1" : null }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
import { PreviewGuideApplication } from "@/components/guide/preview-guide-application";
const reply = () => new Response(JSON.stringify({ status: "pending" }), { headers: { "X-Localley-Data-Source": "d1-preview" } });
beforeEach(() => { mocks.optedIn = true; vi.stubGlobal("fetch", vi.fn(async () => reply())); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fill() {
  fireEvent.change(screen.getByLabelText("About you"), { target: { value: "  My local expertise  " } }); fireEvent.click(screen.getByRole("button", { name: "Seoul" })); fireEvent.click(screen.getByRole("button", { name: "Food & Dining" }));
}
function submit() { fireEvent.submit(screen.getByRole("form", { name: "Preview guide application" })); }
describe("candidate guide form", () => {
  it("validates required biography/city without writing", () => {
    render(<PreviewGuideApplication state={{ kind: "new" }} />); submit(); expect(fetch).not.toHaveBeenCalled(); expect(screen.getByText(/Add a short biography/)).not.toBeNull(); expect(screen.getByLabelText("About you").getAttribute("maxlength")).toBe("2000");
  });
  it("sends one owned flagged application and confirms only the stored response", async () => {
    render(<PreviewGuideApplication state={{ kind: "new" }} />); fill(); submit(); await screen.findByText("Pending application");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledWith("/api/connect/onboard?data_candidate=d1", expect.objectContaining({ method: "POST", body: '{"bio":"My local expertise","cities":["seoul"],"specialties":["Food & Dining"]}' })); expect(screen.queryByRole("form")).toBeNull(); expect(screen.getByText(/Reload to view/)).not.toBeNull();
  });
  it("shows reloaded private pending details without a submit or provider action", () => {
    render(<PreviewGuideApplication state={{ kind: "pending", bio: "Owned saved biography", cities: ["tokyo"], specialties: ["Culture"] }} />); expect(screen.getByText("Owned saved biography")).not.toBeNull(); expect(screen.getByText("tokyo")).not.toBeNull(); expect(screen.queryByRole("button")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks duplicate submissions synchronously", async () => {
    let resolve!: (response: Response) => void; vi.mocked(fetch).mockImplementation(() => new Promise(r => { resolve = r; })); render(<PreviewGuideApplication state={{ kind: "new" }} />); fill(); submit(); submit(); expect(fetch).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: /Saving/ }).hasAttribute("disabled")).toBe(true); resolve(reply()); await screen.findByText("Pending application");
  });
  it("refuses lost opt-in without a source request", async () => {
    render(<PreviewGuideApplication state={{ kind: "new" }} />); fill(); mocks.optedIn = false; submit(); await screen.findByText(/Preview access is unavailable/); expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByText("Pending application")).toBeNull();
  });
  it.each(["refused", "malformed", "external-url", "missing-header", "lost-reply"])("keeps %s save unconfirmed and requires reload without automatic retry", async kind => {
    vi.mocked(fetch).mockImplementation(async () => {
      if (kind === "lost-reply") throw new TypeError("Lost response after commit");
      if (kind === "refused") return new Response('{}', { status: 503 });
      if (kind === "malformed") return new Response('{}', { headers: { "X-Localley-Data-Source": "d1-preview" } });
      if (kind === "external-url") return new Response('{"status":"pending","url":"https://stripe.example"}', { headers: { "X-Localley-Data-Source": "d1-preview" } });
      return new Response('{"status":"pending"}');
    });
    render(<PreviewGuideApplication state={{ kind: "new" }} />); fill(); submit(); await screen.findByText(/Could not confirm the save/); expect(screen.queryByText("Pending application")).toBeNull(); expect(screen.getByRole("button", { name: "Submit preview application" }).hasAttribute("disabled")).toBe(true); submit(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps unavailable accounts out of the form", () => {
    render(<PreviewGuideApplication state={{ kind: "unavailable" }} />); expect(screen.getByText(/unavailable for this account/)).not.toBeNull(); expect(screen.queryByRole("form")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
});
