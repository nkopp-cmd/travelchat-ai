import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  LandingExploreLink,
  LandingPlanner,
  LandingPresets,
  LandingSearch,
  LandingTripBuilder,
} from "@/components/landing/planner";
import { LandingHero } from "@/components/landing/hero";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} href={String(href)} data-prefetch={String(prefetch)} />
  ),
}));
vi.mock("@/components/ui/city-image", () => ({
  CityImageAvatar: () => <span />,
}));

const cities = [
  { name: "Seoul", slug: "seoul", vibe: "Coffee and food" },
  { name: "Tokyo", slug: "tokyo", vibe: "Small streets" },
  { name: "Bangkok", slug: "bangkok", vibe: "Markets" },
];
function mount() {
  return render(
    <LandingPlanner cities={cities}>
      <LandingExploreLink className="recovery-button" />
      <LandingSearch />
      <LandingTripBuilder />
      <LandingPresets />
    </LandingPlanner>,
  );
}
function tripParams() {
  return new URL(
    screen.getByRole("link", { name: "Build trip" }).getAttribute("href")!,
    "https://localley.io",
  ).searchParams;
}

describe("landing planner islands", () => {
  it("preserves initial trip and browse parameters", () => {
    mount();
    expect(Object.fromEntries(tripParams())).toEqual({
      city: "Seoul",
      days: "3",
      interests: "Food & Dining,Cafes & Coffee",
      pace: "moderate",
      budget: "moderate",
      localness: "4",
    });
    expect(
      screen
        .getByRole("link", { name: "Browse local spots" })
        .getAttribute("href"),
    ).toBe("/spots?city=seoul&sort=local&category=Food");
  });
  it("shares selected city and duration across controls", () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: /^Tokyo\s*Small streets$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "2d" }));
    expect(tripParams().get("city")).toBe("Tokyo");
    expect(tripParams().get("days")).toBe("2");
    expect(tripParams().get("pace")).toBe("active");
    expect(
      screen
        .getByRole("link", { name: "Browse local spots" })
        .getAttribute("href"),
    ).toContain("city=tokyo");
  });
  it("applies presets to the same shared route", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Tokyo cafe weekend/ }));
    expect(tripParams().get("city")).toBe("Tokyo");
    expect(tripParams().get("days")).toBe("2");
    expect(tripParams().get("interests")).toBe("Cafes & Coffee,Art & Culture");
  });
  it("retains at least one interest and at most three", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Cafes" }));
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(tripParams().get("interests")).toBe("Food & Dining");
    for (const name of ["Cafes", "Culture", "Street food"])
      fireEvent.click(screen.getByRole("button", { name }));
    expect(tripParams().get("interests")?.split(",")).toHaveLength(3);
  });
  it("encodes a search without changing the route contract", () => {
    mount();
    push.mockClear();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Tokyo coffee & food  " },
    });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(push).toHaveBeenCalledWith(
      "/spots?search=Tokyo%20coffee%20%26%20food",
    );
  });
  it("uses the current browse filters for an empty search", () => {
    mount();
    push.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: /Bangkok street-food run/ }),
    );
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(push).toHaveBeenCalledWith(
      "/spots?city=bangkok&sort=local&category=Street",
    );
  });
  it("passes button styling through and prevents speculative navigation", () => {
    const { container } = mount();
    expect(
      screen.getByRole("link", { name: "Browse local spots" }).className,
    ).toBe("recovery-button");
    for (const link of container.querySelectorAll("a"))
      expect(link.getAttribute("data-prefetch")).toBe("false");
  });
});

describe("landing CDN hero", () => {
  it("preloads exactly the same responsive source set as its decorative image", () => {
    const html = renderToStaticMarkup(<LandingHero />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const image = doc.querySelector("img")!;
    const preload = doc.querySelector('link[rel="preload"]')!;
    expect(doc.querySelectorAll("img")).toHaveLength(1);
    expect(preload.getAttribute("imagesrcset")).toBe(
      image.getAttribute("srcset"),
    );
    expect(preload.getAttribute("imagesizes")).toBe(
      image.getAttribute("sizes"),
    );
    expect(image.getAttribute("fetchpriority")).toBe("high");
    expect(image.getAttribute("alt")).toBe("");
    expect(html).not.toContain("unsplash.com");
    expect(html).not.toContain("background-image");
  });
});
