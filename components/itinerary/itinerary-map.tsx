"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import MapComponent, { type Location } from "@/components/ui/map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MapPin, Loader2, AlertCircle, ChevronDown, ChevronUp, ExternalLink, X, Navigation, Copy, Check } from "@/components/ui/icons";
import { isKoreanCity, useMapProvider } from "@/hooks/use-map-provider";
import { getCityBySlug, getCityByName } from "@/lib/cities";
import { distanceKm } from "@/lib/geocoding";
import type { SubscriptionTier } from "@/lib/subscription";
import { buildDayRouteUrl, getActivitySearchText } from "@/lib/itineraries/map-links";
import { buildItineraryPins } from "@/lib/itineraries/itinerary-pins";

// OpenStreetMap path: the photo-pin map (shared/plans/map-photo-pins.md). Paid tiers keep Kakao/Google.
const SpotPinMap = dynamic(() => import("@/components/spots/spot-pin-map"), {
    ssr: false,
    loading: () => <div className="h-full w-full rounded-xl bg-muted/30" aria-hidden="true" />,
});

interface Activity {
    name: string;
    nameKo?: string;
    address?: string;
    description?: string;
    type?: string;
    time?: string;
    lat?: number;
    lng?: number;
    image?: string;
    category?: string;
    /** Catalog spot id on grounded itineraries. */
    spotId?: string;
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
    userTier?: SubscriptionTier;
}

interface GeocodedLocation extends Location {
    activityName: string;
    day: number;
    activityIndex: number;
    spotId?: string;
}

interface UnmappedActivity {
    name: string;
    nameKo?: string;
    address?: string;
    day: number;
}

export function ItineraryMap({ city, dailyPlans, className, userTier }: ItineraryMapProps) {
    const [locations, setLocations] = useState<GeocodedLocation[]>([]);
    const [unmappedActivities, setUnmappedActivities] = useState<UnmappedActivity[]>([]);
    const [loading, setLoading] = useState(dailyPlans.length > 0);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState<GeocodedLocation | null>(null);
    const [errorDismissed, setErrorDismissed] = useState(false);
    const [copied, setCopied] = useState(false);

    const isPaidUser = userTier === "pro" || userTier === "premium";
    const { provider } = useMapProvider({ city, userTier });
    const usePhotoPins = provider === "openstreetmap";
    const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

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
                            titleKo: activity.nameKo,
                            description: activity.time
                                ? `${activity.time} - ${activity.description?.slice(0, 50)}...`
                                : activity.description?.slice(0, 80),
                            type: activity.type as "morning" | "afternoon" | "evening",
                            image: activity.image,
                            time: activity.time,
                            category: activity.category,
                            address: activity.address,
                            activityName: activity.name,
                            day: dayPlan.day,
                            activityIndex,
                            spotId: activity.spotId,
                        });
                    } else if (activity.address || activity.name) {
                        needsGeocoding.push({ activity, day: dayPlan.day, activityIndex });
                    }
                }
            }

            // If all activities were pre-geocoded, we're done instantly
            if (needsGeocoding.length === 0) {
                // Filter out-of-bounds pre-geocoded locations
                const cityConfig = getCityByName(city) || getCityBySlug(city.toLowerCase().replace(/\s+/g, '-'));
                const cityCenter = cityConfig?.center;
                let validPreGeocoded = preGeocoded;
                if (cityCenter) {
                    validPreGeocoded = preGeocoded.filter(loc => {
                        const dist = distanceKm(loc.lat, loc.lng, cityCenter.lat, cityCenter.lng);
                        if (dist > 50) {
                            console.warn(`[MAP] Filtering out-of-bounds: "${loc.title}" at (${loc.lat}, ${loc.lng}) — ${dist.toFixed(0)}km from ${city}`);
                            return false;
                        }
                        return true;
                    });
                }
                setLocations(validPreGeocoded);
                if (validPreGeocoded.length === 0) {
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
                                titleKo: activity.nameKo,
                                description: activity.time
                                    ? `${activity.time} - ${activity.description?.slice(0, 50)}...`
                                    : activity.description?.slice(0, 80),
                                type: activity.type as "morning" | "afternoon" | "evening",
                                image: activity.image,
                                time: activity.time,
                                category: activity.category,
                                address: activity.address,
                                activityName: activity.name,
                                day,
                                activityIndex,
                                spotId: activity.spotId,
                            });
                        } else {
                            unmapped.push({ name: activity.name, nameKo: activity.nameKo, address: activity.address, day });
                        }
                    }
                } else {
                    // Batch API failed — mark all as unmapped
                    for (const { activity, day } of needsGeocoding) {
                        unmapped.push({ name: activity.name, nameKo: activity.nameKo, address: activity.address, day });
                    }
                }
            } catch (err) {
                console.error("[itinerary-map] Batch geocoding error:", err);
                for (const { activity, day } of needsGeocoding) {
                    unmapped.push({ name: activity.name, nameKo: activity.nameKo, address: activity.address, day });
                }
            }

            // Phase 3: Filter out-of-bounds locations (rejects pins in wrong country)
            const cityConfig = getCityByName(city) || getCityBySlug(city.toLowerCase().replace(/\s+/g, '-'));
            const cityCenter = cityConfig?.center;
            let validLocations = batchLocations;
            if (cityCenter) {
                validLocations = batchLocations.filter(loc => {
                    const dist = distanceKm(loc.lat, loc.lng, cityCenter.lat, cityCenter.lng);
                    if (dist > 50) {
                        console.warn(`[MAP] Filtering out-of-bounds: "${loc.title}" at (${loc.lat}, ${loc.lng}) — ${dist.toFixed(0)}km from ${city}`);
                        return false;
                    }
                    return true;
                });
                if (validLocations.length < batchLocations.length) {
                    console.log(`[MAP] Filtered ${batchLocations.length - validLocations.length} out-of-bounds locations for ${city}`);
                }
            }

            // Set state
            setLocations(validLocations);
            setUnmappedActivities(unmapped);

            if (batchLocations.length === 0) {
                setError("Unable to map locations for this itinerary.");
            }

            setLoading(false);
        };

        processActivities();
    }, [dailyPlans, city]);

    // Filter locations by selected day
    const filteredLocations = useMemo(() => (selectedDay
        ? locations.filter((loc) => loc.day === selectedDay)
        : locations), [locations, selectedDay]);
    const pins = useMemo(() => buildItineraryPins(filteredLocations), [filteredLocations]);

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

    // Maps route URL for total failure fallback
    const getRouteUrl = () => {
        return buildDayRouteUrl(
            dailyPlans.flatMap((dayPlan) => dayPlan.activities).slice(0, 10),
            city
        );
    };

    if (loading) {
        return (
            <Card className={` bg-raised p-6 backdrop-blur-xl ${className}`}>
                <div className="flex items-center justify-center gap-3 h-[300px]">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-muted-foreground">Mapping your itinerary...</span>
                </div>
            </Card>
        );
    }

    // Total failure: zero pins resolved — compact dismissible banner
    if (error || locations.length === 0) {
        if (errorDismissed) return null;

        return (
            <div className={`flex items-center justify-between gap-3 rounded-2xl bg-raised px-4 py-3 backdrop-blur-xl ${className}`}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 flex-shrink-0 text-primary" />
                    <span>Map unavailable — addresses couldn&apos;t be resolved.</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <a
                        href={getRouteUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary dark:text-primary hover:hover:text-primary flex items-center gap-1 whitespace-nowrap"
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
        <Card className={`!gap-0 !py-0 relative z-0 overflow-hidden bg-raised backdrop-blur-xl ${className}`}>
            {/* Header */}
            <div
                className="flex cursor-pointer items-center justify-between bg-raised p-4 text-foreground"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    <h3 className="font-semibold">Itinerary Map</h3>
                    <span className="text-sm opacity-80">({locations.length} locations)</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Open Route button — paid users only */}
                    {isPaidUser && filteredLocations.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-foreground hover:bg-overlay"
                            onClick={(e) => {
                                e.stopPropagation();
                                const locs = filteredLocations;
                                let url = "";
                                if (isKoreanCity(city)) {
                                    const first = locs[0];
                                    const query =
                                        first.titleKo ||
                                        getActivitySearchText(
                                            { name: first.activityName || first.title || city, address: first.address },
                                            city
                                        );
                                    url = `https://map.kakao.com/link/search/${encodeURIComponent(query)}`;
                                } else {
                                    url = buildDayRouteUrl(
                                        locs.map((loc) => ({
                                            name: loc.activityName || loc.title || city,
                                            nameKo: loc.titleKo,
                                            address: loc.address,
                                        })),
                                        city
                                    );
                                }
                                if (url) window.open(url, "_blank", "noopener,noreferrer");
                            }}
                        >
                            <Navigation className="h-4 w-4" />
                            Open route
                        </Button>
                    )}
                    {/* Copy link button */}
                    {isPaidUser && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-foreground hover:bg-overlay"
                            onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(window.location.href);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            }}
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? "Copied" : "Copy"}
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" className="text-foreground hover:bg-overlay">
                        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <>
                    {/* Day Filter */}
                    {days.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto bg-raised p-3">
                            <Button
                                size="sm"
                                variant={selectedDay === null ? "default" : "outline"}
                                className="rounded-xl"
                                onClick={() => { setSelectedDay(null); setSelectedPinId(null); }}
                            >
                                All Days
                            </Button>
                            {days.map((day) => (
                                <Button
                                    key={day}
                                    size="sm"
                                    variant={selectedDay === day ? "default" : "outline"}
                                    className="rounded-xl"
                                    onClick={() => { setSelectedDay(day); setSelectedPinId(null); }}
                                >
                                    Day {day}
                                </Button>
                            ))}
                        </div>
                    )}

                    {/* Map */}
                    {usePhotoPins ? (
                        // Taller than the provider maps so the pin card fits inside the map at 390 px.
                        <div className="h-[440px] sm:h-[480px]">
                            <SpotPinMap spots={pins.spots} routes={pins.routes} selectedId={selectedPinId} onSelect={setSelectedPinId} />
                        </div>
                    ) : (
                        <div className="h-[250px] sm:h-[300px] md:h-[350px] lg:h-[400px]">
                            <MapComponent
                                markers={filteredLocations}
                                onMarkerClick={handleMarkerClick}
                                city={city}
                                userTier={userTier}
                            />
                        </div>
                    )}

                    {/* Unmapped activities warning (partial success) */}
                    {unmappedActivities.length > 0 && (
                        <div className="bg-[rgb(var(--ll-warning)/0.14)] px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 flex-shrink-0 text-[rgb(var(--ll-warning))]" />
                                <p className="text-sm text-foreground">
                                    {unmappedActivities.length} location{unmappedActivities.length > 1 ? "s" : ""} couldn&apos;t be mapped — check activity cards for map links.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Selected Location Info */}
                    {!usePhotoPins && selectedLocation && (
                        <div className="bg-primary/10 p-4">
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
