import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveSpotButton } from "@/components/spots/save-spot-button";

const mockPush = vi.fn();
const mockToast = vi.fn();
const mockUseUser = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => mockUseUser(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("SaveSpotButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockToast.mockReset();
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false });
  });

  it("gives repeated controls distinct names using each spot name", () => {
    render(
      <>
        <SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" />
        <SaveSpotButton spotId="spot-kissa" spotName="Kissa You" />
      </>,
    );

    expect(screen.getByRole("button", { name: "Save LADRIO" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Kissa You" })).toBeTruthy();
  });

  it("exposes pressed and loading state while preserving native button behavior", async () => {
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true });

    let resolveSave: ((response: Response) => void) | undefined;
    const pendingSave = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: false }), { status: 200 }))
      .mockReturnValueOnce(pendingSave);

    render(<SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" />);

    const button = screen.getByRole("button", { name: "Save LADRIO" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-busy")).toBe("false");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    button.focus();
    fireEvent.click(button, { detail: 0 });

    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);

    resolveSave?.(new Response(JSON.stringify({ saved: true }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByRole("button", {
        name: "Remove LADRIO from saved spots",
      }).getAttribute("aria-pressed")).toBe("true");
    });
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("provides a 44px mobile hit area without changing its layout dimensions", () => {
    render(
      <SaveSpotButton
        spotId="spot-ladrio"
        spotName="LADRIO"
        className="h-7 w-7"
      />,
    );

    const button = screen.getByRole("button", { name: "Save LADRIO" });
    expect(button.className).toContain("after:size-11");
    expect(button.className).toContain("h-7");
    expect(button.className).toContain("w-7");
  });
});
