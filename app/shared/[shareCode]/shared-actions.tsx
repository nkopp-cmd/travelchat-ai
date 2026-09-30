"use client";

import { Button } from "@/components/ui/button";
import { Download, Copy, Check } from "lucide-react";
import { LikeButton } from "@/components/itineraries/like-button";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface SharedActionsProps {
    itineraryId: string;
    shareCode: string;
    candidate?: boolean;
}

export function SharedActions({ itineraryId, shareCode, candidate = false }: SharedActionsProps) {
    const [copied, setCopied] = useState(false);
    const { toast } = useToast();

    const handleCopyLink = async () => {
        const url = `${window.location.origin}/shared/${shareCode}${candidate ? "?data_candidate=d1" : ""}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast({
                title: "Link copied!",
                description: "Share this link with friends",
            });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast({
                title: "Failed to copy",
                description: "Please copy the URL manually",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="flex items-center gap-2">
            {!candidate && <LikeButton
                itineraryId={itineraryId}
                showCount={true}
                variant="outline"
            />}
            <Button
                variant="outline"
                size="default"
                onClick={handleCopyLink}
                className="gap-2"
            >
                {copied ? (
                    <>
                        <Check className="h-4 w-4" />
                        Copied!
                    </>
                ) : (
                    <>
                        <Copy className="h-4 w-4" />
                        Copy Link
                    </>
                )}
            </Button>
            {!candidate && <a
                href={`/api/itineraries/${itineraryId}/export`}
                target="_blank"
                rel="noopener noreferrer"
            >
                <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Download
                </Button>
            </a>}
        </div>
    );
}
