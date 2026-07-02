import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpotsFilterBar } from "@/components/spots/spots-filter-bar";
import type { FilterOptions, SpotsFilterState } from "@/lib/spots/types";

vi.mock("@/components/ui/city-image", () => ({
  CityImageAvatar: ({ city, className }: { city: string; className?: string }) => (
    <span className={className}>{city.slice(0, 1)}</span>
  ),
}));

const filterOptions: FilterOptions = {
  cities: [
    { slug: "seoul", name: "Seoul", emoji: "KR", count: 24 },
    { slug: "tokyo", name: "Tokyo", emoji: "JP", count: 18 },
  ],
  categories: [
    { name: "Food", count: 12 },
    { name: "Cafe", count: 9 },
  ],
  scores: [
    { value: 5, label: "Hidden Gem", count: 7 },
    { value: 4, label: "Local Favorite", count: 10 },
  ],
};

const activeFilters: SpotsFilterState = {
  city: "seoul",
  category: "Food",
  score: 5,
  sortBy: "trending",
  search: "",
  page: 1,
  limit: 24,
};

const defaultFilters: SpotsFilterState = {
  city: null,
  category: null,
  score: null,
  sortBy: "score",
  search: "",
  page: 1,
  limit: 24,
};

describe("SpotsFilterBar", () => {
  it("keeps mobile filter controls from overlapping active score controls", () => {
    render(
      <SpotsFilterBar
        filterOptions={filterOptions}
        currentFilters={activeFilters}
        onFilterChange={vi.fn()}
        onClearFilters={vi.fn()}
        isPending={false}
      />,
    );

    const mobileRow = screen.getByTestId("spots-mobile-filter-row");
    const mobileToggle = screen.getByTestId("spots-mobile-filter-toggle");
    const mobileClear = screen.getByTestId("spots-mobile-clear-filters");
    const scoreTrigger = screen.getByTestId("spots-score-filter-trigger");

    expect(mobileRow.className).toContain(
      "grid-cols-[minmax(0,1fr)_2.25rem]",
    );
    expect(mobileToggle.className).toContain("w-full");
    expect(mobileToggle.className).toContain("overflow-hidden");
    expect(mobileClear.className).toContain("justify-self-end");
    expect(scoreTrigger.className).toContain("max-w-full");
    expect(scoreTrigger.className).toContain("overflow-hidden");
    expect(screen.getByText("Edit filters")).toBeTruthy();
  });

  it("lets the mobile filter toggle use the full row when clear is hidden", () => {
    render(
      <SpotsFilterBar
        filterOptions={filterOptions}
        currentFilters={defaultFilters}
        onFilterChange={vi.fn()}
        onClearFilters={vi.fn()}
        isPending={false}
      />,
    );

    const mobileRow = screen.getByTestId("spots-mobile-filter-row");

    expect(mobileRow.className).toContain("grid-cols-1");
    expect(screen.queryByTestId("spots-mobile-clear-filters")).toBeNull();
    expect(screen.getByText("Filters")).toBeTruthy();
  });
});
