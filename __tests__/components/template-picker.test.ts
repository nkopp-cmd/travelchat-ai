import { describe, expect, it } from "vitest";

import { getTemplateUrl } from "@/components/templates/template-picker";
import type { ItineraryTemplate } from "@/lib/templates";

const template: ItineraryTemplate = {
  id: "local-authentic",
  name: "Local's Guide",
  description: "Off-the-beaten-path experiences like a local",
  icon: "key",
  emoji: "🗝️",
  days: 5,
  pace: "moderate",
  focus: ["Hidden Gems", "Local Neighborhoods"],
  activitiesPerDay: 4,
  targetAudience: "Seasoned travelers",
  prompt: "Build an authentic local itinerary.",
  tags: ["Local", "Hidden Gems"],
  color: "from-violet-500 to-purple-500",
};

describe("getTemplateUrl", () => {
  it("preloads the template and its sample city for one-tap generation", () => {
    const url = getTemplateUrl(template);

    expect(url).toBe("/itineraries/new?template=local-authentic&city=Tokyo");
  });
});
