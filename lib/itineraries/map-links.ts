import { isKoreanCity } from "@/hooks/use-map-provider";

export interface MapLinkActivity {
  name: string;
  nameKo?: string;
  address?: string;
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
