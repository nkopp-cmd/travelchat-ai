// Push CD2: meta descriptions for the city hub (/spots?city=) and the A-Z list. Searchers do not know the internal
// "Localley Score"; the snippet says what the page gives and ends with the free trip planner as the next step.
export const HUB_META_TAIL = "Plan your days free with the trip planner.";

export const singaporeHubSnippet = {
  title: "Hidden gems in Singapore: Markets and Cafes",
  description: "Find markets, cafés and other local spots in Singapore. Filter by neighbourhood or see what’s open now, then use the free planner to build your day.",
};

export function cityHubDescription(city: string, country: string): string {
  return `Hidden gems in ${city}, ${country}: cafes, food, bars and sights locals pick. Filter by area and open now. ${HUB_META_TAIL}`;
}

export const SPOTS_INDEX_DESCRIPTION =
  `Local favorites in Seoul, Tokyo, Bangkok, Singapore and more Asian cities: cafes, food, bars and sights locals pick. ${HUB_META_TAIL}`;

export function cityAzDescription(city: string, country: string): string {
  return `Every local spot in ${city}, ${country}, from A to Z. Open a spot for local tips and the map. ${HUB_META_TAIL}`;
}
