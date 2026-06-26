"use client";

import Image from "next/image";
import { getCityGradient, getCityImageUrl, getShortCity } from "@/lib/city-images";
import { cn } from "@/lib/utils";

interface CityImageAvatarProps {
  city: string | null | undefined;
  className?: string;
  imageClassName?: string;
  sizes?: string;
}

export function CityImageAvatar({
  city,
  className,
  imageClassName,
  sizes = "40px",
}: CityImageAvatarProps) {
  const displayCity = getShortCity(city);
  const imageUrl = getCityImageUrl(displayCity, { width: 160 });
  const gradient = getCityGradient(displayCity);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-md bg-gradient-to-br",
        !imageUrl && gradient,
        className
      )}
      aria-hidden="true"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          fill
          className={cn("object-cover", imageClassName)}
          sizes={sizes}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
          {displayCity.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

