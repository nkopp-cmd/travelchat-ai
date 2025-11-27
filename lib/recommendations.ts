import { createSupabaseAdmin } from './supabase';

/**
 * Recommendation Engine
 * Generates personalized spot recommendations based on user history
 */

interface UserItinerary {
  id: string;
  city: string;
  activities: any;
  created_at: string;
}

interface Spot {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  localley_score: number;
  location: any;
  photos: string[];
  verified: boolean;
  trending_score: number;
}

interface RecommendedSpot extends Spot {
  recommendationScore: number;
  reason: string;
}

interface CategoryPreference {
  category: string;
  count: number;
  weight: number;
}

/**
 * Extract activities from itinerary
 */
function extractActivities(itinerary: UserItinerary): string[] {
  try {
    const activities = typeof itinerary.activities === 'string'
      ? JSON.parse(itinerary.activities)
      : itinerary.activities;

    if (!Array.isArray(activities)) return [];

    const activityNames: string[] = [];

    activities.forEach((day: any) => {
      if (day.activities && Array.isArray(day.activities)) {
        day.activities.forEach((activity: any) => {
          if (activity.name) {
            activityNames.push(activity.name.toLowerCase());
          }
        });
      }
    });

    return activityNames;
  } catch (error) {
    console.error('Error extracting activities:', error);
    return [];
  }
}

/**
 * Calculate category preferences from user's itinerary history
 */
function calculateCategoryPreferences(itineraries: UserItinerary[]): CategoryPreference[] {
  const categoryCount: Record<string, number> = {};

  // Count categories from itineraries (inferred from activity keywords)
  itineraries.forEach((itinerary) => {
    const activities = extractActivities(itinerary);

    activities.forEach((activity) => {
      // Infer categories from activity names
      if (activity.includes('cafe') || activity.includes('coffee')) {
        categoryCount['Cafe'] = (categoryCount['Cafe'] || 0) + 1;
      }
      if (activity.includes('restaurant') || activity.includes('food') || activity.includes('eat')) {
        categoryCount['Food'] = (categoryCount['Food'] || 0) + 1;
      }
      if (activity.includes('market') || activity.includes('shopping')) {
        categoryCount['Market'] = (categoryCount['Market'] || 0) + 1;
      }
      if (activity.includes('bar') || activity.includes('club') || activity.includes('nightlife')) {
        categoryCount['Nightlife'] = (categoryCount['Nightlife'] || 0) + 1;
      }
      if (activity.includes('park') || activity.includes('outdoor') || activity.includes('nature')) {
        categoryCount['Outdoor'] = (categoryCount['Outdoor'] || 0) + 1;
      }
    });
  });

  // Calculate weights (normalize to sum to 1)
  const total = Object.values(categoryCount).reduce((sum, count) => sum + count, 0) || 1;

  return Object.entries(categoryCount).map(([category, count]) => ({
    category,
    count,
    weight: count / total,
  }));
}

/**
 * Get cities user has visited from their itineraries
 */
function getVisitedCities(itineraries: UserItinerary[]): string[] {
  return [...new Set(itineraries.map((itinerary) => itinerary.city.toLowerCase()))];
}

/**
 * Check if spot matches user preferences
 */
function matchesPreferences(
  spot: Spot,
  preferences: CategoryPreference[],
  visitedCities: string[]
): { score: number; reason: string } {
  let score = 0;
  let reason = '';

  // Base score from Localley score (0-6 range normalized to 0-40)
  score += (spot.localley_score / 6) * 40;

  // Category match (up to 30 points)
  const categoryPref = preferences.find((pref) => pref.category === spot.category);
  if (categoryPref) {
    const categoryPoints = categoryPref.weight * 30;
    score += categoryPoints;
    reason = `Matches your interest in ${spot.category.toLowerCase()}`;
  }

  // Subcategory match (up to 10 points)
  const subcategoryMatch = spot.subcategories?.some((sub) =>
    preferences.some((pref) => sub.toLowerCase().includes(pref.category.toLowerCase()))
  );
  if (subcategoryMatch) {
    score += 10;
  }

  // Verified spot bonus (5 points)
  if (spot.verified) {
    score += 5;
  }

  // Trending bonus (5 points)
  if (spot.trending_score > 0.7) {
    score += 5;
    if (!reason) reason = 'Trending spot';
  }

  // High local score bonus (10 points for 5-6 score)
  if (spot.localley_score >= 5) {
    score += 10;
    if (!reason) reason = 'Hidden gem with high local score';
  }

  // New city exploration (prefer cities not yet visited)
  const spotCity = extractCityFromAddress(spot.location);
  if (spotCity && !visitedCities.includes(spotCity.toLowerCase())) {
    score += 5;
    if (!reason) reason = `Discover ${spotCity}`;
  }

  // Default reason
  if (!reason) {
    reason = 'Recommended for you';
  }

  return { score, reason };
}

/**
 * Extract city from location data
 */
function extractCityFromAddress(location: any): string | null {
  try {
    if (!location) return null;

    // Try to get address string
    let address = '';
    if (typeof location.address === 'string') {
      address = location.address;
    } else if (typeof location.address === 'object' && location.address.en) {
      address = location.address.en;
    }

    // Extract city (usually first part before comma)
    const parts = address.split(',');
    return parts[0]?.trim() || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get personalized spot recommendations for a user
 *
 * @param userId - Clerk user ID
 * @param limit - Number of recommendations to return (default: 10)
 * @returns Array of recommended spots with scores and reasons
 */
export async function getRecommendations(
  userId: string,
  limit: number = 10
): Promise<RecommendedSpot[]> {
  const supabase = createSupabaseAdmin();

  try {
    // 1. Fetch user's itinerary history
    const { data: itineraries, error: itinerariesError } = await supabase
      .from('itineraries')
      .select('id, city, activities, created_at')
      .eq('clerk_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (itinerariesError) {
      console.error('Error fetching itineraries:', itinerariesError);
      return [];
    }

    // If user has no itineraries, return trending/top spots
    if (!itineraries || itineraries.length === 0) {
      return getDefaultRecommendations(limit);
    }

    // 2. Calculate user preferences
    const categoryPreferences = calculateCategoryPreferences(itineraries);
    const visitedCities = getVisitedCities(itineraries);

    // 3. Fetch all available spots
    const { data: spots, error: spotsError } = await supabase
      .from('spots')
      .select('*')
      .gte('localley_score', 3) // Only recommend decent spots
      .limit(200); // Limit to prevent too much data

    if (spotsError || !spots) {
      console.error('Error fetching spots:', spotsError);
      return [];
    }

    // 4. Score each spot based on preferences
    const scoredSpots: RecommendedSpot[] = spots.map((spot: any) => {
      const { score, reason } = matchesPreferences(
        spot,
        categoryPreferences,
        visitedCities
      );

      return {
        id: spot.id,
        name: typeof spot.name === 'object' ? spot.name.en || Object.values(spot.name)[0] : spot.name,
        description: typeof spot.description === 'object' ? spot.description.en || Object.values(spot.description)[0] : spot.description,
        category: spot.category || 'Uncategorized',
        subcategories: spot.subcategories || [],
        localley_score: spot.localley_score || 3,
        location: spot.location,
        photos: spot.photos || [],
        verified: spot.verified || false,
        trending_score: spot.trending_score || 0,
        recommendationScore: score,
        reason,
      };
    });

    // 5. Sort by recommendation score and return top N
    const recommendations = scoredSpots
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, limit);

    return recommendations;
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return [];
  }
}

/**
 * Get default recommendations for new users or when personalization fails
 */
async function getDefaultRecommendations(limit: number = 10): Promise<RecommendedSpot[]> {
  const supabase = createSupabaseAdmin();

  try {
    // Return highest-rated, trending spots
    const { data: spots, error } = await supabase
      .from('spots')
      .select('*')
      .gte('localley_score', 5) // Only legendary and hidden gems
      .order('localley_score', { ascending: false })
      .limit(limit);

    if (error || !spots) {
      console.error('Error fetching default recommendations:', error);
      return [];
    }

    return spots.map((spot: any) => ({
      id: spot.id,
      name: typeof spot.name === 'object' ? spot.name.en || Object.values(spot.name)[0] : spot.name,
      description: typeof spot.description === 'object' ? spot.description.en || Object.values(spot.description)[0] : spot.description,
      category: spot.category || 'Uncategorized',
      subcategories: spot.subcategories || [],
      localley_score: spot.localley_score || 3,
      location: spot.location,
      photos: spot.photos || [],
      verified: spot.verified || false,
      trending_score: spot.trending_score || 0,
      recommendationScore: spot.localley_score * 10,
      reason: 'Popular hidden gem',
    }));
  } catch (error) {
    console.error('Error fetching default recommendations:', error);
    return [];
  }
}

/**
 * Get recommendations for a specific city
 * Useful for showing "More spots like this" on spot detail pages
 */
export async function getCityRecommendations(
  city: string,
  currentSpotId: string,
  limit: number = 6
): Promise<RecommendedSpot[]> {
  const supabase = createSupabaseAdmin();

  try {
    const { data: spots, error } = await supabase
      .from('spots')
      .select('*')
      .ilike('address->>en', `%${city}%`)
      .neq('id', currentSpotId) // Exclude current spot
      .gte('localley_score', 4) // Only good spots
      .order('localley_score', { ascending: false })
      .limit(limit);

    if (error || !spots) {
      return [];
    }

    return spots.map((spot: any) => ({
      id: spot.id,
      name: typeof spot.name === 'object' ? spot.name.en || Object.values(spot.name)[0] : spot.name,
      description: typeof spot.description === 'object' ? spot.description.en || Object.values(spot.description)[0] : spot.description,
      category: spot.category || 'Uncategorized',
      subcategories: spot.subcategories || [],
      localley_score: spot.localley_score || 3,
      location: spot.location,
      photos: spot.photos || [],
      verified: spot.verified || false,
      trending_score: spot.trending_score || 0,
      recommendationScore: spot.localley_score * 10,
      reason: `More spots in ${city}`,
    }));
  } catch (error) {
    console.error('Error fetching city recommendations:', error);
    return [];
  }
}
