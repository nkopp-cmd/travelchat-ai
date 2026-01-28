"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Location } from "./map";

// Declare kakao maps types
declare global {
    interface Window {
        kakao: {
            maps: {
                load: (callback: () => void) => void;
                Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
                LatLng: new (lat: number, lng: number) => KakaoLatLng;
                LatLngBounds: new () => KakaoLatLngBounds;
                Marker: new (options: KakaoMarkerOptions) => KakaoMarker;
                InfoWindow: new (options: KakaoInfoWindowOptions) => KakaoInfoWindow;
                CustomOverlay: new (options: KakaoCustomOverlayOptions) => KakaoCustomOverlay;
                event: {
                    addListener: (target: unknown, type: string, handler: () => void) => void;
                };
            };
        };
    }
}

interface KakaoMapOptions {
    center: KakaoLatLng;
    level: number;
}

interface KakaoMap {
    setCenter: (latlng: KakaoLatLng) => void;
    setLevel: (level: number) => void;
    setBounds: (bounds: KakaoLatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number) => void;
    getLevel: () => number;
}

interface KakaoLatLng {
    getLat: () => number;
    getLng: () => number;
}

interface KakaoLatLngBounds {
    extend: (latlng: KakaoLatLng) => void;
}

interface KakaoMarkerOptions {
    position: KakaoLatLng;
    map?: KakaoMap;
}

interface KakaoMarker {
    setMap: (map: KakaoMap | null) => void;
}

interface KakaoInfoWindowOptions {
    content: string;
    removable?: boolean;
}

interface KakaoInfoWindow {
    open: (map: KakaoMap, marker: KakaoMarker) => void;
    close: () => void;
}

interface KakaoCustomOverlayOptions {
    position: KakaoLatLng;
    content: string;
    yAnchor?: number;
    xAnchor?: number;
    map?: KakaoMap;
}

interface KakaoCustomOverlay {
    setMap: (map: KakaoMap | null) => void;
}

interface KakaoMapProps {
    center: { lat: number; lng: number };
    zoom: number;
    markers: Location[];
    onMarkerClick?: (marker: Location, index: number) => void;
}

// Track script loading state globally
let kakaoScriptLoaded = false;
let kakaoScriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadKakaoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (kakaoScriptLoaded && window.kakao?.maps) {
            resolve();
            return;
        }

        loadCallbacks.push(resolve);

        if (kakaoScriptLoading) {
            return;
        }

        const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAPS_APP_KEY;
        if (!apiKey) {
            reject(new Error("Kakao Maps API key not configured. Set NEXT_PUBLIC_KAKAO_MAPS_APP_KEY in your environment."));
            return;
        }

        kakaoScriptLoading = true;

        const script = document.createElement("script");
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`;
        script.async = true;

        script.onload = () => {
            window.kakao.maps.load(() => {
                kakaoScriptLoaded = true;
                kakaoScriptLoading = false;
                loadCallbacks.forEach((cb) => cb());
                loadCallbacks.length = 0;
            });
        };

        script.onerror = () => {
            kakaoScriptLoading = false;
            reject(new Error("Failed to load Kakao Maps SDK"));
        };

        document.head.appendChild(script);
    });
}

// Convert zoom level: Leaflet uses 0-19 (higher = closer), Kakao uses 1-14 (lower = closer)
function convertZoomToKakaoLevel(zoom: number): number {
    // Leaflet zoom 15 -> Kakao level 3 (neighborhood level)
    // Leaflet zoom 13 -> Kakao level 5 (district level)
    // Approximate conversion
    return Math.max(1, Math.min(14, 18 - zoom));
}

// Create custom marker HTML
function createMarkerContent(type?: string, index?: number): string {
    const colors: Record<string, string> = {
        morning: "#f59e0b",
        afternoon: "#8b5cf6",
        evening: "#3b82f6",
    };
    const color = colors[type || ""] || "#8b5cf6";

    return `
        <div style="
            width: 32px;
            height: 32px;
            background: ${color};
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
            border: 2px solid white;
            cursor: pointer;
        ">
            <span style="
                transform: rotate(45deg);
                color: white;
                font-weight: bold;
                font-size: 12px;
            ">${index !== undefined ? index + 1 : ""}</span>
        </div>
    `;
}

// Create info window content
function createInfoWindowContent(marker: Location): string {
    return `
        <div style="padding: 12px; min-width: 150px; max-width: 250px;">
            <strong style="font-size: 14px; color: #333;">${marker.title || "Location"}</strong>
            ${marker.description ? `<p style="margin: 8px 0 0; font-size: 12px; color: #666; line-height: 1.4;">${marker.description}</p>` : ""}
        </div>
    `;
}

export default function KakaoMap({
    center,
    zoom,
    markers,
    onMarkerClick,
}: KakaoMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<KakaoMap | null>(null);
    const markersRef = useRef<KakaoCustomOverlay[]>([]);
    const infoWindowRef = useRef<KakaoInfoWindow | null>(null);

    // Initialize map
    useEffect(() => {
        if (!containerRef.current) return;

        let mounted = true;

        loadKakaoScript()
            .then(() => {
                if (!mounted || !containerRef.current) return;

                const { kakao } = window;
                const centerLatLng = new kakao.maps.LatLng(center.lat, center.lng);
                const level = convertZoomToKakaoLevel(zoom);

                const map = new kakao.maps.Map(containerRef.current, {
                    center: centerLatLng,
                    level,
                });

                mapRef.current = map;
            })
            .catch((error) => {
                console.error("Kakao Maps initialization error:", error);
            });

        return () => {
            mounted = false;
            mapRef.current = null;
        };
    }, []);

    // Update center and zoom
    useEffect(() => {
        if (!mapRef.current || !window.kakao?.maps) return;

        const { kakao } = window;
        const centerLatLng = new kakao.maps.LatLng(center.lat, center.lng);
        mapRef.current.setCenter(centerLatLng);
        mapRef.current.setLevel(convertZoomToKakaoLevel(zoom));
    }, [center.lat, center.lng, zoom]);

    // Handle marker click
    const handleMarkerClick = useCallback(
        (marker: Location, index: number) => {
            if (!mapRef.current || !window.kakao?.maps) return;

            const { kakao } = window;

            // Close existing info window
            if (infoWindowRef.current) {
                infoWindowRef.current.close();
            }

            // Create and show info window
            const infoWindow = new kakao.maps.InfoWindow({
                content: createInfoWindowContent(marker),
                removable: true,
            });

            // Create a temporary marker for the info window position
            const position = new kakao.maps.LatLng(marker.lat, marker.lng);
            const tempMarker = new kakao.maps.Marker({ position });

            infoWindow.open(mapRef.current, tempMarker);
            infoWindowRef.current = infoWindow;

            // Call external handler
            if (onMarkerClick) {
                onMarkerClick(marker, index);
            }
        },
        [onMarkerClick]
    );

    // Update markers
    useEffect(() => {
        if (!mapRef.current || !window.kakao?.maps) return;

        const { kakao } = window;
        const map = mapRef.current;

        // Clear existing markers
        markersRef.current.forEach((overlay) => {
            overlay.setMap(null);
        });
        markersRef.current = [];

        // Close info window
        if (infoWindowRef.current) {
            infoWindowRef.current.close();
            infoWindowRef.current = null;
        }

        // Add new markers as custom overlays
        markers.forEach((marker, index) => {
            const position = new kakao.maps.LatLng(marker.lat, marker.lng);

            // Create a wrapper div with click handler
            const content = document.createElement("div");
            content.innerHTML = createMarkerContent(marker.type, index);
            content.onclick = () => handleMarkerClick(marker, index);

            const overlay = new kakao.maps.CustomOverlay({
                position,
                content: content.outerHTML,
                yAnchor: 1,
                xAnchor: 0.5,
                map,
            });

            markersRef.current.push(overlay);
        });

        // Fit bounds if multiple markers
        if (markers.length > 1) {
            const bounds = new kakao.maps.LatLngBounds();
            markers.forEach((marker) => {
                bounds.extend(new kakao.maps.LatLng(marker.lat, marker.lng));
            });
            map.setBounds(bounds, 50, 50, 50, 50);
        }
    }, [markers, handleMarkerClick]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full"
            style={{ minHeight: "300px" }}
        />
    );
}
