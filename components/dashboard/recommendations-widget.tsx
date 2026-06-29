"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, TrendingUp, MapPin, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { CityImageAvatar } from '@/components/ui/city-image';

interface RecommendedSpot {
  id: string;
  name: string;
  description: string;
  category: string;
  localley_score: number;
  photos: string[];
  location: { address?: string | { en?: string } } | null;
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
        toast({
          variant: "destructive",
          title: "Failed to load recommendations",
          description: "We couldn't fetch personalized recommendations. Please try again later.",
        });
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
  const getCity = (location: RecommendedSpot["location"]): string => {
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
      <Card className="rounded-2xl border-white/10 bg-white/[0.055] shadow-xl shadow-violet-950/10 backdrop-blur-xl">
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
                className="group flex-shrink-0 w-48 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] shadow-lg shadow-violet-950/10 backdrop-blur-xl transition-all duration-300 hover:border-violet-300/60 hover:shadow-violet-500/10"
              >
                {/* Image */}
                <div className="relative aspect-video overflow-hidden bg-white/10">
                  {spot.photos && spot.photos.length > 0 ? (
                    <Image
                      src={spot.photos[0]}
                      alt={spot.name}
                      fill
                      sizes="192px"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-600/20 to-indigo-600/20">
                      <MapPin className="h-8 w-8 text-violet-200" />
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
                  <h4 className="font-semibold text-xs line-clamp-1 group-hover:text-violet-300 transition-colors">
                    {spot.name}
                  </h4>
                  {/* City and Category */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    {city && (
                      <>
                        <CityImageAvatar city={city} className="h-4 w-4 rounded-full" sizes="16px" />
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
    <Card className="rounded-2xl border-white/10 bg-white/[0.055] shadow-2xl shadow-violet-950/20 backdrop-blur-xl">
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
                className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition-all duration-300 hover:-translate-y-1 hover:border-violet-300/60 hover:shadow-lg hover:shadow-violet-500/10"
              >
                {/* Image */}
                <div className="relative aspect-video overflow-hidden bg-white/10">
                  {spot.photos && spot.photos.length > 0 ? (
                    <Image
                      src={spot.photos[0]}
                      alt={spot.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-600/20 to-indigo-600/20">
                      <MapPin className="h-12 w-12 text-violet-200" />
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
                  <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-violet-300 transition-colors">
                    {spot.name}
                  </h3>

                  {/* City and Category */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {city && (
                      <>
                        <CityImageAvatar city={city} className="h-5 w-5 rounded-full" sizes="20px" />
                        <span>{city}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>{spot.category}</span>
                  </div>

                  {/* Recommendation reason */}
                  <div className="flex items-center gap-1 text-xs text-violet-300">
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
            <Button variant="outline" className="gap-2 border-white/15 bg-white/10 hover:bg-white/15">
              Explore All Spots
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
