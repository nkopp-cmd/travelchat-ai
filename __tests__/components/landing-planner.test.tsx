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
import { HERO_CATEGORIES, HERO_PINS, HeroCategoryChips, LandingHero } from "@/components/landing/hero";
import { LandingPresetPhoto } from "@/components/landing/preset-photo";
import { readFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import LandingPage from "@/app/page";

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

describe("plan-first landing entry", () => {
  it("sends every Start planning link on the real landing page directly to the planner", () => {
    const html = renderToStaticMarkup(<LandingPage />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(doc.querySelectorAll("a")).filter(link => link.textContent?.trim() === "Start planning");
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(new URL(link.getAttribute("href")!, "https://localley.io").pathname).toBe("/itineraries/new");
  });
});

describe("landing preset photo delivery", () => {
  it.each(["Seoul", "Tokyo", "Bangkok"])(
    "ships both real CDN variants for %s without an optimization proxy",
    async (city) => {
      const html = renderToStaticMarkup(<LandingPresetPhoto city={city} />);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const image = doc.querySelector("img")!;
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("decoding")).toBe("async");
      expect(image.getAttribute("alt")).toBe("");
      expect(doc.querySelector("link[rel=preload]")).toBeNull();
      expect(html).not.toMatch(/https?:|_next\/image/);

      const headers = await readFile(resolve("public/_headers"), "utf8");
      expect(headers).toContain(
        `/images/landing/${city.toLowerCase()}-preset-v1-*\n  Cache-Control: public, max-age=31536000, immutable`,
      );

      const variants = image.getAttribute("srcset")!.split(", ");
      expect(variants).toHaveLength(2);
      for (const variant of variants) {
        const [url, size] = variant.split(" ");
        const width = Number(size.slice(0, -1));
        expect([480, 960]).toContain(width);
        expect(url).toBe(`/images/landing/${city.toLowerCase()}-preset-v1-${width}.webp`);
        const bytes = await readFile(resolve("public", url.slice(1)));
        expect(bytes.length).toBeLessThan(100_000);
        expect(bytes.length).toBeGreaterThan(1_000);
        const metadata = await sharp(bytes).metadata();
        expect(metadata).toMatchObject({ format: "webp", width, height: width / 3 });
      }
    },
  );

  it("does not invent photos for unknown or inherited object names", () => {
    for (const city of ["Unknown city", "toString", "__proto__"]) {
      expect(renderToStaticMarkup(<LandingPresetPhoto city={city} />)).toBe("");
    }
  });
});

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
    screen.getByRole("link", { name: "Start planning" }).getAttribute("href")!,
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
  }, 15_000);
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

describe("landing map hero", () => {
  const html = renderToStaticMarkup(<LandingHero />);
  const doc = new DOMParser().parseFromString(html, "text/html");

  it("preloads exactly the AVIF poster each breakpoint shows", () => {
    const preloads = [...doc.querySelectorAll('link[rel="preload"]')];
    const sources = [...doc.querySelectorAll('picture > source[type="image/avif"]')];
    expect(preloads).toHaveLength(2);
    for (const preload of preloads) {
      expect(preload.getAttribute("type")).toBe("image/avif");
      expect(preload.getAttribute("fetchpriority")).toBe("high");
      const media = preload.getAttribute("media");
      const source = sources.find((item) => (item.getAttribute("media") ?? "(min-width: 768px)") === media)!;
      expect(preload.getAttribute("imagesrcset")).toBe(source.getAttribute("srcset"));
      expect(preload.getAttribute("imagesizes")).toBe(source.getAttribute("sizes"));
    }
    const image = doc.querySelector("img")!;
    expect(doc.querySelectorAll("img")).toHaveLength(1);
    expect(image.getAttribute("fetchpriority")).toBe("high");
    expect(image.getAttribute("alt")).toBe("");
    expect(html).not.toMatch(/unsplash\.com|background-image|<script/);
  });

  it("shows real catalog spots as decorative pins, one with a looping card", () => {
    expect(doc.querySelector(".ll-hero-scene")?.getAttribute("aria-hidden")).toBe("true");
    expect(doc.querySelectorAll(".ll-hero-pin")).toHaveLength(HERO_PINS.length);
    for (const pin of HERO_PINS) {
      expect(pin.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(pin.d[0]).toBeGreaterThanOrEqual(0);
      expect(pin.d[0]).toBeLessThanOrEqual(100);
    }
    const featured = doc.querySelector(".ll-hero-pin[data-featured]")!;
    expect(featured.querySelector(".ll-hero-card-title")?.textContent).toBe("Euljiro Nogari Alley");
    // Pins cut off by the phone crop are hidden there instead of half-drawn.
    expect(doc.querySelectorAll('.ll-hero-pin[data-mobile="hidden"]').length).toBeGreaterThan(0);
    expect(doc.querySelectorAll(".ll-hero-pin:not([data-mobile])").length).toBeGreaterThanOrEqual(5);
  });

  it("links each category chip to the matching /spots quick filter", () => {
    const chips = new DOMParser().parseFromString(renderToStaticMarkup(<HeroCategoryChips />), "text/html");
    const hrefs = [...chips.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(HERO_CATEGORIES.map(({ id }) => `/spots?city=seoul&category=${id}`));
    expect(hrefs).toContain("/spots?city=seoul&category=Cafe");
  });

  it("respects reduced motion for the pins and the card loop", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.ll-hero-pin \.ll-pin, \.ll-hero-pin\[data-featured\] \.ll-pin-face \{ animation: none; \}/);
  });
});

describe("landing map poster variants", () => {
  it.each([["m", 828, 40_000], ["d", 1280, 45_000], ["d", 1920, 90_000]])("%s %ipx is a real AVIF under %i bytes", async (kind, width, maxBytes) => {
    const file = `public/images/landing/seoul-map-v1-${kind}-${width}.avif`;
    const metadata = await sharp(file).metadata();
    expect(metadata).toMatchObject({ format: "heif", compression: "av1", width });
    expect(statSync(file).size).toBeLessThan(maxBytes);
  });
});
