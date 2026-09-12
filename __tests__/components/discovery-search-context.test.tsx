import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Home from "@/app/page";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/layout/marketing-navbar", () => ({ MarketingNavbar: () => null }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: false }) }));

it("keeps the selected city when searching discovery", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo cafe weekend/ }));
    fireEvent.change(screen.getByLabelText("Search for a city, food, cafe, or neighborhood"), { target: { value: "  coffee & cake  " } });
    fireEvent.click(screen.getByRole("button", { name: "Search", exact: true }));
    expect(push).toHaveBeenCalledWith("/spots?city=tokyo&search=coffee+%26+cake");
});
