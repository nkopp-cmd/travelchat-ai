import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Spot } from "./session";

export const placeText = (value: Spot["name"] | null | undefined) => typeof value === "string" ? value : value?.en ?? Object.values(value ?? {})[0] ?? "";
export function sourceLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function pilotPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin && !url.search && !url.hash && !url.username && !url.password && /^\/pilot\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i.test(url.pathname) ? url.pathname : null;
  } catch { return null; }
}
export function reviewedPhoto(spot: Spot) {
  if (!Array.isArray(spot.photos) || !Array.isArray(spot.photoCredits)) return null;
  for (const photo of spot.photos) {
    const path = pilotPath(photo);
    const credit = path && spot.photoCredits.find((entry) => entry && pilotPath(entry.url) === path && typeof entry.author === "string" && entry.author.trim() && typeof entry.license === "string" && entry.license.trim() && sourceLink(entry.licenseUrl) && sourceLink(entry.sourceUrl));
    if (credit) return { path, credit };
  }
  return null;
}
export function PlacePhoto({ spot, hero = false }: { spot: Spot; hero?: boolean }) {
  const photo = reviewedPhoto(spot);
  const [failed, setFailed] = useState<string | null>(null);
  return <figure className={hero ? "place-photo hero-photo" : "place-photo"}>
    {photo && failed !== photo.path ? <><img src={photo.path} alt={placeText(spot.name)} loading={hero ? "eager" : "lazy"} width={960} height={640} onError={() => setFailed(photo.path)} /><figcaption>Photo: {photo.credit.author} · <a href={sourceLink(photo.credit.licenseUrl)!} target="_blank" rel="noopener noreferrer">{photo.credit.license}</a> · <a href={sourceLink(photo.credit.sourceUrl)!} target="_blank" rel="noopener noreferrer">Photo source</a> · <a href="/pilot/licenses.txt" target="_blank" rel="noopener noreferrer">Full credits and image changes</a></figcaption></> : <figcaption className="photo-unavailable">Photo unavailable. No substitute image is shown.</figcaption>}
  </figure>;
}
export function coordinates(spot: Spot): [number, number] | null {
  const { latitude: lat, longitude: lng } = spot;
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 85.05112878 && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180 ? [lat, lng] : null;
}
export function CatalogMap({ spots, selected, onSelect }: { spots: Spot[]; selected: string | null; onSelect: (id: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const selectRef = useRef(onSelect);
  const [tileError, setTileError] = useState(false);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, { preferCanvas: true, scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false });
    mapRef.current = map;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, minZoom: 2, keepBuffer: 0, updateWhenIdle: true, referrerPolicy: "strict-origin", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>' });
    tiles.on("tileerror", () => setTileError(true));
    tiles.addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(element.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; markers.current.clear(); };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current.clear();
    const bounds = L.latLngBounds([]);
    for (const spot of spots) {
      const point = coordinates(spot);
      if (!point) continue;
      bounds.extend(point);
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = placeText(spot.name);
      const note = document.createElement("p");
      note.textContent = "Catalog location, not a verified entrance.";
      const button = document.createElement("button");
      button.textContent = "View place in list";
      button.addEventListener("click", () => selectRef.current(spot.id));
      content.append(title, note, button);
      const marker = L.circleMarker(point, { radius: 12, color: "#6d28d9", weight: 3, fillColor: "#ffffff", fillOpacity: 1 }).addTo(map).bindPopup(content, {
        maxWidth: 236, autoPan: false,
      });
      marker.on("popupopen", () => {
        const popup = marker.getPopup()?.getElement();
        if (!popup) return;
        const box = popup.getBoundingClientRect();
        const frame = map.getContainer().getBoundingClientRect();
        // Leaflet auto-pan always animates. Place the measured popup without motion,
        // reserving the existing top-left zoom controls and the map's edge padding.
        const dx = Math.min(Math.max(0, box.right - frame.right + 12), box.left - frame.left - 56);
        const dy = Math.min(Math.max(0, box.bottom - frame.bottom + 12), box.top - frame.top - 72);
        if (dx || dy) map.panBy([dx, dy], { animate: false });
      });
      marker.on("click", () => selectRef.current(spot.id));
      markers.current.set(spot.id, marker);
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15, animate: false });
  }, [spots]);
  useEffect(() => {
    markers.current.forEach((marker, id) => marker.setStyle({ fillColor: id === selected ? "#6d28d9" : "#ffffff" }));
    const marker = selected ? markers.current.get(selected) : null;
    if (marker) { mapRef.current?.panTo(marker.getLatLng(), { animate: false }); marker.openPopup(); }
  }, [selected, spots]);
  const count = spots.filter((spot) => coordinates(spot)).length;
  return <section className="catalog-map" aria-label="Place map"><div className="map-heading"><h3>Find your bearings</h3><span>{count} mapped places</span></div><p className="muted">Catalog locations, not verified entrances. Use arrow keys to pan and + or - to zoom.</p><div ref={element} className="map-canvas" role="region" aria-label="Interactive OpenStreetMap of catalog places" />{!count && <p>No valid coordinates are available. No pins are shown.</p>}{count < spots.length && <p>Some places have no valid coordinates. They remain in the list without a pin.</p>}{tileError && <p role="status">Some map tiles are unavailable. Place details remain available below.</p>}<button className="secondary" disabled={!count} onClick={() => { const bounds = L.latLngBounds(spots.flatMap((spot) => { const point = coordinates(spot); return point ? [point] : []; })); if (bounds.isValid()) mapRef.current?.fitBounds(bounds, { padding: [32, 32], maxZoom: 15, animate: false }); }}>Show all mapped places</button></section>;
}
type ListingPhoto = { id: string; url: string; sourceLabel: string; attributions: { displayName: string; uri?: string }[] };
type ListingState = { state: "idle" | "loading" | "error" } | { state: "unavailable"; message: string } | { state: "available"; photos: ListingPhoto[] };
function listingPhotoPath(value: unknown, spotId: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin && url.pathname === "/api/places/photo" && url.searchParams.get("spot") === spotId && !url.hash ? url.pathname + url.search : null;
  } catch { return null; }
}
// Google listing photos load only when the visitor asks. They are never shown as reviewed venue evidence.
export function ListingPhotos({ spot }: { spot: Spot }) {
  const [listing, setListing] = useState<ListingState>({ state: "idle" });
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const title = placeText(spot.name);
  const load = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setListing({ state: "loading" });
    setFailed(new Set());
    try {
      const response = await fetch(`/api/spots/${encodeURIComponent(spot.id)}/photos`, { credentials: "same-origin", cache: "no-store", signal: current.signal });
      const data = await response.json() as { status?: unknown; photos?: unknown; message?: unknown };
      if (current.signal.aborted) return;
      const photos = data.status === "available" && Array.isArray(data.photos) ? data.photos.flatMap((entry) => {
        const photo = entry as ListingPhoto;
        const url = listingPhotoPath(photo?.url, spot.id);
        return url && typeof photo.id === "string" && Array.isArray(photo.attributions) ? [{ ...photo, url, attributions: photo.attributions.filter((a) => a && typeof a.displayName === "string" && a.displayName.trim()) }] : [];
      }) : [];
      if (photos.length) setListing({ state: "available", photos: photos.slice(0, 4) });
      else setListing({ state: "unavailable", message: response.status === 429 ? "Too many photo requests. Try again in a minute." : typeof data.message === "string" && data.message.length < 200 ? data.message : "Listing photos are unavailable." });
    } catch { if (!current.signal.aborted) setListing({ state: "error" }); }
  };
  const shown = listing.state === "available" ? listing.photos.filter((photo) => !failed.has(photo.id)) : [];
  return <section className="listing-photos" aria-label={`Google listing photos for ${title}`}>
    {listing.state === "idle" && <button className="secondary" onClick={() => void load()}>Show Google listing photos</button>}
    {listing.state === "loading" && <p role="status">Loading listing photos...</p>}
    {listing.state === "error" && <div role="alert"><p>Listing photos could not load.</p><button className="secondary" onClick={() => void load()}>Retry listing photos</button></div>}
    {listing.state === "unavailable" && <p className="photo-unavailable" role="status">{listing.message} No substitute image is shown.</p>}
    {listing.state === "available" && <>
      <p className="muted">From the Google Maps listing matched to this place. Localley did not review these photos.</p>
      {shown.length ? <div className="listing-grid">{shown.map((photo, index) => <figure key={photo.id}>
        <img src={photo.url} alt={`${title}: Google listing photo ${index + 1}`} loading="lazy" width={600} height={450} referrerPolicy="same-origin" onError={() => setFailed((value) => new Set(value).add(photo.id))} />
        <figcaption>{photo.sourceLabel}{photo.attributions.length ? <> · Photo: {photo.attributions.map((author, i) => <span key={`${author.displayName}-${i}`}>{i ? ", " : ""}{author.uri ? <a href={sourceLink(author.uri) ?? undefined} target="_blank" rel="noopener noreferrer">{author.displayName}</a> : author.displayName}</span>)}</> : null}</figcaption>
      </figure>)}</div> : <p className="photo-unavailable" role="status">These listing photos failed to load. No substitute image is shown.</p>}
      <p className="listing-source">Google Maps</p>
    </>}
  </section>;
}
