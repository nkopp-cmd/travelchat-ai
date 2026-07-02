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
        "94% local signal makes this one of the strongest Localley stops in Jongno-gu.",
      bestUse:
        "Anchor a meal here, then keep the route light before and after it. Best window: Early morning.",
      routePairing:
        "Build a compact food route around Jongno-gu, then add one quiet recovery stop.",
      evidence: "3 real photos plus exact address context.",
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
      "72% local signal makes it a useful neighborhood anchor.",
    );
    expect(plan.bestUse).toContain("Give it breathing room");
    expect(plan.routePairing).toBe(
      "Keep the route around Gion simple and weather-aware.",
    );
    expect(plan.evidence).toBe(
      "area fallback imagery plus area-level address context.",
    );
  });
});
