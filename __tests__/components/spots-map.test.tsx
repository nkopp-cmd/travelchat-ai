import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import SpotsMap, { nextSnap } from "@/components/spots/spots-map";
import { SpotsExplorer } from "@/components/spots/spots-explorer";
import type { Spot } from "@/types";

const state = vi.hoisted(() => ({ query: "", push: vi.fn(), map: vi.fn() }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: state.push }),
    usePathname: () => "/spots",
    useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock("next/dynamic", async () => {
    const { lazy, Suspense } = await import("react");
    return { default: (loader: Parameters<typeof lazy>[0]) => {
        const Component = lazy(loader);
        return function Dynamic(props: Record<string, unknown>) {
            return <Suspense fallback={<p>Loading</p>}><Component {...props} /></Suspense>;
        };
    } };
});
// The real pin layer needs Leaflet and ResizeObserver; this stub keeps the pin -> card contract.
vi.mock("@/components/spots/spot-pin-map", () => ({
    default: (props: { spots: Spot[]; selectedId?: string | null; onSelect?: (id: string | null) => void }) => {
        state.map(props);
        return <div data-testid="map">{props.spots.map((pin, index) => (
            <button key={pin.id} onClick={() => props.onSelect?.(pin.id)}>Marker {index + 1}</button>
        ))}</div>;
    },
}));
const plotted = () => (state.map.mock.lastCall?.[0] as { spots: Spot[] }).spots
    .map((pin) => ({ lat: pin.location.lat, lng: pin.location.lng }));
vi.mock("@/components/spots/spot-card", () => ({
    SpotCard: ({ spot }: { spot: Spot }) => <article data-testid="spot-card"><a href={`/spots/${spot.id}`}>{spot.name}</a></article>,
}));
vi.mock("@/components/spots/spots-filter-bar", () => ({
    SpotsFilterBar: ({ onFilterChange, onClearFilters }: {
        onFilterChange: (key: string, value: string) => void; onClearFilters: () => void;
    }) => <><button onClick={() => onFilterChange("category", "Cafe")}>Filter cafe</button>
        <button onClick={onClearFilters}>Clear filters</button></>,
}));
vi.mock("@/components/spots/spots-pagination", () => ({
    SpotsPagination: ({ onPageChange }: { onPageChange: (page: number) => void }) =>
        <button onClick={() => onPageChange(3)}>Page 3</button>,
}));

function spot(id: string, lat = 37.57, lng = 126.98): Spot {
    return {
        id, name: `Spot ${id}`, description: "Source description", location: { lat, lng, address: "Seoul area" },
        category: "Cafe", subcategories: [], localleyScore: 4, localPercentage: 70,
        bestTime: "Morning", photos: [], tips: [], verified: false, trending: false,
    };
}
const props: ComponentProps<typeof SpotsExplorer> = {
    initialSpots: [spot("a"), spot("b", 37.58, 127)], totalCount: 48, currentPage: 2,
    pageSize: 24, hasMore: false, filterOptions: { cities: [], categories: [], scores: [] },
    currentFilters: { city: "seoul", category: null, score: null, sortBy: "score", search: "", page: 2, limit: 24 },
};

beforeEach(() => {
    vi.clearAllMocks();
    state.query = "";
});

describe("bounded discovery map", () => {
    it("plots only usable coordinates and lists every spot in the sheet", async () => {
        const spots = [spot("missing", 0, 0), spot("a"), spot("invalid", NaN, 127), spot("b", 35, 139), spot("range", 91, 0)];
        render(<SpotsMap spots={spots} city="seoul" currentPage={2} />);
        await screen.findByTestId("map");
        expect(plotted()).toEqual([{ lat: 37.57, lng: 126.98 }, { lat: 35, lng: 139 }]);
        expect(screen.getByText("5 spots")).toBeTruthy();
        expect(screen.getByText("3 without coordinates are listed but not on the map")).toBeTruthy();
        expect(screen.getAllByTestId("spot-card").map((card) => card.textContent))
            .toEqual(["Spot missing", "Spot a", "Spot invalid", "Spot b", "Spot range"]);
        expect(screen.getByRole("link", { name: "Spot b" }).getAttribute("href")).toBe("/spots/b");
    });

    it("lowers the sheet to the map when a pin is chosen and marks that spot in the list", async () => {
        const { container } = render(<SpotsMap spots={[spot("a"), spot("b", 35, 139)]} currentPage={1} />);
        await screen.findByTestId("map");
        const sheet = container.querySelector("[data-snap]")!;
        expect(sheet.getAttribute("data-snap")).toBe("half");
        fireEvent.click(screen.getByRole("button", { name: "Marker 2" }));
        expect(sheet.getAttribute("data-snap")).toBe("map");
        expect(screen.getByRole("link", { name: "Spot b" }).closest("li")?.getAttribute("aria-current")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Show the list" }));
        expect(sheet.getAttribute("data-snap")).toBe("list");
        fireEvent.click(screen.getByRole("button", { name: "Show the map" }));
        expect(sheet.getAttribute("data-snap")).toBe("half");
    });

    it.each(["seoul", "tokyo", undefined])("does not invent a center when no pins exist (%s)", (city) => {
        render(<SpotsMap spots={[spot("missing", 0, 0)]} city={city} currentPage={1} />);
        expect(state.map).not.toHaveBeenCalled();
        expect(screen.getByRole("status").textContent).toContain("No map pins are available");
        expect(screen.getByTestId("spot-card").textContent).toBe("Spot missing");
    });

    it("snaps a drag to the nearest position and a flick one position on", () => {
        expect(nextSnap("half", 0.1, 0)).toBe("list");
        expect(nextSnap("half", 0.55, 0)).toBe("half");
        expect(nextSnap("half", 0.9, 0)).toBe("map");
        expect(nextSnap("list", 0.2, 0.8)).toBe("half");
        expect(nextSnap("map", 0.8, -0.8)).toBe("half");
        expect(nextSnap("map", 1, 0.9)).toBe("map");
        expect(nextSnap("list", 0, -0.9)).toBe("list");
        expect(nextSnap("list", 0.9, 0.8)).toBe("map");
        expect(nextSnap("half", 0.52, 0.8)).toBe("map");
        expect(nextSnap("half", 0.48, -0.8)).toBe("list");
    });

    it("uses real coordinates outside Seoul rather than a fallback city", async () => {
        render(<SpotsMap spots={[spot("tokyo", 35.68, 139.76)]} city="tokyo" currentPage={1} />);
        await screen.findByTestId("map");
        expect(plotted()).toEqual([{ lat: 35.68, lng: 139.76 }]);
    });

    it("does not mount the map in grid/list or for unknown URL views", () => {
        const { rerender } = render(<SpotsExplorer {...props} />);
        for (const view of ["list", "invalid"]) {
            state.query = `view=${view}`;
            rerender(<SpotsExplorer {...props} />);
        }
        expect(state.map).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Grid view" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("preserves filters and page when switching views", async () => {
        state.query = "city=seoul&category=Food&score=4&sort=local&search=tea&page=2";
        const { rerender } = render(<SpotsExplorer {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "Map view" }));
        expect(state.push).toHaveBeenLastCalledWith(`/spots?${state.query}&view=map`, { scroll: false });
        state.query += "&view=map";
        rerender(<SpotsExplorer {...props} />);
        await screen.findByTestId("map");
        fireEvent.click(screen.getByRole("button", { name: "List view" }));
        expect(state.push).toHaveBeenLastCalledWith(`/spots?${state.query.replace("view=map", "view=list")}`, { scroll: false });
    });

    it("loads shared map URLs and preserves map view through filters, pagination, and clearing", async () => {
        state.query = "city=seoul&view=map&page=2";
        render(<SpotsExplorer {...props} />);
        await screen.findByTestId("map");
        expect(screen.getByRole("button", { name: "Map view" }).getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Filter cafe" }));
        expect(state.push).toHaveBeenLastCalledWith("/spots?city=seoul&view=map&category=Cafe", { scroll: false });
        vi.useFakeTimers();
        fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
        expect(state.push).toHaveBeenLastCalledWith("/spots?city=seoul&view=map&page=3", { scroll: false });
        vi.clearAllTimers();
        vi.useRealTimers();
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(state.push).toHaveBeenLastCalledWith("/spots?view=map");
    });

    it("drops the previous selection when the filtered page changes", async () => {
        state.query = "view=map&page=2";
        const { rerender } = render(<SpotsExplorer {...props} />);
        await screen.findByTestId("map");
        fireEvent.click(screen.getByRole("button", { name: "Marker 2" }));
        state.query = "view=map&page=3";
        rerender(<SpotsExplorer {...props} initialSpots={[spot("c")]} currentPage={3} />);
        await waitFor(() => expect(screen.getAllByTestId("spot-card").map((card) => card.textContent)).toEqual(["Spot c"]));
        expect(screen.getByRole("link", { name: "Spot c" }).closest("li")?.getAttribute("aria-current")).toBeNull();
    });

    it("shows the existing honest empty state without mounting a map", () => {
        state.query = "city=seoul&view=map";
        render(<SpotsExplorer {...props} initialSpots={[]} totalCount={0} />);
        expect(screen.getByRole("heading", { name: "No spots found" })).toBeTruthy();
        expect(state.map).not.toHaveBeenCalled();
    });
});
