"use client";

import { useCallback, useId, useMemo, useState } from "react";
import MapComponent, { type Location } from "@/components/ui/map";
import { Button } from "@/components/ui/button";
import { SpotCard } from "@/components/spots/spot-card";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";
import type { Spot } from "@/types";

interface SpotsMapProps {
    spots: Spot[];
    city?: string;
    currentPage: number;
}

export default function SpotsMap({ spots, city, currentPage }: SpotsMapProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const detailId = useId();
    const scopeId = useId();
    const pinnedSpots = useMemo(
        () => spots.filter((spot) => getSpotLocationConfidence(spot.location).usableCoordinates),
        [spots]
    );
    // Keep source text in React, not in the shared provider's HTML popups.
    const markers = useMemo(() => pinnedSpots.map((spot) => ({
        lat: spot.location.lat,
        lng: spot.location.lng,
    })), [pinnedSpots]);
    const selectMarker = useCallback((_marker: Location, index: number) => {
        const spot = pinnedSpots[index];
        if (spot) setSelectedId(spot.id);
    }, [pinnedSpots]);
    const selectedSpot = spots.find((spot) => spot.id === selectedId) ?? pinnedSpots[0] ?? spots[0];
    const missingCount = spots.length - pinnedSpots.length;

    return (
        <section aria-label="Discovery map" className="space-y-4">
            <div id={scopeId} className="space-y-1 text-sm text-muted-foreground">
                <p>Page {currentPage} only: {pinnedSpots.length} of {spots.length} filtered spots have map pins.</p>
                <p>{missingCount} spots have missing or invalid coordinates and are not shown on the map.</p>
                <p>Moving the map does not load more spots. Use filters or pagination to change results.</p>
            </div>
            {markers.length > 0 ? (
                <div className="relative isolate h-[320px] overflow-hidden rounded-xl border border-border sm:h-[440px]"
                    role="region" aria-label="Map of this page's spots" aria-describedby={scopeId}>
                    <MapComponent
                        city={city}
                        userTier="free"
                        markers={markers}
                        initialViewState={{ latitude: markers[0].lat, longitude: markers[0].lng, zoom: 13 }}
                        onMarkerClick={selectMarker}
                    />
                </div>
            ) : (
                <p role="status" className="rounded-xl border border-border bg-muted/30 p-6 text-muted-foreground">
                    No map pins are available for this page. No locations have been estimated.
                </p>
            )}
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                    <h3 className="mb-2 font-semibold">Spots on this page</h3>
                    <p className="mb-3 text-sm text-muted-foreground">Select a pin or a spot below to see its card and open its details.</p>
                    <ul aria-label="Spots on this page" className="max-h-80 space-y-2 overflow-y-auto p-1">
                        {spots.map((spot) => {
                            const pinIndex = pinnedSpots.findIndex((pin) => pin.id === spot.id);
                            const confidence = getSpotLocationConfidence(spot.location);
                            return (
                                <li key={spot.id}>
                                    <Button
                                        variant={selectedSpot?.id === spot.id ? "secondary" : "outline"}
                                        className="h-auto min-h-11 w-full flex-col items-start whitespace-normal text-left"
                                        aria-pressed={selectedSpot?.id === spot.id}
                                        aria-controls={detailId}
                                        onClick={() => setSelectedId(spot.id)}
                                    >
                                        <span>{pinIndex >= 0 ? `Pin ${pinIndex + 1}: ` : "No pin: "}{spot.name}</span>
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {confidence.label}{pinIndex < 0 ? " - coordinates unavailable" : ""}
                                        </span>
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <div id={detailId} className="min-w-0">
                    <h3 className="mb-2 font-semibold" aria-live="polite">
                        {selectedSpot ? `Selected spot: ${selectedSpot.name}` : "No spots on this page"}
                    </h3>
                    {selectedSpot && <SpotCard key={selectedSpot.id} spot={selectedSpot} />}
                </div>
            </div>
        </section>
    );
}
