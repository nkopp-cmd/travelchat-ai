"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";

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
}

// Dynamically import the Leaflet map to avoid SSR issues
const LeafletMap = dynamic(() => import("./leaflet-map"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground text-sm">Loading map...</p>
            </div>
        </div>
    ),
});

export default function MapComponent({
    initialViewState,
    markers = [],
    className,
    onMarkerClick,
}: MapComponentProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

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

    const zoom = initialViewState?.zoom || (markers.length > 1 ? 13 : 15);

    if (!mounted) {
        return (
            <div className={`relative w-full h-full rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center ${className}`}>
                <p className="text-muted-foreground">Loading map...</p>
            </div>
        );
    }

    return (
        <div className={`relative w-full h-full rounded-xl overflow-hidden ${className}`}>
            <LeafletMap
                center={center}
                zoom={zoom}
                markers={markers}
                onMarkerClick={onMarkerClick}
            />
            {markers.length > 0 && (
                <div className="absolute bottom-4 right-4 px-3 py-2 bg-black/60 backdrop-blur-sm text-white text-xs rounded-lg z-[1000]">
                    {markers.length} location{markers.length !== 1 ? "s" : ""}
                </div>
            )}
        </div>
    );
}
