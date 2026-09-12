"use client";

import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSavedSpot } from "@/hooks/use-saved-spot";

interface SaveSpotButtonProps {
    spotId: string;
    spotName?: string;
    className?: string;
    size?: "sm" | "default" | "lg" | "icon";
}

export function SaveSpotButton({ spotId, spotName, className, size = "icon" }: SaveSpotButtonProps) {
    const { isSaved, isLoading, disabled, message, toggle } = useSavedSpot(spotId);
    const handleToggleSave = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        void toggle();
    };

    const accessibleSpotName = spotName?.trim() || spotId;

    return (
        <Button
            type="button"
            variant="ghost"
            size={size}
            onClick={handleToggleSave}
            disabled={disabled}
            title={message ?? undefined}
            className={cn(
                "relative rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90 after:pointer-events-none after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
                className
            )}
            aria-label={isSaved
                ? `Remove ${accessibleSpotName} from saved spots`
                : `Save ${accessibleSpotName}`}
            aria-pressed={isSaved}
            aria-busy={isLoading}
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
