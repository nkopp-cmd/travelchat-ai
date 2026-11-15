import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({ useUser: () => ({ isSignedIn: false }) }));
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
import { Logo } from "@/components/brand/logo";

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
});
