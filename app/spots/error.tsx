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
        <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
            <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
            </div>

            <div className="space-y-2">
                <h2 className="text-2xl font-bold">Unable to load spots</h2>
                <p className="text-muted-foreground">
                    We encountered an error while loading the spots.
                </p>
                {error.digest && (
                    <p className="text-xs text-muted-foreground">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>

            <div className="flex gap-4 justify-center">
                <Button onClick={reset} variant="default">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                </Button>
                <Button onClick={() => window.location.href = "/dashboard"} variant="outline">
                    <Home className="mr-2 h-4 w-4" />
                    Dashboard
                </Button>
            </div>
        </div>
    );
}
