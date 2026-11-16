/** Free planner link, optionally preselecting a city (the wizard reads ?city=). Push AC1. */
export function freePlannerHref(city?: string | null): string {
  const name = typeof city === "string" ? city.trim() : "";
  return name ? `/itineraries/new?${new URLSearchParams({ city: name })}` : "/itineraries/new";
}
