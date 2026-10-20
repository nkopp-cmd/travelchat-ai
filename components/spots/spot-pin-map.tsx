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
const CARD_OFFSET_PX = 30;

interface MarkerSlot { key: string; ids: string[]; host: HTMLElement }

export default function SpotPinMap({ spots, selectedId, onSelect }: {
    spots: Spot[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
}) {
    const container = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const layerRef = useRef<L.LayerGroup | null>(null);
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
        const clusters = capMarkers(clusterPins(points, zoom >= 17 ? 1 : 56), { x: size.x / 2, y: size.y / 2 });
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
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        const resize = new ResizeObserver(() => map.invalidateSize());
        resize.observe(container.current);
        return () => {
            resize.disconnect();
            map.remove();
            mapRef.current = null;
            layerRef.current = null;
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
        onSelect(null);
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
                    return createPortal(
                        <button type="button" className="ll-pin-cluster" aria-label={`${slot.ids.length} spots here. Zoom in`}
                            onClick={() => zoomInto(slot.ids)}>
                            {slot.ids.length}
                        </button>, slot.host, slot.key);
                }
                const spot = byId.get(slot.ids[0]);
                return spot ? createPortal(
                    <PinButton spot={spot} selected={spot.id === selectedId} onSelect={() => onSelect(spot.id)} />,
                    slot.host, slot.key) : null;
            })}
            {selected && cardPoint && (
                <PinCard spot={selected} point={cardPoint} titleId={titleId} onClose={close} />
            )}
        </div>
    );
}

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function pinPhoto(spot: Spot): string | undefined {
    return getDirectVenuePhotos(spot.photos)[0]?.url;
}

function PinButton({ spot, selected, onSelect }: { spot: Spot; selected: boolean; onSelect: () => void }) {
    const tone = pinTone(spot.category);
    const Icon = TONE_ICONS[tone];
    const photo = pinPhoto(spot);
    return (
        <button type="button" className="ll-pin" data-tone={tone} data-pin-id={spot.id} data-selected={selected || undefined}
            aria-label={`${spot.name}, ${spot.category}`} aria-pressed={selected} onClick={onSelect}>
            <span className="ll-pin-face" aria-hidden="true">
                {photo
                    // eslint-disable-next-line @next/next/no-img-element -- Leaflet portal; first-party thumbnail, lazy.
                    ? <img src={photo} alt="" loading="lazy" decoding="async" width={44} height={44} />
                    : <Icon className="h-[18px] w-[18px]" />}
            </span>
            <span className="ll-pin-chip" aria-hidden="true">{spot.category}</span>
        </button>
    );
}

export function PinCard({ spot, point, titleId, onClose }: {
    spot: Spot; point: { x: number; y: number }; titleId: string; onClose: () => void;
}) {
    const card = useRef<HTMLDivElement>(null);
    const tone = pinTone(spot.category);
    const Icon = TONE_ICONS[tone];
    const photo = pinPhoto(spot);
    const area = spot.areaName || spot.cityName;
    useEffect(() => { card.current?.focus(); }, [spot.id]);
    return (
        <div ref={card} role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1}
            className="ll-pin-card" data-tone={tone}
            style={{ left: `clamp(150px, ${point.x}px, calc(100% - 150px))`, top: point.y - CARD_OFFSET_PX }}
            onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
            <div className="ll-pin-card-media">
                {photo
                    // eslint-disable-next-line @next/next/no-img-element -- first-party photo already allowed on cards.
                    ? <img src={photo} alt="" loading="lazy" decoding="async" />
                    : <Icon className="h-10 w-10" aria-hidden="true" />}
                <span className="ll-pin-card-chip">{spot.category}</span>
            </div>
            <div className="space-y-1 p-4">
                <h3 id={titleId} className="text-[17px] font-semibold leading-snug">{spot.name}</h3>
                {area && <p className="text-sm text-muted-foreground">{area}</p>}
                <p className="text-sm text-muted-foreground">Localley score {spot.localleyScore}</p>
                <div className="flex gap-2 pt-2">
                    <Link href={`/spots/${spot.id}`} prefetch={false}
                        className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
                        Details
                    </Link>
                    <button type="button" onClick={onClose} aria-label="Close spot card"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-raised text-foreground">
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );
}
