// Generate thumbnail images for activities
// - Free tier: Unsplash placeholders (no API key needed)
// - Pro/Premium: AI-generated images via Gemini, stored in Supabase Storage

import { generateActivityThumbnail as generateAIThumbnail, isImagenAvailable } from './imagen';
import { createSupabaseAdmin } from './supabase';

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

  // Use Unsplash Source with search terms
  // Format: https://source.unsplash.com/featured/400x300/?{keywords}
  return `https://source.unsplash.com/featured/400x300/?${cityKeyword},${keywords.split(",")[0]}`;
}

/**
 * Generate a unique storage key for an activity image
 */
function generateImageKey(activityName: string, city: string): string {
  // Create a deterministic hash from activity name and city
  const input = `${activityName}-${city}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `activity-thumbnails/${Math.abs(hash).toString(16)}.png`;
}

/**
 * Upload an AI-generated image to Supabase Storage and return the public URL
 */
async function uploadImageToStorage(
  imageBase64: string,
  storageKey: string
): Promise<string | null> {
  try {
    const supabase = createSupabaseAdmin();
    const buffer = Buffer.from(imageBase64, 'base64');

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(storageKey, buffer, {
        contentType: 'image/png',
        upsert: true, // Overwrite if exists
      });

    if (uploadError) {
      console.error('[activity-images] Upload error:', uploadError);
      return null;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('generated-images')
      .getPublicUrl(storageKey);

    return urlData?.publicUrl || null;
  } catch (error) {
    console.error('[activity-images] Storage upload failed:', error);
    return null;
  }
}

/**
 * Check if an image already exists in storage
 */
async function getExistingImageUrl(storageKey: string): Promise<string | null> {
  try {
    const supabase = createSupabaseAdmin();

    // Try to get the file info
    const { data } = await supabase.storage
      .from('generated-images')
      .list(storageKey.split('/')[0], {
        search: storageKey.split('/')[1],
      });

    if (data && data.length > 0) {
      const { data: urlData } = supabase.storage
        .from('generated-images')
        .getPublicUrl(storageKey);
      return urlData?.publicUrl || null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Generate an AI thumbnail for an activity (Pro/Premium feature)
 * Returns a public URL from Supabase Storage, or null if generation fails
 */
export async function getAIActivityThumbnail(
  activityName: string,
  category: string,
  city: string
): Promise<string | null> {
  if (!isImagenAvailable()) {
    return null;
  }

  const storageKey = generateImageKey(activityName, city);

  // Check if we already have this image cached in storage
  const existingUrl = await getExistingImageUrl(storageKey);
  if (existingUrl) {
    return existingUrl;
  }

  try {
    // Generate new AI image
    const imageBase64 = await generateAIThumbnail(activityName, category, city);
    if (!imageBase64) {
      return null;
    }

    // Upload to storage and get URL
    const publicUrl = await uploadImageToStorage(imageBase64, storageKey);
    return publicUrl;
  } catch (error) {
    console.error('[activity-images] AI generation failed:', error);
    return null;
  }
}

/**
 * Generate a thumbnail URL for a city
 * Uses Unsplash Source for free images
 */
export function getCityThumbnail(city: string): string {
  const cityKeyword = city.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, "-");
  return `https://source.unsplash.com/featured/800x600/?${cityKeyword},city,travel`;
}

/**
 * Add thumbnail images to all activities in dailyPlans
 * Uses Unsplash placeholders (for immediate display)
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

/**
 * Add AI-generated thumbnail images to activities (Pro/Premium)
 * Images are uploaded to Supabase Storage and URLs are returned
 * This reduces database payload size significantly
 */
export async function addAIThumbnailsToItinerary(
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
  city: string,
  maxImages: number = 6 // Limit to avoid rate limits and long wait times
): Promise<typeof dailyPlans> {
  if (!isImagenAvailable()) {
    // Fall back to Unsplash if AI not available
    return addThumbnailsToItinerary(dailyPlans, city);
  }

  // Collect all activities that need images
  const activitiesNeedingImages: Array<{
    dayIndex: number;
    activityIndex: number;
    activity: { name: string; category?: string };
  }> = [];

  dailyPlans.forEach((day, dayIndex) => {
    day.activities.forEach((activity, activityIndex) => {
      if (!activity.image) {
        activitiesNeedingImages.push({
          dayIndex,
          activityIndex,
          activity: { name: activity.name, category: activity.category },
        });
      }
    });
  });

  // Limit the number of AI images to generate
  const toGenerate = activitiesNeedingImages.slice(0, maxImages);
  const remaining = activitiesNeedingImages.slice(maxImages);

  // Clone the dailyPlans to avoid mutation
  const result = JSON.parse(JSON.stringify(dailyPlans));

  // Generate AI images in parallel (with concurrency limit)
  const CONCURRENCY = 3;
  for (let i = 0; i < toGenerate.length; i += CONCURRENCY) {
    const batch = toGenerate.slice(i, i + CONCURRENCY);
    const promises = batch.map(async ({ dayIndex, activityIndex, activity }) => {
      try {
        const aiImageUrl = await getAIActivityThumbnail(
          activity.name,
          activity.category || 'attraction',
          city
        );
        if (aiImageUrl) {
          result[dayIndex].activities[activityIndex].image = aiImageUrl;
          result[dayIndex].activities[activityIndex].aiGenerated = true;
        } else {
          // Fallback to Unsplash
          result[dayIndex].activities[activityIndex].image = getActivityThumbnail(
            activity.category || 'attraction',
            city,
            activity.name
          );
        }
      } catch (error) {
        console.error(`[activity-images] Failed to generate AI image for ${activity.name}:`, error);
        // Fallback to Unsplash
        result[dayIndex].activities[activityIndex].image = getActivityThumbnail(
          activity.category || 'attraction',
          city,
          activity.name
        );
      }
    });

    await Promise.all(promises);
  }

  // Use Unsplash for remaining activities beyond the limit
  for (const { dayIndex, activityIndex, activity } of remaining) {
    result[dayIndex].activities[activityIndex].image = getActivityThumbnail(
      activity.category || 'attraction',
      city,
      activity.name
    );
  }

  return result;
}
