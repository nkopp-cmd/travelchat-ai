"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function SpotsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <div
            className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col justify-center space-y-5 px-4 py-8 text-center sm:space-y-6 sm:px-8"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
        >
            <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
                </div>
            </div>

            <div className="space-y-2">
                <h2 className="text-xl font-bold sm:text-2xl">Unable to load spots</h2>
                <p className="text-muted-foreground">
                    We encountered an error while loading the spots.
                </p>
                {error.digest && (
                    <p className="break-all text-xs text-muted-foreground">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>

            <div className="mx-auto flex w-full max-w-sm flex-col justify-center gap-3 sm:flex-row sm:gap-4">
                <Button onClick={reset} variant="default" className="w-full sm:w-auto">
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Try Again
                </Button>
                <Button onClick={() => window.location.href = "/dashboard"} variant="outline" className="w-full sm:w-auto">
                    <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                    Dashboard
                </Button>
            </div>
        </div>
    );
}
