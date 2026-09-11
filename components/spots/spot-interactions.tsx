"use client";

import { Button } from "@/components/ui/button";
import { Share2, Heart, Check, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSavedSpot } from "@/hooks/use-saved-spot";
import { useAppSession } from "@/providers/app-session-provider";

interface SpotInteractionsProps {
    spotId: string;
    spotName: string;
}

export function SpotInteractions({ spotId, spotName }: SpotInteractionsProps) {
    const { isSaved: isLiked, isLoading, disabled, message, toggle } = useSavedSpot(spotId);
    const [isSharing, setIsSharing] = useState(false);
    const { toast } = useToast();
    const session = useAppSession();
    const shareScope = JSON.stringify([session.status, session.provider, session.accountKey, session.sessionId, spotId]);
    const currentShareScope = useRef(shareScope);
    currentShareScope.current = shareScope;

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

                let description = "Spot link shared";
                if (currentShareScope.current !== shareScope) return;
                if (session.provider === "clerk" && session.status === "ready") {
                    try {
                        const response = await fetch("/api/gamification/award", {
                            method: "POST",
                            credentials: "same-origin",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "share", spotId }),
                        });
                        const award = response.ok ? await response.json() : null;
                        if (award?.success === true && typeof award.xpAwarded === "number"
                            && Number.isFinite(award.xpAwarded) && award.xpAwarded > 0) {
                            description = `+${award.xpAwarded} XP earned for sharing`;
                        }
                    } catch {
                        // Sharing succeeded even when the optional reward request failed.
                    }
                }
                if (currentShareScope.current !== shareScope) return;
                toast({
                    title: "Shared successfully!",
                    description,
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

    return (
        <div className="flex gap-2">
            <Button
                size="icon"
                variant="secondary"
                className="rounded-full h-10 w-10 bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-sm"
                onClick={handleShare}
                disabled={isSharing}
                aria-label={`Share ${spotName}`}
                aria-busy={isSharing}
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
                onClick={() => { void toggle(); }}
                disabled={disabled}
                title={message ?? undefined}
                aria-label={isLiked ? `Remove ${spotName} from saved spots` : `Save ${spotName}`}
                aria-pressed={isLiked}
                aria-busy={isLoading}
            >
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
                )}
            </Button>
        </div>
    );
}
