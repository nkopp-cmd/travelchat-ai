import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.localley.io';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/explore',
          '/spots/',
          '/shared/',
          '/templates',
          '/pricing',
        ],
        disallow: [
          '/api/',
          '/dashboard',
          '/itineraries/',
          '/profile',
          '/settings',
          '/challenges',
          '/leaderboard',
        ],
      },
      {
        userAgent: 'GPTBot',
        disallow: '/',
      },
      {
        userAgent: 'CCBot',
        disallow: '/',
      },
      {
        userAgent: 'anthropic-ai',
        disallow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
