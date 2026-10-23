// The planner's city list request. The /itineraries/new layout preloads this exact URL in the
// static HTML, so the request runs while the JS loads instead of after the wizard renders.
export const PLANNER_CITIES_URL = "/api/cities?minSpots=1";
