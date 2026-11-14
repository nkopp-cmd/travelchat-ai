import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
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
  it("renders one static pin for the current record only (no card, no paid photo)", async () => {
    render(<SpotDetailMap lat={37.55} lng={126.98} name="Venue" category="Market" searchUrl="https://www.google.com/maps" />);
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    const props = JSON.parse((await screen.findByTestId("map-props")).textContent!);
    expect(props.spots).toEqual([{ id: "venue", name: "Venue", category: "Market", photos: [], location: { lat: 37.55, lng: 126.98, address: "" } }]);
    expect(props.onSelect).toBeUndefined();
    expect(screen.getByText("Approximate venue pin. Entrance not confirmed.")).toBeTruthy();
    expect(hasValidVenueCoordinates(0, 30)).toBe(true);
  });
  it("mounts the map chunk only when the map nears the viewport and the visitor has scrolled", () => {
    let fire: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    let options: IntersectionObserverInit | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: typeof fire, init?: IntersectionObserverInit) { fire = callback; options = init; }
      observe() {}
      disconnect = disconnect;
    });
    try {
      render(<SpotDetailMap lat={37.55} lng={126.98} name="Venue" searchUrl="https://www.google.com/maps" />);
      expect(screen.queryByTestId("map-props")).toBeNull();
      expect(screen.getByRole("button", { name: "Show map" })).toBeTruthy();
      expect(options?.rootMargin).toBe("300px");
      act(() => fire!([{ isIntersecting: false }]));
      act(() => { window.dispatchEvent(new Event("scroll")); });
      expect(screen.queryByTestId("map-props")).toBeNull();
      expect(screen.getByRole("status").textContent).toBe("Loading map...");
      act(() => fire!([{ isIntersecting: true }]));
      expect(screen.getByTestId("map-props")).toBeTruthy();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("server HTML and the first client render are the same placeholder; no map without a visitor action", async () => {
    // No IntersectionObserver on the server: the map must still wait for an effect, not render in the HTML.
    vi.stubGlobal("IntersectionObserver", undefined);
    try {
      const html = renderToString(<SpotDetailMap lat={37.55} lng={126.98} name="Venue" searchUrl="https://www.google.com/maps" />);
      expect(html).toContain("Show map");
      expect(html).not.toContain("map-props");
      render(<SpotDetailMap lat={37.55} lng={126.98} name="Venue" searchUrl="https://www.google.com/maps" />);
      expect(screen.getByRole("button", { name: "Show map" })).toBeTruthy();
      // A page in the first screen with no visitor action never loads MapLibre (Lighthouse/PSI case).
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(screen.queryByTestId("map-props")).toBeNull();
      act(() => { window.dispatchEvent(new Event("pointerdown")); });
      expect(await screen.findByTestId("map-props")).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
