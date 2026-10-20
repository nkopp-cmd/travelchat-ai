import { afterEach, describe, expect, it, vi } from "vitest";
import { trackSpotEvent, type SpotEvent } from "@/lib/spot-analytics";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("public spot event contract", () => {
  it.each<SpotEvent>(["card_view", "save", "add_to_trip", "open_detail", "directions"])("emits %s without account, URL or place text", event => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const gtag = vi.fn(); vi.stubGlobal("gtag", gtag);
    trackSpotEvent(event, "public-spot-123");
    expect((dispatch.mock.calls[0][0] as CustomEvent).type).toBe("localley:spot-event");
    expect((dispatch.mock.calls[0][0] as CustomEvent).detail).toEqual({ event, spot_id: "public-spot-123" });
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", event, { spot_id: "public-spot-123" });
  });
  it.each([{ doNotTrack: "1" }, { globalPrivacyControl: true }])("respects the browser privacy preference %j", preference => {
    vi.stubGlobal("navigator", preference);
    const dispatch = vi.spyOn(window, "dispatchEvent"), gtag = vi.fn(); vi.stubGlobal("gtag", gtag);
    trackSpotEvent("save", "public-spot");
    expect(dispatch).not.toHaveBeenCalled(); expect(gtag).not.toHaveBeenCalled();
  });
  it("rejects URL-shaped or unbounded identifiers", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    for (const id of ["https://example.test/?email=private", "", "x".repeat(129)]) trackSpotEvent("save", id);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("keeps actions usable when the existing provider throws", () => {
    vi.stubGlobal("gtag", () => { throw Error("provider unavailable"); });
    expect(() => trackSpotEvent("directions", "public-spot")).not.toThrow();
  });
});
