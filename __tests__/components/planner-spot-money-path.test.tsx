import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerCity } from "@/lib/cities-catalog";

// Money path (push AD2): "Add to trip" on a spot opens /itineraries/new?spot=<id>; the generate body must carry that
// spotId so the route pins the spot (AD1). Without ?spot= the body has no spotId.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn(), funnelSource: () => "direct" }));
import { NewItineraryClient } from "@/app/itineraries/new/planner-client";
import { getQuickStartLabel } from "@/components/itineraries/wizard";

const cities = [
  { slug: "seoul", name: "Seoul", emoji: "*", vibe: "Seoul vibe", spotCount: 386, status: "recommended" },
  { slug: "tokyo", name: "Tokyo", emoji: "*", vibe: "Tokyo vibe", spotCount: 429, status: "recommended" },
] as unknown as PlannerCity[];
const SPOT_ID = "0022dc9c-5f13-41fd-9940-38a190795704";

function stubGenerate() {
  const fetcher = vi.fn(async () => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetcher);
  return () => fetcher.mock.calls
    .filter((call) => String((call as unknown[])[0]).includes("/api/itineraries/generate"))
    .map((call) => JSON.parse(String(((call as unknown[])[1] as RequestInit).body)));
}

async function generateFrom(search: string) {
  window.history.replaceState(null, "", `/itineraries/new${search}`);
  const bodies = stubGenerate();
  render(<NewItineraryClient initialCities={cities} />);
  fireEvent.click(await screen.findByRole("button", { name: /Seoul/ }));
  fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) }));
  return bodies();
}

describe("planner ?spot= reaches the generate body (push AD2)", () => {
  beforeEach(() => { localStorage.clear(); Element.prototype.scrollTo = () => {}; });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); window.history.replaceState(null, "", "/"); });

  it("sends the chosen spotId from ?spot=", async () => {
    const bodies = await generateFrom(`?spot=${SPOT_ID}`);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ city: "Seoul", spotId: SPOT_ID });
  });

  it("sends no spotId without ?spot= or with an invalid one", async () => {
    for (const search of ["", "?spot=not-a-uuid"]) {
      const bodies = await generateFrom(search);
      expect(bodies).toHaveLength(1);
      expect(bodies[0]).toMatchObject({ city: "Seoul" });
      expect(bodies[0]).not.toHaveProperty("spotId");
      document.body.innerHTML = "";
      vi.unstubAllGlobals();
    }
  });
});
