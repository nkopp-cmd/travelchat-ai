import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StoryDialog } from "@/components/itineraries/story-dialog";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe("story generation options", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows the painted-background control without credits or provider names", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(
      url === "/api/images/story-background" ? { sources: { ai: true, library: true }, models: [
        { provider: "library", label: "Painted backgrounds", credits: 0, available: true },
      ] } : { tier: "pro" }
    ), { headers: { "content-type": "application/json" } })));
    render(<StoryDialog itineraryId="controlled-trip" itineraryTitle="Seoul day" totalDays={1} city="Seoul" />);
    fireEvent.click(screen.getByRole("button", { name: "Stories" }));
    await waitFor(() => expect(screen.getAllByText(/painted city backgrounds/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/credit/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Generate 3 Slides" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText(/FLUX|Seedream|Gemini|Nano Banana|GPT|Luna/i)).toBeNull();
  });

  it("makes no status requests until the dialog is opened, then exactly two once", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    render(<StoryDialog itineraryId="lazy-trip" itineraryTitle="Seoul day" totalDays={1} city="Seoul" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stories" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls.map(([url]) => url).sort()).toEqual(["/api/images/story-background", "/api/user/tier"]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Stories" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
