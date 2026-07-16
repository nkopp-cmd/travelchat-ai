export type SpotReviewDisposition = {
  spotId: string;
  decision: "leave_unassigned" | "fix_location_then_assign";
  scope: "outside_current_coverage" | "destination_ownership_pending" | "stored_location_error";
  rationale: string;
  enforcementApproved: false;
  proposedLocation?: { lat: number; lng: number };
  evidenceUrl?: string;
};

const outsideCoverage = (
  spotId: string,
  rationale: string,
): SpotReviewDisposition => ({
  spotId,
  decision: "leave_unassigned",
  scope: "outside_current_coverage",
  rationale,
  enforcementApproved: false,
});

const ownershipPending = (
  spotId: string,
  rationale: string,
): SpotReviewDisposition => ({
  spotId,
  decision: "leave_unassigned",
  scope: "destination_ownership_pending",
  rationale,
  enforcementApproved: false,
});

/**
 * Interim engineering dispositions approved for safe nullable processing.
 * These rows must not receive destination ownership until the product gate is approved.
 */
export const SPOT_REVIEW_DISPOSITIONS: readonly SpotReviewDisposition[] = [
  outsideCoverage("937a316c-74c3-404f-8739-590df00f8c7f", "Depok is outside the current Indonesia destination catalog."),
  ownershipPending("045cc392-cb1f-4dc7-bb1c-027a600f0f9d", "Bali regional ownership must not be inferred from proximity to Ubud or Canggu."),
  ownershipPending("ff64e836-293e-4bbc-b1e3-0b509e477125", "Bali regional ownership must not be inferred from proximity to Ubud or Canggu."),
  ownershipPending("ca7a33ef-b051-49df-b357-8c4d1407c72a", "Nusa Penida needs an explicit Bali regional destination decision."),
  ownershipPending("249171e3-5ef8-4203-ae0d-6ece296b7e3e", "Munduk needs an explicit Bali regional destination decision."),
  ownershipPending("26c31c24-2494-4504-96db-a315afe91647", "Bali regional ownership must not be inferred from proximity to Canggu."),
  ownershipPending("4796038f-d294-4f6b-9c16-12df723fd6d4", "Bali regional ownership must not be inferred from proximity to Canggu."),
  ownershipPending("07846a87-cebd-4dc7-8504-5739d8eb603d", "Klungkung needs an explicit Bali regional destination decision."),
  ownershipPending("5b18dc62-279d-4a47-9fb3-10cf27d6e8af", "Hualien is outside the currently owned Taiwan destination set."),
  ownershipPending("ff56df3a-4dc6-4bc3-bc49-8d2076cc3cd9", "Taichung is outside the currently owned Taiwan destination set."),
  ownershipPending("265d7b07-f0e4-4b30-96e8-ba85c7472a5d", "Taichung is outside the currently owned Taiwan destination set."),
  outsideCoverage("cbb43f15-d912-4293-a250-fcf7ba7e083f", "Depok is outside the current Indonesia destination catalog."),
  outsideCoverage("3e20d386-38b8-4a60-bcb7-4f2d4204578a", "Depok is outside the current Indonesia destination catalog."),
  outsideCoverage("02e3cc8b-ada0-4610-a39b-1d254fc93f35", "Depok is outside the current Indonesia destination catalog."),
  outsideCoverage("60fe2b7f-0d5f-4d4e-a482-027ff7c3ee90", "Depok is outside the current Indonesia destination catalog."),
  outsideCoverage("dbcaaad4-f6a0-4800-9325-c7a13151fcb6", "Depok is outside the current Indonesia destination catalog."),
  ownershipPending("ed644d24-9089-4a8f-8664-175b6834330c", "Yangmingshan needs an explicit Taipei extension or destination decision."),
  outsideCoverage("c0f947f0-ad9e-4422-8549-894a9556539d", "Depok is outside the current Indonesia destination catalog."),
  outsideCoverage("0ccf4ed6-2edb-4d43-a5df-d2b4ca25b432", "Depok is outside the current Indonesia destination catalog."),
  outsideCoverage("a817d47f-ccb6-4b53-b208-6aa6dd2a560a", "Depok is outside the current Indonesia destination catalog."),
  ownershipPending("aee12dc5-886b-437b-802b-7648e6cefb34", "Taichung is outside the currently owned Taiwan destination set."),
  ownershipPending("3fe812c7-cc05-4dec-a4a7-88d76f6df901", "Hualien is outside the currently owned Taiwan destination set."),
  ownershipPending("7dfdaa1f-f9a8-4e4f-a7ad-7efc7c09c1f5", "Nusa Penida needs an explicit Bali regional destination decision."),
  ownershipPending("4520680a-f574-47ab-aa61-356184e52c13", "Nantou is outside the currently owned Taiwan destination set."),
  {
    spotId: "aec11426-b1cd-43bc-8ebb-b5ca1b944ad0",
    decision: "fix_location_then_assign",
    scope: "stored_location_error",
    rationale: "Stored coordinates point to Taipei; the official Taiwan Tourism record places Jiaoxi Hot Springs Park in Yilan.",
    enforcementApproved: false,
    proposedLocation: { lat: 24.831013, lng: 121.77596 },
    evidenceUrl: "https://eng.taiwan.net.tw/m1.aspx?id=2263&sNo=0000208",
  },
] as const;

export const SPOT_REVIEW_DISPOSITION_BY_ID = new Map(
  SPOT_REVIEW_DISPOSITIONS.map((disposition) => [disposition.spotId, disposition]),
);
