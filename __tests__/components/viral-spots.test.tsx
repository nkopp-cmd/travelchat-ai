import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViralSpots } from "@/components/spots/viral-spots";
import { transformSpot, type RawSpot } from "@/lib/spots/transform";
import fixture from "@/docs/spot-card-public-fixtures.json";

vi.mock("next/link", () => ({
  default: ({ href, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => <a href={href} data-prefetch={String(prefetch)} {...props} />,
}));
vi.mock("@/components/spots/save-spot-button", () => ({ SaveSpotButton: () => <button type="button">Save fixture</button> }));
vi.mock("@/components/spots/spot-photo-image", () => ({ VenueCardPhoto: () => <div>Photo fixture</div> }));

const items = fixture.rows.map((row) => ({
  spot: transformSpot({ ...row, location: null, photos: [], tips: [], subcategories: [] } as RawSpot),
  note: null, event: { slug: "justin-bieber-seoul-2026-10", label: "Justin Bieber in Seoul, Oct 2026" },
}));

describe("viral spots rail", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
  afterEach(() => vi.unstubAllGlobals());
  it("shows each spot with a link to its event page", () => {
    render(<ViralSpots items={items} />);
    const region = screen.getByRole("region", { name: "Where everyone is going" });
    expect(within(region).getAllByTestId("spot-card")).toHaveLength(items.length);
    const events = within(region).getAllByRole("link", { name: "Justin Bieber in Seoul, Oct 2026" });
    expect(events).toHaveLength(items.length);
    expect(events[0].getAttribute("href")).toBe("/trending/justin-bieber-seoul-2026-10");
    expect(within(region).getByRole("link", { name: "All events" }).getAttribute("href")).toBe("/trending");
  });
  it("renders nothing without viral spots", () => {
    render(<ViralSpots items={[]} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
