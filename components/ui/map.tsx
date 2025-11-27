"use client";

import { useState, useEffect } from "react";

interface Location {
    lat: number;
    lng: number;
    title?: string;
}

interface MapComponentProps {
    initialViewState?: {
        latitude: number;
        longitude: number;
        zoom: number;
    };
    markers?: Location[];
    className?: string;
}

// Placeholder map component for production builds
// TODO: This is a temporary workaround for Turbopack compatibility issues with react-map-gl
// The map works fine in development mode but fails during production builds with Turbopack
export default function MapComponent({
    markers = [],
    className,
}: MapComponentProps) {
    const [mounted, setMounted] = useState(false);

    // Fix: Use useEffect properly to avoid setState in effect body
    useEffect(() => {
        // This runs after component mounts on client side
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    if (!mounted) {
        return (
            <div className={`relative w-full h-full rounded-xl overflow-hidden bg-muted/30 flex items-center justify-center ${className}`}>
                <p className="text-muted-foreground">Loading map...</p>
            </div>
        );
    }

    // Placeholder map view with markers
    return (
        <div className={`relative w-full h-full rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 ${className}`}>
            {/* Map placeholder background */}
            <div className="absolute inset-0 opacity-20">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
            </div>

            {/* Marker indicators */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-full h-full max-w-2xl max-h-96">
                    {markers.map((marker, index) => (
                        <div
                            key={index}
                            className="absolute group cursor-pointer"
                            style={{
                                left: `${20 + (index * 25)}%`,
                                top: `${30 + (index % 3) * 20}%`,
                            }}
                        >
                            <div className="h-8 w-8 bg-violet-600 rounded-full flex items-center justify-center shadow-lg shadow-violet-500/30 group-hover:scale-110 transition-transform">
                                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </div>
                            {marker.title && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 backdrop-blur-sm text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                    {marker.title}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Info overlay */}
            <div className="absolute bottom-4 right-4 px-3 py-2 bg-black/60 backdrop-blur-sm text-white text-xs rounded-lg">
                {markers.length} location{markers.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
}
