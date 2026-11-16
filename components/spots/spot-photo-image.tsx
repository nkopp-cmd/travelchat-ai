"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { pinTone } from "@/lib/spots/pin-clusters";
import { TONE_ICONS } from "./category-tone";
import type { PhotoGalleryResponse } from "@/lib/spots/photo-contract";
import { earlyHeroScript, getDirectVenuePhotos, type DirectPhotoCredit, useDetailVenuePhotos, useVenuePhotos } from "./venue-photo-provider";

type Photo = PhotoGalleryResponse["photos"][number];

export function SpotPhotoImage({ photo, alt, className = "object-cover", sizes, priority = false, loading = false, children, frameClassName, hero = false, earlySpotId, category }: {
  photo?: Photo; alt: string; className?: string; sizes: string; priority?: boolean; loading?: boolean; children?: ReactNode; frameClassName?: string; hero?: boolean; earlySpotId?: string; category?: string;
}) {
  // Reset only the image state on source changes; keep hero interactions mounted.
  return <PhotoImage photo={photo} alt={alt} className={className} sizes={sizes} priority={priority} loading={loading} frameClassName={frameClassName} hero={hero} earlySpotId={earlySpotId} category={category}>{children}</PhotoImage>;
}

function PhotoImage({ photo, alt, className, sizes, priority, loading, children, frameClassName, hero, earlySpotId, category = "" }: {
  photo?: Photo; alt: string; className: string; sizes: string; priority: boolean; loading: boolean; children?: ReactNode; frameClassName?: string; hero: boolean; earlySpotId?: string; category?: string;
}) {
  const [imageState, setImageState] = useState<{ url?: string; status: "loading" | "loaded" | "failed" }>({ url: photo?.url, status: "loading" });
  if (imageState.url !== photo?.url) setImageState({ url: photo?.url, status: "loading" });
  const state = imageState.url === photo?.url ? imageState.status : "loading";
  const unavailable = !photo || state === "failed";
  const tone = pinTone(category);
  const ToneIcon = TONE_ICONS[tone];
  return <figure className="flex h-full w-full flex-col">
    <div data-testid={hero ? "spot-detail-hero" : undefined} className={cn("relative min-h-0 flex-1", frameClassName)}>
      {unavailable ? <>
        {/* Category tile, never a blank box and no status text (content-first rule 2). */}
        <div data-testid="photo-placeholder" data-state={loading ? "loading" : "unavailable"} data-tone={tone} aria-hidden="true" className={cn("ll-photo-tile h-full min-h-24 w-full", loading && "animate-pulse")}>
          <ToneIcon className="ll-photo-tile-icon" />
        </div>
        {/* Server HTML only: the inline script fills these at parse time; React keeps them until its own photo arrives. */}
        {loading && earlySpotId && <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" hidden suppressHydrationWarning className={cn("absolute inset-0 h-full w-full", className)} />
          <span hidden suppressHydrationWarning className={CREDIT_OVERLAY}>{" "}</span>
          <script dangerouslySetInnerHTML={{ __html: earlyHeroScript(earlySpotId) }} />
        </>}
      </> : <Image key={photo.url} src={photo.url} alt={alt} fill unoptimized sizes={sizes} priority={priority} className={className}
        onLoad={() => setImageState({url:photo.url,status:"loaded"})} onError={() => setImageState({url:photo.url,status:"failed"})} />}
      {children}
    </div>
  </figure>;
}

/** One quiet line on the hero for the whole gallery: no caption under each photo (Nils 2026-11-16). */
const CREDIT_OVERLAY = "pointer-events-none absolute bottom-1.5 right-1.5 max-w-[85%] truncate rounded bg-black/45 px-1.5 py-0.5 text-[10px] leading-4 text-foreground/80";

/**
 * Google requires the source and author names next to Places photos, so the gallery keeps one small line for all of
 * its photos instead of a caption block under each tile. Stored licensed photos are credited on /credits.
 */
export function galleryCreditText(photos: Photo[]): string | null {
  const google = photos.filter((photo) => photo.sourceLabel === "Google listing photo");
  if (!google.length) return null;
  const authors = [...new Set(google.flatMap((photo) => photo.attributions || []).map((author) => author.displayName.trim()).filter(Boolean))];
  return `Google Maps${authors.length ? ` · ${authors.join(", ")}` : ""}`;
}

function GalleryCredit({ photos }: { photos: Photo[] }) {
  const text = galleryCreditText(photos);
  return text ? <span translate="no" data-testid="gallery-credit" className={CREDIT_OVERLAY}>{text}</span> : null;
}

export function VenueHeroPhoto({ name, children }: { name: string; children?: ReactNode }) {
  const { data, loading, spotId } = useDetailVenuePhotos();
  // No photo known at first render: no hero block (content-first rule 2), the page starts with the guide. A box first
  // shown while loading keeps its space as the tone tile when the answer is "unavailable": removing it moved the whole
  // page up 311 px (mobile PSI CLS 0.308 on spot f242e187; the photos API always says unavailable to automated agents).
  const [shownWhileLoading] = useState(loading);
  if (!loading && !data?.photos[0] && !shownWhileLoading) return null;
  return <SpotPhotoImage key={spotId} photo={data?.photos[0]} alt={name} sizes="(max-width: 768px) 100vw, 1024px" priority loading={loading} hero earlySpotId={spotId} frameClassName="relative aspect-[4/3] min-h-60 w-full overflow-hidden rounded-lg shadow-2xl shadow-violet-950/30 sm:aspect-[16/10] sm:min-h-0 md:aspect-[21/9]">
    {children}
    {!loading && <GalleryCredit photos={data?.photos || []} />}
  </SpotPhotoImage>;
}

export function VenuePhotoThumbnails({ name }: { name: string }) {
  const { data, spotId } = useDetailVenuePhotos();
  const photos = data?.photos.slice(1) || [];
  if (!photos.length) return null;
  // Fixed columns (2 for one or two photos, else 3): one leftover photo no longer stretches across the page.
  return <div data-testid="venue-thumbnails" className={cn("grid gap-2 sm:gap-3", photos.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
    {photos.map((photo, index) => <div key={`${spotId}:${photo.id}`} className="relative overflow-hidden rounded-lg bg-violet-950/40">
      <SpotPhotoImage photo={photo} alt={`${name} photo ${index + 2}`} frameClassName="aspect-[4/3] w-full" sizes="(max-width: 768px) 33vw, 320px" />
    </div>)}
  </div>;
}

export function VenueCardPhoto({ spotId, name, priority = false, directPhotos = [], photoCredits = [], frameClassName, category }: { spotId: string; name: string; priority?: boolean; directPhotos?: string[]; photoCredits?: DirectPhotoCredit[]; frameClassName?: string; category?: string }) {
  // Cards and Nearby rows show only server-rendered photos (own, direct, or the stored Google photo via one Photo
  // call); they never ask Place Details. Without a photo the category tile shows.
  const { ref, data, loading } = useVenuePhotos(spotId, priority, getDirectVenuePhotos(directPhotos, photoCredits), false);
  return <div ref={ref} className="relative h-full w-full">
    <SpotPhotoImage key={spotId} photo={data?.photos[0]} alt={name} sizes="(max-width: 768px) 100vw, 400px" priority={priority} loading={loading} frameClassName={frameClassName} category={category} />
  </div>;
}
