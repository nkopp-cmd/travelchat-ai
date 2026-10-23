import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));

import { toPlannerCities, type CityWithCount } from "@/lib/cities-catalog";
import { PlannerCitiesContext } from "@/components/itineraries/wizard/planner-cities-context";
import { StepDestination } from "@/components/itineraries/wizard/step-destination";
import { WizardProvider } from "@/components/itineraries/wizard/wizard-context";

const city = (slug: string, spotCount: number, status: CityWithCount["status"]) =>
  ({ slug, name: slug[0].toUpperCase() + slug.slice(1), emoji: "*", vibe: `${slug} vibe`, spotCount, status, neighborhoods: ["x"] }) as unknown as CityWithCount;

afterEach(() => vi.unstubAllGlobals());

describe("planner city list rendered with the page", () => {
  it("matches /api/cities?minSpots=1: visible cities with spots, most spots first, public fields only", () => {
    const list = toPlannerCities([city("tokyo", 429, "recommended"), city("seoul", 386, "recommended"), city("nara", 0, "hidden"), city("jeju", 3, "beta")]);
    expect(list.map((c) => [c.slug, c.spotCount])).toEqual([["tokyo", 429], ["seoul", 386], ["jeju", 3]]);
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
      ? Response.json({ success: true, cities: toPlannerCities([city("bangkok", 317, "recommended")]), total: 1 })
      : new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    render(<PlannerCitiesContext.Provider value={null}><WizardProvider><StepDestination /></WizardProvider></PlannerCitiesContext.Provider>);
    expect(await screen.findByText("Bangkok")).toBeTruthy();
    expect(fetcher.mock.calls.map(([url]) => String(url))).toContain("/api/cities?minSpots=1");
  });
});
