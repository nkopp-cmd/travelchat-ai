"use client";

import { cn } from "@/lib/utils";
import { MapPin, Calendar, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCityImageUrl, getCityGradient } from "@/lib/city-images";

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
  const backgroundImage = getCityImageUrl(city, { width: 1200, quality: 80 });

  return (
    <div className={cn("relative w-full rounded-2xl overflow-hidden", className)}>
      {/* Background image or gradient fallback */}
      <div className="relative h-[280px] sm:h-[320px] md:h-[400px] w-full overflow-hidden">
        {backgroundImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundImage})` }}
          />
        ) : (
          <div className={cn("absolute inset-0 bg-gradient-to-br", getCityGradient(city))} />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        {/* Local score badge */}
        {localScore !== undefined && (
          <div className="absolute top-4 right-4">
            <Badge
              variant="secondary"
              className="bg-violet-600/90 text-white border-0 px-3 py-1"
            >
              <Star className="w-3.5 h-3.5 mr-1.5 fill-current" />
              {localScore}% Local
            </Badge>
          </div>
        )}

        {/* Content overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          {/* Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 line-clamp-2">
            {title}
          </h1>

          {subtitle && (
            <p className="text-gray-300 mb-3 line-clamp-1">{subtitle}</p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 text-gray-300">
            {city && city !== "Adventure Awaits" && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium">{city}</span>
              </div>
            )}
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
        <div className="px-4 py-3 overflow-x-auto scrollbar-hide bg-white/70 dark:bg-white/5 backdrop-blur-md">
          <div className="flex gap-2">
            {highlights.map((highlight, index) => (
              <Badge
                key={index}
                variant="outline"
                className="whitespace-nowrap bg-violet-50/50 dark:bg-white/5 border-violet-200/50 dark:border-white/10 text-foreground"
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
