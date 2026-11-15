import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ isSignedIn: true }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { ReviewForm } from "@/components/spots/review-form";

describe("review form rating buttons", () => {
  // Lighthouse spot page 2026-11-15: the 5 star buttons had no accessible name.
  it("names each star button and marks the chosen rating", () => {
    render(<ReviewForm spotId="s1" />);
    const stars = [1, 2, 3, 4, 5].map((n) => screen.getByRole("button", { name: `Rate ${n} star${n === 1 ? "" : "s"}` }));
    fireEvent.click(stars[3]);
    expect(stars.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "true", "false"]);
  });
});
