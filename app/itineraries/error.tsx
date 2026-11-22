"use client";

import { useEffect } from "react";

// Push CH1: this boundary loads on every /itineraries/new first screen (Next fetches route error boundaries up front).
// Keep it plain markup: no Sentry import (loads only when an error happens), no buttonVariants/cva, no icon module.
const button = "inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors";

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
        <div role="alert" className="max-w-2xl mx-auto p-8 text-center space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold">Unable to load itineraries</h2>
                <p className="text-muted-foreground">We encountered an error while loading your itineraries.</p>
                {error.digest && <p className="text-xs text-muted-foreground">Error ID: {error.digest}</p>}
            </div>
            <div className="flex gap-4 justify-center">
                <button type="button" onClick={reset} className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}>
                    Try Again
                </button>
                <a href="/dashboard" className={`${button} bg-secondary text-secondary-foreground hover:bg-accent`}>
                    Dashboard
                </a>
            </div>
        </div>
    );
}
