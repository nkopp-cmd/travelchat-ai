import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({ state: { isLoaded: true, isSignedIn: false } }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => auth.state }));

import { SpotActivities, getSpotActivitiesCopy, pickSpotProduct } from "@/components/spots/spot-activities";

const viator = (productCode: string, title: string) => ({
  id: productCode, productCode, title, priceFrom: 40, currency: "USD", rating: 4.8, reviewCount: 300,
  viatorUrl: `https://www.viator.com/tours/Seoul/x/d973-${productCode}`,
});

describe("SpotActivities", () => {
  it("heading names the spot, never a city list", () => {
    expect(getSpotActivitiesCopy("Gwangjang Market").heading).toBe("Book a tour with Gwangjang Market");
  });

  it("picks one product that fits the spot, none for a free place", () => {
    const list = [viator("P1", "Gwangjang Market Night Food Tour"), viator("P2", "DMZ Day Trip")] as never[];
    expect(pickSpotProduct(list, { name: "Gwangjang Market", category: "Market" })?.productCode).toBe("P1");
    expect(pickSpotProduct(list, { name: "Seoul Forest", category: "Park" })).toBeNull();
  });
});

describe("SpotActivities requests", () => {
  afterEach(() => { vi.unstubAllGlobals(); auth.state = { isLoaded: true, isSignedIn: false }; });

  it("makes no Viator request for signed-out visitors and renders nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    auth.state = { isLoaded: true, isSignedIn: false };
    const { container } = render(<SpotActivities spotId="s1" city="Seoul" spotName="Gwangjang Market" />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches activities for signed-in users", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { activities: [] } })));
    vi.stubGlobal("fetch", fetchMock);
    auth.state = { isLoaded: true, isSignedIn: true };
    render(<SpotActivities spotId="s1" city="Seoul" spotName="Gwangjang Market" category="Market" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/viator/search", expect.objectContaining({ method: "POST" })));
  });

  it("renders one matched card for a signed-in user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: { activities: [viator("P1", "Gwangjang Market Night Food Tour"), viator("P3", "Gwangjang Market Cooking Class")] } }))));
    auth.state = { isLoaded: true, isSignedIn: true };
    const { findAllByRole } = render(<SpotActivities spotId="s1" city="Seoul" spotName="Gwangjang Market" category="Market" />);
    const links = await findAllByRole("link");
    expect(new Set(links.map((l) => l.getAttribute("href"))).size).toBe(1);
  });

  it("makes no request for a free place", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    auth.state = { isLoaded: true, isSignedIn: true };
    render(<SpotActivities spotId="s1" city="Seoul" spotName="Seoul Forest" category="Park" />);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
