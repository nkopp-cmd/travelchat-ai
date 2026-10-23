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
  "app/itineraries/(list)/page.tsx",
  "app/settings/page.tsx",
  "components/settings/notification-preferences.tsx",
  "app/profile/page.tsx",
  "app/users/[username]/page.tsx",
  // batch 5
  "app/spots/[id]/page.tsx",
  "components/activities/activity-card.tsx",
  "app/spots/submissions/page.tsx",
  "app/spots/submit/page.tsx",
  "components/itineraries/wizard/index.tsx",
  "components/itineraries/wizard/route-preview.tsx",
  "components/itineraries/wizard/step-destination.tsx",
  "components/itineraries/wizard/step-duration.tsx",
  "components/itineraries/wizard/step-interests.tsx",
  "components/itineraries/wizard/step-preferences.tsx",
  "components/itineraries/wizard/wizard-progress.tsx",
  "components/auth/auth-forms.tsx",
  "components/auth/auth-shell.tsx",
  // batch 6
  "components/spots/spots-filter-bar.tsx",
  "components/templates/template-card.tsx",
  "components/templates/template-picker.tsx",
  "components/spots/submission-media-progress.tsx",
  "app/spots/submissions/evidence-form.tsx",
  "app/shared/[shareCode]/page.tsx",
  "app/explore/explore-content.tsx",
  "components/guide/source-guide-application.tsx",
  "components/guide/source-guide-dashboard.tsx",
  "app/pricing/page.tsx",
  "app/page.tsx",
  "components/landing/planner.tsx",
  // batch 7: admin (chart series colours in app/admin/analytics/page.tsx are data-viz, not UI chrome)
  "components/admin/apify-spot-discovery-workbench.tsx",
  "components/admin/social-submission-recovery.tsx",
  "components/admin/spot-quality-workbench.tsx",
  "components/admin/analytics-charts.tsx",
  "components/ui/glass-card.tsx",
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
    // A primary fill needs its own ink, never the light foreground.
    expect(source).not.toMatch(/(?<![\w/:-])bg-primary(?![/\w-])[^"'`]*(?<![\w:-])text-foreground\b/);
    expect(source).not.toMatch(/rgba\((?:124|139|79|11|20|30),/);
  });
});
