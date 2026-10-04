import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ host: "localley-next-preview.nkopp.workers.dev", read: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: mocks.host }) }));
vi.mock("@/lib/app-data/preview-guide-application-page", () => ({ previewGuideApplicationPage: mocks.read }));
vi.mock("@/components/guide/source-guide-dashboard", () => ({ default: () => <p>Normal guide dashboard</p> }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));
import GuideDashboardPage from "@/app/guide/dashboard/page";
beforeEach(() => {
  vi.resetAllMocks(); mocks.host = "localley-next-preview.nkopp.workers.dev";
  mocks.read.mockResolvedValue({ kind: "new" });
  vi.stubEnv("AUTH_MAIL_MODE", "outbox"); vi.stubEnv("SUPABASE_READ_ONLY", "true");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No browser API or payment requests allowed"); }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const page = (data_candidate?: string | string[]) => GuideDashboardPage({ searchParams: Promise.resolve({ data_candidate }) });
function candidateLinks() {
  const links = screen.getAllByRole("link");
  expect(links.every(link => link.getAttribute("href")?.endsWith("?data_candidate=d1"))).toBe(true);
  expect(screen.getByRole("link", { name: "Reload dashboard" }).getAttribute("href")).toBe("/guide/dashboard?data_candidate=d1");
  expect(screen.getByRole("link", { name: "Preview settings" }).getAttribute("href")).toBe("/settings?data_candidate=d1");
  expect(fetch).not.toHaveBeenCalled(); expect(screen.queryByText("Normal guide dashboard")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
}
describe("candidate guide dashboard", () => {
  it("shows the verified empty state with flagged apply, settings and real reload links", async () => {
    render(await page("d1")); expect(screen.getByRole("status").textContent).toMatch(/no saved preview application/);
    expect(screen.getByRole("link", { name: "Apply as a guide" }).getAttribute("href")).toBe("/guide/apply?data_candidate=d1");
    candidateLinks(); expect(screen.queryByText("Pending application")).toBeNull();
  });
  it("renders only the saved owned pending details without earnings totals or payment actions", async () => {
    mocks.read.mockResolvedValue({ kind: "pending", bio: "Owned local expertise", cities: ["tokyo"], specialties: ["Culture & History"] });
    render(await page("d1")); expect(screen.getByText("Pending application")).not.toBeNull();
    for (const text of ["Owned local expertise", "tokyo", "Culture & History"]) expect(screen.getByText(text)).not.toBeNull();
    expect(screen.getByRole("link", { name: "View application" }).getAttribute("href")).toBe("/guide/apply?data_candidate=d1");
    expect(screen.getByRole("status").textContent).toMatch(/Approval and payments remain unavailable/);
    expect(screen.queryByText(/\$0|Total earned|Stripe onboarding complete/)).toBeNull(); candidateLinks();
  });
  it("escapes hostile saved text and gives missing specialties a clear value", async () => {
    const bio = '<script>private()&</script>';
    mocks.read.mockResolvedValue({ kind: "pending", bio, cities: ["seoul"], specialties: [] });
    const { container } = render(await page("d1")); expect(screen.getByText(bio)).not.toBeNull();
    expect(container.querySelector("script")).toBeNull(); expect(screen.getByText("None selected")).not.toBeNull(); candidateLinks();
  });
  it.each(["AUTH_MAIL_MODE", "SUPABASE_READ_ONLY"])("refuses missing or unsafe %s without reading or source fallback", async key => {
    vi.stubEnv(key, "off"); render(await page("d1")); expect(screen.getByRole("status").textContent).toMatch(/unavailable for this account/);
    expect(mocks.read).not.toHaveBeenCalled(); expect(screen.queryByRole("link", { name: "Apply as a guide" })).toBeNull(); candidateLinks();
  });
  it("refuses absent safety settings without a source page", async () => {
    vi.stubEnv("AUTH_MAIL_MODE", undefined); vi.stubEnv("SUPABASE_READ_ONLY", undefined);
    render(await page("d1")); expect(screen.getByRole("status").textContent).toMatch(/unavailable for this account/);
    expect(mocks.read).not.toHaveBeenCalled(); candidateLinks();
  });
  it.each(["unverified owner", "foreign secret biography", "rejected secret", "malformed application", "D1 unavailable"])("keeps %s failures private without fallback", async message => {
    mocks.read.mockRejectedValue(new Error(message)); render(await page("d1"));
    expect(screen.getByRole("status").textContent).toMatch(/unavailable for this account/); expect(screen.queryByText(message)).toBeNull(); candidateLinks();
  });
  it.each(["www.localley.io", "localley.io", "localley-next-preview.nkopp.workers.dev.attacker.test", "localley-next-preview.nkopp.workers.dev:443"])("keeps %s on the normal dashboard", async host => {
    mocks.host = host; render(await page("d1")); expect(screen.getByText("Normal guide dashboard")).not.toBeNull(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([undefined, "source", ["source", "d1"], ["", "d1"]])("keeps missing, lost and first-other opt-in normal", async flag => {
    render(await page(flag)); expect(screen.getByText("Normal guide dashboard")).not.toBeNull(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("honors only the first D1 value of repeated flags", async () => {
    render(await page(["d1", "source"])); expect(screen.getByRole("status").textContent).toMatch(/no saved preview application/); candidateLinks();
  });
});
