import type { Spot } from "@/types";

/**
 * Push BM3: a city hub (/spots?city=<slug>) only lists spots whose address names that city, so a spot with no
 * resolved city (an ambiguous address) takes the hub city. Its "Add to trip" link then opens the planner on the
 * right city. Spots that already have a city keep it.
 */
export function withHubCity(spots: Spot[], city: { name: string; slug: string } | undefined): Spot[] {
  if (!city) return spots;
  return spots.map((spot) => (spot.cityName ? spot : { ...spot, cityName: city.name, citySlug: spot.citySlug ?? city.slug }));
}
