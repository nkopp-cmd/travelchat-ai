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

  it("shows the GetYourGuide link to signed-out visitors without a Viator request (DR1)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://www.getyourguide.com/s/?q=Gyeongbokgung+Palace+Seoul&partner_id=AB12CDE&cmp=localley-spot";
    const { findByTestId } = render(<SpotActivities spotId="s1" city="Seoul" spotName="Gyeongbokgung Palace" category="Palace" gygUrl={url} />);
    const link = await findByTestId("spot-gyg-link");
    expect(link.getAttribute("href")).toBe(url);
    expect(link.getAttribute("rel")).toContain("sponsored");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/viator/search", expect.anything());
    link.click();
    const body = JSON.parse((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ partner: "getyourguide", trackingId: "getyourguide-s1-spot", eventType: "click" });
  });

  it("hides the GetYourGuide link on a free place", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(<SpotActivities spotId="s1" city="Seoul" spotName="Seoul Forest" category="Park" gygUrl="https://www.getyourguide.com/s/?q=x" />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
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
