import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveSpotButton } from "@/components/spots/save-spot-button";
import { SpotInteractions } from "@/components/spots/spot-interactions";
import { trackSpotEvent } from "@/lib/spot-analytics";

vi.mock("@/lib/spot-analytics", () => ({ trackSpotEvent: vi.fn() }));

const mockPush = vi.fn();
const mockToast = vi.fn();
const mockUseUser = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/auth/client", () => ({
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
    vi.mocked(trackSpotEvent).mockClear();
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
    expect(trackSpotEvent).not.toHaveBeenCalled();
    button.focus();
    fireEvent.click(button, { detail: 0 });

    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(trackSpotEvent).not.toHaveBeenCalled();

    resolveSave?.(new Response(JSON.stringify({ saved: true }), { status: 200 }));

    await waitFor(() => {
      expect(screen.getByRole("button", {
        name: "Remove LADRIO from saved spots",
      }).getAttribute("aria-pressed")).toBe("true");
    });
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(trackSpotEvent).toHaveBeenCalledExactlyOnceWith("save", "spot-ladrio");
  });

  it("does not report a save when loading an already saved spot or removing it", async () => {
    mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true });
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: false }), { status: 200 }));
    render(<SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" />);
    const remove = await screen.findByRole("button", { name: "Remove LADRIO from saved spots" });
    expect(trackSpotEvent).not.toHaveBeenCalled();
    fireEvent.click(remove);
    await screen.findByRole("button", { name: "Save LADRIO" });
    expect(trackSpotEvent).not.toHaveBeenCalled();
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
    expect(button.className).toContain("spot-save"); // .spot-save carries the after:size-11 hit area (app/globals.css)
    expect(button.className).not.toMatch(/inline-flex|\[&_svg\]/);
    expect(button.className).toContain("h-7");
    expect(button.className).toContain("w-7");
  });

  describe("sign-up gate resume (Push AZ2)", () => {
    const back = (query: string) => window.history.replaceState(null, "", `/spots/spot-ladrio${query}`);
    const posts = (fetchMock: ReturnType<typeof vi.spyOn>) => fetchMock.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "POST");

    it("sends a signed-out tap to sign-up with a save action for this spot", () => {
      back("");
      try {
        const href = "/sign-up?redirect_url=%2Fspots%2Fspot-ladrio%3Fcontinue%3Dsave-spot%253Aspot-ladrio";
        const card = render(<SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" />);
        fireEvent.click(screen.getByRole("button", { name: "Save LADRIO" }));
        expect(mockPush).toHaveBeenLastCalledWith(href);
        card.unmount();
        render(<SpotInteractions spotId="spot-ladrio" spotName="LADRIO" />);
        fireEvent.click(screen.getByRole("button", { name: "Save LADRIO" }));
        expect(mockPush).toHaveBeenLastCalledWith(href);
        expect(mockPush).toHaveBeenCalledTimes(2);
      } finally { back(""); window.history.replaceState(null, "", "/"); }
    });

    it("back signed in: saves the matching spot once (card + spot page on one screen), never the other cards", async () => {
      mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true });
      back("?continue=save-spot%3Aspot-ladrio");
      const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => new Response(JSON.stringify({ saved: init?.method === "POST" }), { status: 200 }));
      try {
        const view = render(<><SpotInteractions spotId="spot-ladrio" spotName="LADRIO" /><SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" /><SaveSpotButton spotId="spot-kissa" spotName="Kissa You" /></>);
        await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
        view.rerender(<><SpotInteractions spotId="spot-ladrio" spotName="LADRIO" /><SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" /><SaveSpotButton spotId="spot-kissa" spotName="Kissa You" /></>);
        await new Promise((r) => setTimeout(r, 20));
        expect(posts(fetchMock)).toHaveLength(1);
        expect(JSON.parse(String((posts(fetchMock)[0][1] as RequestInit).body))).toEqual({ spotId: "spot-ladrio" });
        expect(window.location.search).toBe("");
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Spot saved!" }));
      } finally { window.history.replaceState(null, "", "/"); }
    });

    it("card resume saves, reports the save event and shows the pressed state", async () => {
      mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true });
      back("?continue=save-spot%3Aspot-ladrio");
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ saved: true }), { status: 200 }));
      try {
        render(<SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" />);
        expect((await screen.findByRole("button", { name: "Remove LADRIO from saved spots" })).getAttribute("aria-pressed")).toBe("true");
        expect(posts(fetchMock)).toHaveLength(1);
        expect(trackSpotEvent).toHaveBeenCalledExactlyOnceWith("save", "spot-ladrio");
      } finally { window.history.replaceState(null, "", "/"); }
    });

    it("free limit reached: says the spot was not saved, with the server message", async () => {
      mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true });
      back("?continue=save-spot%3Aspot-ladrio");
      vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { message: "You've reached your saved spots limit." } }), { status: 403 }));
      try {
        render(<SpotInteractions spotId="spot-ladrio" spotName="LADRIO" />);
        await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Spot not saved", description: "You've reached your saved spots limit." })));
        expect(trackSpotEvent).not.toHaveBeenCalled();
      } finally { window.history.replaceState(null, "", "/"); }
    });

    it.each([[false, "?continue=save-spot%3Aspot-ladrio"], [true, ""], [true, "?continue=save"], [true, "?continue=save-spot%3Aother"]])("starts no save on load (signed %s, query \"%s\")", async (signed, query) => {
      mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: signed });
      back(query);
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ saved: false }), { status: 200 }));
      try {
        render(<><SpotInteractions spotId="spot-ladrio" spotName="LADRIO" /><SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" /></>);
        await new Promise((r) => setTimeout(r, 20));
        expect(posts(fetchMock)).toHaveLength(0);
        // A save-spot value that no card claimed is dropped (BA3); other actions belong to other pages and stay.
        expect(window.location.search).toBe(query.includes("save-spot") ? "" : query);
      } finally { window.history.replaceState(null, "", "/"); }
    });

    it("stale card resume: a list without the spot drops the param after the first render and saves nothing", async () => {
      mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true });
      back("?city=seoul&continue=save-spot%3Agone-spot#top");
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ saved: false }), { status: 200 }));
      try {
        render(<><SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" /><SaveSpotButton spotId="spot-kissa" spotName="Kissa You" /></>);
        await waitFor(() => expect(window.location.search).toBe("?city=seoul"));
        expect(window.location.hash).toBe("#top");
        await new Promise((r) => setTimeout(r, 20));
        expect(posts(fetchMock)).toHaveLength(0);
      } finally { window.history.replaceState(null, "", "/"); }
    });

    it("waits for the session: the param stays while auth loads, then the matching card still saves once", async () => {
      mockUseUser.mockReturnValue({ isLoaded: false, isSignedIn: false });
      back("?continue=save-spot%3Aspot-ladrio");
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ saved: true }), { status: 200 }));
      try {
        const view = render(<><SaveSpotButton spotId="spot-kissa" spotName="Kissa You" /><SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" /></>);
        await new Promise((r) => setTimeout(r, 20));
        expect(window.location.search).toBe("?continue=save-spot%3Aspot-ladrio");
        mockUseUser.mockReturnValue({ isLoaded: true, isSignedIn: true });
        view.rerender(<><SaveSpotButton spotId="spot-kissa" spotName="Kissa You" /><SaveSpotButton spotId="spot-ladrio" spotName="LADRIO" /></>);
        await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
        expect(JSON.parse(String((posts(fetchMock)[0][1] as RequestInit).body))).toEqual({ spotId: "spot-ladrio" });
        expect(window.location.search).toBe("");
      } finally { window.history.replaceState(null, "", "/"); }
    });
  });
});
