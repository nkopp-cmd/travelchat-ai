import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hasValidVenueCoordinates, SpotDetailMap } from "@/components/spots/spot-detail-map";

// next/dynamic resolves the pin map lazily; the test renders a stand-in with its props.
vi.mock("next/dynamic", () => ({ default: () => (props: unknown) => <div data-testid="map-props">{JSON.stringify(props)}</div> }));

describe("spot detail map", () => {
  it.each([[NaN, 1], [91, 1], [1, 181], [0, 0], [Infinity, 1]])("rejects invalid coordinates %s,%s", (lat, lng) => {
    expect(hasValidVenueCoordinates(lat, lng)).toBe(false);
    render(<SpotDetailMap lat={lat} lng={lng} name="Venue" searchUrl="https://www.google.com/maps/search/?api=1&query=Venue" />);
    expect(screen.queryByTestId("map-props")).toBeNull();
    expect(screen.getByText("No map pin available.")).toBeTruthy();
    expect(screen.getByRole("link")).toBeTruthy();
  });
  it("renders one static pin for the current record only (no card, no paid photo)", () => {
    render(<SpotDetailMap lat={37.55} lng={126.98} name="Venue" category="Market" searchUrl="https://www.google.com/maps" />);
    const props = JSON.parse(screen.getByTestId("map-props").textContent!);
    expect(props.spots).toEqual([{ id: "venue", name: "Venue", category: "Market", photos: [], location: { lat: 37.55, lng: 126.98, address: "" } }]);
    expect(props.onSelect).toBeUndefined();
    expect(screen.getByText("Approximate venue pin. Entrance not confirmed.")).toBeTruthy();
    expect(hasValidVenueCoordinates(0, 30)).toBe(true);
  });
});
