/**
 * City Images Utility
 *
 * Curated Unsplash images for known cities.
 * Used across itinerary cards, dashboard stories, and other city-related UI.
 */

// Map of cities to their Unsplash photo URLs
const CITY_IMAGES: Record<string, string> = {
  // Asia
  "tokyo": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
  "seoul": "https://images.unsplash.com/photo-1538485399081-7191377e8241",
  "bangkok": "https://images.unsplash.com/photo-1508009603885-50cf7c579365",
  "singapore": "https://images.unsplash.com/photo-1525625293386-3f8f99389edd",
  "hong kong": "https://images.unsplash.com/photo-1536599018102-9f803c140fc1",
  "osaka": "https://images.unsplash.com/photo-1590559899731-a382839e5549",
  "kyoto": "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e",
  "taipei": "https://images.unsplash.com/photo-1470004914212-05527e49370b",
  "bali": "https://images.unsplash.com/photo-1537996194471-e657df975ab4",
  "hanoi": "https://images.unsplash.com/photo-1509030450996-dd1a26dda07a",
  "ho chi minh": "https://images.unsplash.com/photo-1583417319070-4a69db38a482",
  "kuala lumpur": "https://images.unsplash.com/photo-1596422846543-75c6fc197f07",
  "manila": "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86",
  "busan": "https://images.unsplash.com/photo-1596178065887-1198b6148b2b",
  "jeju": "https://images.unsplash.com/photo-1616798249081-30877e213b16",
  "chiang mai": "https://images.unsplash.com/photo-1528181304800-259b08848526",
  "da nang": "https://images.unsplash.com/photo-1701396173275-835886dd72ce",
  "penang": "https://images.unsplash.com/photo-1650163410135-e5355b4ff33e",
  "nara": "https://images.unsplash.com/photo-1720573166278-4ac6ba745a2a",
  "kanazawa": "https://images.unsplash.com/photo-1627304827615-3a05fafaed7a",
  "gyeongju": "https://images.unsplash.com/photo-1684134549350-be5fd0d8feaa",
  "sapporo": "https://images.unsplash.com/photo-1736156725121-027231636f9d",
  "okinawa": "https://images.unsplash.com/photo-1664888882993-5bc4b906db5e",
  "phuket": "https://images.unsplash.com/photo-1589394815804-964ed0be2eb5",
  "siem reap": "https://images.unsplash.com/photo-1539650116574-8efeb43e2750",
  "hoi an": "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b",
  "luang prabang": "https://images.unsplash.com/photo-1583417267826-aebc4d1542e1",
  "ubud": "https://images.unsplash.com/photo-1555400038-63f5ba517a47",
  "canggu": "https://images.unsplash.com/photo-1724568834710-d5db3faab7e8",
  // Europe
  "paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34",
  "london": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad",
  "rome": "https://images.unsplash.com/photo-1552832230-c0197dd311b5",
  "barcelona": "https://images.unsplash.com/photo-1583422409516-2895a77efded",
  "amsterdam": "https://images.unsplash.com/photo-1534351590666-13e3e96b5017",
  "berlin": "https://images.unsplash.com/photo-1560969184-10fe8719e047",
  "prague": "https://images.unsplash.com/photo-1519677100203-a0e668c92439",
  "vienna": "https://images.unsplash.com/photo-1516550893923-42d28e5677af",
  "lisbon": "https://images.unsplash.com/photo-1585208798174-6cedd86e019a",
  // Americas
  "new york": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9",
  "los angeles": "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da",
  "san francisco": "https://images.unsplash.com/photo-1501594907352-04cda38ebc29",
  "miami": "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2",
  "chicago": "https://images.unsplash.com/photo-1494522855154-9297ac14b55f",
  "toronto": "https://images.unsplash.com/photo-1517090504486-6c08a4dc119c",
  "mexico city": "https://images.unsplash.com/photo-1518659526054-190340b32735",
  // Oceania
  "sydney": "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9",
  "melbourne": "https://images.unsplash.com/photo-1514395462725-fb4566210144",
  "auckland": "https://images.unsplash.com/photo-1507699622108-4be3abd695ad",
  // Middle East
  "dubai": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c",
  "istanbul": "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200",
};

// Gradient fallbacks for cities without images
const CITY_GRADIENTS = [
  "from-rose-500/80 via-orange-400/60 to-amber-300/40",
  "from-violet-500/80 via-purple-400/60 to-fuchsia-300/40",
  "from-cyan-500/80 via-blue-400/60 to-indigo-300/40",
  "from-emerald-500/80 via-teal-400/60 to-green-300/40",
  "from-amber-500/80 via-yellow-400/60 to-lime-300/40",
  "from-pink-500/80 via-rose-400/60 to-red-300/40",
  "from-indigo-500/80 via-violet-400/60 to-purple-300/40",
  "from-teal-500/80 via-emerald-400/60 to-green-300/40",
];

/**
 * Get a city image URL with optional size parameters
 *
 * @param city - City name to look up
 * @param options - Image options
 * @returns URL string or null if city not found
 */
export function getCityImageUrl(
  city: string,
  options: { width?: number; quality?: number } = {}
): string | null {
  const { width = 800, quality = 80 } = options;
  const cityLower = city.toLowerCase().trim();

  // Check for exact match or partial match
  for (const [key, baseUrl] of Object.entries(CITY_IMAGES)) {
    if (cityLower.includes(key) || key.includes(cityLower)) {
      return `${baseUrl}?w=${width}&q=${quality}`;
    }
  }

  return null;
}

/**
 * Get a consistent gradient for a city (used as fallback when no image)
 *
 * @param city - City name
 * @returns Tailwind gradient classes
 */
export function getCityGradient(city: string): string {
  const hash = city.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CITY_GRADIENTS[hash % CITY_GRADIENTS.length];
}

/**
 * Get display name for a city (handles unknown/empty values)
 *
 * @param city - City name or null/undefined
 * @returns Clean display name
 */
export function getDisplayCity(city: string | null | undefined): string {
  if (!city || city.toLowerCase() === "unknown city" || city.trim() === "") {
    return "Adventure Awaits";
  }
  return city;
}

/**
 * Get short city name (first part before comma)
 *
 * @param city - Full city name (e.g., "Tokyo, Japan")
 * @returns Short name (e.g., "Tokyo")
 */
export function getShortCity(city: string | null | undefined): string {
  if (!city || city.toLowerCase() === "unknown city") return "Trip";
  return city.split(",")[0].trim();
}

/**
 * Check if a city has a curated image available
 *
 * @param city - City name to check
 * @returns True if image available
 */
export function hasCityImage(city: string): boolean {
  const cityLower = city.toLowerCase().trim();
  return Object.keys(CITY_IMAGES).some(
    key => cityLower.includes(key) || key.includes(cityLower)
  );
}

/**
 * Get all supported cities with images
 *
 * @returns Array of city names
 */
export function getSupportedCities(): string[] {
  return Object.keys(CITY_IMAGES);
}
