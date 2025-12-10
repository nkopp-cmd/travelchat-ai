"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";

interface BillingPortalButtonProps {
    className?: string;
    variant?: "default" | "outline" | "ghost";
}

export function BillingPortalButton({
    className,
    variant = "default",
}: BillingPortalButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = async () => {
        setIsLoading(true);
        try {
            const response = await fetch("/api/subscription/portal", {
                method: "POST",
            });

            if (!response.ok) {
                throw new Error("Failed to create billing portal session");
            }

            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            }
        } catch (error) {
            console.error("Error opening billing portal:", error);
            setIsLoading(false);
        }
    };

    return (
        <Button
            variant={variant}
            className={className}
            onClick={handleClick}
            disabled={isLoading}
        >
            {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
                <CreditCard className="h-4 w-4 mr-2" />
            )}
            Manage Billing
            <ExternalLink className="h-3 w-3 ml-2" />
        </Button>
    );
}
