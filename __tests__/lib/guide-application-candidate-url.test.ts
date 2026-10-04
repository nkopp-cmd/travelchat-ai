import { describe, expect, it } from "vitest";
import { previewGuideApplicationUrl } from "@/lib/app-data/guide-application-candidate-url";
describe("guide form candidate URL", () => {
  it("carries exact preview opt-in to the existing application writer", () => {
    expect(previewGuideApplicationUrl({ hostname: "localley-next-preview.nkopp.workers.dev", search: "?data_candidate=d1" })).toBe("/api/connect/onboard?data_candidate=d1");
  });
  it.each([
    { hostname: "www.localley.io", search: "?data_candidate=d1" },
    { hostname: "localley-next-preview.nkopp.workers.dev.attacker.test", search: "?data_candidate=d1" },
    { hostname: "localley-next-preview.nkopp.workers.dev", search: "" },
    { hostname: "localley-next-preview.nkopp.workers.dev", search: "?data_candidate=source" },
    { hostname: "localley-next-preview.nkopp.workers.dev", search: "?data_candidate=source&data_candidate=d1" },
  ])("refuses lost or foreign intent %j", location => { expect(previewGuideApplicationUrl(location)).toBeNull(); });
});
