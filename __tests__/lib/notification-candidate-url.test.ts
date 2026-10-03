// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isPreviewNotificationSettings, notificationPreferencesUrl } from "@/lib/app-data/notification-candidate-url";

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
  it("keeps server rendering on the normal route", () => {
    expect(isPreviewNotificationSettings()).toBe(false);
    expect(notificationPreferencesUrl()).toBe("/api/notifications/preferences");
  });
});
