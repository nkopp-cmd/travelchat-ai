import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViatorSuggestions } from "@/components/activities/viator-suggestions";

let trigger: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
const disconnect = vi.fn();

class FakeObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) { trigger = callback; }
  observe() {}
  disconnect() { disconnect(); }
}

describe("Viator suggestions first view", () => {
  afterEach(() => { vi.unstubAllGlobals(); trigger = null; disconnect.mockReset(); });

  it("does not call the partner API until the card is near the viewport, then calls it once", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { activities: [] } })));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(<ViatorSuggestions city="Seoul" userTier="free" limit={4} />);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { trigger?.([{ isIntersecting: false }]); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { trigger?.([{ isIntersecting: true }]); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/^\/api\/viator\/search\?destination=Seoul&limit=4/);
    expect(disconnect).toHaveBeenCalled();
  });

  it("still loads where IntersectionObserver is missing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { activities: [] } })));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", undefined);
    await act(async () => { render(<ViatorSuggestions city="Tokyo" userTier="free" />); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
