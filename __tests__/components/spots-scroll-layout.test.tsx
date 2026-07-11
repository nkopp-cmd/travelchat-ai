import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SpotsLayout from "@/app/spots/layout";
import { MainContentShell } from "@/components/layout/main-content-shell";
import { SpotsExplorer } from "@/components/spots/spots-explorer";
import type { Spot } from "@/types";
import type { FilterOptions, SpotsFilterState } from "@/lib/spots/types";

const { routerPush } = vi.hoisted(() => ({
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => "/spots",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <aside>Sidebar</aside>,
}));

vi.mock("@/components/layout/app-background", () => ({
  AppBackground: ({
    children,
    className,
    contentClassName,
  }: {
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
  }) => (
    <div className={className}>
      <div className={contentClassName}>{children}</div>
    </div>
  ),
}));

vi.mock("@/components/spots/spot-card", () => ({
  SpotCard: () => <article>Spot</article>,
}));

vi.mock("@/components/spots/spots-filter-bar", () => ({
  SpotsFilterBar: () => <div>Filters</div>,
}));

vi.mock("@/components/spots/spots-pagination", () => ({
  SpotsPagination: ({ onPageChange }: { onPageChange: (page: number) => void }) => (
    <button type="button" onClick={() => onPageChange(2)}>
      Page 2
    </button>
  ),
}));

vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

const filterOptions: FilterOptions = {
  cities: [],
  categories: [],
  scores: [],
};

const currentFilters: SpotsFilterState = {
  city: null,
  category: null,
  score: null,
  sortBy: "score",
  search: "",
  page: 1,
  limit: 24,
};

describe("spots scroll layout", () => {
  it("keeps the root shell as the only main landmark and scroll host", () => {
    render(
      <MainContentShell>
        <SpotsLayout>
          <p>Spots content</p>
        </SpotsLayout>
      </MainContentShell>,
    );

    const mainLandmarks = screen.getAllByRole("main");
    const main = mainLandmarks[0];

    expect(mainLandmarks).toHaveLength(1);
    expect(main.id).toBe("main-content");
    expect(main.hasAttribute("data-main-scroll-host")).toBe(true);
    expect(main.className).toContain("overflow-y-auto");
    expect(screen.getByText("Spots content").parentElement?.className).not.toContain(
      "overflow-y-auto",
    );
  });

  it("scrolls pagination against the results header's actual host", () => {
    vi.useFakeTimers();

    const host = document.createElement("main");
    const container = document.createElement("div");
    const scrollTo = vi.fn();
    host.setAttribute("data-main-scroll-host", "");
    host.scrollTop = 100;
    host.scrollTo = scrollTo;
    host.getBoundingClientRect = () =>
      ({ top: 50, right: 500, bottom: 650, left: 0, width: 500, height: 600, x: 0, y: 50, toJSON: () => ({}) });
    host.appendChild(container);
    document.body.appendChild(host);

    render(
      <SpotsExplorer
        initialSpots={[{ id: "spot-1" } as Spot]}
        totalCount={48}
        currentPage={1}
        pageSize={24}
        hasMore
        filterOptions={filterOptions}
        currentFilters={currentFilters}
      />,
      { container },
    );

    const resultsHeader = screen.getByText("Showing 1-24 of 48 spots").parentElement
      ?.parentElement as HTMLElement;
    resultsHeader.getBoundingClientRect = () =>
      ({ top: 300, right: 500, bottom: 340, left: 0, width: 500, height: 40, x: 0, y: 300, toJSON: () => ({}) });

    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    vi.advanceTimersByTime(80);

    expect(routerPush).toHaveBeenCalledWith("/spots?page=2", { scroll: false });
    expect(scrollTo).toHaveBeenCalledWith({ top: 334, behavior: "smooth" });

    host.remove();
    vi.useRealTimers();
  });
});
