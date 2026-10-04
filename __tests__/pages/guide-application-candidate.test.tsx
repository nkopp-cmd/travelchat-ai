import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ host: "localley-next-preview.nkopp.workers.dev", page: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: mocks.host }) }));
vi.mock("@/lib/app-data/preview-guide-application-page", () => ({ previewGuideApplicationPage: mocks.page }));
vi.mock("@/components/guide/source-guide-application", () => ({ default: () => <p>Normal guide form</p> }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
import GuideApplyPage from "@/app/guide/apply/page";
beforeEach(() => { vi.resetAllMocks(); mocks.host = "localley-next-preview.nkopp.workers.dev"; mocks.page.mockResolvedValue({ kind: "new" }); vi.stubEnv("AUTH_MAIL_MODE", "outbox"); vi.stubEnv("SUPABASE_READ_ONLY", "true"); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const page = (data_candidate?: string | string[]) => GuideApplyPage({ searchParams: Promise.resolve({ data_candidate }) });
describe("guide application page boundary", () => {
  it("shows the candidate form and retained settings flag", async () => {
    render(await page("d1")); expect(screen.getByRole("form", { name: "Preview guide application" })).not.toBeNull(); expect(screen.getByText("Preview settings").getAttribute("href")).toBe("/settings?data_candidate=d1"); expect(screen.queryByText("Normal guide form")).toBeNull();
  });
  it.each(["AUTH_MAIL_MODE", "SUPABASE_READ_ONLY"])("refuses missing %s without entering the normal form", async key => {
    vi.stubEnv(key, "off"); render(await page("d1")); expect(screen.getByText(/unavailable for this account/)).not.toBeNull(); expect(mocks.page).not.toHaveBeenCalled(); expect(screen.queryByRole("form")).toBeNull(); expect(screen.queryByText("Normal guide form")).toBeNull();
  });
  it("keeps private read failures generic without fallback", async () => {
    mocks.page.mockRejectedValue(new Error("private foreign biography")); render(await page("d1")); expect(screen.getByText(/unavailable for this account/)).not.toBeNull(); expect(screen.queryByText("private foreign biography")).toBeNull(); expect(screen.queryByText("Normal guide form")).toBeNull();
  });
  it.each(["www.localley.io", "localley.io", "localley-next-preview.nkopp.workers.dev.attacker.test"])("keeps %s normal", async host => {
    mocks.host = host; render(await page("d1")); expect(screen.getByText("Normal guide form")).not.toBeNull(); expect(mocks.page).not.toHaveBeenCalled();
  });
  it.each([undefined, "source", ["source", "d1"]])("keeps unflagged/first-source preview normal", async flag => {
    render(await page(flag)); expect(screen.getByText("Normal guide form")).not.toBeNull(); expect(mocks.page).not.toHaveBeenCalled();
  });
});
