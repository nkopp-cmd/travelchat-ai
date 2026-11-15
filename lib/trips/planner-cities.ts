// The planner's city list request. The /itineraries/new layout preloads this exact URL in the
// static HTML, so the request runs while the JS loads instead of after the wizard renders.
export const PLANNER_CITIES_URL = "/api/cities?minSpots=1";

// Generate tells the model to choose ONLY from the city's real spots, so a free 3-day plan from a city
// with 1-3 spots comes back thin or fails. The picker offers a city only from this many spots up;
// a deep link (?city=) to a smaller city still works.
export const PLANNER_MIN_SPOTS = 10;

export function isPlannerCity(city: { spotCount: number }): boolean {
  return city.spotCount >= PLANNER_MIN_SPOTS;
}
