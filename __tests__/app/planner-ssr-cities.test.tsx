import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
vi.mock("@/lib/cities-catalog", async (orig) => ({ ...(await orig<typeof import("@/lib/cities-catalog")>()), plannerCities: async () => [] }));

import { toPlannerCities, type CityWithCount } from "@/lib/cities-catalog";
import { PLANNER_MIN_SPOTS } from "@/lib/trips/planner-cities";
import { PlannerCitiesContext } from "@/components/itineraries/wizard/planner-cities-context";
import { StepDestination } from "@/components/itineraries/wizard/step-destination";
import { WizardProvider } from "@/components/itineraries/wizard/wizard-context";

const city = (slug: string, spotCount: number, status: CityWithCount["status"]) =>
  ({ slug, name: slug[0].toUpperCase() + slug.slice(1), emoji: "*", vibe: `${slug} vibe`, spotCount, status, neighborhoods: ["x"] }) as unknown as CityWithCount;

afterEach(() => vi.unstubAllGlobals());

describe("planner city list rendered with the page", () => {
  it("lists visible cities that can fill a trip (>= PLANNER_MIN_SPOTS), most spots first, public fields only", () => {
    const list = toPlannerCities([city("tokyo", 429, "recommended"), city("seoul", 386, "recommended"), city("nara", 0, "hidden"),
      city("jeju", 3, "beta"), city("ubud", 1, "available"), city("busan", PLANNER_MIN_SPOTS, "available"), city("kobe", PLANNER_MIN_SPOTS - 1, "available")]);
    expect(list.map((c) => [c.slug, c.spotCount])).toEqual([["tokyo", 429], ["seoul", 386], ["busan", PLANNER_MIN_SPOTS]]);
    expect(Object.keys(list[0]).sort()).toEqual(["emoji", "name", "slug", "spotCount", "status", "vibe"]);
  });

  it("shows the server list at once and never requests /api/cities", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    const cities = toPlannerCities([city("seoul", 386, "recommended"), city("tokyo", 429, "recommended")]);
    render(<PlannerCitiesContext.Provider value={cities}><WizardProvider><StepDestination /></WizardProvider></PlannerCitiesContext.Provider>);
    expect(screen.getByText("Tokyo")).toBeTruthy();
    expect(screen.getByText("Seoul")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/api/cities"))).toEqual([]);
  });

  it("still loads the list itself when the page had none", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("/api/cities")
      ? Response.json({ success: true, cities: [city("bangkok", 317, "recommended"), city("hanoi", 2, "beta")], total: 2 })
      : new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    render(<PlannerCitiesContext.Provider value={null}><WizardProvider><StepDestination /></WizardProvider></PlannerCitiesContext.Provider>);
    expect(await screen.findByText("Bangkok")).toBeTruthy();
    // The API answers every city with a spot; the picker drops the ones that cannot fill a trip.
    expect(screen.queryByText("Hanoi")).toBeNull();
    expect(fetcher.mock.calls.map(([url]) => String(url))).toContain("/api/cities?minSpots=1");
  });

  it("clears a ?city= the planner does not offer and asks for a listed city (Push DD3); a listed city stays chosen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const list = toPlannerCities([city("seoul", 386, "recommended"), city("tokyo", 429, "recommended")]);
    const { unmount } = render(<PlannerCitiesContext.Provider value={list}><WizardProvider initialData={{ city: "Nara" }}><StepDestination /></WizardProvider></PlannerCitiesContext.Provider>);
    expect((await screen.findByTestId("planner-unplannable-city")).textContent).toBe("Localley cannot plan Nara yet. Pick a city below for your free plan.");
    expect(screen.queryByText(/selected/i)).toBeNull();
    unmount();
    render(<PlannerCitiesContext.Provider value={list}><WizardProvider initialData={{ city: "tokyo" }}><StepDestination /></WizardProvider></PlannerCitiesContext.Provider>);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("planner-unplannable-city")).toBeNull();
  });

  it("offers a one-tap swap to the nearest planner city for an unplannable ?city= (Push DD3)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const list = toPlannerCities([city("tokyo", 429, "recommended"), city("osaka", 120, "recommended")]);
    render(<PlannerCitiesContext.Provider value={list}><WizardProvider initialData={{ city: "Nara" }}><StepDestination /></WizardProvider></PlannerCitiesContext.Provider>);
    const swap = await screen.findByTestId("planner-nearby-swap");
    expect(swap.textContent).toBe("Plan Osaka instead");
    expect(screen.getByTestId("planner-unplannable-city").textContent).toMatch(/^Localley cannot plan Nara yet\. Osaka is \d+ km away\./);
    fireEvent.click(swap);
    expect(screen.queryByTestId("planner-unplannable-city")).toBeNull();
    expect(screen.getByText(/selected/i)).toBeTruthy();
  });

  it("is the page's one <h1> (the step heading) so the free-trip landing has a main heading", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    render(<PlannerCitiesContext.Provider value={toPlannerCities([city("seoul", 386, "recommended")])}><WizardProvider><StepDestination /></WizardProvider></PlannerCitiesContext.Provider>);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Where to?"]);
  });

  it("has its own title, self canonical and a free-offer schema (not the home page metadata)", async () => {
    const { metadata, default: Page } = await import("@/app/itineraries/new/page");
    const title = (metadata.title as { absolute: string }).absolute;
    expect(title).toMatch(/^Free trip planner/);
    expect(title.length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeGreaterThanOrEqual(50);
    expect(String(metadata.description).length).toBeLessThanOrEqual(170);
    expect(metadata.alternates?.canonical).toBe("https://www.localley.io/itineraries/new");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    Element.prototype.scrollTo = () => {};
    const { container } = render(await Page());
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld).toMatchObject({ "@type": "WebApplication", url: "https://www.localley.io/itineraries/new", offers: { price: 0 } });
  });

  it("renders per request (edge-cached), never as ISR: the build has no D1, so ISR shipped initialCities null", async () => {
    const mod = await import("@/app/itineraries/new/page");
    expect((mod as { dynamic?: string }).dynamic).toBe("force-dynamic");
    expect("revalidate" in mod).toBe(false);
  });
});
