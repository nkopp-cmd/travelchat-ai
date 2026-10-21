"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { MapPin, Calendar, Star } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { getCityImageUrl } from "@/lib/city-images";
import { CityImageAvatar } from "@/components/ui/city-image";

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
  const backgroundImage = getCityImageUrl(city, { width: 1800, quality: 92 });

  return (
    <div className={cn("relative w-full rounded-2xl overflow-hidden", className)}>
      {/* Background image or gradient fallback */}
      <div className="relative h-[280px] sm:h-[320px] md:h-[400px] w-full overflow-hidden">
        {backgroundImage ? (
          <Image
            src={backgroundImage}
            alt={`${city} itinerary`}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 1024px"
            quality={92}
          />
        ) : (
          <div className="absolute inset-0 bg-raised" />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        {/* Local score badge */}
        {localScore !== undefined && (
          <div className="absolute top-4 right-4">
            <Badge
              variant="secondary"
              className="bg-primary text-primary-foreground border-0 px-3 py-1"
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
            <p className="text-muted-foreground mb-3 line-clamp-1">{subtitle}</p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
            {city && city !== "Adventure Awaits" && (
              <div className="flex items-center gap-2 rounded-full bg-black/30 py-1 pl-1 pr-3 backdrop-blur-sm">
                <CityImageAvatar city={city} className="h-7 w-7 rounded-full " sizes="28px" />
                <MapPin className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{city}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {days} {days === 1 ? "day" : "days"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Highlights pills - horizontal scroll */}
      {highlights && highlights.length > 0 && (
        <div className="scrollbar-hide overflow-x-auto bg-surface px-4 py-3 backdrop-blur-xl">
          <div className="flex gap-2">
            {highlights.map((highlight, index) => (
              <Badge
                key={index}
                variant="outline"
                className="whitespace-nowrap bg-primary/10 text-foreground"
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
