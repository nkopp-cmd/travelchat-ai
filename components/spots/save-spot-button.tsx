"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface SaveSpotButtonProps {
    spotId: string;
    className?: string;
    size?: "sm" | "default" | "lg" | "icon";
}

export function SaveSpotButton({ spotId, className, size = "icon" }: SaveSpotButtonProps) {
    const [isSaved, setIsSaved] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const { isLoaded, isSignedIn } = useUser();

    // Check if spot is saved on mount
    useEffect(() => {
        if (!isLoaded || !isSignedIn) return;

        const checkSavedStatus = async () => {
            try {
                const response = await fetch(`/api/spots/save?spotId=${spotId}`);
                if (response.ok) {
                    const data = await response.json();
                    setIsSaved(data.saved);
                }
            } catch (error) {
                console.error("Error checking saved status:", error);
            }
        };
        checkSavedStatus();
    }, [isLoaded, isSignedIn, spotId]);

    const handleToggleSave = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isSignedIn) {
            toast({
                title: "Sign in to save spots",
                description: "Keep your favorite places in one trip list.",
            });
            router.push("/sign-in");
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch("/api/spots/save", {
                method: isSaved ? "DELETE" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ spotId }),
            });

            if (response.ok) {
                const data = await response.json();
                setIsSaved(data.saved);
                toast({
                    title: data.saved ? "Spot saved!" : "Spot removed",
                    description: data.saved
                        ? "Added to your saved spots +50 XP"
                        : "Removed from your saved spots",
                });
            } else {
                throw new Error("Failed to update saved status");
            }
        } catch (error) {
            console.error("Error toggling save:", error);
            toast({
                title: "Error",
                description: "Failed to update saved status",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            variant="ghost"
            size={size}
            onClick={handleToggleSave}
            disabled={isLoading || !isLoaded}
            className={cn(
                "rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90",
                className
            )}
            aria-label={isSaved ? "Remove from saved" : "Save spot"}
        >
            <Heart
                className={cn(
                    "h-4 w-4 transition-all",
                    isSaved ? "fill-red-500 text-red-500" : "text-muted-foreground",
                    isLoading && "animate-pulse"
                )}
            />
        </Button>
    );
}
