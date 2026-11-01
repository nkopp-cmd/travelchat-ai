import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpotCard } from "@/components/spots/spot-card";
import { LocalleyScale, type Spot } from "@/types";
import { trackSpotEvent } from "@/lib/spot-analytics";
import { SpotEventLink } from "@/components/spots/spot-event-link";

vi.mock("@/lib/spot-analytics", () => ({ trackSpotEvent: vi.fn() }));

vi.mock("@/components/spots/save-spot-button", () => ({ SaveSpotButton: () => <button type="button">Save spot</button> }));

const baseSpot: Spot = {
  id: "spot_ladrio", name: "A very long source-backed place name that must stay readable",
  description: "A tiny kissaten stop for a quiet coffee break. The source also describes its historic interior and evening service.",
  location: { lat: 35.69512, lng: 139.75846, address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo" },
  cityName: "Tokyo", areaName: "Kanda Jinbocho", citySlug: "tokyo", category: "Cafe", subcategories: ["Coffee"],
  localleyScore: LocalleyScale.HIDDEN_GEM, localPercentage: 88, bestTime: "Late afternoon",
  photos: [], googlePlaceId: "ChIJ-ladrio", tips: [], verified: true, trending: true,
};

describe("SpotCard", () => {
  beforeEach(() => {
    vi.mocked(trackSpotEvent).mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "unavailable", photos: [] }) }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each([false, true])("keeps full names and source-backed geography in both layouts (compact %s)", compact => {
    render(<SpotCard spot={baseSpot} compact={compact} />);
    expect(screen.getByRole("heading", { name: baseSpot.name }).textContent).toBe(baseSpot.name);
    expect(screen.getByText("Kanda Jinbocho, Tokyo · Cafe")).toBeTruthy();
    expect(screen.queryByText(baseSpot.location.address)).toBeNull();
    expect(screen.queryByText("Place matched")).toBeNull();
    expect(screen.queryByText("5/6")).toBeNull();
  });
  it("expands the original description and explains verification without inventing an endorsement", () => {
    render(<SpotCard spot={baseSpot} />);
    expect(screen.queryByText(baseSpot.description)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `More about ${baseSpot.name}` }));
    expect(screen.getByText(baseSpot.description)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verified place" }));
    expect(screen.getByText(/Check current hours and access/)).toBeTruthy();
  });
  it("carries the selected spot and real city to planning, with a separate detail action", () => {
    render(<SpotCard spot={baseSpot} />);
    const href = screen.getByRole("link", { name: `Add to trip: ${baseSpot.name}` }).getAttribute("href");
    expect(new URL(href!, "https://localley.io").searchParams.get("spot")).toBe(baseSpot.id);
    expect(new URL(href!, "https://localley.io").searchParams.get("city")).toBe("Tokyo");
    expect(screen.getByRole("link", { name: `Details: ${baseSpot.name}` }).getAttribute("href")).toBe(`/spots/${baseSpot.id}`);
  });
  it("does not disguise missing photography or invent missing geography", async () => {
    render(<SpotCard spot={{...baseSpot, id:"missing", verified:false, cityName:undefined, areaName:undefined, citySlug:undefined}} />);
    await waitFor(() => expect(screen.getByTestId("photo-placeholder").dataset.state).toBe("unavailable"));
    expect(screen.queryByText("Verified place")).toBeNull();
    expect(screen.queryByText(/Location confirmed|Area photo|Unknown city/)).toBeNull();
    expect(screen.getByText("Cafe", {selector:"p"})).toBeTruthy();
  });
  it("identifies community suggestions without implying verification", () => {
    render(<SpotCard spot={{...baseSpot, verified:false, communitySubmitted:true}} />);
    expect(screen.getByLabelText("Community submitted spot")).toBeTruthy();
    expect(screen.queryByText("Verified place")).toBeNull();
  });
  it("reports a card view only once after at least half enters view", () => {
    let notify: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {} disconnect = disconnect;
    });
    const { unmount } = render(<SpotCard spot={baseSpot} />);
    const target = screen.getByTestId("spot-card");
    const intersect = (ratio: number) => act(() => notify([{ target, isIntersecting: true, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver));
    intersect(0.49); expect(trackSpotEvent).not.toHaveBeenCalled();
    intersect(0.5); intersect(1);
    expect(trackSpotEvent).toHaveBeenCalledExactlyOnceWith("card_view", baseSpot.id);
    unmount(); expect(disconnect).toHaveBeenCalled();
  });
  it("does not count a late view after the card unmounts", () => {
    let notify: IntersectionObserverCallback;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {} disconnect() {}
    });
    const { unmount } = render(<SpotCard spot={baseSpot} />);
    const target = screen.getByTestId("spot-card"); unmount();
    act(() => notify([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(trackSpotEvent).not.toHaveBeenCalled();
  });
  it.each(["add_to_trip", "open_detail", "directions"] as const)("reports a real %s link action", event => {
    render(<div onClick={click => click.preventDefault()}><SpotEventLink spotId={baseSpot.id} event={event} href="/spots/example">Open fixture</SpotEventLink></div>);
    fireEvent.click(screen.getByRole("link", { name: "Open fixture" }));
    expect(trackSpotEvent).toHaveBeenCalledExactlyOnceWith(event, baseSpot.id);
  });
});
