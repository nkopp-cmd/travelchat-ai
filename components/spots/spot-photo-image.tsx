"use client";

import Image from "next/image";
import { useState } from "react";
import type { PhotoGalleryResponse } from "@/lib/spots/photo-contract";
import { getDirectVenuePhotos, useDetailVenuePhotos, useVenuePhotos } from "./venue-photo-provider";

type Photo = PhotoGalleryResponse["photos"][number];

export function SpotPhotoImage({ photo, alt, className = "object-cover", sizes, priority = false, loading = false, creditClassName = "" }: {
  photo?: Photo; alt: string; className?: string; sizes: string; priority?: boolean; loading?: boolean; creditClassName?: string;
}) {
  // A new source gets a new load state, including after navigation to another spot.
  return <PhotoImage key={photo?.url || "unavailable"} photo={photo} alt={alt} className={className} sizes={sizes} priority={priority} loading={loading} creditClassName={creditClassName} />;
}

function PhotoImage({ photo, alt, className, sizes, priority, loading, creditClassName }: {
  photo?: Photo; alt: string; className: string; sizes: string; priority: boolean; loading: boolean; creditClassName: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  if (!photo || state === "failed") return (
    <div role="status" className="flex h-full w-full items-center justify-center bg-violet-950/60 p-2 text-center text-xs text-white">
      {loading ? "Loading venue photos..." : "Photo unavailable"}
    </div>
  );
  return <>
    <Image src={photo.url} alt={alt} fill unoptimized sizes={sizes} priority={priority} className={className}
      onLoad={() => setState("loaded")} onError={() => setState("failed")} />
    <div tabIndex={0} aria-label="Photo source and author credits" className={`absolute inset-x-0 top-0 z-10 max-h-full overflow-auto bg-black/80 p-1.5 text-xs leading-5 text-white focus-visible:outline focus-visible:outline-2 ${creditClassName}`}>
      <p>{state === "loaded" ? photo.sourceLabel : "Loading photo..."}</p>
      {photo.attributions?.map((author, index) => {
        let href: string | undefined;
        try { const url = new URL(author.uri || ""); if (url.protocol === "https:" && !url.username && !url.password) href = url.href; } catch {}
        return <span key={index} className="mr-2 inline-block">{href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline" onClick={(event) => event.stopPropagation()}>{author.displayName}</a>
          : author.displayName}</span>;
      })}
    </div>
  </>;
}

export function VenueHeroPhoto({ name }: { name: string }) {
  const { data, loading, spotId } = useDetailVenuePhotos();
  return <SpotPhotoImage key={spotId} photo={data?.photos[0]} alt={name} sizes="(max-width: 768px) 100vw, 1024px" priority loading={loading} creditClassName="!right-28" />;
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
