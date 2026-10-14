import { afterEach, describe, expect, it, vi } from "vitest";
import { savedSpotCandidateUrl } from "@/lib/app-data/saved-spot-candidate-url";
const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllGlobals());
describe("saved spot candidate URL", () => {
  it.each(["www.localley.io", "localley.io", "localley-next-preview.nkopp.workers.dev.evil.test"])("refuses %s", hostname => {
    vi.stubGlobal("window", { location: { hostname, search: "?data_candidate=d1" } }); expect(savedSpotCandidateUrl(id)).toBeNull();
  });
  it("requires exact host, flag and UUID", () => {
    vi.stubGlobal("window", { location: { hostname: "localley-next-preview.nkopp.workers.dev", search: "?data_candidate=d1" } });
    expect(savedSpotCandidateUrl(id)).toBe(`/api/spots/save?data_candidate=d1&spotId=${id}`);
    expect(savedSpotCandidateUrl()).toBe("/api/spots/save?data_candidate=d1"); expect(savedSpotCandidateUrl("bad")).toBeNull();
    window.location.search = ""; expect(savedSpotCandidateUrl(id)).toBeNull();
  });
});
