import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// shared/plans/localley-design-consistency.md batches 3-4: itinerary detail, list, settings, profile and public profile use tokens (story-dialog is protected).
const FILES = [
  "app/itineraries/[id]/page.tsx",
  "components/itinerary/itinerary-insights-panel.tsx",
  "components/itinerary/hero-section.tsx",
  "components/itinerary/itinerary-map.tsx",
  "components/itinerary/sticky-tabs.tsx",
  "components/itinerary/day-route-section.tsx",
  "components/itinerary/day-section.tsx",
  "components/itinerary/floating-actions.tsx",
  "components/activities/itinerary-activity-card.tsx",
  "components/itineraries/share-dialog.tsx",
  "components/itineraries/email-dialog.tsx",
  // batch 4
  "components/activities/viator-suggestions.tsx",
  "components/activities/booking-deals-popover.tsx",
  "components/itineraries/itinerary-list.tsx",
  "app/itineraries/page.tsx",
  "app/settings/page.tsx",
  "components/settings/notification-preferences.tsx",
  "app/profile/page.tsx",
  "app/users/[username]/page.tsx",
];

describe("itinerary detail design tokens", () => {
  it.each(FILES)("%s has no legacy gradients, raw hex, palette accents or coloured shadows", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/bg-gradient-to-(?:r|br)\b[^"']*(?:from|to)-(?:violet|indigo|purple)-/);
    expect(source).not.toMatch(/\b(?:bg|hover:bg)-\[#[0-9a-f]{6}\]/i);
    expect(source).not.toMatch(/\b(?:bg|text)-(?:violet|indigo|emerald|amber|sky)-\d{2,3}\b/);
    expect(source).not.toMatch(/\bshadow-violet-\d+\/\d+/);
    expect(source).not.toMatch(/text-\[(?:9|10|11)px\]/);
    expect(source).not.toMatch(/bg-primary[^"']*text-white/);
  });
});
