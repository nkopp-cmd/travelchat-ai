import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyTrendingSpots } from "@/components/spots/weekly-trending-spots";
import { transformSpot, type RawSpot } from "@/lib/spots/transform";
import fixture from "@/docs/spot-card-public-fixtures.json";

vi.mock("next/link", () => ({
  default: ({ href, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => <a href={href} data-prefetch={String(prefetch)} {...props} />,
}));
// This check covers shared card rendering and navigation, not photography or saved-state delivery.
vi.mock("@/components/spots/save-spot-button", () => ({ SaveSpotButton: () => <button type="button">Save fixture</button> }));
vi.mock("@/components/spots/spot-photo-image", () => ({ VenueCardPhoto: () => <div>Photo fixture</div> }));

const items = fixture.rows.map((row, index) => ({
  spot: transformSpot({ ...row, location: null, photos: [], tips: [], subcategories: [] } as RawSpot),
  citySlug: "seoul", rank: index + 1, score: 1, postCount: 1, platformCount: 1,
}));

describe("weekly shared cards in city catalogs", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
  afterEach(() => vi.unstubAllGlobals());
  it("uses the actual shared card and preserves each spot identity", () => {
    render(<WeeklyTrendingSpots items={items} citySlug="seoul" />);
    const cards = screen.getAllByTestId("spot-card");
    expect(cards).toHaveLength(items.length);
    items.forEach((item, index) => {
      const card = within(cards[index]);
      expect(card.getByRole("heading", { name: item.spot.name }).textContent).toBe(item.spot.name);
      const href = card.getByRole("link", { name: `Add to trip: ${item.spot.name}` }).getAttribute("href")!;
      expect(new URL(href, "https://www.localley.io").searchParams.get("spot")).toBe(item.spot.id);
      expect(card.getByRole("link", { name: `Details: ${item.spot.name}` }).getAttribute("href")).toBe(`/spots/${item.spot.id}`);
    });
  });
  it.each(["seoul", "tokyo", "taipei&sort=score"])("retains and safely encodes the selected city %s", citySlug => {
    render(<WeeklyTrendingSpots items={items} citySlug={citySlug} />);
    const target = new URL(screen.getByRole("link", { name: "See all" }).getAttribute("href")!, "https://www.localley.io");
    expect(target.origin).toBe("https://www.localley.io");
    expect(target.pathname).toBe("/spots");
    expect(Object.fromEntries(target.searchParams)).toEqual({ sort: "trending", city: citySlug });
    expect(target.hash).toBe("#spot-results");
  });
  it("keeps the unfiltered catalog link global", () => {
    render(<WeeklyTrendingSpots items={items} />);
    expect(screen.getByRole("link", { name: "See all" }).getAttribute("href")).toBe("/spots?sort=trending#spot-results");
  });
  it("does not invent a carousel when the city has no weekly items", () => {
    render(<WeeklyTrendingSpots items={[]} citySlug="seoul" />);
    expect(screen.queryByRole("heading", { name: "Places worth a detour" })).toBeNull();
    expect(screen.queryByRole("link", { name: "See all" })).toBeNull();
  });
  it("names each carousel and links its buttons to its own accessible track", () => {
    render(<><WeeklyTrendingSpots items={items} citySlug="seoul" /><WeeklyTrendingSpots items={items} citySlug="tokyo" /></>);
    const regions = screen.getAllByRole("region", { name: "Places worth a detour" });
    const ids = regions.map(region => {
      const track = within(region).getByRole("group", { name: "This week’s spots. Use left and right arrows to browse." });
      expect(track.tabIndex).toBe(0);
      for (const name of ["Previous spot", "Next spot"]) {
        expect(within(region).getByRole("button", { name }).getAttribute("aria-controls")).toBe(track.id);
      }
      expect(document.getElementById(region.getAttribute("aria-labelledby")!)?.textContent).toBe("Places worth a detour");
      return track.id;
    });
    expect(new Set(ids).size).toBe(2);
    expect(document.querySelectorAll("[id]").length).toBe(new Set(Array.from(document.querySelectorAll("[id]"), node => node.id)).size);
  });
  it("announces the position in words while keeping the compact visual indicator", () => {
    render(<WeeklyTrendingSpots items={items} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.querySelector('[aria-hidden="true"]')?.textContent).toBe("1/3");
    expect(within(status).getByText("Showing spot 1 of 3")).toBeTruthy();
  });
  it("does not intercept keyboard events from a card action", () => {
    render(<WeeklyTrendingSpots items={items} />);
    const track = screen.getByRole("group", { name: "This week’s spots. Use left and right arrows to browse." });
    const scrollTo = vi.fn(); track.scrollTo = scrollTo;
    const action = within(track).getAllByRole("link", { name: /^Add to trip:/ })[0];
    action.focus();
    expect(fireEvent.keyDown(action, { key: "End" })).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(action);
  });
});
