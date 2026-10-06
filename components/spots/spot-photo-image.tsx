"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PhotoGalleryResponse } from "@/lib/spots/photo-contract";
import { getDirectVenuePhotos, useDetailVenuePhotos, useVenuePhotos } from "./venue-photo-provider";

type Photo = PhotoGalleryResponse["photos"][number];

export function SpotPhotoImage({ photo, alt, className = "object-cover", sizes, priority = false, loading = false, creditClassName = "", children, frameClassName, hero = false }: {
  photo?: Photo; alt: string; className?: string; sizes: string; priority?: boolean; loading?: boolean; creditClassName?: string; children?: ReactNode; frameClassName?: string; hero?: boolean;
}) {
  // A new source gets a new load state, including after navigation to another spot.
  return <PhotoImage key={photo?.url || "unavailable"} photo={photo} alt={alt} className={className} sizes={sizes} priority={priority} loading={loading} creditClassName={creditClassName} frameClassName={frameClassName} hero={hero}>{children}</PhotoImage>;
}

function PhotoImage({ photo, alt, className, sizes, priority, loading, creditClassName, children, frameClassName, hero }: {
  photo?: Photo; alt: string; className: string; sizes: string; priority: boolean; loading: boolean; creditClassName: string; children?: ReactNode; frameClassName?: string; hero: boolean;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const unavailable = !photo || state === "failed";
  return <figure className="flex h-full w-full flex-col">
    <div data-testid={hero ? "spot-detail-hero" : undefined} className={cn("relative min-h-0 flex-1", frameClassName)}>
      {unavailable ? <div role="status" className="flex h-full min-h-24 w-full items-center justify-center bg-violet-950/60 p-2 text-center text-xs text-white">
        {loading ? "Loading venue photos..." : "Photo unavailable"}
      </div> : <Image src={photo.url} alt={alt} fill unoptimized sizes={sizes} priority={priority} className={className}
        onLoad={() => setState("loaded")} onError={() => setState("failed")} />}
      {children}
    </div>
    {!unavailable && photo && <figcaption tabIndex={0} aria-label="Photo source and author credits" className={`relative z-10 max-h-[40%] shrink-0 overflow-auto border-t border-white/10 bg-[#100b1c] px-2 py-1 text-xs leading-4 text-violet-100 focus-visible:outline focus-visible:outline-2 ${creditClassName}`}>
      <span translate="no" className="whitespace-nowrap font-normal not-italic tracking-normal text-white">{photo.sourceLabel === "Google listing photo" ? "Google Maps" : photo.sourceLabel}</span>{photo.attributions?.length ? " · " : null}
      {photo.attributions?.map((author, index) => {
        let href: string | undefined;
        try { const url = new URL(author.uri || ""); if (url.protocol === "https:" && !url.username && !url.password) href = url.href; } catch {}
        return <span key={index} className="mr-2 inline-block">{href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline" onClick={(event) => event.stopPropagation()}>{author.displayName}</a>
          : author.displayName}</span>;
      })}
    </figcaption>}
  </figure>;
}

export function VenueHeroPhoto({ name, children }: { name: string; children?: ReactNode }) {
  const { data, loading, spotId } = useDetailVenuePhotos();
  return <SpotPhotoImage key={spotId} photo={data?.photos[0]} alt={name} sizes="(max-width: 768px) 100vw, 1024px" priority loading={loading} hero frameClassName="relative aspect-[4/3] min-h-60 w-full overflow-hidden rounded-lg border border-violet-200/15 shadow-2xl shadow-violet-950/30 sm:aspect-[16/10] sm:min-h-0 md:aspect-[21/9]">{children}</SpotPhotoImage>;
}

export function VenuePhotoThumbnails({ name }: { name: string }) {
  const { data, spotId } = useDetailVenuePhotos();
  const photos = data?.photos.slice(1) || [];
  if (!photos.length) return null;
  return <div data-testid="venue-thumbnails" className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${photos.length}, minmax(0, 1fr))` }}>
    {photos.map((photo, index) => <div key={`${spotId}:${photo.id}`} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-violet-200/15 bg-violet-950/40">
      <SpotPhotoImage photo={photo} alt={`${name} photo ${index + 2}`} sizes="(max-width: 768px) 33vw, 320px" />
    </div>)}
  </div>;
}

export function VenueCardPhoto({ spotId, name, priority = false, directPhotos = [] }: { spotId: string; name: string; priority?: boolean; directPhotos?: string[] }) {
  const { ref, data, loading } = useVenuePhotos(spotId, priority, getDirectVenuePhotos(directPhotos));
  return <div ref={ref} className="relative h-full w-full">
    <SpotPhotoImage key={spotId} photo={data?.photos[0]} alt={name} sizes="(max-width: 768px) 128px, 400px" priority={priority} loading={loading} />
  </div>;
}
