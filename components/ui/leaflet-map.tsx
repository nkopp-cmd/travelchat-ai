"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Location } from "./map";

interface LeafletMapProps {
    center: { lat: number; lng: number };
    zoom: number;
    markers: Location[];
    onMarkerClick?: (marker: Location, index: number) => void;
}

// Custom marker icons based on activity type
const createMarkerIcon = (type?: string, index?: number) => {
    const colors: Record<string, string> = {
        morning: "#f59e0b", // amber
        afternoon: "#8b5cf6", // violet
        evening: "#3b82f6", // blue
    };
    const color = colors[type || ""] || "#8b5cf6";

    return L.divIcon({
        className: "custom-marker",
        html: `
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
            ">
                <span style="
                    transform: rotate(45deg);
                    color: white;
                    font-weight: bold;
                    font-size: 12px;
                ">${index !== undefined ? index + 1 : ""}</span>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
    });
};

export default function LeafletMap({
    center,
    zoom,
    markers,
    onMarkerClick,
}: LeafletMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        // Initialize map
        const map = L.map(containerRef.current, {
            center: [center.lat, center.lng],
            zoom,
            zoomControl: true,
            attributionControl: true,
        });

        // Add tile layer (OpenStreetMap)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
        }).addTo(map);

        mapRef.current = map;

        // Cleanup
        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Handle container resize (for orientation changes and dynamic containers)
    useEffect(() => {
        if (!containerRef.current || !mapRef.current) return;

        const resizeObserver = new ResizeObserver(() => {
            // Delay to ensure container has finished resizing
            setTimeout(() => {
                mapRef.current?.invalidateSize();
            }, 100);
        });

        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    // Handle orientation change on mobile
    useEffect(() => {
        const handleOrientationChange = () => {
            setTimeout(() => {
                mapRef.current?.invalidateSize();
            }, 150);
        };

        window.addEventListener('orientationchange', handleOrientationChange);
        window.addEventListener('resize', handleOrientationChange);

        return () => {
            window.removeEventListener('orientationchange', handleOrientationChange);
            window.removeEventListener('resize', handleOrientationChange);
        };
    }, []);

    // Update map center and zoom when props change
    useEffect(() => {
        if (!mapRef.current) return;
        mapRef.current.setView([center.lat, center.lng], zoom);
    }, [center.lat, center.lng, zoom]);

    // Update markers
    useEffect(() => {
        if (!mapRef.current) return;

        const map = mapRef.current;

        // Clear existing markers
        map.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                map.removeLayer(layer);
            }
        });

        // Add new markers
        const markerGroup: L.Marker[] = [];

        markers.forEach((marker, index) => {
            const leafletMarker = L.marker([marker.lat, marker.lng], {
                icon: createMarkerIcon(marker.type, index),
            }).addTo(map);

            // Add popup
            if (marker.title) {
                const popupContent = `
                    <div style="min-width: 150px;">
                        <strong style="font-size: 14px;">${marker.title}</strong>
                        ${marker.description ? `<p style="margin: 4px 0 0; font-size: 12px; color: #666;">${marker.description}</p>` : ""}
                    </div>
                `;
                leafletMarker.bindPopup(popupContent);
            }

            // Handle click
            if (onMarkerClick) {
                leafletMarker.on("click", () => {
                    onMarkerClick(marker, index);
                });
            }

            markerGroup.push(leafletMarker);
        });

        // Fit bounds if multiple markers
        if (markers.length > 1) {
            const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [markers, onMarkerClick]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full"
            style={{ minHeight: "300px" }}
        />
    );
}
