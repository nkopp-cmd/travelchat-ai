"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { Location } from "./map";
import { AlertCircle } from "lucide-react";

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
    onError?: (error: string) => void;
}

// Track script loading state globally
let kakaoScriptLoaded = false;
let kakaoScriptLoading = false;
let kakaoMapsDisabled = false; // Session-level flag: once Kakao fails, don't retry
const loadCallbacks: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

// Timeout for SDK initialization (10 seconds)
const INIT_TIMEOUT = 10000;

function loadKakaoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        // If Kakao Maps previously failed this session, fail fast — don't spam their servers
        if (kakaoMapsDisabled) {
            reject(new Error("Kakao Maps is disabled for this session (previous load failed)."));
            return;
        }

        // Already loaded successfully
        if (kakaoScriptLoaded && window.kakao?.maps) {
            resolve();
            return;
        }

        // Add to callback queue
        loadCallbacks.push({ resolve, reject });

        // Already loading, wait for it
        if (kakaoScriptLoading) {
            return;
        }

        const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAPS_APP_KEY;
        if (!apiKey) {
            kakaoMapsDisabled = true;
            const error = new Error("Kakao Maps API key not configured. Set NEXT_PUBLIC_KAKAO_MAPS_APP_KEY in your environment.");
            loadCallbacks.forEach((cb) => cb.reject(error));
            loadCallbacks.length = 0;
            return;
        }

        kakaoScriptLoading = true;

        // Set up timeout to detect stuck initialization
        const timeoutId = setTimeout(() => {
            if (!kakaoScriptLoaded) {
                kakaoScriptLoading = false;
                kakaoMapsDisabled = true; // Don't retry after timeout
                const error = new Error(
                    "Kakao Maps SDK timed out. Please verify:\n" +
                    "1. '카카오맵' feature is ON at https://developers.kakao.com/console\n" +
                    "2. Your domain is registered in the app platform settings\n" +
                    "3. You're using the JavaScript key (not REST API key)"
                );
                loadCallbacks.forEach((cb) => cb.reject(error));
                loadCallbacks.length = 0;
            }
        }, INIT_TIMEOUT);

        const script = document.createElement("script");
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false&libraries=services`;
        script.async = true;

        script.onload = () => {
            // Check if kakao maps module is available
            // If '카카오맵' feature is not enabled in Kakao Developer Console,
            // the script loads but maps.load() won't be available
            if (!window.kakao?.maps?.load) {
                clearTimeout(timeoutId);
                kakaoScriptLoading = false;
                kakaoMapsDisabled = true; // Don't retry — feature is not enabled
                const error = new Error(
                    "Kakao Maps SDK loaded but maps API not available.\n" +
                    "Enable '카카오맵' feature at: https://developers.kakao.com/console → App → 카카오맵 → ON"
                );
                loadCallbacks.forEach((cb) => cb.reject(error));
                loadCallbacks.length = 0;
                return;
            }

            window.kakao.maps.load(() => {
                clearTimeout(timeoutId);
                kakaoScriptLoaded = true;
                kakaoScriptLoading = false;
                loadCallbacks.forEach((cb) => cb.resolve());
                loadCallbacks.length = 0;
            });
        };

        script.onerror = () => {
            clearTimeout(timeoutId);
            kakaoScriptLoading = false;
            kakaoMapsDisabled = true; // Don't retry after network error
            const error = new Error("Failed to load Kakao Maps SDK. Check your network connection.");
            loadCallbacks.forEach((cb) => cb.reject(error));
            loadCallbacks.length = 0;
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
    onError,
}: KakaoMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<KakaoMap | null>(null);
    const markersRef = useRef<KakaoCustomOverlay[]>([]);
    const infoWindowRef = useRef<KakaoInfoWindow | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

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
                setIsLoading(false);
            })
            .catch((err) => {
                console.error("Kakao Maps initialization error:", err);
                if (mounted) {
                    const errorMessage = err instanceof Error ? err.message : "Failed to load map";
                    setError(errorMessage);
                    setIsLoading(false);
                    if (onError) {
                        onError(errorMessage);
                    }
                }
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

    // Error state
    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-xl p-6" style={{ minHeight: "300px" }}>
                <div className="text-center max-w-md">
                    <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                    <p className="font-medium text-foreground">Map failed to load</p>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{error}</p>
                </div>
            </div>
        );
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-xl" style={{ minHeight: "300px" }}>
                <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground text-sm">Loading Kakao Maps...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="w-full h-full"
            style={{ minHeight: "300px" }}
        />
    );
}
