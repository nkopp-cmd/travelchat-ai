import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("uses native selects that pass the chosen city, category, score and sort", () => {
    const onFilterChange = vi.fn();
    render(
      <SpotsFilterBar
        filterOptions={filterOptions}
        currentFilters={defaultFilters}
        onFilterChange={onFilterChange}
        onClearFilters={vi.fn()}
        isPending={false}
      />,
    );

    const score = screen.getByTestId("spots-score-filter-trigger") as HTMLSelectElement;
    expect(score.tagName).toBe("SELECT");
    expect([...score.options].map((option) => option.textContent)).toEqual(["All Scores", "5+ Hidden Gem (7)", "4+ Local fave (10)"]);
    fireEvent.change(score, { target: { value: "4" } });
    expect(onFilterChange).toHaveBeenLastCalledWith("score", 4);
    fireEvent.change(screen.getByLabelText("Select city"), { target: { value: "tokyo" } });
    expect(onFilterChange).toHaveBeenLastCalledWith("city", "tokyo");
    fireEvent.change(screen.getByLabelText("Select category"), { target: { value: "all" } });
    expect(onFilterChange).toHaveBeenLastCalledWith("category", null);
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "trending" } });
    expect(onFilterChange).toHaveBeenLastCalledWith("sortBy", "trending");
  });

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

  it("starts collapsed over the phone and tablet map even with active filters", () => {
    render(
      <SpotsFilterBar
        filterOptions={filterOptions}
        currentFilters={activeFilters}
        onFilterChange={vi.fn()}
        onClearFilters={vi.fn()}
        isPending={false}
        overMap
      />,
    );

    const toggle = screen.getByTestId("spots-mobile-filter-toggle");
    const advanced = document.getElementById("spots-advanced-filters")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Compact chrome: no extra "Edit filters" row, the toggle sits inside the search pill.
    expect(screen.queryByTestId("spots-mobile-filter-row")).toBeNull();
    expect(toggle.parentElement!.className).toContain("lg:hidden");
    expect(advanced.className).toContain("hidden");
    expect(advanced.className).toContain("lg:grid");
    expect(advanced.className).not.toContain("md:grid");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(advanced.className).not.toMatch(/(^| )hidden( |$)/);
  });

  it("floats the filter card over the phone map and closes it after a choice or when the map opens", () => {
    const props = {
      filterOptions,
      onFilterChange: vi.fn(),
      onClearFilters: vi.fn(),
      isPending: false,
    };
    // Opened in the list view (active sort), then the user switches to the map: the card must not stay open.
    const { rerender } = render(<SpotsFilterBar {...props} currentFilters={activeFilters} />);
    const advanced = () => document.getElementById("spots-advanced-filters")!;
    expect(advanced().className).not.toMatch(/(^| )hidden( |$)/);
    rerender(<SpotsFilterBar {...props} currentFilters={activeFilters} overMap />);
    const toggle = screen.getByTestId("spots-mobile-filter-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(advanced().className).toMatch(/(^| )hidden( |$)/);

    // Over the map the card floats (absolute), so opening it never shrinks the map.
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(advanced().className).toContain("max-lg:absolute");
    expect(advanced().className).toContain("max-lg:top-full");

    // A choice closes the card, so the map is visible again at once.
    rerender(<SpotsFilterBar {...props} currentFilters={{ ...activeFilters, category: "cafe" }} overMap />);
    expect(screen.getByTestId("spots-mobile-filter-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(advanced().className).toMatch(/(^| )hidden( |$)/);
  });

  it("shows the city inside the map search pill and counts active filters on the filter icon", () => {
    const onFilterChange = vi.fn();
    render(
      <SpotsFilterBar
        filterOptions={filterOptions}
        currentFilters={activeFilters}
        onFilterChange={onFilterChange}
        onClearFilters={vi.fn()}
        isPending={false}
        overMap
      />,
    );

    const cityToken = screen.getByTestId("spots-pill-city");
    expect(cityToken.textContent).toBe("Seoul");
    expect(screen.getByTestId("spots-filter-badge").textContent).toBe("4");
    expect(screen.getByRole("list", { name: "Active filters" }).className).toContain("max-lg:hidden");
    expect(screen.getByRole("group", { name: "Quick filters" }).className).toContain("max-lg:flex-nowrap");
    fireEvent.click(cityToken);
    expect(onFilterChange).toHaveBeenCalledWith("city", null);
  });

  it("keeps the explorer mounted across filter changes, so the phone map does not reload", () => {
    const page = readFileSync("app/spots/page.tsx", "utf8");
    expect(page).toMatch(/<Suspense fallback={<SpotsLoading \/>}>\s*<SpotsContent/);
    expect(page).not.toMatch(/<Suspense key=/);
  });

  it("renders the city chips in the first HTML, so no late stream shifts the page", () => {
    const page = readFileSync("app/spots/page.tsx", "utf8");
    expect(page).toMatch(/<CityQuickFilters cities={filterOptions\.cities}/);
    expect(page).not.toMatch(/<Suspense[\s\S]{0,400}<CityQuickFilters/);
  });
});
