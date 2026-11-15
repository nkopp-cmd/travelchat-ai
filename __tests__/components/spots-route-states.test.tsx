import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SpotsError from "@/app/spots/error";

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

describe("spots route states", () => {
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
