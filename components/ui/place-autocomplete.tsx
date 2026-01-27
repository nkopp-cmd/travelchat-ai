"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Extend Window interface for Google Maps
declare global {
    interface Window {
        google?: typeof google;
    }
}

interface PlaceAutocompleteProps {
    value: string;
    onChange: (value: string, place?: google.maps.places.PlaceResult) => void;
    types?: string[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function PlaceAutocomplete({
    value,
    onChange,
    types = ["(cities)"],
    placeholder = "Search for a place...",
    className,
    disabled = false,
}: PlaceAutocompleteProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load Google Maps script
    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

        if (!apiKey) {
            console.warn("Google Maps API key not configured");
            return;
        }

        if (window.google?.maps?.places) {
            setIsLoaded(true);
            return;
        }

        // Check if script is already loading
        const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        if (existingScript) {
            existingScript.addEventListener("load", () => setIsLoaded(true));
            return;
        }

        setIsLoading(true);
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            setIsLoaded(true);
            setIsLoading(false);
        };
        script.onerror = () => {
            console.error("Failed to load Google Maps script");
            setIsLoading(false);
        };
        document.head.appendChild(script);
    }, []);

    // Memoize the onChange handler
    const handlePlaceChanged = useCallback(() => {
        const place = autocompleteRef.current?.getPlace();
        if (place?.name) {
            onChange(place.name, place);
        }
    }, [onChange]);

    // Initialize autocomplete
    useEffect(() => {
        if (!isLoaded || !inputRef.current || !window.google?.maps?.places) return;

        // Clean up previous instance
        if (autocompleteRef.current) {
            google.maps.event.clearInstanceListeners(autocompleteRef.current);
        }

        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
            types,
            fields: ["name", "formatted_address", "geometry", "place_id"],
        });

        autocompleteRef.current.addListener("place_changed", handlePlaceChanged);

        return () => {
            if (autocompleteRef.current) {
                google.maps.event.clearInstanceListeners(autocompleteRef.current);
            }
        };
    }, [isLoaded, types, handlePlaceChanged]);

    return (
        <div className="relative">
            <Input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(className)}
                disabled={disabled || isLoading}
            />
            {isLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
            )}
        </div>
    );
}
