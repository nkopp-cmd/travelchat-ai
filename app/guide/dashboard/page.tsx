"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft,
    Loader2,
    DollarSign,
    TrendingUp,
    Eye,
    Bookmark,
    ExternalLink,
    AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

interface GuideStatus {
    isGuide: boolean;
    status: string;
    onboardingComplete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    totalEarned: number;
    pendingBalance: number;
    appliedAt: string;
}

interface Earnings {
    summary: {
        totalEarned: number;
        totalPaidOut: number;
        pendingBalance: number;
    };
    currentMonth: {
        totalPoints: number;
        itineraryViews: number;
        itinerarySaves: number;
        spotViews: number;
        spotSaves: number;
    } | null;
    earnings: Array<{
        id: string;
        earning_month: string;
        gross_amount: number;
        status: string;
        total_engagement_points: number;
    }>;
}

export default function GuideDashboardPage() {
    const [guideStatus, setGuideStatus] = useState<GuideStatus | null>(null);
    const [earnings, setEarnings] = useState<Earnings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOnboarding, setIsOnboarding] = useState(false);
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const fetchData = useCallback(async () => {
        try {
            const [statusRes, earningsRes] = await Promise.all([
                fetch("/api/connect/status"),
                fetch("/api/connect/earnings").catch(() => null),
            ]);

            const statusData = await statusRes.json();
            setGuideStatus(statusData);

            if (earningsRes?.ok) {
                const earningsData = await earningsRes.json();
                setEarnings(earningsData);
            }
        } catch {
            toast({ title: "Failed to load dashboard", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (searchParams.get("onboarding") === "complete") {
            toast({ title: "Stripe onboarding complete! Your account is being verified." });
        }
    }, [searchParams, toast]);

    const handleOnboarding = async () => {
        setIsOnboarding(true);
        try {
            const res = await fetch("/api/connect/onboard", { method: "POST" });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch {
            toast({ title: "Failed to start onboarding", variant: "destructive" });
        } finally {
            setIsOnboarding(false);
        }
    };

    const handleStripeDashboard = async () => {
        try {
            const res = await fetch("/api/connect/dashboard");
            const data = await res.json();
            if (data.url) {
                window.open(data.url, "_blank");
            }
        } catch {
            toast({ title: "Failed to open Stripe dashboard", variant: "destructive" });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (!guideStatus?.isGuide) {
        return (
            <div className="container max-w-3xl mx-auto py-8 px-4 text-center">
                <h1 className="text-2xl font-bold mb-4">Not a Guide Yet</h1>
                <p className="text-muted-foreground mb-6">
                    Apply to become a local guide and start earning from your travel content.
                </p>
                <Button asChild>
                    <Link href="/guide/apply">Apply Now</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4">
            <Link
                href="/settings"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Settings
            </Link>

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Guide Dashboard</h1>
                    <p className="text-muted-foreground">Manage your earnings and content</p>
                </div>
                <Badge variant={guideStatus.status === "approved" ? "default" : "secondary"}>
                    {guideStatus.status}
                </Badge>
            </div>

            {/* Pending/Onboarding States */}
            {guideStatus.status === "pending" && (
                <Card className="mb-6 border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
                    <CardContent className="pt-6 flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                        <div>
                            <p className="font-medium">Application Under Review</p>
                            <p className="text-sm text-muted-foreground">
                                We&apos;re reviewing your guide application. You&apos;ll be notified once approved.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {guideStatus.status === "approved" && !guideStatus.onboardingComplete && (
                <Card className="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3 mb-4">
                            <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                            <div>
                                <p className="font-medium">Complete Stripe Onboarding</p>
                                <p className="text-sm text-muted-foreground">
                                    Set up your Stripe account to receive payouts.
                                </p>
                            </div>
                        </div>
                        <Button onClick={handleOnboarding} disabled={isOnboarding}>
                            {isOnboarding ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</>
                            ) : (
                                "Complete Stripe Setup"
                            )}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Earnings Summary */}
            {guideStatus.status === "approved" && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Total Earned</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-5 w-5 text-green-500" />
                                    <span className="text-2xl font-bold">
                                        ${(earnings?.summary.totalEarned || 0).toFixed(2)}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Pending Balance</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-blue-500" />
                                    <span className="text-2xl font-bold">
                                        ${(earnings?.summary.pendingBalance || 0).toFixed(2)}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Paid Out</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                                    <span className="text-2xl font-bold">
                                        ${(earnings?.summary.totalPaidOut || 0).toFixed(2)}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Current Month Engagement */}
                    {earnings?.currentMonth && (
                        <Card className="mb-6">
                            <CardHeader>
                                <CardTitle className="text-lg">This Month&apos;s Engagement</CardTitle>
                                <CardDescription>
                                    Paid subscribers interacting with your content
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="flex items-center gap-2">
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">Itinerary Views</p>
                                            <p className="font-bold">{earnings.currentMonth.itineraryViews}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Bookmark className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">Itinerary Saves</p>
                                            <p className="font-bold">{earnings.currentMonth.itinerarySaves}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">Spot Views</p>
                                            <p className="font-bold">{earnings.currentMonth.spotViews}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Bookmark className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">Spot Saves</p>
                                            <p className="font-bold">{earnings.currentMonth.spotSaves}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t">
                                    <p className="text-sm text-muted-foreground">
                                        Total Engagement Points: <strong>{earnings.currentMonth.totalPoints}</strong>
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Earnings History */}
                    {earnings?.earnings && earnings.earnings.length > 0 && (
                        <Card className="mb-6">
                            <CardHeader>
                                <CardTitle className="text-lg">Earnings History</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {earnings.earnings.map((e) => (
                                        <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                            <div>
                                                <p className="font-medium">
                                                    {new Date(e.earning_month).toLocaleDateString("en-US", {
                                                        month: "long",
                                                        year: "numeric",
                                                    })}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {e.total_engagement_points} engagement points
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold">${e.gross_amount.toFixed(2)}</p>
                                                <Badge variant="outline" className="text-xs">
                                                    {e.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Stripe Dashboard Link */}
                    {guideStatus.onboardingComplete && (
                        <Card>
                            <CardContent className="pt-6">
                                <Button variant="outline" onClick={handleStripeDashboard}>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Open Stripe Dashboard
                                </Button>
                                <p className="text-sm text-muted-foreground mt-2">
                                    View detailed payout history, update bank details, and manage tax info.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
