import { afterEach, describe, expect, it, vi } from "vitest";
import { funnelSource, trackFunnelStep } from "@/lib/funnel-analytics";

afterEach(() => { vi.unstubAllGlobals(); });

describe("funnel analytics", () => {
  it("maps the referrer to a coarse source and never keeps the URL", () => {
    const origin = "https://www.localley.io";
    expect(funnelSource("", origin)).toBe("direct");
    expect(funnelSource("https://www.localley.io/", origin)).toBe("home");
    expect(funnelSource("https://www.localley.io/spots?city=seoul", origin)).toBe("spots");
    expect(funnelSource("https://www.localley.io/pricing", origin)).toBe("pricing");
    expect(funnelSource("https://www.localley.io/itineraries", origin)).toBe("other");
    expect(funnelSource("https://news.example/?q=private", origin)).toBe("other");
  });

  it("sends one beacon with only the step and the source", async () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon, doNotTrack: null });
    trackFunnelStep("planner_start", "home");
    expect(beacon).toHaveBeenCalledOnce();
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    const text = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(url).toBe("/api/events/spots");
    expect(JSON.parse(text)).toEqual({ funnel: [{ step: "planner_start", source: "home" }] });
  });

  it("respects Do Not Track", () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon, doNotTrack: "1" });
    trackFunnelStep("checkout_start", "pricing");
    expect(beacon).not.toHaveBeenCalled();
  });
});
