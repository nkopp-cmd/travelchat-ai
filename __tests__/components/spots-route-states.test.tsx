import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SpotDetailsLoading from "@/app/spots/[id]/loading";
import SpotsError from "@/app/spots/error";
import SpotsLoading from "@/app/spots/loading";

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

describe("spots route states", () => {
  it("announces the responsive spots loading state", () => {
    const { unmount } = render(<SpotsLoading />);
    const status = screen.getByRole("status");

    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("Loading spots");
    expect(status.className).toContain("w-full");
    expect(status.querySelector("[aria-hidden='true']")?.className).toContain(
      "animate-pulse",
    );

    unmount();
  });

  it("announces spot-detail loading without exposing skeleton noise", () => {
    render(<SpotDetailsLoading />);
    const status = screen.getByRole("status");

    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("Loading spot details");
    expect(status.querySelector("[aria-hidden='true']")?.className).toContain(
      "animate-pulse",
    );
    expect(status.querySelector(".sm\\:aspect-\\[16\\/9\\]")).toBeTruthy();
  });

  it("announces errors and keeps recovery controls mobile-friendly", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("spots failed"), { digest: "digest-123" });
    render(<SpotsError error={error} reset={reset} />);

    const alert = screen.getByRole("alert");
    const retry = screen.getByRole("button", { name: "Try Again" });

    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.textContent).toContain("Unable to load spots");
    expect(alert.textContent).toContain("digest-123");
    expect(retry.className).toContain("w-full");
    expect(screen.getByRole("button", { name: "Dashboard" }).className).toContain(
      "sm:w-auto",
    );
    expect(captureException).toHaveBeenCalledWith(error);

    fireEvent.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
