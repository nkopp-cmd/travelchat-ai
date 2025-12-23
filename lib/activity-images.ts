// Generate thumbnail images for activities
// - Free tier: Curated Unsplash images (direct URLs, no API needed)
// - Pro/Premium: AI-generated images via Gemini, stored in Supabase Storage

import { generateActivityThumbnail as generateAIThumbnail, isImagenAvailable } from './imagen';
import { createSupabaseAdmin } from './supabase';

/**
 * Curated high-quality images by city and category
 * Using direct Unsplash URLs (the Source API was deprecated in 2022)
 */
const CURATED_IMAGES: Record<string, Record<string, string[]>> = {
  seoul: {
    restaurant: [
      'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=400&h=300&fit=crop', // Korean BBQ
      'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=400&h=300&fit=crop', // Korean food
      'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=400&h=300&fit=crop', // Asian dining
    ],
    cafe: [
      'https://images.unsplash.com/photo-1559496417-e7f25cb247f3?w=400&h=300&fit=crop', // Coffee shop
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=300&fit=crop', // Cafe interior
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=300&fit=crop', // Cozy cafe
    ],
    bar: [
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=300&fit=crop', // Bar interior
      'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400&h=300&fit=crop', // Cocktails
    ],
    market: [
      'https://images.unsplash.com/photo-1555992336-fb0d29498b13?w=400&h=300&fit=crop', // Night market
      'https://images.unsplash.com/photo-1534531173927-aeb928d54385?w=400&h=300&fit=crop', // Street food
    ],
    temple: [
      'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=400&h=300&fit=crop', // Korean temple
      'https://images.unsplash.com/photo-1573165067541-4cd6d9837902?w=400&h=300&fit=crop', // Temple gate
    ],
    park: [
      'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=400&h=300&fit=crop', // Seoul park
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop', // Nature
    ],
    attraction: [
      'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=400&h=300&fit=crop', // Seoul skyline
      'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=400&h=300&fit=crop', // Gyeongbokgung
    ],
    neighborhood: [
      'https://images.unsplash.com/photo-1538485399081-7191377e8241?w=400&h=300&fit=crop', // Seoul alley
      'https://images.unsplash.com/photo-1546874177-9e664107314e?w=400&h=300&fit=crop', // Street scene
    ],
  },
  tokyo: {
    restaurant: [
      'https://images.unsplash.com/photo-1553621042-f6e147245754?w=400&h=300&fit=crop', // Ramen
      'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&h=300&fit=crop', // Sushi
      'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=400&h=300&fit=crop', // Japanese food
    ],
    cafe: [
      'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=400&h=300&fit=crop', // Japanese cafe
      'https://images.unsplash.com/photo-1559496417-e7f25cb247f3?w=400&h=300&fit=crop', // Coffee
    ],
    bar: [
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=300&fit=crop', // Bar
      'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&h=300&fit=crop', // Izakaya
    ],
    market: [
      'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=400&h=300&fit=crop', // Fish market
      'https://images.unsplash.com/photo-1555992336-fb0d29498b13?w=400&h=300&fit=crop', // Market
    ],
    temple: [
      'https://images.unsplash.com/photo-1583407723467-9b2d22504831?w=400&h=300&fit=crop', // Senso-ji
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=300&fit=crop', // Temple
    ],
    park: [
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=300&fit=crop', // Tokyo park
      'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=400&h=300&fit=crop', // Garden
    ],
    attraction: [
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&h=300&fit=crop', // Tokyo Tower
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400&h=300&fit=crop', // Shibuya
    ],
    neighborhood: [
      'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=400&h=300&fit=crop', // Tokyo street
      'https://images.unsplash.com/photo-1549693578-d683be217e58?w=400&h=300&fit=crop', // Alley
    ],
  },
  bangkok: {
    restaurant: [
      'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=400&h=300&fit=crop', // Thai food
      'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400&h=300&fit=crop', // Thai cuisine
    ],
    cafe: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=300&fit=crop', // Cafe
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=300&fit=crop', // Coffee
    ],
    bar: [
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=300&fit=crop', // Bar
      'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400&h=300&fit=crop', // Rooftop
    ],
    market: [
      'https://images.unsplash.com/photo-1555992336-fb0d29498b13?w=400&h=300&fit=crop', // Night market
      'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=300&fit=crop', // Floating market
    ],
    temple: [
      'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=400&h=300&fit=crop', // Wat Arun
      'https://images.unsplash.com/photo-1528181304800-259b08848526?w=400&h=300&fit=crop', // Grand Palace
    ],
    park: [
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop', // Park
    ],
    attraction: [
      'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400&h=300&fit=crop', // Bangkok landmark
      'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=400&h=300&fit=crop', // Temple
    ],
    neighborhood: [
      'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=400&h=300&fit=crop', // Street
    ],
  },
  singapore: {
    restaurant: [
      'https://images.unsplash.com/photo-1555992336-fb0d29498b13?w=400&h=300&fit=crop', // Hawker
      'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=400&h=300&fit=crop', // Asian dining
    ],
    cafe: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=300&fit=crop', // Cafe
      'https://images.unsplash.com/photo-1559496417-e7f25cb247f3?w=400&h=300&fit=crop', // Coffee
    ],
    bar: [
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=300&fit=crop', // Bar
    ],
    market: [
      'https://images.unsplash.com/photo-1555992336-fb0d29498b13?w=400&h=300&fit=crop', // Market
    ],
    temple: [
      'https://images.unsplash.com/photo-1579169825953-8de21a0c0839?w=400&h=300&fit=crop', // Temple
    ],
    park: [
      'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=400&h=300&fit=crop', // Gardens
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop', // Park
    ],
    attraction: [
      'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=400&h=300&fit=crop', // Marina Bay
      'https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=400&h=300&fit=crop', // Skyline
    ],
    neighborhood: [
      'https://images.unsplash.com/photo-1508964942454-1a56651d54ac?w=400&h=300&fit=crop', // Street
    ],
  },
};

// Default images for unknown cities/categories
const DEFAULT_CATEGORY_IMAGES: Record<string, string[]> = {
  restaurant: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400&h=300&fit=crop',
  ],
  cafe: [
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=300&fit=crop',
  ],
  bar: [
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=300&fit=crop',
  ],
  market: [
    'https://images.unsplash.com/photo-1555992336-fb0d29498b13?w=400&h=300&fit=crop',
  ],
  temple: [
    'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=300&fit=crop',
  ],
  park: [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
  ],
  museum: [
    'https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=400&h=300&fit=crop',
  ],
  shopping: [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
  ],
  attraction: [
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=300&fit=crop',
  ],
  neighborhood: [
    'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400&h=300&fit=crop',
  ],
};

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=300&fit=crop';

/**
 * Generate a thumbnail URL for an activity based on its category and city
 * Uses curated Unsplash direct URLs (no API key needed)
 */
export function getActivityThumbnail(
  category: string,
  city: string,
  _activityName: string
): string {
  const normalizedCity = city.toLowerCase().trim();
  const normalizedCategory = category?.toLowerCase().trim() || 'attraction';

  // Try to get city-specific images first
  const cityImages = CURATED_IMAGES[normalizedCity];
  if (cityImages && cityImages[normalizedCategory]) {
    const images = cityImages[normalizedCategory];
    return images[Math.floor(Math.random() * images.length)];
  }

  // Fall back to category defaults
  const categoryImages = DEFAULT_CATEGORY_IMAGES[normalizedCategory];
  if (categoryImages && categoryImages.length > 0) {
    return categoryImages[Math.floor(Math.random() * categoryImages.length)];
  }

  // Final fallback
  return FALLBACK_IMAGE;
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

// City cover images for itinerary headers
const CITY_COVER_IMAGES: Record<string, string[]> = {
  seoul: [
    'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=800&h=600&fit=crop',
  ],
  tokyo: [
    'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800&h=600&fit=crop',
  ],
  bangkok: [
    'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=800&h=600&fit=crop',
  ],
  singapore: [
    'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&h=600&fit=crop',
    'https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=800&h=600&fit=crop',
  ],
};

const DEFAULT_CITY_IMAGE = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=600&fit=crop';

/**
 * Generate a thumbnail URL for a city
 * Uses curated Unsplash direct URLs
 */
export function getCityThumbnail(city: string): string {
  const normalizedCity = city.toLowerCase().trim();
  const images = CITY_COVER_IMAGES[normalizedCity];
  if (images && images.length > 0) {
    return images[Math.floor(Math.random() * images.length)];
  }
  return DEFAULT_CITY_IMAGE;
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
