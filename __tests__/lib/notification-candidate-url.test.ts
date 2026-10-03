// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPreviewNotificationSettings, notificationPreferencesUrl, notificationInboxUrl } from "@/lib/app-data/notification-candidate-url";

afterEach(() => vi.unstubAllGlobals());

describe("notification settings candidate URL gate", () => {
  it("requires the exact preview host and explicit D1 opt-in", () => {
    expect(isPreviewNotificationSettings({hostname:"localley-next-preview.nkopp.workers.dev",search:"?tab=notifications&data_candidate=d1"})).toBe(true);
    for (const hostname of ["www.localley.io","localley.io","other.workers.dev","localley-next-preview.nkopp.workers.dev.evil.test"]) {
      expect(isPreviewNotificationSettings({hostname,search:"?data_candidate=d1"})).toBe(false);
    }
    for (const search of ["","?data_candidate=D1","?data_candidate=d2"]) {
      expect(isPreviewNotificationSettings({hostname:"localley-next-preview.nkopp.workers.dev",search})).toBe(false);
    }
  });
  it("adds D1 only on the opted-in preview browser for every inbox URL", () => {
    for (const [hostname, search, candidate] of [
      ["localley-next-preview.nkopp.workers.dev", "?data_candidate=d1", true],
      ["localley-next-preview.nkopp.workers.dev", "", false],
      ["www.localley.io", "?data_candidate=d1", false],
      ["localley.io", "?data_candidate=d1", false],
    ] as const) {
      vi.stubGlobal("window", { location: { hostname, search } });
      expect(notificationInboxUrl()).toBe(`/api/notifications${candidate ? "?data_candidate=d1" : ""}`);
      expect(notificationInboxUrl("one")).toBe(`/api/notifications/one${candidate ? "?data_candidate=d1" : ""}`);
      expect(notificationInboxUrl(undefined, {limit:20,offset:20})).toBe(`/api/notifications?limit=20&offset=20${candidate ? "&data_candidate=d1" : ""}`);
    }
  });
  it("keeps server rendering on the normal route", () => {
    expect(isPreviewNotificationSettings()).toBe(false);
    expect(notificationPreferencesUrl()).toBe("/api/notifications/preferences");
    expect(notificationInboxUrl()).toBe("/api/notifications");
    expect(notificationInboxUrl("a/b")).toBe("/api/notifications/a%2Fb");
    expect(notificationInboxUrl(undefined, {limit:20,offset:20})).toBe("/api/notifications?limit=20&offset=20");
  });
});
