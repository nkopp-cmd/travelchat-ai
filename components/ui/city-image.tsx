"use client";

import Image from "next/image";
import { getCityGradient, getCityImageUrl, getShortCity } from "@/lib/city-images";
import { clsx } from "clsx";

// A caller radius (rounded-full) replaces the default one; plain clsx, no tailwind-merge in public bundles (Push AT3).
const CALLER_RADIUS = /(?:^|\s)rounded(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?(?=\s|$)/;

// A fixed "<n>px" size renders width/height: next/image then writes a 1x/2x srcset (2 entries) instead of the
// 16-entry fill srcset up to 3840w. 26 city chips on /spots carried 75 KB of srcset HTML (Push CB1).
const FIXED_PX = /^(\d+)px$/;

interface CityImageAvatarProps {
  city: string | null | undefined;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  imageWidth?: number;
  quality?: number;
}

export function CityImageAvatar({
  city,
  className,
  imageClassName,
  sizes = "40px",
  imageWidth = 160,
  quality = 80,
}: CityImageAvatarProps) {
  const displayCity = getShortCity(city);
  const imageUrl = getCityImageUrl(displayCity, { width: imageWidth, quality });
  const gradient = getCityGradient(displayCity);
  const fixedMatch = FIXED_PX.exec(sizes);
  const fixedPx = fixedMatch ? Number(fixedMatch[1]) : null;

  return (
    <span
      className={clsx(
        "relative inline-flex shrink-0 overflow-hidden bg-gradient-to-br",
        !CALLER_RADIUS.test(className ?? "") && "rounded-md",
        !imageUrl && gradient,
        className
      )}
      aria-hidden="true"
    >
      {imageUrl ? (
        fixedPx ? (
          <Image
            src={imageUrl}
            alt=""
            width={fixedPx}
            height={fixedPx}
            className={clsx("absolute inset-0 h-full w-full object-cover", imageClassName)}
          />
        ) : (
          <Image
            src={imageUrl}
            alt=""
            fill
            className={clsx("object-cover", imageClassName)}
            sizes={sizes}
          />
        )
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
          {displayCity.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
