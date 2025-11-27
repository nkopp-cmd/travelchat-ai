"use client";

import { Button } from "@/components/ui/button";
import { Share2, Heart, Check, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface SpotInteractionsProps {
    spotId: string;
    spotName: string;
}

export function SpotInteractions({ spotId, spotName }: SpotInteractionsProps) {
    const [isLiked, setIsLiked] = useState(false);
    const [isSharing, setIsSharing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    // Check if spot is already saved on mount
    useEffect(() => {
        const checkSavedStatus = async () => {
            try {
                const response = await fetch(`/api/spots/save?spotId=${spotId}`);
                if (response.ok) {
                    const data = await response.json();
                    setIsLiked(data.saved);
                }
            } catch (error) {
                // Silently fail - user just won't see saved state
            } finally {
                setIsLoading(false);
            }
        };
        checkSavedStatus();
    }, [spotId]);

    const handleShare = async () => {
        setIsSharing(true);

        try {
            // Try native share API first
            if (navigator.share) {
                await navigator.share({
                    title: spotName,
                    text: `Check out ${spotName} on Localley!`,
                    url: window.location.href,
                });

                // Award XP for sharing
                await fetch("/api/gamification/award", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "share", spotId }),
                });

                toast({
                    title: "Shared successfully!",
                    description: "+10 XP earned for sharing",
                });
            } else {
                // Fallback: copy to clipboard
                await navigator.clipboard.writeText(window.location.href);
                toast({
                    title: "Link copied!",
                    description: "Share link copied to clipboard",
                });
            }
        } catch (error) {
            if ((error as Error).name !== "AbortError") {
                toast({
                    title: "Share failed",
                    description: "Could not share this spot",
                    variant: "destructive",
                });
            }
        } finally {
            setIsSharing(false);
        }
    };

    const handleLike = async () => {
        const newLikedState = !isLiked;
        setIsSaving(true);

        try {
            const response = await fetch("/api/spots/save", {
                method: newLikedState ? "POST" : "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spotId }),
            });

            if (!response.ok) {
                throw new Error("Failed to update saved status");
            }

            setIsLiked(newLikedState);

            if (newLikedState) {
                toast({
                    title: "Spot saved!",
                    description: `${spotName} added to your saved spots`,
                });
            } else {
                toast({
                    title: "Spot removed",
                    description: `${spotName} removed from saved spots`,
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Could not update saved status. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex gap-2">
            <Button
                size="icon"
                variant="secondary"
                className="rounded-full h-10 w-10 bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-sm"
                onClick={handleShare}
                disabled={isSharing}
            >
                {isSharing ? (
                    <Check className="h-4 w-4" />
                ) : (
                    <Share2 className="h-4 w-4" />
                )}
            </Button>
            <Button
                size="icon"
                variant="secondary"
                className={`rounded-full h-10 w-10 border-none backdrop-blur-sm transition-colors ${isLiked
                        ? "bg-red-500/80 text-white hover:bg-red-600/80"
                        : "bg-white/10 hover:bg-white/20 text-white"
                    }`}
                onClick={handleLike}
                disabled={isSaving || isLoading}
            >
                {isSaving || isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                )}
            </Button>
        </div>
    );
}
