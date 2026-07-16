import { ENABLED_CITIES } from "../cities";
import { geographySeedManifest } from "./seed-manifest";
import { normalizeGeoAlias } from "./manifest-schema";

export type SpotGeographyAssignment = {
  destinationSlug: string | null;
  localAreaSlug: string | null;
  confidence: "high" | "medium" | "review";
  reason: "address_alias" | "nearest_center" | "ambiguous_centers" | "unassigned";
  nearestDestinationSlug: string | null;
  nearestDistanceKm: number | null;
  assignedDistanceKm: number | null;
  needsReview: boolean;
  reviewReasons: string[];
};

type Coordinate = { lat: number; lng: number };

const destinationRadiusKm: Record<string, number> = {
  "bali-ubud": 70,
  "bali-canggu": 70,
  jeju: 100,
  okinawa: 140,
  penang: 65,
  phuket: 90,
  "hong-kong": 65,
  singapore: 55,
};

function distanceKm(left: Coordinate, right: Coordinate): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDelta = radians(right.lat - left.lat);
  const lngDelta = radians(right.lng - left.lng);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(left.lat)) * Math.cos(radians(right.lat)) *
    Math.sin(lngDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function rankedCenters(coordinate: Coordinate) {
  return ENABLED_CITIES
    .map((city) => ({
      slug: city.slug,
      distanceKm: distanceKm(coordinate, city.center),
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

function containsNormalizedAlias(normalizedAddress: string, alias: string): boolean {
  return ` ${normalizedAddress} `.includes(` ${alias} `);
}

function addressDestinationCandidates(address: string): Array<{
  slug: string;
  longestAlias: number;
  source: "destination" | "local_area";
}> {
  const normalizedAddress = normalizeGeoAlias(address);
  const directMatches = geographySeedManifest.destinations.flatMap((destination) => {
    const names = [destination.name.en, ...destination.aliases]
      .map(normalizeGeoAlias)
      .filter((alias) => alias.length >= 3 && containsNormalizedAlias(normalizedAddress, alias));
    return names.length > 0
      ? [{
        slug: destination.slug,
        longestAlias: Math.max(...names.map((name) => name.length)),
        source: "destination" as const,
      }]
      : [];
  });
  const areaMatches = geographySeedManifest.destinations.flatMap((destination) =>
    destination.localAreas.flatMap((area) => {
      const aliases = [area.name.en, ...area.aliases]
        .map(normalizeGeoAlias)
        .filter((alias) => alias.length >= 3 && containsNormalizedAlias(normalizedAddress, alias));
      return aliases.length > 0
        ? [{
          slug: destination.slug,
          longestAlias: Math.max(...aliases.map((alias) => alias.length)),
          source: "local_area" as const,
        }]
        : [];
    }),
  );
  const strongestByDestination = new Map<string, { longestAlias: number; source: "destination" | "local_area" }>();
  for (const match of [...directMatches, ...areaMatches]) {
    const current = strongestByDestination.get(match.slug);
    if (!current || match.source === "destination" || match.longestAlias > current.longestAlias) {
      strongestByDestination.set(match.slug, {
        longestAlias: Math.max(current?.longestAlias || 0, match.longestAlias),
        source: match.source === "destination" ? "destination" : current?.source || "local_area",
      });
    }
  }
  return [...strongestByDestination]
    .map(([slug, match]) => ({ slug, ...match }))
    .sort((left, right) => right.longestAlias - left.longestAlias);
}

function localAreaSlug(destinationSlug: string, address: string): string | null {
  const destination = geographySeedManifest.destinations.find(
    (candidate) => candidate.slug === destinationSlug,
  );
  if (!destination) return null;
  const normalizedAddress = normalizeGeoAlias(address);
  const matches = destination.localAreas.flatMap((area) => {
    const aliases = [area.name.en, ...area.aliases]
      .map(normalizeGeoAlias)
      .filter((alias) => alias.length >= 3 && containsNormalizedAlias(normalizedAddress, alias));
    return aliases.length > 0
      ? [{ slug: area.slug, longestAlias: Math.max(...aliases.map((alias) => alias.length)) }]
      : [];
  }).sort((left, right) => right.longestAlias - left.longestAlias);
  return matches[0]?.slug || null;
}

export function assignSpotGeography(input: {
  address: string;
  coordinate: Coordinate | null;
}): SpotGeographyAssignment {
  const addressCandidates = addressDestinationCandidates(input.address);
  const centers = input.coordinate ? rankedCenters(input.coordinate) : [];
  const nearest = centers[0] || null;
  const secondNearest = centers[1] || null;
  const reviewReasons: string[] = [];
  const coordinatePreferredCandidate = input.coordinate && addressCandidates.length > 1
    ? [...addressCandidates].sort((left, right) => {
      const leftCenter = ENABLED_CITIES.find((city) => city.slug === left.slug)!.center;
      const rightCenter = ENABLED_CITIES.find((city) => city.slug === right.slug)!.center;
      return distanceKm(input.coordinate!, leftCenter) - distanceKm(input.coordinate!, rightCenter);
    })[0]
    : null;
  const fromAddress = coordinatePreferredCandidate?.slug || addressCandidates[0]?.slug || null;
  const selectedAddressCandidate = coordinatePreferredCandidate || addressCandidates[0] || null;

  if (fromAddress) {
    const assignedCenter = ENABLED_CITIES.find((city) => city.slug === fromAddress)?.center;
    const assignedDistance = input.coordinate && assignedCenter
      ? distanceKm(input.coordinate, assignedCenter)
      : null;
    if (
      nearest && nearest.slug !== fromAddress && assignedDistance !== null &&
      nearest.distanceKm + 30 < assignedDistance
    ) {
      reviewReasons.push("address_coordinate_destination_disagreement");
    }
    if (
      reviewReasons.length > 0 &&
      selectedAddressCandidate?.source === "local_area"
    ) {
      return {
        destinationSlug: null,
        localAreaSlug: null,
        confidence: "review",
        reason: "unassigned",
        nearestDestinationSlug: nearest?.slug || null,
        nearestDistanceKm: nearest ? Number(nearest.distanceKm.toFixed(2)) : null,
        assignedDistanceKm: assignedDistance === null ? null : Number(assignedDistance.toFixed(2)),
        needsReview: true,
        reviewReasons,
      };
    }
    return {
      destinationSlug: fromAddress,
      localAreaSlug: localAreaSlug(fromAddress, input.address),
      confidence: reviewReasons.length > 0 ? "review" : "high",
      reason: "address_alias",
      nearestDestinationSlug: nearest?.slug || null,
      nearestDistanceKm: nearest ? Number(nearest.distanceKm.toFixed(2)) : null,
      assignedDistanceKm: assignedDistance === null ? null : Number(assignedDistance.toFixed(2)),
      needsReview: reviewReasons.length > 0,
      reviewReasons,
    };
  }

  if (nearest && secondNearest) {
    const radius = destinationRadiusKm[nearest.slug] || 80;
    if (nearest.distanceKm > radius) {
      reviewReasons.push("outside_destination_radius");
    } else if (secondNearest.distanceKm - nearest.distanceKm <= 12) {
      reviewReasons.push("ambiguous_nearest_destinations");
    } else {
      return {
        destinationSlug: nearest.slug,
        localAreaSlug: null,
        confidence: "medium",
        reason: "nearest_center",
        nearestDestinationSlug: nearest.slug,
        nearestDistanceKm: Number(nearest.distanceKm.toFixed(2)),
        assignedDistanceKm: Number(nearest.distanceKm.toFixed(2)),
        needsReview: false,
        reviewReasons: [],
      };
    }
  } else {
    reviewReasons.push("missing_address_and_coordinates");
  }

  return {
    destinationSlug: null,
    localAreaSlug: null,
    confidence: "review",
    reason: reviewReasons.includes("ambiguous_nearest_destinations")
      ? "ambiguous_centers"
      : "unassigned",
    nearestDestinationSlug: nearest?.slug || null,
    nearestDistanceKm: nearest ? Number(nearest.distanceKm.toFixed(2)) : null,
    assignedDistanceKm: null,
    needsReview: true,
    reviewReasons,
  };
}
