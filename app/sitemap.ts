import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

// Force dynamic generation to ensure env vars are available at runtime
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://localley.com';

  // Static routes - always available
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/explore`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/dashboard`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/spots`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/templates`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/sign-up`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // Try to fetch dynamic routes from Supabase, but gracefully handle missing env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Return only static routes if Supabase is not configured
    return staticRoutes;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch public itineraries (shared ones)
  const { data: itineraries } = await supabase
    .from('itineraries')
    .select('id, share_code, updated_at')
    .not('share_code', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1000);

  const itineraryRoutes: MetadataRoute.Sitemap = (itineraries || []).map((itinerary) => ({
    url: `${baseUrl}/shared/${itinerary.share_code}`,
    lastModified: new Date(itinerary.updated_at),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Fetch all spots
  const { data: spots } = await supabase
    .from('spots')
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .limit(1000);

  const spotRoutes: MetadataRoute.Sitemap = (spots || []).map((spot) => ({
    url: `${baseUrl}/spots/${spot.id}`,
    lastModified: new Date(spot.created_at),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...itineraryRoutes, ...spotRoutes];
}
