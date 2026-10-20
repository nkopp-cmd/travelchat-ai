"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2 } from "@/components/ui/icons";
import { placesSnapshot, placesServerSnapshot, subscribePlaces } from "@/lib/maps/places-readiness";

declare global { interface Window { google?: typeof google; } }
interface PlaceAutocompleteProps {
  value: string;
  onChange: (value: string, place?: google.maps.places.PlaceResult) => void;
  types?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}
const CITY_TYPES = ["(cities)"];

export function PlaceAutocomplete({ value, onChange, types = CITY_TYPES, placeholder = "Search for a place...", className, disabled = false }: PlaceAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const status = useSyncExternalStore(subscribePlaces, placesSnapshot, placesServerSnapshot);
  const typesKey = JSON.stringify(types);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    if (status !== "ready" || !inputRef.current || !window.google?.maps?.places) return;
    const maps = window.google.maps;
    const autocomplete = new maps.places.Autocomplete(inputRef.current, {
      types: JSON.parse(typesKey) as string[], fields: ["name", "formatted_address", "geometry", "place_id"],
    });
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place?.name) onChangeRef.current(place.name, place);
    });
    return () => { listener.remove(); maps.event.clearInstanceListeners(autocomplete); };
  }, [status, typesKey]);
  return <div className="relative" aria-busy={status === "loading"}>
    <Input ref={inputRef} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder}
      className={cn(status === "loading" && "pr-10", className)} disabled={disabled} />
    {status === "loading" && <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" /></div>}
  </div>;
}
