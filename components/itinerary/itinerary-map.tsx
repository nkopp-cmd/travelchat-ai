"use client";

import { useState, useEffect, useCallback } from "react";
import MapComponent, { type Location } from "@/components/ui/map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, Loader2, AlertCircle, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { isKoreanCity } from "@/hooks/use-map-provider";

interface Activity {
    name: string;
    address?: string;
    description?: string;
    type?: string;
    time?: string;
    lat?: number;
    lng?: number;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: Activity[];
}

interface ItineraryMapProps {
    city: string;
    dailyPlans: DayPlan[];
    className?: string;
}

interface GeocodedLocation extends Location {
    activityName: string;
    day: number;
    activityIndex: number;
}

interface UnmappedActivity {
    name: string;
    address?: string;
    day: number;
}

/**
 * Get a search URL for an unmapped activity.
 * Korea → Kakao Maps, everywhere else → Google Maps
 */
function getMapSearchUrl(name: string, city: string): string {
    if (isKoreanCity(city)) {
        return `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${city}`)}`;
}

export function ItineraryMap({ city, dailyPlans, className }: ItineraryMapProps) {
    const [locations, setLocations] = useState<GeocodedLocation[]>([]);
    const [unmappedActivities, setUnmappedActivities] = useState<UnmappedActivity[]>([]);
    const [loading, setLoading] = useState(dailyPlans.length > 0);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState<GeocodedLocation | null>(null);
    const [errorDismissed, setErrorDismissed] = useState(false);

    useEffect(() => {
        if (dailyPlans.length === 0) return;

        const processActivities = async () => {
            setLoading(true);
            setError(null);

            const preGeocoded: GeocodedLocation[] = [];
            const needsGeocoding: { activity: Activity; day: number; activityIndex: number }[] = [];

            // Phase 1: Separate pre-geocoded (have lat/lng) vs needs-geocoding
            for (const dayPlan of dailyPlans) {
                for (let activityIndex = 0; activityIndex < dayPlan.activities.length; activityIndex++) {
                    const activity = dayPlan.activities[activityIndex];

                    if (activity.lat && activity.lng) {
                        // Already geocoded at generation time — instant!
                        preGeocoded.push({
                            lat: activity.lat,
                            lng: activity.lng,
                            title: activity.name,
                            description: activity.time
                                ? `${activity.time} - ${activity.description?.slice(0, 50)}...`
                                : activity.description?.slice(0, 80),
                            type: activity.type as "morning" | "afternoon" | "evening",
                            activityName: activity.name,
                            day: dayPlan.day,
                            activityIndex,
                        });
                    } else if (activity.address || activity.name) {
                        needsGeocoding.push({ activity, day: dayPlan.day, activityIndex });
                    }
                }
            }

            // If all activities were pre-geocoded, we're done instantly
            if (needsGeocoding.length === 0) {
                setLocations(preGeocoded);
                if (preGeocoded.length === 0) {
                    setError("No mappable locations found in this itinerary.");
                }
                setLoading(false);
                return;
            }

            // Phase 2: Batch geocode remaining via server API
            const batchLocations: GeocodedLocation[] = [...preGeocoded];
            const unmapped: UnmappedActivity[] = [];

            try {
                const batchItems = needsGeocoding.map(({ activity }) => ({
                    address: activity.address || activity.name,
                    city,
                    name: activity.name,
                }));

                const response = await fetch("/api/geocode/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items: batchItems }),
                });

                if (response.ok) {
                    const { results } = await response.json();

                    for (let i = 0; i < needsGeocoding.length; i++) {
                        const { activity, day, activityIndex } = needsGeocoding[i];
                        const result = results[i];

                        if (result) {
                            batchLocations.push({
                                lat: result.lat,
                                lng: result.lng,
                                title: activity.name,
                                description: activity.time
                                    ? `${activity.time} - ${activity.description?.slice(0, 50)}...`
                                    : activity.description?.slice(0, 80),
                                type: activity.type as "morning" | "afternoon" | "evening",
                                activityName: activity.name,
                                day,
                                activityIndex,
                            });
                        } else {
                            unmapped.push({ name: activity.name, address: activity.address, day });
                        }
                    }
                } else {
                    // Batch API failed — mark all as unmapped
                    for (const { activity, day } of needsGeocoding) {
                        unmapped.push({ name: activity.name, address: activity.address, day });
                    }
                }
            } catch (err) {
                console.error("[itinerary-map] Batch geocoding error:", err);
                for (const { activity, day } of needsGeocoding) {
                    unmapped.push({ name: activity.name, address: activity.address, day });
                }
            }

            // Phase 3: Set state
            setLocations(batchLocations);
            setUnmappedActivities(unmapped);

            if (batchLocations.length === 0) {
                setError("Unable to map locations for this itinerary.");
            }

            setLoading(false);
        };

        processActivities();
    }, [dailyPlans, city]);

    // Filter locations by selected day
    const filteredLocations = selectedDay
        ? locations.filter((loc) => loc.day === selectedDay)
        : locations;

    const handleMarkerClick = useCallback(
        (marker: Location, index: number) => {
            const location = filteredLocations[index];
            if (location) {
                setSelectedLocation(location);
            }
        },
        [filteredLocations]
    );

    // Get unique days
    const days = [...new Set(locations.map((l) => l.day))].sort();

    // Google Maps route URL for total failure fallback
    const getRouteUrl = () => {
        const allActivities = dailyPlans.flatMap((d) =>
            d.activities.map((a) => a.name)
        );
        const waypoints = allActivities.slice(0, 10).join("/");
        return `https://www.google.com/maps/dir/${encodeURIComponent(city)}/${waypoints
            .split("/")
            .map((w) => encodeURIComponent(w + ", " + city))
            .join("/")}`;
    };

    if (loading) {
        return (
            <Card className={`p-6 ${className}`}>
                <div className="flex items-center justify-center gap-3 h-[300px]">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
                    <span className="text-muted-foreground">Mapping your itinerary...</span>
                </div>
            </Card>
        );
    }

    // Total failure: zero pins resolved — compact dismissible banner
    if (error || locations.length === 0) {
        if (errorDismissed) return null;

        return (
            <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/70 dark:bg-white/5 border border-black/5 dark:border-white/10 ${className}`}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span>Map unavailable — addresses couldn&apos;t be resolved.</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <a
                        href={getRouteUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 flex items-center gap-1 whitespace-nowrap"
                    >
                        View on Google Maps
                        <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                        onClick={() => setErrorDismissed(true)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Card className={`overflow-hidden relative z-0 ${className}`}>
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    <h3 className="font-semibold">Itinerary Map</h3>
                    <span className="text-sm opacity-80">({locations.length} locations)</span>
                </div>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </Button>
            </div>

            {isExpanded && (
                <>
                    {/* Day Filter */}
                    {days.length > 1 && (
                        <div className="flex gap-2 p-3 bg-muted/50 overflow-x-auto">
                            <Button
                                size="sm"
                                variant={selectedDay === null ? "default" : "outline"}
                                onClick={() => setSelectedDay(null)}
                            >
                                All Days
                            </Button>
                            {days.map((day) => (
                                <Button
                                    key={day}
                                    size="sm"
                                    variant={selectedDay === day ? "default" : "outline"}
                                    onClick={() => setSelectedDay(day)}
                                >
                                    Day {day}
                                </Button>
                            ))}
                        </div>
                    )}

                    {/* Map */}
                    <div className="h-[250px] sm:h-[300px] md:h-[350px] lg:h-[400px]">
                        <MapComponent
                            markers={filteredLocations}
                            onMarkerClick={handleMarkerClick}
                            city={city}
                        />
                    </div>

                    {/* Unmapped activities warning (partial success) */}
                    {unmappedActivities.length > 0 && (
                        <div className="px-4 py-2.5 border-t bg-amber-50/80 dark:bg-amber-950/20">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                    {unmappedActivities.length} location{unmappedActivities.length > 1 ? "s" : ""} couldn&apos;t be mapped — check activity cards for map links.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Selected Location Info */}
                    {selectedLocation && (
                        <div className="p-4 border-t bg-violet-50 dark:bg-violet-950/20">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-semibold">{selectedLocation.activityName}</p>
                                    <p className="text-sm text-muted-foreground">
                                        Day {selectedLocation.day} • {selectedLocation.description}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedLocation(null)}
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </Card>
    );
}
