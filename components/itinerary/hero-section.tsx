"use client";

import { cn } from "@/lib/utils";
import { MapPin, Calendar, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// City images for hero backgrounds
const CITY_IMAGES: Record<string, string> = {
  Seoul: "https://images.unsplash.com/photo-1583833008338-31a6657917ab?w=1200",
  Tokyo: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1200",
  Bangkok: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=1200",
  Singapore: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1200",
};

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  city: string;
  days: number;
  localScore?: number;
  highlights?: string[];
  className?: string;
}

export function HeroSection({
  title,
  subtitle,
  city,
  days,
  localScore,
  highlights,
  className,
}: HeroSectionProps) {
  const backgroundImage = CITY_IMAGES[city] || CITY_IMAGES.Tokyo;

  return (
    <div className={cn("relative w-full", className)}>
      {/* Background image */}
      <div className="relative h-[280px] sm:h-[320px] md:h-[400px] w-full overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        {/* Content overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          {/* Local score badge */}
          {localScore !== undefined && (
            <Badge
              variant="secondary"
              className="mb-3 bg-violet-600/90 text-white border-0"
            >
              <Star className="w-3 h-3 mr-1 fill-current" />
              {localScore}% Local
            </Badge>
          )}

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 line-clamp-2">
            {title}
          </h1>

          {subtitle && (
            <p className="text-gray-300 mb-3 line-clamp-1">{subtitle}</p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 text-gray-300">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium">{city}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium">
                {days} {days === 1 ? "day" : "days"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights pills - horizontal scroll */}
      {highlights && highlights.length > 0 && (
        <div className="px-4 py-3 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2">
            {highlights.map((highlight, index) => (
              <Badge
                key={index}
                variant="outline"
                className="whitespace-nowrap bg-white/5 border-white/10 text-gray-300"
              >
                {highlight}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
