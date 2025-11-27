"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import * as Sentry from "@sentry/nextjs";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Error caught by boundary:", error, errorInfo);

        // Send error to Sentry
        Sentry.captureException(error, {
            contexts: {
                react: {
                    componentStack: errorInfo.componentStack,
                },
            },
        });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex items-center justify-center min-h-[400px] p-4">
                    <Card className="max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center gap-3 text-destructive">
                            <AlertTriangle className="h-6 w-6" />
                            <h2 className="text-lg font-semibold">Something went wrong</h2>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            We encountered an unexpected error. This has been logged and we&apos;ll look into it.
                        </p>

                        {this.state.error && (
                            <details className="text-xs bg-muted p-3 rounded-md">
                                <summary className="cursor-pointer font-medium mb-2">Error details</summary>
                                <pre className="whitespace-pre-wrap break-words">
                                    {this.state.error.message}
                                </pre>
                            </details>
                        )}

                        <div className="flex gap-2">
                            <Button onClick={this.handleReset} className="flex-1">
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Try Again
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => window.location.href = '/dashboard'}
                                className="flex-1"
                            >
                                Go to Dashboard
                            </Button>
                        </div>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

// Simplified error boundary for smaller components
export function SimpleErrorBoundary({ children }: { children: React.ReactNode }) {
    return (
        <ErrorBoundary
            fallback={
                <div className="p-4 text-center text-sm text-muted-foreground">
                    <p>Unable to load this component</p>
                </div>
            }
        >
            {children}
        </ErrorBoundary>
    );
}
