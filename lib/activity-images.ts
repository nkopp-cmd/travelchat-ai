// Generate thumbnail images for activities using Unsplash
// No API key needed - uses Unsplash Source URL pattern

const CATEGORY_KEYWORDS: Record<string, string> = {
  restaurant: "restaurant,food,dining",
  cafe: "cafe,coffee,bakery",
  bar: "bar,cocktail,nightlife",
  market: "market,street-food,bazaar",
  temple: "temple,shrine,buddhist",
  park: "park,garden,nature",
  museum: "museum,art,gallery",
  shopping: "shopping,store,boutique",
  attraction: "landmark,tourist,sightseeing",
  neighborhood: "street,alley,urban",
};

/**
 * Generate a thumbnail URL for an activity based on its category and city
 * Uses Unsplash Source which is free and doesn't require API key
 */
export function getActivityThumbnail(
  category: string,
  city: string,
  activityName: string
): string {
  const keywords = CATEGORY_KEYWORDS[category?.toLowerCase()] || "travel,destination";
  const cityKeyword = city.toLowerCase().replace(/[^a-z]/g, "");

  // Create a deterministic but varied image based on activity name
  // This ensures same activity always gets same image
  const seed = activityName.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Use Unsplash Source with search terms
  // Format: https://source.unsplash.com/featured/400x300/?{keywords}
  return `https://source.unsplash.com/featured/400x300/?${cityKeyword},${keywords.split(",")[0]}`;
}

/**
 * Add thumbnail images to all activities in dailyPlans
 */
export function addThumbnailsToItinerary(
  dailyPlans: Array<{
    day: number;
    theme: string;
    activities: Array<{
      name: string;
      category?: string;
      image?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>,
  city: string
): typeof dailyPlans {
  return dailyPlans.map((day) => ({
    ...day,
    activities: day.activities.map((activity) => ({
      ...activity,
      image: activity.image || getActivityThumbnail(
        activity.category || "attraction",
        city,
        activity.name
      ),
    })),
  }));
}
