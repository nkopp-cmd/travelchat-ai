"use client";

import { buttonVariants } from "@/components/ui/button-variants";
import { AlertCircle, RefreshCw, Home } from "@/components/ui/icons";
import { useEffect } from "react";

// Push CH1: this boundary sits on the planner first screen (/itineraries/new). A static @sentry/nextjs import and the
// tailwind-merge Button put ~6 KB gzip into its first-load JS; Sentry now loads only when an error really happens.

export default function ItinerariesError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error)).catch(() => undefined);
    }, [error]);

    return (
        <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
            <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
            </div>

            <div className="space-y-2">
                <h2 className="text-2xl font-bold">Unable to load itineraries</h2>
                <p className="text-muted-foreground">
                    We encountered an error while loading your itineraries.
                </p>
                {error.digest && (
                    <p className="text-xs text-muted-foreground">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>

            <div className="flex gap-4 justify-center">
                <button type="button" onClick={reset} className={buttonVariants({ variant: "default" })}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                </button>
                <a href="/dashboard" className={buttonVariants({ variant: "outline" })}>
                    <Home className="mr-2 h-4 w-4" />
                    Dashboard
                </a>
            </div>
        </div>
    );
}
