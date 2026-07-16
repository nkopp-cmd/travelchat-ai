import { describe, expect, it } from "vitest";
import { assignSpotGeography } from "@/lib/geography/spot-assignment";

describe("spot geography assignment", () => {
  it("prefers an explicit destination and local-area alias", () => {
    expect(assignSpotGeography({
      address: "21 Hongik-ro, Hongdae, Mapo-gu, Seoul",
      coordinate: { lat: 37.5563, lng: 126.9236 },
    })).toMatchObject({
      destinationSlug: "seoul",
      localAreaSlug: "hongdae",
      confidence: "high",
      reason: "address_alias",
      needsReview: false,
    });
  });

  it("flags a strong address-coordinate disagreement instead of silently trusting it", () => {
    expect(assignSpotGeography({
      address: "Shibuya, Tokyo",
      coordinate: { lat: 37.5665, lng: 126.978 },
    })).toMatchObject({
      destinationSlug: "tokyo",
      localAreaSlug: "shibuya",
      confidence: "review",
      nearestDestinationSlug: "seoul",
      needsReview: true,
      reviewReasons: ["address_coordinate_destination_disagreement"],
    });
  });

  it("uses an unambiguous nearby center when address identity is absent", () => {
    expect(assignSpotGeography({
      address: "",
      coordinate: { lat: 34.6937, lng: 135.5023 },
    })).toMatchObject({
      destinationSlug: "osaka",
      confidence: "medium",
      reason: "nearest_center",
      needsReview: false,
    });
  });

  it("assigns a reviewed surrounding town through its parent destination", () => {
    expect(assignSpotGeography({
      address: "Tam Coc, Hoa Lư, Ninh Bình, Vietnam",
      coordinate: { lat: 20.215, lng: 105.936 },
    })).toMatchObject({
      destinationSlug: "hanoi",
      localAreaSlug: "ninh-binh",
      confidence: "high",
      reason: "address_alias",
      needsReview: false,
    });
  });

  it("does not match destination names embedded inside street words", () => {
    expect(assignSpotGeography({
      address: "58 Naradhiwat Rajanagarindra, Sathon, Krung Thep Maha Nakhon, Thailand",
      coordinate: { lat: 13.72, lng: 100.53 },
    })).toMatchObject({
      destinationSlug: "bangkok",
      needsReview: false,
    });
  });

  it("uses coordinates to resolve two explicit place-name candidates in an address", () => {
    expect(assignSpotGeography({
      address: "18 Hanoi Road, Tsim Sha Tsui, Kowloon",
      coordinate: { lat: 22.297, lng: 114.173 },
    })).toMatchObject({
      destinationSlug: "hong-kong",
      localAreaSlug: "tsim-sha-tsui",
      needsReview: false,
    });
  });

  it("does not let a generic neighborhood token pull a spot across countries", () => {
    expect(assignSpotGeography({
      address: "Pancoran Mas, Depok, West Java, Indonesia",
      coordinate: { lat: -6.4, lng: 106.82 },
    })).toMatchObject({
      destinationSlug: null,
      confidence: "review",
      reason: "unassigned",
      needsReview: true,
      reviewReasons: ["address_coordinate_destination_disagreement"],
    });
  });

  it("does not force a point that is equally close to two destination centers", () => {
    expect(assignSpotGeography({
      address: "Unlabeled Kansai location",
      coordinate: { lat: 34.85, lng: 135.65 },
    })).toMatchObject({
      destinationSlug: null,
      confidence: "review",
      reason: "ambiguous_centers",
      needsReview: true,
    });
  });

  it("requires review when neither address nor coordinates establish identity", () => {
    expect(assignSpotGeography({ address: "", coordinate: null })).toMatchObject({
      destinationSlug: null,
      confidence: "review",
      reason: "unassigned",
      reviewReasons: ["missing_address_and_coordinates"],
    });
  });
});
