import { MetadataRoute } from 'next';
import { createSupabaseAdmin } from '@/lib/supabase';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://localley.com';
  const supabase = createSupabaseAdmin();

  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
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
      url: `${baseUrl}/itineraries/new`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];

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
