import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StopBookingCard, TripBookingProvider, TripChecklist, computeTripMatches } from "@/components/booking/trip-booking";
import type { ViatorActivity } from "@/types/viator";

const activity = (productCode: string, title: string, priceFrom = 45): ViatorActivity =>
  ({
    id: productCode, productCode, title, priceFrom, currency: "USD", rating: 4.8, reviewCount: 900,
    viatorUrl: `https://www.viator.com/tours/Seoul/x/d973-${productCode}`,
  }) as unknown as ViatorActivity;

const products = [
  activity("P1", "Gwangjang Market Night Food Tour"),
  activity("P2", "Gyeongbokgung Palace Guided Tour with Hanbok"),
];

describe("computeTripMatches", () => {
  it("gives a paid stop its match and a free stop nothing", () => {
    const days = [[
      { name: "Gwangjang Market", category: "food", cost: "₩15,000" },
      { name: "Cheonggyecheon Stream", category: "walk" },
    ]];
    const [day] = computeTripMatches(days, products);
    expect(day[0]?.productCode).toBe("P1");
    expect(day[1]).toBeNull();
  });

  it("ignores products that cannot render (no viator.com link)", () => {
    const broken = { ...products[0], viatorUrl: "https://example.com/x" } as ViatorActivity;
    const [day] = computeTripMatches([[{ name: "Gwangjang Market", category: "food", cost: "$10" }]], [broken]);
    expect(day[0]).toBeNull();
  });
});

describe("TripBookingProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches once and renders the card under the paid stop only", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { activities: products } })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TripBookingProvider city="Seoul" days={[[{ name: "Gwangjang Market", category: "food", cost: "$10" }, { name: "Seoul Forest", category: "park" }]]}>
        <div data-testid="stop-0"><StopBookingCard dayIndex={0} stopIndex={0} /></div>
        <div data-testid="stop-1"><StopBookingCard dayIndex={0} stopIndex={1} /></div>
      </TripBookingProvider>,
    );
    await waitFor(() => expect(screen.getByText("Gwangjang Market Night Food Tour")).toBeTruthy());
    expect(screen.getByTestId("stop-1").innerHTML).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("/api/viator/search?destination=Seoul&limit=30");
  });

  it("makes no request when every stop is free", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TripBookingProvider city="Seoul" days={[[{ name: "Seoul Forest", category: "park" }, { name: "Bukchon", category: "neighborhood", cost: "Free" }]]}>
        <StopBookingCard dayIndex={0} stopIndex={0} />
      </TripBookingProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing without a provider or after a failed search", async () => {
    const { container } = render(<StopBookingCard dayIndex={0} stopIndex={0} />);
    expect(container.innerHTML).toBe("");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const view = render(
      <TripBookingProvider city="Seoul" days={[[{ name: "Gwangjang Market", category: "food", cost: "$10" }]]}>
        <div data-testid="paid"><StopBookingCard dayIndex={0} stopIndex={0} /></div>
      </TripBookingProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(view.getByTestId("paid").innerHTML).toBe("");
  });

  it("checklist lists matched stops once, totals per person and keeps booked marks on the device", async () => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: { activities: products } }))));
    const days = [
      [{ name: "Gwangjang Market", category: "food", cost: "$10" }, { name: "Seoul Forest", category: "park" }],
      [{ name: "Gyeongbokgung Palace", category: "culture", cost: "₩3,000" }],
    ];
    const view = render(
      <TripBookingProvider city="Seoul" days={days}>
        <TripChecklist itineraryId="trip-1" />
      </TripBookingProvider>,
    );
    await waitFor(() => expect(screen.getByText("Bookings for this trip")).toBeTruthy());
    expect(screen.getByText("Book early")).toBeTruthy();
    expect(screen.getByText(/0 of 2 booked · \$90 of \$90 per person left to book/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Gwangjang Market Night Food Tour/));
    expect(screen.getByText(/1 of 2 booked · \$45 of \$90/)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("localley:booked:trip-1") ?? "[]")).toEqual(["P1"]);
    expect(screen.getAllByText("Check availability")).toHaveLength(1);
    view.unmount();
  });

  it("checklist renders nothing when no stop matched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const view = render(
      <TripBookingProvider city="Seoul" days={[[{ name: "Gwangjang Market", category: "food", cost: "$10" }]]}>
        <div data-testid="list"><TripChecklist itineraryId="trip-2" /></div>
      </TripBookingProvider>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(view.getByTestId("list").innerHTML).toBe("");
  });
});
