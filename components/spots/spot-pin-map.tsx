"use client";

import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Camera, Coffee, MapPin, Moon, ShoppingBag, Store, Ticket, Train, Trees, Utensils, X, type IconProps } from "@/components/ui/icons";
import { getDirectVenuePhotos } from "@/components/spots/venue-photo-provider";
import { capMarkers, clusterPins, pinTone, type PinTone } from "@/lib/spots/pin-clusters";
import type { Spot } from "@/types";

// Photo pins on a dark map (shared/plans/map-photo-pins.md). Pins show the spot's own first-party
// photo; without one they show a category tile. Pins never call a paid photo API.
const TONE_ICONS: Record<PinTone, ComponentType<IconProps>> = {
    food: Utensils, cafe: Coffee, nightlife: Moon, shopping: ShoppingBag, market: Store,
    outdoor: Trees, culture: Camera, entertainment: Ticket, transport: Train, other: MapPin,
};
const NEAR_ZOOM = 15;
const NO_ROUTES: PinRoute[] = [];
const CARD_OFFSET_PX = 30;

interface MarkerSlot { key: string; ids: string[]; host: HTMLElement }

/** The fields a pin and its card read, so non-catalog places (itinerary stops) can use the same pins. */
export type PinSpot = Pick<Spot, "id" | "name" | "category" | "location" | "photos"> &
    Partial<Pick<Spot, "description" | "areaName" | "cityName" | "localleyScore" | "bestTime" | "tips">> & {
        /** Numbered stop badge, e.g. the visit order on an itinerary day. */
        stop?: { label: string; color: string; ariaPrefix: string };
        /** Card subtitle in place of the area name, e.g. "Day 1 · 9:00 AM". */
        meta?: string;
        /** Details link target; null hides it (no catalog page). Default: /spots/<id>. */
        href?: string | null;
    };

/** A dashed line through one day's stops, in visit order. */
export interface PinRoute { key: string; color: string; points: Array<[number, number]> }

export default function SpotPinMap({ spots, routes = NO_ROUTES, selectedId = null, onSelect }: {
    spots: PinSpot[];
    routes?: PinRoute[];
    selectedId?: string | null;
    /** Omit for a static map (e.g. the spot's own detail page): pins become labelled images, no card. */
    onSelect?: (id: string | null) => void;
}) {
    const container = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const layerRef = useRef<L.LayerGroup | null>(null);
    const routeLayerRef = useRef<L.LayerGroup | null>(null);
    const spotsRef = useRef(spots);
    const [slots, setSlots] = useState<MarkerSlot[]>([]);
    const [near, setNear] = useState(false);
    const [cardPoint, setCardPoint] = useState<{ x: number; y: number } | null>(null);
    // Closing pans the map and redraws the pins, so focus returns after the redraw.
    const returnFocus = useRef<string | null>(null);
    const titleId = useId();
    const byId = new Map(spots.map((spot) => [spot.id, spot]));
    const selected = selectedId ? byId.get(selectedId) ?? null : null;

    const placeCard = useCallback(() => {
        const map = mapRef.current;
        const spot = selectedId ? spotsRef.current.find((item) => item.id === selectedId) : undefined;
        if (!map || !spot) return setCardPoint(null);
        const point = map.latLngToContainerPoint([spot.location.lat, spot.location.lng]);
        setCardPoint({ x: point.x, y: point.y });
    }, [selectedId]);

    const drawMarkers = useCallback(() => {
        const map = mapRef.current;
        const layer = layerRef.current;
        if (!map || !layer) return;
        layer.clearLayers();
        const size = map.getSize();
        const zoom = map.getZoom();
        const points = spotsRef.current.map((spot) => {
            const point = map.latLngToContainerPoint([spot.location.lat, spot.location.lng]);
            return { id: spot.id, x: point.x, y: point.y };
        }).filter((point) => point.x > -60 && point.y > -60 && point.x < size.x + 60 && point.y < size.y + 60);
        // Pins may overlap a little (as in the reference) before they merge into a count bubble.
        const clusters = capMarkers(clusterPins(points, zoom >= 17 ? 1 : 40, 34), { x: size.x / 2, y: size.y / 2 });
        const next: MarkerSlot[] = clusters.map((cluster) => {
            const host = document.createElement("div");
            L.DomEvent.disableClickPropagation(host);
            const only = cluster.ids.length === 1 ? spotsRef.current.find((spot) => spot.id === cluster.ids[0]) : undefined;
            const latlng = only ? L.latLng(only.location.lat, only.location.lng) : map.containerPointToLatLng([cluster.x, cluster.y]);
            L.marker(latlng, {
                icon: L.divIcon({ className: "ll-pin-icon", html: host, iconSize: [0, 0] }),
                keyboard: false,
                zIndexOffset: only ? 0 : 500,
            }).addTo(layer);
            return { key: cluster.ids.join("|"), ids: cluster.ids, host };
        });
        setSlots(next);
        setNear(zoom >= NEAR_ZOOM);
    }, []);

    // Map event handlers read the latest spots; this effect runs before the ones that use it.
    useEffect(() => { spotsRef.current = spots; }, [spots]);

    useEffect(() => {
        if (!container.current || mapRef.current) return;
        const first = spotsRef.current[0];
        const map = L.map(container.current, { zoomControl: true, attributionControl: true })
            .setView(first ? [first.location.lat, first.location.lng] : [37.5665, 126.978], 13);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
            className: "ll-map-tiles",
        }).addTo(map);
        routeLayerRef.current = L.layerGroup().addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        const resize = new ResizeObserver(() => map.invalidateSize());
        resize.observe(container.current);
        return () => {
            resize.disconnect();
            map.remove();
            mapRef.current = null;
            layerRef.current = null;
            routeLayerRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (spots.length > 1) {
            map.fitBounds(L.latLngBounds(spots.map((spot) => [spot.location.lat, spot.location.lng])), { padding: [48, 48], maxZoom: 15 });
        } else if (spots[0]) {
            map.setView([spots[0].location.lat, spots[0].location.lng], 15);
        }
        drawMarkers();
    }, [spots, drawMarkers]);

    useEffect(() => {
        const layer = routeLayerRef.current;
        if (!layer) return;
        layer.clearLayers();
        for (const route of routes) {
            if (route.points.length < 2) continue;
            L.polyline(route.points, {
                color: route.color, weight: 3, opacity: 0.85, dashArray: "6 8", interactive: false, className: "ll-pin-route",
            }).addTo(layer);
        }
    }, [routes]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const update = () => { drawMarkers(); placeCard(); };
        const follow = () => placeCard();
        map.on("zoomend moveend", update);
        map.on("move zoom", follow);
        // Position the card for a new selection on the next frame, not inside the effect body.
        const frame = requestAnimationFrame(placeCard);
        return () => { cancelAnimationFrame(frame); map.off("zoomend moveend", update); map.off("move zoom", follow); };
    }, [drawMarkers, placeCard]);

    // Bring the selected pin into the lower part of the map so its card has room above it.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !selected) return;
        const point = map.latLngToContainerPoint([selected.location.lat, selected.location.lng]);
        const size = map.getSize();
        const target = { x: size.x / 2, y: Math.min(size.y - 40, Math.max(size.y * 0.72, 300)) };
        map.panBy([point.x - target.x, point.y - target.y], { animate: !prefersReducedMotion() });
    }, [selected]);

    const close = useCallback(() => {
        returnFocus.current = selectedId;
        onSelect?.(null);
    }, [onSelect, selectedId]);

    useEffect(() => {
        const id = returnFocus.current;
        if (!id) return;
        const pin = container.current?.parentElement?.querySelector<HTMLButtonElement>(`[data-pin-id="${CSS.escape(id)}"]`);
        if (pin) {
            pin.focus();
            returnFocus.current = null;
        }
    }, [slots, selectedId]);

    const zoomInto = (ids: string[]) => {
        const map = mapRef.current;
        if (!map) return;
        const bounds = L.latLngBounds(ids.map((id) => {
            const spot = byId.get(id);
            return spot ? [spot.location.lat, spot.location.lng] as [number, number] : map.getCenter();
        }));
        map.fitBounds(bounds, { padding: [64, 64], maxZoom: Math.min(map.getZoom() + 3, 18), animate: !prefersReducedMotion() });
    };

    return (
        <div className="relative h-full w-full">
            <div ref={container} className="ll-pin-map h-full w-full" data-zoom-band={near ? "near" : "far"}
                data-card-open={selected ? "" : undefined} style={{ minHeight: "300px" }} />
            {slots.map((slot) => {
                if (slot.ids.length > 1) {
                    // A group looks like a pin (its first place) with a count badge, as in the reference.
                    const lead = byId.get(slot.ids[0]);
                    return createPortal(
                        <button type="button" className="ll-pin ll-pin-group" data-tone={lead ? pinTone(lead.category) : "other"}
                            aria-label={`${slot.ids.length} spots here. Zoom in`} onClick={() => zoomInto(slot.ids)}>
                            {lead && <PinFace spot={lead} />}
                            <span className="ll-pin-count" aria-hidden="true">{slot.ids.length}</span>
                        </button>, slot.host, slot.key);
                }
                const spot = byId.get(slot.ids[0]);
                return spot ? createPortal(
                    <PinButton spot={spot} selected={spot.id === selectedId} onSelect={onSelect ? () => onSelect(spot.id) : undefined} />,
                    slot.host, slot.key) : null;
            })}
            {selected && cardPoint && (
                <PinCard key={selected.id} spot={selected} point={cardPoint} titleId={titleId} onClose={close} />
            )}
        </div>
    );
}

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function pinPhoto(spot: PinSpot): string | undefined {
    return getDirectVenuePhotos(spot.photos)[0]?.url;
}

function PinFace({ spot }: { spot: PinSpot }) {
    const Icon = TONE_ICONS[pinTone(spot.category)];
    const photo = pinPhoto(spot);
    return (
        <span className="ll-pin-face" aria-hidden="true">
            {photo
                // eslint-disable-next-line @next/next/no-img-element -- Leaflet portal; first-party thumbnail, lazy.
                ? <img src={photo} alt="" loading="lazy" decoding="async" width={44} height={44} />
                : <Icon className="h-[18px] w-[18px]" />}
        </span>
    );
}

function PinButton({ spot, selected, onSelect }: { spot: PinSpot; selected: boolean; onSelect?: () => void }) {
    const tone = pinTone(spot.category);
    const face = (
        <>
            <PinFace spot={spot} />
            <span className="ll-pin-chip" aria-hidden="true">{spot.category}</span>
            {spot.stop && (
                <span className="ll-pin-stop" aria-hidden="true" style={{ backgroundColor: spot.stop.color }}>{spot.stop.label}</span>
            )}
        </>
    );
    const label = `${spot.stop ? `${spot.stop.ariaPrefix}: ` : ""}${spot.name}, ${spot.category}`;
    if (!onSelect) {
        return <span className="ll-pin" role="img" data-tone={tone} data-pin-id={spot.id} aria-label={label}>{face}</span>;
    }
    return (
        <button type="button" className="ll-pin" data-tone={tone} data-pin-id={spot.id} data-selected={selected || undefined}
            aria-label={label} aria-pressed={selected} onClick={onSelect}>
            {face}
        </button>
    );
}

export function PinCard({ spot, point, titleId, onClose }: {
    spot: PinSpot; point: { x: number; y: number }; titleId: string; onClose: () => void;
}) {
    const card = useRef<HTMLDivElement>(null);
    // Second step of the pin -> card -> detail morph: the card grows to fill the map in place.
    const [expanded, setExpanded] = useState(false);
    const detailsId = useId();
    const tone = pinTone(spot.category);
    const Icon = TONE_ICONS[tone];
    const photo = pinPhoto(spot);
    const area = spot.meta || spot.areaName || spot.cityName;
    const href = spot.href === undefined ? `/spots/${spot.id}` : spot.href;
    const tips = (spot.tips || []).filter((tip) => typeof tip === "string" && tip.trim()).slice(0, 3);
    // Photo strip for the expanded card: the venue's other first-party photos.
    const strip = getDirectVenuePhotos(spot.photos).slice(1, 4).map((item) => item.url);
    useEffect(() => { card.current?.focus(); }, [spot.id]);
    return (
        <div ref={card} role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1}
            className="ll-pin-card" data-tone={tone} data-expanded={expanded || undefined}
            style={{ left: `clamp(150px, ${point.x}px, calc(100% - 150px))`, top: point.y - CARD_OFFSET_PX }}
            onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.stopPropagation();
                // Escape steps back one level: detail -> card -> closed.
                if (expanded) setExpanded(false);
                else onClose();
            }}>
            {photo && (
                <div className="ll-pin-card-media">
                    {/* eslint-disable-next-line @next/next/no-img-element -- first-party photo already allowed on cards. */}
                    <img src={photo} alt="" loading="lazy" decoding="async" />
                </div>
            )}
            <div className="space-y-1.5 p-4">
                <h3 id={titleId} className="text-[17px] font-semibold leading-snug">{spot.name}</h3>
                {area && <p className="truncate text-[13px] text-muted-foreground">{area}</p>}
                <p className="flex items-center gap-1.5 text-[13px] text-foreground">
                    <span className="ll-pin-card-dot" aria-hidden="true"><Icon className="h-3 w-3" /></span>
                    <span>{spot.category}</span>
                    {spot.localleyScore !== undefined && (
                        <span className="text-muted-foreground">· Localley score {spot.localleyScore}</span>
                    )}
                </p>
                {spot.description && (
                    <p className={expanded ? "pt-1 text-sm leading-relaxed" : "line-clamp-2 pt-1 text-sm leading-relaxed text-muted-foreground"}>
                        {spot.description}
                    </p>
                )}
                {expanded && (
                    <div id={detailsId} className="space-y-3 pt-1 text-sm">
                        {strip.length > 0 && (
                            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                                {strip.map((url) => (
                                    // eslint-disable-next-line @next/next/no-img-element -- first-party venue photos, lazy.
                                    <img key={url} src={url} alt="" loading="lazy" decoding="async"
                                        className="h-24 w-36 shrink-0 rounded-xl object-cover" />
                                ))}
                            </div>
                        )}
                        {spot.location?.address && <p className="text-muted-foreground">{spot.location.address}</p>}
                        {spot.bestTime && <p className="text-muted-foreground">Best time: {spot.bestTime}</p>}
                        {tips.length > 0 && (
                            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                {tips.map((tip) => <li key={tip}>{tip}</li>)}
                            </ul>
                        )}
                    </div>
                )}
                <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={detailsId}
                    className="min-h-11 text-sm font-medium text-primary">
                    {expanded ? "Show less" : "More about this spot"}
                </button>
                <div className="flex gap-2 pt-1">
                    {href && (
                        <Link href={href} prefetch={false}
                            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
                            Details
                        </Link>
                    )}
                    <button type="button" onClick={onClose} aria-label="Close spot card"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-raised text-foreground">
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );
}
