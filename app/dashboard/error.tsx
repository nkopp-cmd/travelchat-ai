"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
            <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
            </div>

            <div className="space-y-2">
                <h2 className="text-2xl font-bold">Something went wrong!</h2>
                <p className="text-muted-foreground">
                    We encountered an error while loading the dashboard.
                </p>
                {error.message && (
                    <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                        {error.message}
                    </p>
                )}
            </div>

            <div className="flex gap-4 justify-center">
                <Button onClick={reset} variant="default">
                    Try Again
                </Button>
                <Button onClick={() => window.location.href = "/"} variant="outline">
                    Go Home
                </Button>
            </div>
        </div>
    );
}
