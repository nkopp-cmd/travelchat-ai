"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, TrendingUp, MapPin, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

interface RecommendedSpot {
  id: string;
  name: string;
  description: string;
  category: string;
  localley_score: number;
  photos: string[];
  location: any;
  recommendationScore: number;
  reason: string;
}

interface RecommendationsWidgetProps {
  compact?: boolean;
}

export function RecommendationsWidget({ compact = false }: RecommendationsWidgetProps) {
  const [recommendations, setRecommendations] = useState<RecommendedSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        const response = await fetch('/api/recommendations?limit=6');

        if (!response.ok) {
          if (response.status === 401) {
            // User not authenticated, silently fail
            setLoading(false);
            return;
          }
          throw new Error('Failed to fetch recommendations');
        }

        const data = await response.json();
        setRecommendations(data.recommendations || []);
      } catch (err) {
        console.error('Error fetching recommendations:', err);
        setError('Failed to load recommendations');
      } finally {
        setLoading(false);
      }
    }

    fetchRecommendations();
  }, []);

  // Get score badge color
  const getScoreBadge = (score: number) => {
    if (score >= 6) return { label: 'Legendary', color: 'bg-yellow-500 text-white' };
    if (score >= 5) return { label: 'Hidden Gem', color: 'bg-violet-500 text-white' };
    if (score >= 4) return { label: 'Local Favorite', color: 'bg-indigo-500 text-white' };
    return { label: 'Popular', color: 'bg-blue-500 text-white' };
  };

  // Extract city from location
  const getCity = (location: any): string => {
    try {
      if (!location) return '';
      const address = typeof location.address === 'string'
        ? location.address
        : location.address?.en || '';
      return address.split(',')[0]?.trim() || '';
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-violet-600" />
            You Might Like
          </CardTitle>
          <CardDescription>
            Personalized recommendations based on your interests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || recommendations.length === 0) {
    return null; // Don't show widget if no recommendations
  }

  // Compact mode for top banner
  if (compact) {
    return (
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-semibold">You Might Like</h3>
          </div>
          <Link href="/spots">
            <Button variant="ghost" size="sm" className="gap-1 h-8 text-xs">
              View All
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {recommendations.slice(0, 6).map((spot) => {
            const badge = getScoreBadge(spot.localley_score);
            const city = getCity(spot.location);

            return (
              <Link
                key={spot.id}
                href={`/spots/${spot.id}`}
                className="group flex-shrink-0 w-48 rounded-lg border border-border/40 overflow-hidden hover:shadow-md transition-all duration-300 hover:border-violet-300 bg-white dark:bg-gray-950"
              >
                {/* Image */}
                <div className="relative aspect-video overflow-hidden bg-gray-100">
                  {spot.photos && spot.photos.length > 0 ? (
                    <Image
                      src={spot.photos[0]}
                      alt={spot.name}
                      fill
                      sizes="192px"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gradient-to-br from-violet-100 to-indigo-100">
                      <MapPin className="h-8 w-8 text-violet-300" />
                    </div>
                  )}
                  {/* Score badge */}
                  <div className="absolute top-1.5 right-1.5">
                    <Badge className={`${badge.color} text-xs px-1.5 py-0.5`}>
                      {spot.localley_score}/6
                    </Badge>
                  </div>
                </div>

                {/* Content */}
                <div className="p-2.5">
                  {/* Name */}
                  <h4 className="font-semibold text-xs line-clamp-1 group-hover:text-violet-600 transition-colors">
                    {spot.name}
                  </h4>
                  {/* City and Category */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    {city && (
                      <>
                        <MapPin className="h-2.5 w-2.5" />
                        <span className="line-clamp-1">{city}</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // Full card mode for regular display
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-violet-600" />
              You Might Like
            </CardTitle>
            <CardDescription>
              Personalized recommendations based on your interests
            </CardDescription>
          </div>
          <Link href="/spots">
            <Button variant="ghost" size="sm" className="gap-2">
              View All
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recommendations.map((spot) => {
            const badge = getScoreBadge(spot.localley_score);
            const city = getCity(spot.location);

            return (
              <Link
                key={spot.id}
                href={`/spots/${spot.id}`}
                className="group block rounded-lg border border-border/40 overflow-hidden hover:shadow-lg transition-all duration-300 hover:border-violet-300"
              >
                {/* Image */}
                <div className="relative aspect-video overflow-hidden bg-gray-100">
                  {spot.photos && spot.photos.length > 0 ? (
                    <Image
                      src={spot.photos[0]}
                      alt={spot.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gradient-to-br from-violet-100 to-indigo-100">
                      <MapPin className="h-12 w-12 text-violet-300" />
                    </div>
                  )}

                  {/* Score badge */}
                  <div className="absolute top-2 right-2">
                    <Badge className={badge.color}>
                      {spot.localley_score}/6
                    </Badge>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-2">
                  {/* Name */}
                  <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-violet-600 transition-colors">
                    {spot.name}
                  </h3>

                  {/* City and Category */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {city && (
                      <>
                        <MapPin className="h-3 w-3" />
                        <span>{city}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>{spot.category}</span>
                  </div>

                  {/* Recommendation reason */}
                  <div className="flex items-center gap-1 text-xs text-violet-600">
                    <TrendingUp className="h-3 w-3" />
                    <span className="line-clamp-1">{spot.reason}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* View more link */}
        <div className="mt-6 text-center">
          <Link href="/spots">
            <Button variant="outline" className="gap-2">
              Explore All Spots
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
