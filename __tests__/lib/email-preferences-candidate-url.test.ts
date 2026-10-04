import { describe, expect, it } from "vitest";
import { previewEmailPreferencesUrl } from "@/lib/app-data/email-preferences-candidate-url";
describe("email preference explicit candidate URL", () => {
  it("uses the exact preview and explicit opt-in", () => expect(previewEmailPreferencesUrl({ hostname: "localley-next-preview.nkopp.workers.dev", search: "?other=1&data_candidate=d1" })).toBe("/api/user/email-preferences?data_candidate=d1"));
  it("refuses www, normal preview, lost flags and host lookalikes", () => {
    for (const [hostname, search] of [["www.localley.io", "?data_candidate=d1"], ["localley-next-preview.nkopp.workers.dev", ""], ["localley-next-preview.nkopp.workers.dev", "?data_candidate=other"], ["localley-next-preview.nkopp.workers.dev.example", "?data_candidate=d1"]]) expect(previewEmailPreferencesUrl({ hostname, search })).toBeNull();
  });
});
