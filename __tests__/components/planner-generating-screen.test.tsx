import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeneratingScreen, generatingChoices, generatingCity } from "@/components/itineraries/wizard/generating-screen";
import { PlannerCitiesContext } from "@/components/itineraries/wizard/planner-cities-context";
import type { WizardData } from "@/components/itineraries/wizard/wizard-context";
import type { PlannerCity } from "@/lib/cities-catalog";

// eslint-disable-next-line @next/next/no-img-element -- test stub for next/image
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));

const data: WizardData = {
  city: "Seoul", days: 3, budget: "moderate", interests: ["Food & Dining", "Cafes & Coffee", "History"],
  localnessLevel: 4, pace: "moderate", groupType: "friends", tripMode: "single", citySlugs: [], cityNameBySlug: {},
};
const cities: PlannerCity[] = [
  { slug: "seoul", name: "Seoul", emoji: "🇰🇷", vibe: "K-culture & nightlife", heroImage: "https://images.unsplash.com/seoul.jpg", spotCount: 425, status: "recommended" },
  { slug: "tokyo", name: "Tokyo", emoji: "🇯🇵", spotCount: 463, status: "recommended" },
];

// The wait (10-30 s) is where planner visitors leave: it shows their city and choices from the planner HTML.
describe("planner wait screen", () => {
  it("finds the chosen city in the server list (case-insensitive) and only for single-city trips", () => {
    expect(generatingCity({ ...data, city: "seoul " }, cities)?.slug).toBe("seoul");
    expect(generatingCity({ ...data, city: "Hanoi" }, cities)).toBeNull();
    expect(generatingCity(data, null)).toBeNull();
    expect(generatingCity({ ...data, tripMode: "multi" }, cities)).toBeNull();
  });

  it("sums up the visitor's own choices", () => {
    expect(generatingChoices(data)).toBe("3 days · Food & Dining, Cafes & Coffee +1 · Mid budget");
    expect(generatingChoices({ ...data, days: 1, interests: [], budget: "splurge" })).toBe("1 day · Splurge");
  });

  it("shows the city photo, vibe, spot count and choices while the trip builds", () => {
    render(<PlannerCitiesContext.Provider value={cities}><GeneratingScreen data={data} progressMessage="Finding hidden gems..." /></PlannerCitiesContext.Provider>);
    expect(screen.getByRole("heading", { name: "Building your Seoul plan" })).toBeTruthy();
    expect(screen.getByText("K-culture & nightlife")).toBeTruthy();
    expect(screen.getByText("Picking from 425 local spots in Seoul")).toBeTruthy();
    expect(screen.getByText("Finding hidden gems...")).toBeTruthy();
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://images.unsplash.com/seoul.jpg");
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("falls back to the plain loader without a known city (no request of its own)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<GeneratingScreen data={{ ...data, city: "Hanoi" }} progressMessage="Almost there..." />);
    expect(screen.getByRole("heading", { name: "Building your Hanoi plan" })).toBeTruthy();
    expect(screen.queryByText(/local spots in/)).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
