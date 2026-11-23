import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpotsPagination, spotsPageHref } from "@/components/spots/spots-pagination";
import { spotsHubPagePath } from "@/lib/seo/spots-hub-page";

const hrefFor = (page: number) => spotsPageHref("/spots", "city=seoul&page=2", page);

describe("spots pagination links (DA2)", () => {
  it("builds page URLs that keep filters and drop page 1", () => {
    expect(spotsPageHref("/spots", "city=seoul&category=Food&page=3", 1)).toBe("/spots?city=seoul&category=Food");
    expect(spotsPageHref("/spots", "city=seoul", 4)).toBe("/spots?city=seoul&page=4");
    expect(spotsPageHref("/spots", "", 1)).toBe("/spots");
  });

  it("renders crawlable anchors for other pages, prev and next", () => {
    render(<SpotsPagination currentPage={2} totalCount={100} pageSize={20} onPageChange={() => {}} isPending={false} hrefFor={hrefFor} />);
    expect(screen.getByRole("link", { name: "Page 1" }).getAttribute("href")).toBe("/spots?city=seoul");
    expect(screen.getByRole("link", { name: "Page 3" }).getAttribute("href")).toBe("/spots?city=seoul&page=3");
    expect(screen.getByRole("link", { name: "Previous page" }).getAttribute("rel")).toBe("prev");
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toBe("/spots?city=seoul&page=3");
    // The current page is not a link.
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page");
  });

  it("keeps client navigation on a plain click and the browser default on a modified click", () => {
    const onPageChange = vi.fn();
    render(<SpotsPagination currentPage={1} totalCount={100} pageSize={20} onPageChange={onPageChange} isPending={false} hrefFor={hrefFor} />);
    const next = screen.getByRole("link", { name: "Next page" });
    expect(fireEvent.click(next)).toBe(false);
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(fireEvent.click(next, { ctrlKey: true })).toBe(true);
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Previous page" })).toHaveProperty("disabled", true);
  });

  it("gives page 2+ a self canonical and its own title", () => {
    expect(spotsHubPagePath("/spots?city=seoul", "2")).toEqual({ page: 2, path: "/spots?city=seoul&page=2", titleSuffix: " (page 2)" });
    expect(spotsHubPagePath("/spots", "3").path).toBe("/spots?page=3");
    expect(spotsHubPagePath("/spots?city=seoul", undefined).path).toBe("/spots?city=seoul");
    expect(spotsHubPagePath("/spots?city=seoul", "abc").path).toBe("/spots?city=seoul");
    expect(spotsHubPagePath("/spots?city=seoul", "1").titleSuffix).toBe("");
  });
});
