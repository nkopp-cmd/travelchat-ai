import { render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/met-locationforecast-seoul.json";
import { TripOutlook } from "@/components/itineraries/wizard/trip-outlook";
import { cityOutlook, resolveOutlookCity } from "@/lib/weather/trip-outlook";
import { tripOutlook, type CityOutlook } from "@/lib/weather/trip-outlook-days";
import { isPublicRoute } from "@/middleware";

function memoryCache() {
  const store = new Map<string, Response>();
  return {
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { store.set(request.url, response); }),
  };
}

const metFetcher = () => vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));

describe("trip outlook data", () => {
  it("answers only for reviewed season-table cities, by slug or by name", () => {
    expect(resolveOutlookCity("seoul")?.slug).toBe("seoul");
    expect(resolveOutlookCity("Tokyo")?.slug).toBe("tokyo");
    expect(resolveOutlookCity("Atlantis")).toBeUndefined();
  });

  it("returns 12 season months and the MET days for a city, and null for an unknown one", async () => {
    const fetcher = metFetcher();
    const outlook = (await cityOutlook("Seoul", { cache: memoryCache(), fetcher: fetcher as never, now: Date.parse(fixture.properties.timeseries[0].time) }))!;
    expect(outlook.months).toHaveLength(12);
    expect(outlook.months[3]).toEqual({ label: "Cherry blossom", kind: "blossom", tempC: [8, 18] });
    expect(outlook.forecast).toHaveLength(7);
    expect(await cityOutlook("Atlantis", { fetcher: fetcher as never })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("uses the forecast inside the 7-day window and the usual season after it", async () => {
    const outlook = (await cityOutlook("seoul", { cache: memoryCache(), fetcher: metFetcher() as never, now: Date.parse(fixture.properties.timeseries[0].time) }))!;
    const last = outlook.forecast[6].date;
    const days = tripOutlook(last, 3, outlook);
    expect(days.map((day) => day.source)).toEqual(["forecast", "season", "season"]);
    expect(days[1]).toMatchObject({ source: "season", season: { kind: outlook.months[Number(days[1].date.slice(5, 7)) - 1].kind } });
    expect(tripOutlook("2027-04-30", 2, outlook).map((day) => day.date)).toEqual(["2027-04-30", "2027-05-01"]);
    expect(tripOutlook("not-a-date", 3, outlook)).toEqual([]);
  });

  it("serves the route publicly for the anonymous planner", () => {
    expect(isPublicRoute(new NextRequest("https://www.localley.io/api/conditions/seoul"))).toBe(true);
  });
});

describe("TripOutlook", () => {
  const outlook: CityOutlook = {
    slug: "seoul",
    name: "Seoul",
    months: Array.from({ length: 12 }, (_, index) => ({ label: index === 9 ? "Autumn foliage" : "Other", kind: index === 9 ? "foliage" : "mild", tempC: [10, 20] as [number, number] })),
    forecast: [{ date: "2026-10-24", minC: 9, maxC: 17, kind: "rain", precipMm: 4.2 }],
  };

  it("fetches nothing until a start date is chosen", () => {
    const fetcher = vi.fn();
    const { container } = render(<TripOutlook city="Seoul" days={3} fetcher={fetcher} />);
    expect(container.innerHTML).toBe("");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("shows one tile per trip day: forecast first, then the usual season", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(outlook), { status: 200 }));
    render(<TripOutlook city="Seoul" startDate="2026-10-24" days={2} fetcher={fetcher as never} />);
    expect(await screen.findByText("Your days in Seoul")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith("/api/conditions/Seoul", expect.anything());
    const tiles = screen.getAllByRole("listitem");
    expect(tiles).toHaveLength(2);
    expect(tiles[0].textContent).toContain("Sat 24");
    expect(tiles[0].textContent).toContain("17°");
    expect(tiles[0].textContent).toContain("Rain, 4.2 mm rain");
    expect(tiles[1].textContent).toContain("Autumn foliage");
    expect(tiles[1].textContent).toContain("usually 10–20°");
    expect(screen.getByRole("link", { name: "MET Norway" })).toBeTruthy();
  });

  it("renders nothing when the city has no outlook", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 404 }));
    const { container } = render(<TripOutlook city="Atlantis" startDate="2026-10-24" days={2} fetcher={fetcher as never} />);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(container.innerHTML).toBe("");
  });
});
