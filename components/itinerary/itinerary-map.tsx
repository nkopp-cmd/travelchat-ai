"use client";

import { useState, useEffect, useCallback } from "react";
import MapComponent, { type Location } from "@/components/ui/map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface Activity {
    name: string;
    address?: string;
    description?: string;
    type?: string;
    time?: string;
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

// Cache for geocoded addresses (persists across component re-renders)
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

// Simple geocoding using Nominatim (OpenStreetMap's free geocoding service)
// Rate limit: 1 request per second (Nominatim usage policy)
async function geocodeAddress(address: string, city: string): Promise<{ lat: number; lng: number } | null> {
    const cacheKey = `${address}|${city}`.toLowerCase();

    // Check cache first
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey) || null;
    }

    try {
        const query = encodeURIComponent(`${address}, ${city}`);
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
            {
                headers: {
                    "User-Agent": "Localley Travel App (https://localley.ai)",
                },
            }
        );

        if (!response.ok) {
            geocodeCache.set(cacheKey, null);
            return null;
        }

        const data = await response.json();
        if (data.length > 0) {
            const result = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
            };
            geocodeCache.set(cacheKey, result);
            return result;
        }

        geocodeCache.set(cacheKey, null);
        return null;
    } catch (error) {
        console.error("Geocoding error:", error);
        geocodeCache.set(cacheKey, null);
        return null;
    }
}

export function ItineraryMap({ city, dailyPlans, className }: ItineraryMapProps) {
    const [locations, setLocations] = useState<GeocodedLocation[]>([]);
    // Initialize loading based on whether we have plans to process
    const [loading, setLoading] = useState(dailyPlans.length > 0);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState<GeocodedLocation | null>(null);

    // Geocode all activities
    useEffect(() => {
        // Skip if no plans to process
        if (dailyPlans.length === 0) {
            return;
        }

        const geocodeActivities = async () => {
            setLoading(true);
            setError(null);

            const allLocations: GeocodedLocation[] = [];
            let apiCallCount = 0;

            for (const dayPlan of dailyPlans) {
                for (let activityIndex = 0; activityIndex < dayPlan.activities.length; activityIndex++) {
                    const activity = dayPlan.activities[activityIndex];

                    if (activity.address) {
                        // Check if this address is already cached
                        const cacheKey = `${activity.address}|${city}`.toLowerCase();
                        const isCached = geocodeCache.has(cacheKey);

                        // Rate limit: wait 1 second between API requests (Nominatim requires this)
                        // Skip delay if result is cached
                        if (!isCached && apiCallCount > 0) {
                            await new Promise((resolve) => setTimeout(resolve, 1000));
                        }

                        const coords = await geocodeAddress(activity.address, city);

                        if (!isCached) {
                            apiCallCount++;
                        }

                        if (coords) {
                            allLocations.push({
                                lat: coords.lat,
                                lng: coords.lng,
                                title: activity.name,
                                description: activity.time ? `${activity.time} - ${activity.description?.slice(0, 50)}...` : activity.description?.slice(0, 80),
                                type: activity.type as "morning" | "afternoon" | "evening",
                                activityName: activity.name,
                                day: dayPlan.day,
                                activityIndex,
                            });
                        }
                    }
                }
            }

            if (allLocations.length === 0) {
                setError("Unable to map locations. Addresses may not be specific enough.");
            }

            setLocations(allLocations);
            setLoading(false);
        };

        geocodeActivities();
    }, [dailyPlans, city]);

    // Filter locations by selected day
    const filteredLocations = selectedDay
        ? locations.filter((loc) => loc.day === selectedDay)
        : locations;

    const handleMarkerClick = useCallback((marker: Location, index: number) => {
        const location = filteredLocations[index];
        if (location) {
            setSelectedLocation(location);
        }
    }, [filteredLocations]);

    // Get unique days
    const days = [...new Set(locations.map((l) => l.day))].sort();

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

    if (error || locations.length === 0) {
        return (
            <Card className={`p-6 ${className}`}>
                <div className="flex flex-col items-center justify-center gap-3 h-[300px] text-center">
                    <AlertCircle className="h-8 w-8 text-amber-500" />
                    <div>
                        <p className="font-medium">Map unavailable</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {error || "No mappable locations found in this itinerary."}
                        </p>
                    </div>
                </div>
            </Card>
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
