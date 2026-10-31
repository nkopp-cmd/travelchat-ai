"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PhotoGalleryResponse } from "@/lib/spots/photo-contract";
import { classifySpotPhoto } from "@/lib/place-images";

const pending = new Map<string, Promise<PhotoGalleryResponse>>();
// Results kept for this page session only (memory, never storage), so a card that remounts after
// a filter change or a list re-render does not call Places again. Bounded to the newest 200 spots.
const settled = new Map<string, PhotoGalleryResponse>();
const SETTLED_LIMIT = 200;
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
  }).slice(0, 4).map((url) => ({ id: url, url, attributions: [],
    sourceLabel: url.startsWith("/media/spot/") ? "Localley traveller photo" : "Direct source photo - unverified" }));
}

/** Global set by the detail hero's inline script: the photos request it started during HTML parse. */
export const EARLY_HERO_KEY = "__localleyHeroPhotos";
type EarlyHero = { id: string; p: Promise<PhotoGalleryResponse | null> };

// Reuse the request the inline hero script already started (once), so the page makes one Places
// call. Places data never enters the edge-cached HTML: the browser fetches it at runtime.
function fetchGallery(spotId: string): Promise<PhotoGalleryResponse | null> {
  const scope = globalThis as typeof globalThis & { [EARLY_HERO_KEY]?: EarlyHero };
  const early = scope[EARLY_HERO_KEY];
  if (early?.id === spotId) {
    delete scope[EARLY_HERO_KEY];
    return early.p;
  }
  return fetch(`/api/spots/${encodeURIComponent(spotId)}/photos`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() as Promise<PhotoGalleryResponse> : null);
}

/**
 * Inline script for the server-rendered hero placeholder. It runs at HTML parse time, starts the
 * photos request and shows the first photo (with its credit) before hydration. Its previous
 * siblings are the hidden early <img> and credit <span>.
 */
export function earlyHeroScript(spotId: string) {
  const id = JSON.stringify(spotId).replace(/</g, "\\u003c");
  return `(function(){var s=document.currentScript,c=s&&s.previousElementSibling,i=c&&c.previousElementSibling,id=${id};` +
    `var p=fetch("/api/spots/"+encodeURIComponent(id)+"/photos",{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});` +
    `window.${EARLY_HERO_KEY}={id:id,p:p};` +
    `p.then(function(d){var f=d&&d.status==="available"&&Array.isArray(d.photos)&&d.photos[0];` +
    `if(!f||!f.id||typeof f.url!=="string"||f.url.charAt(0)!=="/"||f.url.charAt(1)==="/"||!i||!i.isConnected)return;` +
    `var a=(f.attributions||[]).map(function(x){return x&&x.displayName}).filter(Boolean);` +
    `c.firstChild.nodeValue=(f.sourceLabel==="Google listing photo"?"Google Maps":String(f.sourceLabel||""))+(a.length?" \u00b7 "+a.join(", "):"");` +
    `i.setAttribute("fetchpriority","high");i.src=f.url;i.hidden=false;c.hidden=false;})})();`;
}

function requestPhotos(spotId: string) {
  const done = settled.get(spotId);
  if (done) return Promise.resolve(done);
  const existing = pending.get(spotId);
  if (existing) return existing;
  const request = fetchGallery(spotId)
    .then((data): PhotoGalleryResponse => {
      if (!data || data.status !== "available" || !Array.isArray(data.photos)) return unavailable;
      const ids = new Set<string>();
      const urls = new Set<string>();
      const photos = data.photos.filter((photo) => {
        if (!photo.id || !photo.url || ids.has(photo.id) || urls.has(photo.url)) return false;
        ids.add(photo.id);
        urls.add(photo.url);
        return true;
      }).slice(0, 4);
      return photos.length ? { status: "available", photos } : unavailable;
    }).then((result) => {
      settled.set(spotId, result);
      if (settled.size > SETTLED_LIMIT) settled.delete(settled.keys().next().value!);
      return result;
    }, () => unavailable)
    .finally(() => { pending.delete(spotId); });
  pending.set(spotId, request);
  return request;
}

/** Test hook: forget this page's photo results. */
export function resetVenuePhotoMemory() {
  settled.clear();
  pending.clear();
}

export function useVenuePhotos(spotId: string, priority = false, directPhotos: PhotoGalleryResponse["photos"] = [], allowFetch = true) {
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ spotId: string; data: PhotoGalleryResponse | null }>({ spotId, data: null });
  if (result.spotId !== spotId) setResult({ spotId, data: null });
  useEffect(() => {
    if (directPhotos.length || !allowFetch) return;
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
  }, [spotId, priority, directPhotos.length, allowFetch]);
  const data: PhotoGalleryResponse | null = directPhotos.length
    ? { status: "available", photos: directPhotos }
    : !allowFetch ? unavailable
    : result?.spotId === spotId ? result.data : null;
  return { ref, data, loading: !data, spotId };
}

const VenuePhotoContext = createContext<ReturnType<typeof useVenuePhotos> | null>(null);

export function VenuePhotoProvider({ spotId, children, directPhotos = [], allowFetch = true }: { spotId: string; children: ReactNode; directPhotos?: string[]; allowFetch?: boolean }) {
  const state = useVenuePhotos(spotId, true, getDirectVenuePhotos(directPhotos), allowFetch);
  return <VenuePhotoContext.Provider value={state}>{children}</VenuePhotoContext.Provider>;
}

export function useDetailVenuePhotos() {
  const state = useContext(VenuePhotoContext);
  if (!state) throw new Error("VenuePhotoProvider is required");
  return state;
}
