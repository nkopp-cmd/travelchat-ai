"use client";

import Image, { getImageProps } from "next/image";
import { useState, type ReactNode } from "react";
import { preload } from "react-dom";
import { cn } from "@/lib/utils";
import { pinTone } from "@/lib/spots/pin-clusters";
import { isOwnSpotPhotoPath, spotPhotoAvifLoader, spotPhotoLoader } from "@/lib/spots/own-photo";
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
          <script dangerouslySetInnerHTML={{ __html: earlyHeroScript(earlySpotId) }} />
        </>}
      </> : isOwnSpotPhotoPath(photo.url) ? <OwnSpotPicture key={photo.url} src={photo.url} alt={alt} sizes={sizes} priority={priority} className={className}
        onLoad={() => setImageState({url:photo.url,status:"loaded"})} onError={() => setImageState({url:photo.url,status:"failed"})} />
        : <Image key={photo.url} src={photo.url} alt={alt} fill sizes={sizes} preload={priority} fetchPriority={priority ? "high" : undefined} className={className} unoptimized
        onLoad={() => setImageState({url:photo.url,status:"loaded"})} onError={() => setImageState({url:photo.url,status:"failed"})} />}
      {children}
    </div>
  </figure>;
}

/**
 * A stored spot photo: srcset of its 480/960/full copies (the full hero was 599 KB on phones, Push AL2), with an AVIF
 * source first (about half the WebP bytes; the phone hero is the spot page LCP, Push CI2). The preload carries
 * type=image/avif, so a browser without AVIF skips it and loads the WebP <img> instead of fetching both.
 */
function OwnSpotPicture({ src, alt, sizes, priority, className, onLoad, onError }: {
  src: string; alt: string; sizes: string; priority: boolean; className: string; onLoad: () => void; onError: () => void;
}) {
  const avif = getImageProps({ src, alt: "", fill: true, sizes, loader: spotPhotoAvifLoader }).props;
  if (priority && avif.srcSet) preload(avif.src, { as: "image", imageSrcSet: avif.srcSet, imageSizes: sizes, fetchPriority: "high", type: "image/avif" });
  return <picture>
    <source type="image/avif" srcSet={avif.srcSet} sizes={sizes} />
    <Image src={src} alt={alt} fill sizes={sizes} fetchPriority={priority ? "high" : undefined} loading={priority ? "eager" : undefined} className={className}
      loader={spotPhotoLoader} onLoad={onLoad} onError={onError} />
  </picture>;
}

export function VenueHeroPhoto({ name, category, children }: { name: string; category?: string; children?: ReactNode }) {
  const { data, loading, spotId } = useDetailVenuePhotos();
  // No photo known at first render: no hero block (content-first rule 2), the page starts with the guide. A box first
  // shown while loading keeps its space as the tone tile when the answer is "unavailable": removing it moved the whole
  // page up 311 px (mobile PSI CLS 0.308 on spot f242e187; the photos API always says unavailable to automated agents).
  // Same height either way (a shrink after the answer is a layout shift); the tile shows the spot's category tone.
  const [shownWhileLoading] = useState(loading);
  if (!loading && !data?.photos[0] && !shownWhileLoading) return null;
  return <SpotPhotoImage key={spotId} photo={data?.photos[0]} alt={name} sizes="(max-width: 768px) 100vw, 1024px" priority loading={loading} hero earlySpotId={spotId} category={category} frameClassName="relative aspect-[4/3] min-h-60 w-full overflow-hidden rounded-lg shadow-2xl shadow-violet-950/30 sm:aspect-[16/10] sm:min-h-0 md:aspect-[21/9]">{children}</SpotPhotoImage>;
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
