import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({ useUser: () => ({ isSignedIn: false }) }));
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Logo } from "@/components/brand/logo";
import { LOGO_SRC, LOGO_SRCSET, LogoMark } from "@/components/brand/logo-mark";

afterEach(cleanup);

describe("Logo accessible name", () => {
  it("names the link once: decorative image next to the text (no image-redundant-alt)", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(screen.getByRole("link", { name: "Localley" })).toBeTruthy();
    // The text is visually hidden below sm, never display:none, so mobile keeps the name.
    expect(screen.getByText("Localley").className).toContain("sr-only");
    expect(screen.getByText("Localley").className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("keeps the image alt when the text is not shown", () => {
    render(<Logo showText={false} />);
    expect(screen.getByRole("link", { name: "Localley" })).toBeTruthy();
    expect(screen.getByAltText("Localley")).toBeTruthy();
  });

  it("loads eagerly but low priority, so React SSR adds no logo preload that competes with the hero (LCP)", () => {
    const { container } = render(<Logo />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("loading")).toBe("eager");
    expect(img?.getAttribute("fetchpriority")).toBe("low");
  });

  it("uses the static versioned WebP files, not next/image (Push BE3: next/image left the layout chunk)", () => {
    const { container } = render(<Logo />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(LOGO_SRC);
    expect(img?.getAttribute("srcset")).toBe(LOGO_SRCSET);
    for (const file of ["logo-v1-48.webp", "logo-v1-96.webp"]) expect(existsSync(path.join(process.cwd(), "public/brand", file))).toBe(true);
    for (const file of ["components/brand/logo.tsx", "components/brand/logo-mark.tsx"]) {
      expect(readFileSync(path.join(process.cwd(), file), "utf8")).not.toMatch(/from "next\/image"/);
    }
  });

  it("LogoMark is server-safe (no client directive or hooks) and the home footer uses it in a plain Link", () => {
    const mark = readFileSync(path.join(process.cwd(), "components/brand/logo-mark.tsx"), "utf8");
    expect(mark).not.toMatch(/"use client"|useUser|useState|useEffect/);
    const home = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
    expect(home).not.toMatch(/from "@\/components\/brand\/logo"/);
    expect(home).toContain('<LogoMark size="md" isLanding />');
    const { container } = render(<LogoMark showText={false} />);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("Localley");
  });
});
