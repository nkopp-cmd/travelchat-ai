import { getFirstRealDisplaySpotPhoto } from "@/lib/spots/display-images";
import { parseSpotCoordinates } from "@/lib/spots/coordinates";

type LocalizedText = string | { en?: string; [key: string]: unknown } | null | undefined;

export interface ItineraryGroundingSpot {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  address: LocalizedText;
  category?: string | null;
  subcategories?: string[] | null;
  localley_score: number;
  local_percentage?: number | null;
  photos?: string[] | null;
  location?: unknown;
  google_place_id?: string | null;
  verified?: boolean | null;
  trending_score?: number | null;
  best_times?: LocalizedText;
}

interface GeneratedActivity {
  spotId?: string;
  name?: string;
  description?: string;
  address?: string;
  category?: string;
  time?: string;
  type?: "morning" | "afternoon" | "evening";
  duration?: string;
  cost?: string;
  localleyScore?: number;
  image?: string;
  lat?: number;
  lng?: number;
  [key: string]: unknown;
}

interface GeneratedDayPlan {
  day?: number;
  theme?: string;
  activities?: GeneratedActivity[];
  [key: string]: unknown;
}

export interface ItineraryGroundingPreferences {
  days: number;
  interests?: string[];
  localnessLevel?: number;
  pace?: string;
}

const INTEREST_CATEGORY_TERMS: Record<string, string[]> = {
  food: ["bakery", "dessert", "food", "market", "restaurant", "street food"],
  cafe: ["cafe", "coffee", "tea"],
  nightlife: ["bar", "beer", "club", "cocktail", "drink", "nightlife", "pub", "wine"],
  shopping: ["boutique", "market", "shop", "shopping"],
  culture: ["art", "culture", "gallery", "historic", "museum", "temple"],
  outdoor: ["garden", "hike", "nature", "outdoor", "park", "trail", "view"],
  history: ["heritage", "historic", "history", "monument", "museum", "palace", "temple"],
  street_food: ["food alley", "food market", "hawker", "street food"],
  vintage: ["antique", "flea", "thrift", "vintage"],
  music: ["club", "entertainment", "live music", "music", "performance", "theater"],
};

const INTEREST_LABEL_GROUPS: Record<string, string> = {
  "food & dining": "food",
  "cafes & coffee": "cafe",
  "nightlife & bars": "nightlife",
  shopping: "shopping",
  "art & culture": "culture",
  "nature & parks": "outdoor",
  history: "history",
  "street food": "street_food",
  "vintage & thrift": "vintage",
  "music & entertainment": "music",
};

function localizedText(value: LocalizedText): string {
  if (typeof value === "string") return value.trim();
  return typeof value?.en === "string" ? value.en.trim() : "";
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function categoryText(spot: ItineraryGroundingSpot): string {
  return [spot.category || "", ...(spot.subcategories || [])].join(" ").toLowerCase();
}

function categoryGroup(value: string): string {
  const category = value.toLowerCase();
  if (/market|bazaar/.test(category)) return "market";
  if (/bar|beer|club|cocktail|nightlife|pub|wine/.test(category)) return "nightlife";
  if (/restaurant|food|bakery|dessert/.test(category)) return "food";
  if (/cafe|coffee|tea/.test(category)) return "cafe";
  if (/shop|shopping|boutique|thrift|vintage/.test(category)) return "shopping";
  if (/park|outdoor|nature|trail|garden|view/.test(category)) return "outdoor";
  if (/culture|museum|gallery|temple|historic|art/.test(category)) return "culture";
  return category || "other";
}

function spotCategoryGroup(spot: ItineraryGroundingSpot): string {
  return categoryGroup(categoryText(spot));
}

function requestedInterestTerms(interests: string[] | undefined): string[] {
  const terms = new Set<string>();
  for (const group of requestedInterestGroups(interests)) {
    (INTEREST_CATEGORY_TERMS[group] || []).forEach((value) => terms.add(value));
  }
  return [...terms];
}

function requestedInterestGroups(interests: string[] | undefined): string[] {
  return [...new Set((interests || [])
    .map((interest) => INTEREST_LABEL_GROUPS[interest.toLowerCase().trim()])
    .filter((interest): interest is string => Boolean(interest)))];
}

function spotMatchesInterestGroup(spot: ItineraryGroundingSpot, group: string): boolean {
  const text = `${localizedText(spot.name)} ${categoryText(spot)}`.toLowerCase();
  return (INTEREST_CATEGORY_TERMS[group] || []).some((term) => text.includes(term));
}

function interestScore(spot: ItineraryGroundingSpot, interests: string[] | undefined): number {
  const terms = requestedInterestTerms(interests);
  if (terms.length === 0) return 0;
  const text = `${localizedText(spot.name)} ${categoryText(spot)}`.toLowerCase();
  return terms.some((term) => text.includes(term)) ? 30 : 0;
}

function minimumSpotScore(localnessLevel = 3): number {
  if (localnessLevel >= 5) return 6;
  if (localnessLevel >= 4) return 5;
  return Math.max(3, localnessLevel);
}

export function getPaceStopRange(pace = "moderate"): { min: number; max: number } {
  if (pace === "relaxed") return { min: 2, max: 3 };
  if (pace === "active") return { min: 4, max: 5 };
  if (pace === "packed") return { min: 5, max: 6 };
  return { min: 3, max: 4 };
}

export function hasItineraryGroundingCoverage(
  spots: ItineraryGroundingSpot[],
  preferences: ItineraryGroundingPreferences,
): boolean {
  const required = preferences.days * getPaceStopRange(preferences.pace).min;
  const markets = spots.filter((spot) => spotCategoryGroup(spot) === "market").length;
  const nonMarkets = spots.length - markets;
  const usableCapacity = nonMarkets + Math.min(markets, preferences.days);
  const interestsCovered = requestedInterestGroups(preferences.interests).every(
    (interest) => spots.some((spot) => spotMatchesInterestGroup(spot, interest)),
  );
  const interestsFitSchedule = requestedInterestGroups(preferences.interests).length <=
    preferences.days * getPaceStopRange(preferences.pace).max;
  return usableCapacity >= required && interestsCovered && interestsFitSchedule;
}

function rankingScore(spot: ItineraryGroundingSpot, interests: string[] | undefined): number {
  return spot.localley_score * 20 +
    (spot.local_percentage || 0) / 5 +
    interestScore(spot, interests) +
    (spot.verified ? 10 : 0) +
    (getFirstRealDisplaySpotPhoto(spot.photos) ? 12 : 0) +
    Math.min(5, (spot.trending_score || 0) * 5);
}

export function rankItineraryGroundingSpots(
  spots: ItineraryGroundingSpot[],
  preferences: ItineraryGroundingPreferences,
): ItineraryGroundingSpot[] {
  const threshold = minimumSpotScore(preferences.localnessLevel);
  const unique = new Map<string, ItineraryGroundingSpot>();

  for (const spot of spots) {
    const name = localizedText(spot.name);
    const description = localizedText(spot.description);
    if (!name || spot.localley_score < threshold || !spot.verified) continue;
    if (description.length < 60) continue;
    if (!getFirstRealDisplaySpotPhoto(spot.photos)) continue;
    if (!parseSpotCoordinates(spot.location)) continue;
    unique.set(normalizedName(name), spot);
  }

  return [...unique.values()].sort(
    (left, right) => rankingScore(right, preferences.interests) - rankingScore(left, preferences.interests),
  );
}

export function buildItinerarySpotContext(spots: ItineraryGroundingSpot[]): string {
  return spots.slice(0, 30).map((spot) => {
    const coordinates = parseSpotCoordinates(spot.location);
    return JSON.stringify({
      spotId: spot.id,
      name: localizedText(spot.name),
      category: spot.category || "Local",
      subcategories: spot.subcategories || [],
      localleyScore: spot.localley_score,
      localPercentage: spot.local_percentage || null,
      address: localizedText(spot.address),
      description: localizedText(spot.description),
      bestTimes: localizedText(spot.best_times),
      lat: coordinates?.lat || null,
      lng: coordinates?.lng || null,
    });
  }).join("\n");
}

function chooseDescription(activity: GeneratedActivity, spot: ItineraryGroundingSpot): string {
  const authoritative = localizedText(spot.description);
  return authoritative || activity.description?.trim() || "";
}

function hydrateActivity(
  activity: GeneratedActivity,
  spot: ItineraryGroundingSpot,
): GeneratedActivity {
  const coordinates = parseSpotCoordinates(spot.location);
  return {
    ...activity,
    spotId: spot.id,
    name: localizedText(spot.name),
    address: localizedText(spot.address) || activity.address,
    description: chooseDescription(activity, spot),
    category: spot.category || activity.category || "Local",
    localleyScore: spot.localley_score,
    image: getFirstRealDisplaySpotPhoto(spot.photos) || activity.image,
    googlePlaceId: spot.google_place_id || undefined,
    lat: coordinates?.lat ?? activity.lat,
    lng: coordinates?.lng ?? activity.lng,
  };
}

function defaultActivity(spot: ItineraryGroundingSpot, index: number): GeneratedActivity {
  const times = ["11:00 AM", "3:00 PM", "7:00 PM", "9:00 PM"];
  const types = ["morning", "afternoon", "evening", "evening"] as const;
  const timingText = `${localizedText(spot.best_times)} ${categoryText(spot)}`.toLowerCase();
  const timing = /late|night|evening|bar|club|nightlife/.test(timingText)
    ? { time: "7:00 PM", type: "evening" as const }
    : /early|morning|breakfast/.test(timingText)
      ? { time: "9:00 AM", type: "morning" as const }
      : /lunch|noon/.test(timingText)
        ? { time: "12:00 PM", type: "afternoon" as const }
        : /afternoon/.test(timingText)
          ? { time: "3:00 PM", type: "afternoon" as const }
          : {
              time: times[Math.min(index, times.length - 1)],
              type: types[Math.min(index, types.length - 1)],
            };
  return hydrateActivity({
    name: localizedText(spot.name),
    time: timing.time,
    type: timing.type,
    duration: "1-2 hours",
    cost: "Varies",
  }, spot);
}

function distanceBetweenSpots(left: ItineraryGroundingSpot, right: ItineraryGroundingSpot): number {
  const a = parseSpotCoordinates(left.location);
  const b = parseSpotCoordinates(right.location);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(b.lat - a.lat);
  const longitudeDelta = radians(b.lng - a.lng);
  const startLatitude = radians(a.lat);
  const endLatitude = radians(b.lat);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bestFillerSpot(
  spots: ItineraryGroundingSpot[],
  usedSpotIds: Set<string>,
  previousSpot: ItineraryGroundingSpot | undefined,
  usedGroups: Set<string>,
  preferredInterestGroup?: string,
  reservedSpotIds: Set<string> = new Set(),
): ItineraryGroundingSpot | undefined {
  return spots
    .filter((spot) => !usedSpotIds.has(spot.id))
    .filter((spot) => !reservedSpotIds.has(spot.id))
    .filter((spot) => spotCategoryGroup(spot) !== "market" || !usedGroups.has("market"))
    .filter((spot) => !preferredInterestGroup || spotMatchesInterestGroup(spot, preferredInterestGroup))
    .sort((left, right) => {
      const leftDiversity = usedGroups.has(spotCategoryGroup(left)) ? 1 : 0;
      const rightDiversity = usedGroups.has(spotCategoryGroup(right)) ? 1 : 0;
      if (leftDiversity !== rightDiversity) return leftDiversity - rightDiversity;
      if (!previousSpot) return 0;
      return distanceBetweenSpots(previousSpot, left) - distanceBetweenSpots(previousSpot, right);
    })[0];
}

function matchingInterestGroups(spot: ItineraryGroundingSpot, groups: string[]): string[] {
  return groups.filter((group) => spotMatchesInterestGroup(spot, group));
}

function rebuildUsedGroups(
  selected: Array<{ activity: GeneratedActivity; spot: ItineraryGroundingSpot }>,
): Set<string> {
  return new Set(selected.map(({ spot }) => spotCategoryGroup(spot)));
}

function replacementIndexForInterest(
  selected: Array<{ activity: GeneratedActivity; spot: ItineraryGroundingSpot }>,
  requestedGroups: string[],
): number {
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const matches = matchingInterestGroups(selected[index].spot, requestedGroups);
    if (matches.length === 0) return index;
    const allDuplicated = matches.every((group) =>
      selected.filter(({ spot }) => spotMatchesInterestGroup(spot, group)).length > 1,
    );
    if (allDuplicated) return index;
  }
  return selected.length - 1;
}

function maximumRouteLegKm(pace = "moderate"): number {
  if (pace === "relaxed") return 12;
  if (pace === "moderate") return 18;
  return 25;
}

function spotSupportsActivityTime(spot: ItineraryGroundingSpot, activity: GeneratedActivity): boolean {
  const bestTimes = localizedText(spot.best_times).toLowerCase();
  if (!bestTimes) return true;
  const activityMinutes = activityTimeMinutes(activity);
  const isMorning = activity.type === "morning" || activityMinutes < 12 * 60;
  const isEvening = activity.type === "evening" || activityMinutes >= 17 * 60;
  if (/early|morning|breakfast/.test(bestTimes) && isEvening) return false;
  if (/late|night|evening/.test(bestTimes) && isMorning) return false;
  if (/lunch|noon/.test(bestTimes) && isEvening) return false;
  return true;
}

function repairLongRouteLegs(
  selected: Array<{ activity: GeneratedActivity; spot: ItineraryGroundingSpot }>,
  rankedSpots: ItineraryGroundingSpot[],
  usedSpotIds: Set<string>,
  pace: string | undefined,
  requestedGroups: string[],
): boolean {
  const maximumLeg = maximumRouteLegKm(pace);
  for (let index = 1; index < selected.length; index += 1) {
    const previous = selected[index - 1].spot;
    const current = selected[index].spot;
    if (distanceBetweenSpots(previous, current) <= maximumLeg) continue;
    const currentGroup = spotCategoryGroup(current);
    const currentInterests = matchingInterestGroups(current, requestedGroups);
    const replacement = rankedSpots.find((spot) =>
      !usedSpotIds.has(spot.id) &&
      spotCategoryGroup(spot) === currentGroup &&
      currentInterests.every((interest) => spotMatchesInterestGroup(spot, interest)) &&
      spotSupportsActivityTime(spot, selected[index].activity) &&
      distanceBetweenSpots(previous, spot) <= maximumLeg,
    );
    if (!replacement) return false;
    usedSpotIds.delete(current.id);
    usedSpotIds.add(replacement.id);
    selected[index] = {
      spot: replacement,
      activity: hydrateActivity(selected[index].activity, replacement),
    };
  }
  return true;
}

function activityTimeMinutes(activity: GeneratedActivity): number {
  const value = activity.time?.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!value) return Number.POSITIVE_INFINITY;
  let hours = Number(value[1]) % 12;
  if (value[3].toUpperCase() === "PM") hours += 12;
  return hours * 60 + Number(value[2]);
}

export function groundGeneratedDailyPlans(
  dailyPlans: GeneratedDayPlan[],
  rankedSpots: ItineraryGroundingSpot[],
  preferences: ItineraryGroundingPreferences,
): GeneratedDayPlan[] {
  if (rankedSpots.length === 0) return dailyPlans;

  const spotsById = new Map(rankedSpots.map((spot) => [spot.id, spot]));
  const spotsByName = new Map(
    rankedSpots.map((spot) => [normalizedName(localizedText(spot.name)), spot]),
  );
  const usedSpotIds = new Set<string>();
  const { min, max } = getPaceStopRange(preferences.pace);
  const requestedGroups = requestedInterestGroups(preferences.interests);

  const groundedPlans = Array.from({ length: preferences.days }, (_, dayIndex) => {
    const day = dailyPlans[dayIndex] || {
      day: dayIndex + 1,
      theme: `Local discoveries — day ${dayIndex + 1}`,
      activities: [],
    };
    const selected: Array<{ activity: GeneratedActivity; spot: ItineraryGroundingSpot }> = [];
    let usedGroups = new Set<string>();
    const requiredGroups = requestedGroups.filter((_, index) => index % preferences.days === dayIndex);
    const futureGroups = requestedGroups.filter((_, index) => index % preferences.days > dayIndex);
    const remainingDays = preferences.days - dayIndex - 1;
    const reservedSpotIds = new Set<string>();
    for (const interest of futureGroups) {
      const reserved = rankedSpots.find(
        (spot) => !usedSpotIds.has(spot.id) && spotMatchesInterestGroup(spot, interest),
      );
      if (reserved) reservedSpotIds.add(reserved.id);
    }
    const availableUnusedSpots = rankedSpots.filter((spot) => !usedSpotIds.has(spot.id));
    const availableUnusedMarkets = availableUnusedSpots.filter(
      (spot) => spotCategoryGroup(spot) === "market",
    ).length;
    const futureMarketSlots = Math.min(remainingDays, availableUnusedMarkets);
    const futureNonMarketsNeeded = Math.max(0, remainingDays * min - futureMarketSlots);
    const nonMarketReservationCandidates = availableUnusedSpots
      .filter((spot) => spotCategoryGroup(spot) !== "market")
      .filter((spot) => !reservedSpotIds.has(spot.id))
      .sort((left, right) => {
        const leftNeededNow = requiredGroups.some((interest) => spotMatchesInterestGroup(left, interest)) ? 1 : 0;
        const rightNeededNow = requiredGroups.some((interest) => spotMatchesInterestGroup(right, interest)) ? 1 : 0;
        return leftNeededNow - rightNeededNow;
      });
    nonMarketReservationCandidates
      .slice(0, futureNonMarketsNeeded)
      .forEach((spot) => reservedSpotIds.add(spot.id));
    const availableForCurrentDay = rankedSpots.length - usedSpotIds.size - remainingDays * min;
    const dayMax = Math.min(max, Math.max(min, availableForCurrentDay));

    for (const activity of day.activities || []) {
      const spot = (activity.spotId && spotsById.get(activity.spotId)) ||
        spotsByName.get(normalizedName(activity.name || ""));
      if (!spot || usedSpotIds.has(spot.id) || reservedSpotIds.has(spot.id)) continue;
      const group = spotCategoryGroup(spot);
      if (group === "market" && usedGroups.has("market")) continue;
      if (selected.at(-1) && spotCategoryGroup(selected.at(-1)!.spot) === group) continue;
      selected.push({ activity: hydrateActivity(activity, spot), spot });
      usedSpotIds.add(spot.id);
      usedGroups.add(group);
      if (selected.length === dayMax) break;
    }

    while (selected.length < min) {
      const filler = bestFillerSpot(
        rankedSpots,
        usedSpotIds,
        selected.at(-1)?.spot,
        usedGroups,
        undefined,
        reservedSpotIds,
      );
      if (!filler) break;
      selected.push({ activity: defaultActivity(filler, selected.length), spot: filler });
      usedSpotIds.add(filler.id);
      usedGroups.add(spotCategoryGroup(filler));
    }

    for (const interest of requiredGroups) {
      if (selected.some(({ spot }) => spotMatchesInterestGroup(spot, interest))) continue;
      let removedEntry: { activity: GeneratedActivity; spot: ItineraryGroundingSpot } | undefined;
      let removedIndex = -1;
      if (selected.length >= dayMax) {
        removedIndex = replacementIndexForInterest(selected, requestedGroups);
        removedEntry = selected[removedIndex];
        usedSpotIds.delete(removedEntry.spot.id);
        selected.splice(removedIndex, 1);
        usedGroups = rebuildUsedGroups(selected);
      }
      const filler = bestFillerSpot(
        rankedSpots,
        usedSpotIds,
        selected.at(-1)?.spot,
        usedGroups,
        interest,
        reservedSpotIds,
      );
      if (!filler) {
        if (removedEntry) {
          selected.splice(removedIndex, 0, removedEntry);
          usedSpotIds.add(removedEntry.spot.id);
          usedGroups = rebuildUsedGroups(selected);
        }
        continue;
      }
      selected.push({ activity: defaultActivity(filler, selected.length), spot: filler });
      usedSpotIds.add(filler.id);
      usedGroups.add(spotCategoryGroup(filler));
    }

    selected.sort((left, right) => activityTimeMinutes(left.activity) - activityTimeMinutes(right.activity));
    const routeIsFeasible = repairLongRouteLegs(
      selected,
      rankedSpots,
      usedSpotIds,
      preferences.pace,
      requestedGroups,
    );
    if (!routeIsFeasible) {
      throw new Error(`Could not build a geographically feasible route for day ${dayIndex + 1}.`);
    }

    return {
      ...day,
      day: day.day || dayIndex + 1,
      activities: selected.map(({ activity }) => activity),
    };
  });

  for (const interest of requestedGroups) {
    const covered = groundedPlans.some((day) =>
      (day.activities || []).some((activity) => {
        const spot = activity.spotId ? spotsById.get(activity.spotId) : undefined;
        return Boolean(spot && spotMatchesInterestGroup(spot, interest));
      }),
    );
    if (!covered) {
      throw new Error(`Could not cover the requested ${interest} interest with verified spots.`);
    }
  }

  return groundedPlans;
}
