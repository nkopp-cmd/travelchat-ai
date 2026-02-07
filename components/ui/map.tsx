"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { useMapProvider, type MapProvider } from "@/hooks/use-map-provider";

export interface Location {
    lat: number;
    lng: number;
    title?: string;
    description?: string;
    type?: "morning" | "afternoon" | "evening";
}

interface MapComponentProps {
    initialViewState?: {
        latitude: number;
        longitude: number;
        zoom: number;
    };
    markers?: Location[];
    className?: string;
    onMarkerClick?: (marker: Location, index: number) => void;
    /** City name or slug - used to detect if Kakao Maps should be used for Korea */
    city?: string;
    /** Force a specific map provider */
    forceProvider?: MapProvider;
}

// Loading component shared between providers
const MapLoading = () => (
    <div className="w-full h-full rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground text-sm">Loading map...</p>
        </div>
    </div>
);

// Dynamically import the Leaflet map to avoid SSR issues
const LeafletMap = dynamic(() => import("./leaflet-map"), {
    ssr: false,
    loading: MapLoading,
});

// Dynamically import the Kakao map for South Korea
const KakaoMap = dynamic(() => import("./kakao-map"), {
    ssr: false,
    loading: MapLoading,
});

export default function MapComponent({
    initialViewState,
    markers = [],
    className,
    onMarkerClick,
    city,
    forceProvider,
}: MapComponentProps) {
    const [mounted, setMounted] = useState(false);
    const [kakaoFailed, setKakaoFailed] = useState(false);

    // Calculate center from markers if not provided
    const center = useMemo(() => {
        if (initialViewState) {
            return { lat: initialViewState.latitude, lng: initialViewState.longitude };
        }
        if (markers.length === 0) {
            return { lat: 25.0330, lng: 121.5654 }; // Default: Taipei
        }
        const avgLat = markers.reduce((sum, m) => sum + m.lat, 0) / markers.length;
        const avgLng = markers.reduce((sum, m) => sum + m.lng, 0) / markers.length;
        return { lat: avgLat, lng: avgLng };
    }, [initialViewState, markers]);

    // Detect map provider based on city or coordinates
    const { provider, isKorea } = useMapProvider({
        city,
        lat: center.lat,
        lng: center.lng,
        forceProvider,
    });

    useEffect(() => {
        setMounted(true);
    }, []);

    // Handle Kakao map error - fallback to OpenStreetMap
    const handleKakaoError = useCallback((error: string) => {
        console.warn(
            "[map] Kakao Maps failed, falling back to OpenStreetMap.",
            "\n  → If this persists, ensure '카카오맵' is enabled at https://developers.kakao.com/console",
            "\n  → Error:", error
        );
        setKakaoFailed(true);
    }, []);

    const zoom = initialViewState?.zoom || (markers.length > 1 ? 13 : 15);

    if (!mounted) {
        return (
            <div className={`relative w-full h-full rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center ${className}`}>
                <p className="text-muted-foreground">Loading map...</p>
            </div>
        );
    }

    // Choose the appropriate map component based on provider
    // Fall back to Leaflet if Kakao fails
    const useKakao = provider === "kakao" && !kakaoFailed;
    const MapImpl = useKakao ? KakaoMap : LeafletMap;

    return (
        <div className={`relative w-full h-full rounded-xl overflow-hidden ${className}`}>
            {useKakao ? (
                <KakaoMap
                    center={center}
                    zoom={zoom}
                    markers={markers}
                    onMarkerClick={onMarkerClick}
                    onError={handleKakaoError}
                />
            ) : (
                <LeafletMap
                    center={center}
                    zoom={zoom}
                    markers={markers}
                    onMarkerClick={onMarkerClick}
                />
            )}
            {markers.length > 0 && (
                <div className="absolute bottom-4 right-4 px-3 py-2 bg-black/60 backdrop-blur-sm text-white text-xs rounded-lg z-[1000]">
                    {markers.length} location{markers.length !== 1 ? "s" : ""}
                    {isKorea && !kakaoFailed && (
                        <span className="ml-2 opacity-75">via Kakao</span>
                    )}
                    {kakaoFailed && (
                        <span className="ml-2 opacity-75">via OpenStreetMap</span>
                    )}
                </div>
            )}
        </div>
    );
}
