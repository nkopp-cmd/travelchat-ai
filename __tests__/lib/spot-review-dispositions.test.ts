import { describe, expect, it } from "vitest";
import {
  SPOT_REVIEW_DISPOSITION_BY_ID,
  SPOT_REVIEW_DISPOSITIONS,
} from "@/lib/geography/spot-review-dispositions";

describe("spot review dispositions", () => {
  it("covers the complete review packet exactly once", () => {
    expect(SPOT_REVIEW_DISPOSITIONS).toHaveLength(25);
    expect(SPOT_REVIEW_DISPOSITION_BY_ID.size).toBe(25);
  });

  it("carries product sign-off on every reviewed row", () => {
    expect(SPOT_REVIEW_DISPOSITIONS.every((row) => row.enforcementApproved === true)).toBe(true);
    expect(SPOT_REVIEW_DISPOSITIONS.filter((row) => row.decision === "leave_unassigned")).toHaveLength(24);
  });

  it("approves Jiaoxi as an evidenced coordinate fix", () => {
    expect(SPOT_REVIEW_DISPOSITION_BY_ID.get("aec11426-b1cd-43bc-8ebb-b5ca1b944ad0"))
      .toMatchObject({
        decision: "fix_location_then_assign",
        scope: "stored_location_error",
        proposedLocation: { lat: 24.831013, lng: 121.77596 },
        enforcementApproved: true,
      });
  });
});
