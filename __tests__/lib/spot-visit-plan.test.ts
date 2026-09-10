import { describe, expect, it } from "vitest";
import { LocalleyScale } from "@/types";
import { getSpotVisitPlan } from "@/lib/spots/detail-normalization";

describe("spot visit plan", () => {
  it("derives local-first visit guidance for food and market spots", () => {
    const plan = getSpotVisitPlan({
      category: "Market",
      city: "Seoul",
      primaryArea: "Jongno-gu",
      localleyScore: LocalleyScale.LEGENDARY_ALLEY,
      localPercentage: 94,
      bestTime: "Early morning",
      locationTone: "exact",
      hasRealPhoto: true,
      realPhotoCount: 3,
    });

    expect(plan).toEqual({
      localReason:
        "Editorial curation highlights this stop in Jongno-gu; this is not a measured visitor count.",
      bestUse:
        "Anchor a meal here, then keep the route light before and after it. Best window: Early morning. Visit advice, not opening hours. Confirm hours with the venue.",
      routePairing:
        "Build a compact food route around Jongno-gu, then add one quiet recovery stop.",
      evidence: "3 stored photo references plus exact address context. References do not prove current image availability.",
    });
  });

  it("keeps area-level evidence honest when the spot needs address enrichment", () => {
    const plan = getSpotVisitPlan({
      category: "Outdoor",
      city: "Kyoto",
      primaryArea: "Gion",
      localleyScore: LocalleyScale.LOCAL_FAVORITE,
      localPercentage: 72,
      bestTime: "Late afternoon",
      locationTone: "area",
      hasRealPhoto: false,
      realPhotoCount: 0,
    });

    expect(plan.localReason).toBe(
      "Editorial curation suggests a neighborhood stop; this is not a measured visitor count.",
    );
    expect(plan.bestUse).toContain("Give it breathing room");
    expect(plan.routePairing).toBe(
      "Keep the route around Gion simple and weather-aware.",
    );
    expect(plan.evidence).toBe(
      "no stored photo references plus area-level address context. References do not prove current image availability.",
    );
  });
});
