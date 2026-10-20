import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("shared Places readiness", () => {
  beforeEach(()=>{vi.resetModules();vi.useFakeTimers();vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY","public-test-key");vi.stubGlobal("google",undefined);});
  afterEach(()=>{document.querySelectorAll('script[src*="maps.googleapis.com"]').forEach(script=>script.remove());vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
  it("shares one pending script and removes an unmounted subscriber", async()=>{
    const loader=await import("@/lib/maps/places-readiness");const first=vi.fn(),second=vi.fn();
    const unsubscribe=loader.subscribePlaces(first);loader.subscribePlaces(second);
    const scripts=document.querySelectorAll('script[src*="maps.googleapis.com"]');expect(scripts).toHaveLength(1);expect(loader.placesSnapshot()).toBe("loading");
    unsubscribe();first.mockClear();vi.stubGlobal("google",{maps:{places:{}}});scripts[0].dispatchEvent(new Event("load"));
    expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalled();expect(loader.placesSnapshot()).toBe("ready");expect(loader.placesServerSnapshot()).toBe("idle");expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["error","timeout"])("leaves manual input available after %s",async mode=>{
    const loader=await import("@/lib/maps/places-readiness");loader.subscribePlaces(vi.fn());
    if(mode==="error")document.querySelector('script[src*="maps.googleapis.com"]')!.dispatchEvent(new Event("error"));
    else await vi.advanceTimersByTimeAsync(15000);
    expect(loader.placesSnapshot()).toBe("unavailable");expect(vi.getTimerCount()).toBe(0);
  });
  it("does not fetch a script without a configured public key",async()=>{
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY","");const loader=await import("@/lib/maps/places-readiness");loader.subscribePlaces(vi.fn());
    expect(loader.placesSnapshot()).toBe("unavailable");expect(document.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
  });
});
