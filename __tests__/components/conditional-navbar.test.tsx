import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConditionalNavbar } from "@/components/layout/conditional-navbar";

const state = vi.hoisted(() => ({ pathname: "/", rendered: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ prefetch: () => {} }) }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function AppNavigation() {
      state.rendered();
      return <nav aria-label="App navigation" />;
    },
}));

beforeEach(() => state.rendered.mockClear());
describe("conditional app navigation", () => {
  it.each(["/sign-in", "/sign-up/verify"])(
    "does not mount app controls on %s",
    (pathname) => {
      state.pathname = pathname;
      render(<ConditionalNavbar />);
      expect(screen.queryByRole("navigation")).toBeNull();
      expect(state.rendered).not.toHaveBeenCalled();
    },
  );
  it("uses one shared navigation on home and after route changes", () => {
    state.pathname = "/";
    const view = render(<ConditionalNavbar />);
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    state.pathname = "/spots";
    view.rerender(<ConditionalNavbar />);
    expect(
      screen.getByRole("navigation", { name: "App navigation" }),
    ).toBeTruthy();
    expect(state.rendered).toHaveBeenCalledTimes(2);
  });
});
