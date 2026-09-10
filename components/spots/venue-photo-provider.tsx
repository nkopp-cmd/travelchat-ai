"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PhotoGalleryResponse } from "@/lib/spots/photo-contract";
import { classifySpotPhoto } from "@/lib/place-images";

const pending = new Map<string, Promise<PhotoGalleryResponse>>();
const unavailable: PhotoGalleryResponse = { status: "unavailable", photos: [] };

export function getDirectVenuePhotos(photos: string[] = []): PhotoGalleryResponse["photos"] {
  return [...new Set(photos)].filter((src) => {
    if (!["remote_https", "local_asset"].includes(classifySpotPhoto(src))) return false;
    try {
      const url = new URL(src, "https://localley.io");
      return url.protocol === "https:" && !url.username && !url.password &&
        !/google|ggpht|gstatic|unsplash|pexels|pixabay/i.test(url.hostname) &&
        !/generated|stock|fallback|placeholder|story|\/api\//i.test(url.pathname) &&
        ![...url.searchParams.keys()].some((key) => /key|token|credential|signature/i.test(key));
    } catch { return false; }
  }).slice(0, 4).map((url) => ({ id: url, url, sourceLabel: "Direct source photo - unverified", attributions: [] }));
}

function requestPhotos(spotId: string) {
  const existing = pending.get(spotId);
  if (existing) return existing;
  const request = fetch(`/api/spots/${encodeURIComponent(spotId)}/photos`, { cache: "no-store" })
    .then(async (response): Promise<PhotoGalleryResponse> => {
      if (!response.ok) return unavailable;
      const data: PhotoGalleryResponse = await response.json();
      if (data.status !== "available" || !Array.isArray(data.photos)) return unavailable;
      const ids = new Set<string>();
      const urls = new Set<string>();
      const photos = data.photos.filter((photo) => {
        if (!photo.id || !photo.url || ids.has(photo.id) || urls.has(photo.url)) return false;
        ids.add(photo.id);
        urls.add(photo.url);
        return true;
      }).slice(0, 4);
      return photos.length ? { status: "available", photos } : unavailable;
    }).catch(() => unavailable)
    .finally(() => { pending.delete(spotId); });
  pending.set(spotId, request);
  return request;
}

export function useVenuePhotos(spotId: string, priority = false, directPhotos: PhotoGalleryResponse["photos"] = []) {
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ spotId: string; data: PhotoGalleryResponse | null }>({ spotId, data: null });
  if (result.spotId !== spotId) setResult({ spotId, data: null });
  useEffect(() => {
    if (directPhotos.length) return;
    let current = true;
    const load = () => requestPhotos(spotId).then((data) => {
      if (current) setResult({ spotId, data });
    });
    let observer: IntersectionObserver | undefined;
    if (priority || !ref.current || typeof IntersectionObserver === "undefined") {
      void load();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          void load();
        }
      });
      observer.observe(ref.current);
    }
    return () => { current = false; observer?.disconnect(); };
  }, [spotId, priority, directPhotos.length]);
  const data: PhotoGalleryResponse | null = directPhotos.length
    ? { status: "available", photos: directPhotos }
    : result?.spotId === spotId ? result.data : null;
  return { ref, data, loading: !data, spotId };
}

const VenuePhotoContext = createContext<ReturnType<typeof useVenuePhotos> | null>(null);

export function VenuePhotoProvider({ spotId, children, directPhotos = [] }: { spotId: string; children: ReactNode; directPhotos?: string[] }) {
  const state = useVenuePhotos(spotId, true, getDirectVenuePhotos(directPhotos));
  return <VenuePhotoContext.Provider value={state}>{children}</VenuePhotoContext.Provider>;
}

export function useDetailVenuePhotos() {
  const state = useContext(VenuePhotoContext);
  if (!state) throw new Error("VenuePhotoProvider is required");
  return state;
}
