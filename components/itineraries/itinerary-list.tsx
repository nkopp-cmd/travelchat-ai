"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useDuplicateItinerary, useDeleteItinerary } from "@/hooks/use-queries";
import { getCityImageUrl } from "@/lib/city-images";
import { ItineraryCollection, type CollectionItinerary } from "./itinerary-collection";

interface Itinerary extends CollectionItinerary {
    title: string;
    subtitle?: string;
    city: string;
    local_score: number;
    status?: "draft" | "completed";
}

interface ItineraryListProps {
    initialItineraries: Itinerary[];
}

export function ItineraryList({ initialItineraries }: ItineraryListProps) {
    const [itineraries, setItineraries] = useState(initialItineraries);
    const { toast } = useToast();
    const duplicateMutation = useDuplicateItinerary();
    const deleteMutation = useDeleteItinerary();

    return <ItineraryCollection itineraries={itineraries} Link={Link} canCreate
        renderImage={(city, sizes) => {
            const src = getCityImageUrl(city);
            return src ? <Image src={src} alt={city} fill className="object-cover" sizes={sizes} /> : null;
        }}
        duplicatePending={duplicateMutation.isPending}
        onDuplicate={(itinerary) => duplicateMutation.mutate(itinerary.id, {
            onSuccess: (newItinerary) => {
                setItineraries((prev) => [{ ...newItinerary, local_score: newItinerary.localScore ?? 0,
                    created_at: newItinerary.createdAt ?? new Date().toISOString() } as Itinerary, ...prev]);
                toast({ title: "Itinerary duplicated", description: `"${itinerary.title}" has been duplicated.` });
            },
            onError: (error) => toast({ title: "Failed to duplicate", description: error.message || "Please try again.", variant: "destructive" }),
        })}
        onDelete={(id) => new Promise<void>((resolve) => {
            deleteMutation.mutate(id, {
                onSuccess: () => {
                    setItineraries((prev) => prev.filter((i) => i.id !== id));
                    toast({ title: "Itinerary deleted", description: "Your itinerary has been deleted." });
                    resolve();
                },
                onError: (error) => {
                    toast({ title: "Failed to delete", description: error.message || "Please try again.", variant: "destructive" });
                    resolve();
                },
            });
        })}
        onShare={async (itinerary) => {
            const city = !itinerary.city || itinerary.city.toLowerCase() === "unknown city" || !itinerary.city.trim()
                ? "Adventure Awaits" : itinerary.city;
            const url = `${window.location.origin}/itineraries/${itinerary.id}`;
            if (navigator.share) {
                try {
                    await navigator.share({ title: itinerary.title ?? "", text: `Check out my ${itinerary.days}-day itinerary for ${city}!`, url });
                } catch { /* User cancelled or error. */ }
            } else {
                await navigator.clipboard.writeText(url);
            }
        }} />;
}
