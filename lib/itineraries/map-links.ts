import { isKoreanCity } from "@/hooks/use-map-provider";
import { isAreaLevelAddress } from "@/lib/spots/location-confidence";

export interface MapLinkActivity {
  name: string;
  nameKo?: string;
  address?: string;
}

export type DayRouteAddressMode = "empty" | "exact" | "mixed" | "search_first";

export interface DayRouteAddressSummary {
  mode: DayRouteAddressMode;
  mappableStopCount: number;
  exactStopCount: number;
  searchFirstStopCount: number;
}

function cleanPart(value: string | undefined): string {
  return value?.trim() || "";
}

function uniqueParts(parts: string[]): string[] {
  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = part.toLowerCase();
    if (!part || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getActivitySearchText(activity: MapLinkActivity, city: string): string {
  const address = cleanPart(activity.address);
  const cityName = cleanPart(city);
  const shouldAppendCity = cityName && !address.toLowerCase().includes(cityName.toLowerCase());

  return uniqueParts([
    cleanPart(activity.name),
    address,
    shouldAppendCity ? cityName : "",
  ]).join(", ");
}

export function hasExactActivityAddress(address: string | undefined): boolean {
  const cleanedAddress = cleanPart(address);
  return Boolean(cleanedAddress) && !isAreaLevelAddress(cleanedAddress);
}

export function getDayRouteAddressSummary(
  activities: MapLinkActivity[],
): DayRouteAddressSummary {
  const mappableActivities = activities.filter((activity) => activity.address || activity.name);
  const exactStopCount = mappableActivities.filter((activity) =>
    hasExactActivityAddress(activity.address),
  ).length;
  const searchFirstStopCount = mappableActivities.length - exactStopCount;

  if (mappableActivities.length === 0) {
    return {
      mode: "empty",
      mappableStopCount: 0,
      exactStopCount: 0,
      searchFirstStopCount: 0,
    };
  }

  if (exactStopCount === mappableActivities.length) {
    return {
      mode: "exact",
      mappableStopCount: mappableActivities.length,
      exactStopCount,
      searchFirstStopCount,
    };
  }

  if (exactStopCount > 0) {
    return {
      mode: "mixed",
      mappableStopCount: mappableActivities.length,
      exactStopCount,
      searchFirstStopCount,
    };
  }

  return {
    mode: "search_first",
    mappableStopCount: mappableActivities.length,
    exactStopCount,
    searchFirstStopCount,
  };
}

export function getPreferredActivityMapAddress(
  activity: MapLinkActivity,
  matchedAddress?: string | null,
): string {
  const storedAddress = cleanPart(activity.address);
  const placeAddress = cleanPart(matchedAddress || undefined);

  if (hasExactActivityAddress(storedAddress)) return storedAddress;
  return placeAddress || storedAddress;
}

export function buildActivityMapUrl(activity: MapLinkActivity, city: string): string | null {
  const address = cleanPart(activity.address);
  const cityName = cleanPart(city);
  const name = cleanPart(activity.name);
  if (!address && !name) return null;

  if (isKoreanCity(city)) {
    const kakaoQuery = cleanPart(activity.nameKo) || uniqueParts([name, address, cityName]).join(" ");
    return `https://map.kakao.com/link/search/${encodeURIComponent(kakaoQuery)}`;
  }

  const query = getActivitySearchText(activity, city);
  if (!query) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildDayRouteUrl(activities: MapLinkActivity[], city: string): string {
  const mappableActivities = activities.filter((activity) => activity.address || activity.name);
  if (mappableActivities.length === 0) return "";

  if (isKoreanCity(city)) {
    const first = mappableActivities[0];
    const kakaoQuery =
      cleanPart(first.nameKo) ||
      [cleanPart(first.name), cleanPart(first.address)].filter(Boolean).join(" ");
    return `https://map.kakao.com/link/search/${encodeURIComponent(kakaoQuery)}`;
  }

  const waypoints = mappableActivities.map((activity) => getActivitySearchText(activity, city));

  if (waypoints.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(waypoints[0])}`;
  }

  const params = new URLSearchParams({
    api: "1",
    origin: waypoints[0],
    destination: waypoints[waypoints.length - 1],
    travelmode: "walking",
  });

  const middleWaypoints = waypoints.slice(1, -1);
  if (middleWaypoints.length > 0) {
    params.set("waypoints", middleWaypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
