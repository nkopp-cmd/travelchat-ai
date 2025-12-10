"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface LikeButtonProps {
    itineraryId: string;
    initialLiked?: boolean;
    initialCount?: number;
    showCount?: boolean;
    size?: "sm" | "default" | "lg";
    variant?: "default" | "ghost" | "outline";
    className?: string;
}

export function LikeButton({
    itineraryId,
    initialLiked = false,
    initialCount = 0,
    showCount = true,
    size = "default",
    variant = "ghost",
    className,
}: LikeButtonProps) {
    const { isSignedIn } = useAuth();
    const { toast } = useToast();
    const [liked, setLiked] = useState(initialLiked);
    const [likeCount, setLikeCount] = useState(initialCount);
    const [loading, setLoading] = useState(false);
    const [initialFetch, setInitialFetch] = useState(true);

    // Fetch initial like status on mount
    useEffect(() => {
        async function fetchLikeStatus() {
            try {
                const response = await fetch(`/api/itineraries/${itineraryId}/like`);
                if (response.ok) {
                    const data = await response.json();
                    setLiked(data.liked);
                    setLikeCount(data.likeCount);
                }
            } catch (error) {
                console.error("Error fetching like status:", error);
            } finally {
                setInitialFetch(false);
            }
        }

        fetchLikeStatus();
    }, [itineraryId]);

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isSignedIn) {
            toast({
                title: "Sign in required",
                description: "Please sign in to save itineraries",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        try {
            const method = liked ? "DELETE" : "POST";
            const response = await fetch(`/api/itineraries/${itineraryId}/like`, {
                method,
            });

            if (response.ok) {
                const data = await response.json();
                setLiked(data.liked);
                setLikeCount(data.likeCount);

                toast({
                    title: data.liked ? "Saved!" : "Removed",
                    description: data.liked
                        ? "Itinerary added to your saved items"
                        : "Itinerary removed from saved items",
                });
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to save itinerary",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error toggling like:", error);
            toast({
                title: "Error",
                description: "Something went wrong. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const sizeClasses = {
        sm: "h-8 px-2",
        default: "h-9 px-3",
        lg: "h-10 px-4",
    };

    const iconSizes = {
        sm: "h-4 w-4",
        default: "h-5 w-5",
        lg: "h-6 w-6",
    };

    return (
        <Button
            variant={variant}
            size={size}
            className={cn(
                sizeClasses[size],
                "gap-1.5 transition-all",
                liked && "text-rose-500 hover:text-rose-600",
                className
            )}
            onClick={handleClick}
            disabled={loading || initialFetch}
        >
            {loading ? (
                <Loader2 className={cn(iconSizes[size], "animate-spin")} />
            ) : (
                <Heart
                    className={cn(
                        iconSizes[size],
                        "transition-all",
                        liked && "fill-current"
                    )}
                />
            )}
            {showCount && (
                <span className="font-medium tabular-nums">
                    {likeCount > 0 ? likeCount : ""}
                </span>
            )}
        </Button>
    );
}
