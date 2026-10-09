import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StoryDialog } from "@/components/itineraries/story-dialog";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe("story generation options", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows one generic generation control and credit cost without exposing providers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(
      url === "/api/images/story-background" ? { sources: { ai: true }, models: [
        { provider: "flux", label: "FLUX", credits: 1, available: true },
        { provider: "seedream", label: "Seedream", credits: 2, available: true },
        { provider: "gemini", label: "Gemini Nano Banana", credits: 3, available: true },
      ] } : url === "/api/user/tier" ? { tier: "pro" } : { limits: { aiImagesPerMonth: 15 }, usage: { aiImagesThisMonth: 0 } }
    ), { headers: { "content-type": "application/json" } })));
    render(<StoryDialog itineraryId="controlled-trip" itineraryTitle="Seoul day" totalDays={1} city="Seoul" />);
    fireEvent.click(screen.getByRole("button", { name: "Stories" }));
    await waitFor(() => expect(screen.getByText(/This story will use ~9 credits/)).not.toBeNull());
    expect((screen.getByRole("button", { name: "Generate 3 Slides" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText(/FLUX|Seedream|Gemini|Nano Banana|GPT|Luna/i)).toBeNull();
  });
});
