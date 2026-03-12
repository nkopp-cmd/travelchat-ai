"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Location } from "./map";
import { AlertCircle, ChevronLeft, ChevronRight, X, Phone, MapPin } from "lucide-react";

// ============================================================================
// Google Maps Script Loading
// ============================================================================

let googleScriptLoaded = false;
let googleScriptLoading = false;
let googleMapsDisabled = false;
const loadCallbacks: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

const INIT_TIMEOUT = 15000;

function loadGoogleMapsScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (googleMapsDisabled) {
            reject(new Error("Google Maps is disabled for this session (previous load failed)."));
            return;
        }

        if (googleScriptLoaded && window.google?.maps) {
            resolve();
            return;
        }

        loadCallbacks.push({ resolve, reject });

        if (googleScriptLoading) return;

        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey) {
            googleMapsDisabled = true;
            const error = new Error("Google Maps API key not configured.");
            loadCallbacks.forEach((cb) => cb.reject(error));
            loadCallbacks.length = 0;
            return;
        }

        googleScriptLoading = true;

        const timeoutId = setTimeout(() => {
            if (!googleScriptLoaded) {
                googleScriptLoading = false;
                googleMapsDisabled = true;
                const error = new Error("Google Maps SDK timed out.");
                loadCallbacks.forEach((cb) => cb.reject(error));
                loadCallbacks.length = 0;
            }
        }, INIT_TIMEOUT);

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&v=weekly`;
        script.async = true;
        script.defer = true;

        script.onload = () => {
            clearTimeout(timeoutId);
            googleScriptLoaded = true;
            googleScriptLoading = false;
            loadCallbacks.forEach((cb) => cb.resolve());
            loadCallbacks.length = 0;
        };

        script.onerror = () => {
            clearTimeout(timeoutId);
            googleScriptLoading = false;
            googleMapsDisabled = true;
            const error = new Error("Failed to load Google Maps SDK.");
            loadCallbacks.forEach((cb) => cb.reject(error));
            loadCallbacks.length = 0;
        };

        document.head.appendChild(script);
    });
}

// ============================================================================
// Dark Map Styles
// ============================================================================

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ color: "#212121" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
    { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
    { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
    { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
    { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
    { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
    { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

// ============================================================================
// Per-Day Marker Colors (10 distinct colors)
// ============================================================================

const DAY_COLORS = [
    "#8b5cf6", // Day 1: violet
    "#3b82f6", // Day 2: blue
    "#10b981", // Day 3: emerald
    "#f59e0b", // Day 4: amber
    "#ef4444", // Day 5: red
    "#ec4899", // Day 6: pink
    "#06b6d4", // Day 7: cyan
    "#f97316", // Day 8: orange
    "#6366f1", // Day 9: indigo
    "#14b8a6", // Day 10: teal
];

function getMarkerColor(day?: number): string {
    if (day === undefined || day < 1) return DAY_COLORS[0];
    return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}

// ============================================================================
// Component
// ============================================================================

interface GoogleMapProps {
    center: { lat: number; lng: number };
    zoom: number;
    markers: Location[];
    onMarkerClick?: (marker: Location, index: number) => void;
    onError?: (error: string) => void;
}

export default function GoogleMap({
    center,
    zoom,
    markers,
    onMarkerClick,
    onError,
}: GoogleMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedMarker, setSelectedMarker] = useState<{ marker: Location; index: number } | null>(null);
    const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

    // Initialize map
    useEffect(() => {
        let mounted = true;

        loadGoogleMapsScript()
            .then(() => {
                if (!mounted || !containerRef.current) return;

                const map = new google.maps.Map(containerRef.current, {
                    center: { lat: center.lat, lng: center.lng },
                    zoom,
                    styles: DARK_MAP_STYLES,
                    disableDefaultUI: false,
                    zoomControl: true,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    gestureHandling: "greedy",
                    mapId: "localley-dark-map",
                });

                mapRef.current = map;
                setIsLoading(false);
            })
            .catch((err) => {
                if (mounted) {
                    const errorMessage = err instanceof Error ? err.message : "Failed to load map";
                    setError(errorMessage);
                    setIsLoading(false);
                    onError?.(errorMessage);
                }
            });

        return () => {
            mounted = false;
            mapRef.current = null;
        };
    }, []);

    // Update center and zoom
    useEffect(() => {
        if (!mapRef.current) return;
        mapRef.current.setCenter({ lat: center.lat, lng: center.lng });
        mapRef.current.setZoom(zoom);
    }, [center.lat, center.lng, zoom]);

    // Handle marker selection
    const handleMarkerSelect = useCallback(
        (marker: Location, index: number) => {
            setSelectedMarker({ marker, index });
            onMarkerClick?.(marker, index);
        },
        [onMarkerClick]
    );

    // Navigate between markers in the info panel
    const navigateMarker = useCallback(
        (direction: "prev" | "next") => {
            if (!selectedMarker) return;
            const newIndex = direction === "prev"
                ? (selectedMarker.index - 1 + markers.length) % markers.length
                : (selectedMarker.index + 1) % markers.length;
            setSelectedMarker({ marker: markers[newIndex], index: newIndex });

            if (mapRef.current) {
                mapRef.current.panTo({ lat: markers[newIndex].lat, lng: markers[newIndex].lng });
            }
        },
        [selectedMarker, markers]
    );

    // Update markers
    useEffect(() => {
        if (!mapRef.current || !window.google?.maps) return;

        const map = mapRef.current;

        // Clear existing markers
        markersRef.current.forEach((m) => {
            m.map = null;
        });
        markersRef.current = [];

        if (infoWindowRef.current) {
            infoWindowRef.current.close();
            infoWindowRef.current = null;
        }

        // Add new markers
        markers.forEach((marker, index) => {
            const color = getMarkerColor(marker.day);

            const pinEl = document.createElement("div");
            pinEl.style.cssText = `position: relative; cursor: pointer;`;

            if (marker.image) {
                pinEl.innerHTML = `
                    <div style="
                        width: 48px; height: 48px; border-radius: 8px; overflow: hidden;
                        border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4); position: relative;
                    ">
                        <img src="${marker.image}" style="width:100%;height:100%;object-fit:cover;" alt="" />
                        <div style="
                            position: absolute; top: -6px; right: -6px;
                            width: 20px; height: 20px; background: ${color}; border-radius: 50%;
                            display: flex; align-items: center; justify-content: center;
                            color: white; font-size: 11px; font-weight: 700;
                            border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                        ">${index + 1}</div>
                    </div>
                    <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid white;margin:0 auto;"></div>
                `;
            } else {
                pinEl.innerHTML = `
                    <div style="
                        width: 36px; height: 36px; background: ${color};
                        border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
                        display: flex; align-items: center; justify-content: center;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 3px solid white;
                    ">
                        <span style="transform:rotate(45deg);color:white;font-weight:bold;font-size:13px;">${index + 1}</span>
                    </div>
                `;
            }

            try {
                const advancedMarker = new google.maps.marker.AdvancedMarkerElement({
                    position: { lat: marker.lat, lng: marker.lng },
                    map,
                    content: pinEl,
                    title: marker.title,
                });

                advancedMarker.addListener("click", () => {
                    handleMarkerSelect(marker, index);
                });

                markersRef.current.push(advancedMarker);
            } catch {
                const regularMarker = new google.maps.Marker({
                    position: { lat: marker.lat, lng: marker.lng },
                    map,
                    label: { text: String(index + 1), color: "white", fontWeight: "bold", fontSize: "12px" },
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 16, fillColor: color, fillOpacity: 1, strokeColor: "white", strokeWeight: 3,
                    },
                    title: marker.title,
                });

                regularMarker.addListener("click", () => {
                    handleMarkerSelect(marker, index);
                });

                markersRef.current.push(regularMarker as unknown as google.maps.marker.AdvancedMarkerElement);
            }
        });

        if (markers.length > 1) {
            const bounds = new google.maps.LatLngBounds();
            markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
            map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
        }
    }, [markers, handleMarkerSelect]);

    // Get accent color for the selected marker's day
    const accentColor = selectedMarker ? getMarkerColor(selectedMarker.marker.day) : DAY_COLORS[0];

    return (
        <div className="relative w-full h-full" style={{ minHeight: "300px" }}>
            {/* Map container */}
            <div ref={containerRef} className="w-full h-full" style={{ minHeight: "300px" }} />

            {/* Loading overlay */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/30 rounded-xl z-10">
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                        <p className="text-muted-foreground text-sm">Loading Google Maps...</p>
                    </div>
                </div>
            )}

            {/* Error overlay */}
            {error && !isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/30 rounded-xl z-10 p-6">
                    <div className="text-center max-w-md">
                        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                        <p className="font-medium text-foreground">Map failed to load</p>
                        <p className="text-sm text-muted-foreground mt-2">{error}</p>
                    </div>
                </div>
            )}

            {/* Info Panel — bottom sheet on mobile, right panel on desktop */}
            {selectedMarker && !error && (
                <div className={[
                    "absolute bg-gradient-to-b from-[#1c1c2e] to-[#141420] text-white z-20 flex flex-col shadow-2xl",
                    // Mobile: bottom sheet
                    "inset-x-0 bottom-0 max-h-[70%] rounded-t-2xl animate-in slide-in-from-bottom duration-200",
                    // Desktop: right panel
                    "md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:max-h-none md:w-[360px] md:rounded-t-none md:animate-in md:slide-in-from-right md:duration-200",
                ].join(" ")}>
                    {/* Mobile drag handle */}
                    <div className="md:hidden flex justify-center pt-2 pb-1 flex-shrink-0">
                        <div className="w-10 h-1 rounded-full bg-white/30" />
                    </div>

                    {/* Close button */}
                    <button
                        onClick={() => setSelectedMarker(null)}
                        className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors md:top-3"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Mobile: compact horizontal header */}
                    <div className="md:hidden flex-shrink-0 px-4 pb-3 pt-1">
                        <div className="flex items-start gap-3">
                            {/* Thumbnail or number */}
                            {selectedMarker.marker.image ? (
                                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={selectedMarker.marker.image} alt="" className="w-full h-full object-cover" />
                                </div>
                            ) : (
                                <div
                                    className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
                                    style={{ backgroundColor: accentColor }}
                                >
                                    {selectedMarker.index + 1}
                                </div>
                            )}
                            <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex items-center gap-2 mb-1">
                                    {selectedMarker.marker.day && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: accentColor }}>
                                            Day {selectedMarker.marker.day}
                                        </span>
                                    )}
                                    {selectedMarker.marker.time && (
                                        <span className="text-xs font-medium" style={{ color: accentColor }}>
                                            {selectedMarker.marker.time}
                                        </span>
                                    )}
                                </div>
                                <h3 className="font-bold text-base leading-snug">{selectedMarker.marker.title}</h3>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {selectedMarker.marker.category && (
                                        <span className="text-xs text-gray-400 capitalize">{selectedMarker.marker.category}</span>
                                    )}
                                    {selectedMarker.marker.rating && (
                                        <span className="text-xs text-yellow-400">
                                            &#9733; {selectedMarker.marker.rating.toFixed(1)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mobile: scrollable details */}
                    <div className="md:hidden flex-1 overflow-y-auto px-4 pb-2 space-y-3">
                        {selectedMarker.marker.address && (
                            <div className="flex items-start gap-2 text-sm text-gray-400">
                                <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span>{selectedMarker.marker.address}</span>
                            </div>
                        )}
                        {selectedMarker.marker.description && (
                            <div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: `${accentColor}08`, borderLeft: `3px solid ${accentColor}` }}>
                                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">About this spot</p>
                                <p className="text-sm text-gray-200 leading-relaxed">{selectedMarker.marker.description}</p>
                            </div>
                        )}
                        {selectedMarker.marker.phone && (
                            <a href={`tel:${selectedMarker.marker.phone}`} className="flex items-center gap-2 text-sm text-gray-300">
                                <Phone className="h-3.5 w-3.5" />
                                {selectedMarker.marker.phone}
                            </a>
                        )}
                    </div>

                    {/* Desktop: full photo header + content (hidden on mobile) */}
                    <div className="hidden md:contents">
                        {/* Place photo with gradient overlay */}
                        {selectedMarker.marker.image ? (
                            <div className="relative w-full h-52 flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={selectedMarker.marker.image}
                                    alt={selectedMarker.marker.title || ""}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#1c1c2e] via-transparent to-transparent" />
                                {selectedMarker.marker.day && (
                                    <div
                                        className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                                        style={{ backgroundColor: accentColor }}
                                    >
                                        Day {selectedMarker.marker.day}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div
                                className="relative w-full h-20 flex-shrink-0 flex items-center justify-center"
                                style={{ background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}11)` }}
                            >
                                <div
                                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                    style={{ backgroundColor: accentColor }}
                                >
                                    {selectedMarker.index + 1}
                                </div>
                                {selectedMarker.marker.day && (
                                    <div
                                        className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                                        style={{ backgroundColor: accentColor }}
                                    >
                                        Day {selectedMarker.marker.day}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Desktop content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {selectedMarker.marker.time && (
                                <span
                                    className="inline-block px-2.5 py-1 rounded-md text-xs font-medium"
                                    style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                                >
                                    {selectedMarker.marker.time}
                                </span>
                            )}
                            <h3 className="text-xl font-bold leading-tight">
                                {selectedMarker.marker.title}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                                {selectedMarker.marker.rating && (
                                    <div className="flex items-center gap-1 text-sm">
                                        <span className="text-yellow-400 font-medium">{selectedMarker.marker.rating.toFixed(1)}</span>
                                        <span className="text-yellow-400">&#9733;</span>
                                        {selectedMarker.marker.totalRatings && (
                                            <span className="text-gray-500 text-xs">({selectedMarker.marker.totalRatings.toLocaleString()})</span>
                                        )}
                                    </div>
                                )}
                                {selectedMarker.marker.category && (
                                    <span className="px-2 py-0.5 rounded-md bg-white/8 text-xs text-gray-300 capitalize">
                                        {selectedMarker.marker.category}
                                    </span>
                                )}
                            </div>
                            {selectedMarker.marker.address && (
                                <div className="flex items-start gap-2 text-sm text-gray-400">
                                    <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                    <span>{selectedMarker.marker.address}</span>
                                </div>
                            )}
                            {selectedMarker.marker.description && (
                                <div
                                    className="rounded-xl p-4 space-y-2"
                                    style={{ backgroundColor: `${accentColor}08`, borderLeft: `3px solid ${accentColor}` }}
                                >
                                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">About this spot</p>
                                    <p className="text-sm text-gray-200 leading-relaxed">{selectedMarker.marker.description}</p>
                                </div>
                            )}
                            {selectedMarker.marker.phone && (
                                <a href={`tel:${selectedMarker.marker.phone}`} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors">
                                    <Phone className="h-4 w-4" />
                                    {selectedMarker.marker.phone}
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Navigation footer */}
                    <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 flex-shrink-0 bg-black/20">
                        <button
                            onClick={() => navigateMarker("prev")}
                            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <span className="text-sm text-gray-400">
                            {selectedMarker.index + 1} of {markers.length}
                        </span>
                        <button
                            onClick={() => navigateMarker("next")}
                            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
