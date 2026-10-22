import { act, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/met-locationforecast-seoul.json";
import { loadPickConditions, PickAttribution, PickChip, resetPickConditions } from "@/components/landing/pick-conditions";
import { WEEKEND_PICK_SLUGS } from "@/components/landing/weekend-picks-data";
import { pickConditions } from "@/lib/weather/pick-conditions";
import { isPublicRoute } from "@/middleware";

function memoryCache() {
  const store = new Map<string, Response>();
  return {
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { store.set(request.url, response); }),
  };
}

describe("pick conditions data", () => {
  it("gives every pick city its season for the local month and the current MET weather", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));
    const result = await pickConditions(WEEKEND_PICK_SLUGS, { cache: memoryCache(), fetcher: fetcher as never }, new Date("2026-10-22T12:00:00Z"));
    expect(Object.keys(result)).toEqual([...WEEKEND_PICK_SLUGS]);
    expect(result.seoul.season).toEqual({ label: "Autumn foliage", kind: "foliage", score: 5 });
    expect(result.bangkok.season?.kind).toBe("rainy");
    expect(result.seoul.now?.tempC).toBe(Math.round(fixture.properties.timeseries[0].data.instant.details.air_temperature));
    // One upstream call per city grid cell, none per visitor.
    expect(fetcher).toHaveBeenCalledTimes(WEEKEND_PICK_SLUGS.length);
  });

  it("keeps the season when MET is down", async () => {
    const fetcher = vi.fn(async () => new Response("down", { status: 503 }));
    const result = await pickConditions(["seoul"], { cache: memoryCache(), fetcher: fetcher as never }, new Date("2026-04-10T12:00:00Z"));
    expect(result.seoul).toEqual({ season: { label: "Cherry blossom", kind: "blossom", score: 5 }, now: null });
  });

  it("is a public GET route", () => {
    expect(isPublicRoute(new NextRequest("https://www.localley.io/api/conditions"))).toBe(true);
  });
});

describe("pick chips", () => {
  afterEach(() => { resetPickConditions(); vi.unstubAllGlobals(); });

  it("render nothing until the one shared request returns, then the chip and MET credit", async () => {
    const body = { cities: { seoul: { season: { label: "Autumn foliage", kind: "foliage", score: 5 }, now: { tempC: 6, kind: "clear", isNight: true } } } };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<><PickChip slug="seoul" /><PickChip slug="tokyo" /><PickAttribution /></>);
    await act(async () => { await loadPickConditions(fetcher as never); });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/conditions");
    const chips = container.querySelectorAll(".ll-pick-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].getAttribute("data-kind")).toBe("foliage");
    expect(chips[0].textContent).toContain("Autumn foliage");
    expect(chips[0].textContent).toContain("6°");
    expect(screen.getByRole("link", { name: "MET Norway" }).getAttribute("href")).toBe("https://api.met.no/doc/License");
    // Every chip keeps a slot, so the caption does not move when data arrives.
    expect(container.querySelectorAll(".ll-pick-chip-slot")).toHaveLength(2);
  });

  it("show no chip and no credit when the request fails", async () => {
    const fetcher = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("IntersectionObserver", undefined);
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<><PickChip slug="seoul" /><PickAttribution /></>);
    await act(async () => { await loadPickConditions(fetcher as never); });
    expect(container.querySelector(".ll-pick-chip")).toBeNull();
    expect(screen.queryByText(/MET Norway/)).toBeNull();
  });
});
