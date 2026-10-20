import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CityQuickFilters } from "@/components/spots/city-quick-filters";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/spots",
  useSearchParams: () => new URLSearchParams("city=seoul&page=3&view=list&category=Food"),
}));
vi.mock("@/components/ui/city-image", () => ({ CityImageAvatar: () => null }));
const cities = [{ slug: "seoul", name: "Seoul", count: 1234 }, { slug: "tokyo", name: "Tokyo", count: 4321 }];

describe("city quick filters", () => {
  beforeEach(() => push.mockClear());
  it("exposes the full catalog count separately from city controls", () => {
    render(<CityQuickFilters cities={cities} totalSpots={1234567} />);
    expect(screen.getByRole("status").textContent).toBe("1,234,567 total curated spots");
    expect(screen.getByRole("button", { name: "Seoul 1,234 spots" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Tokyo 4,321 spots" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("keeps category and layout while resetting pagination for another city", () => {
    render(<CityQuickFilters cities={cities} totalSpots={5555} />);
    fireEvent.click(screen.getByRole("button", { name: "Tokyo 4,321 spots" }));
    const target = new URL(push.mock.calls[0][0], "https://www.localley.io");
    expect(Object.fromEntries(target.searchParams)).toEqual({ city: "tokyo", view: "list", category: "Food" });
    expect(push.mock.calls[0][1]).toEqual({ scroll: false });
  });
  it("clears the active city without losing other filters", () => {
    render(<CityQuickFilters cities={cities} totalSpots={5555} />);
    fireEvent.click(screen.getByRole("button", { name: "Seoul 1,234 spots" }));
    const target = new URL(push.mock.calls[0][0], "https://www.localley.io");
    expect(Object.fromEntries(target.searchParams)).toEqual({ view: "list", category: "Food" });
  });
});
