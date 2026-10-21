"use client";

import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    Trophy,
    Star,
    Target,
    ArrowLeft,
    Loader2,
    CheckCircle,
    Sparkles,
    Users,
    Flame,
    Map,
    Heart,
} from "@/components/ui/icons";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { AppBackground } from "@/components/layout/app-background";

interface Challenge {
    id: string;
    name: string;
    description: string;
    xpReward: number;
    requirements: {
        type: string;
        count?: number;
        days?: number;
    };
    progress: number;
    total: number;
    progressPercentage: number;
    isCompleted: boolean;
    canClaim: boolean;
}

function getChallengeIcon(type: string) {
    switch (type) {
        case "itinerary_count":
            return <Map className="h-6 w-6" />;
        case "saved_spots":
            return <Heart className="h-6 w-6" />;
        case "following_count":
        case "followers_count":
            return <Users className="h-6 w-6" />;
        case "streak":
            return <Flame className="h-6 w-6" />;
        default:
            return <Target className="h-6 w-6" />;
    }
}

function getChallengeColor(type: string) {
    switch (type) {
        case "itinerary_count":
            return "text-primary bg-primary/10";
        case "saved_spots":
            return "text-red-500 bg-red-500/10";
        case "following_count":
        case "followers_count":
            return "text-blue-500 bg-blue-500/10";
        case "streak":
            return "text-orange-500 bg-orange-500/10";
        default:
            return "text-muted-foreground bg-raised";
    }
}

export default function ChallengesPage() {
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [completedCount, setCompletedCount] = useState(0);
    const { toast } = useToast();

    const fetchChallenges = useCallback(async () => {
        try {
            const response = await fetch("/api/challenges");
            const data = await response.json();

            if (data.success) {
                setChallenges(data.challenges);
                setCompletedCount(data.completedCount);
            }
        } catch (error) {
            console.error("Error fetching challenges:", error);
            toast({
                title: "Error",
                description: "Failed to load challenges",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchChallenges();
    }, [fetchChallenges]);

    const handleClaim = async (challengeId: string) => {
        setClaimingId(challengeId);
        try {
            const response = await fetch("/api/challenges", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ challengeId }),
            });

            const data = await response.json();

            if (data.success) {
                toast({
                    title: "Challenge Completed!",
                    description: data.message,
                });
                // Refresh challenges
                fetchChallenges();
            } else {
                toast({
                    title: "Error",
                    description: data.error || "Failed to claim challenge",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error claiming challenge:", error);
            toast({
                title: "Error",
                description: "Failed to claim challenge",
                variant: "destructive",
            });
        } finally {
            setClaimingId(null);
        }
    };

    const inProgressChallenges = challenges.filter((c) => !c.isCompleted);
    const completedChallenges = challenges.filter((c) => c.isCompleted);

    return (
        <AppBackground ambient className="min-h-screen">
            <PageShell width="narrow">
            {/* Back Button */}
            <Link
                href="/profile"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Profile
            </Link>

            <PageHeader
                eyebrow="Your progress"
                eyebrowIcon={Target}
                title="Challenges"
                lede="Complete challenges to earn XP and unlock achievements."
            />

            {/* Progress Summary */}
            <Card className="bg-surface">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Completed</p>
                            <p className="text-3xl font-bold">
                                {completedCount}/{challenges.length}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Trophy className="h-8 w-8 text-[rgb(var(--ll-warning))]" />
                            <div className="text-right">
                                <p className="text-sm text-muted-foreground">Total XP Available</p>
                                <p className="text-xl font-bold">
                                    {challenges.reduce((sum, c) => sum + c.xpReward, 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <>
                    {/* In Progress */}
                    {inProgressChallenges.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                In Progress
                            </h2>
                            <div className="grid gap-4">
                                {inProgressChallenges.map((challenge) => (
                                    <Card
                                        key={challenge.id}
                                        className={` bg-background/60 backdrop-blur-sm transition-all ${
                                            challenge.canClaim
                                                ? " bg-primary/10"
                                                : ""
                                        }`}
                                    >
                                        <CardContent className="p-6">
                                            <div className="flex items-start gap-4">
                                                <div
                                                    className={`p-3 rounded-xl ${getChallengeColor(
                                                        challenge.requirements.type
                                                    )}`}
                                                >
                                                    {getChallengeIcon(challenge.requirements.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <h3 className="font-semibold">{challenge.name}</h3>
                                                        <Badge variant="secondary" className="shrink-0">
                                                            +{challenge.xpReward} XP
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mb-3">
                                                        {challenge.description}
                                                    </p>
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-muted-foreground">Progress</span>
                                                            <span className="font-medium">
                                                                {challenge.progress}/{challenge.total}
                                                            </span>
                                                        </div>
                                                        <Progress
                                                            value={challenge.progressPercentage}
                                                            className="h-2"
                                                        />
                                                    </div>
                                                </div>
                                                {challenge.canClaim && (
                                                    <Button
                                                        onClick={() => handleClaim(challenge.id)}
                                                        disabled={claimingId === challenge.id}
                                                        className="shrink-0"
                                                    >
                                                        {claimingId === challenge.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Star className="mr-2 h-4 w-4" />
                                                                Claim
                                                            </>
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Completed */}
                    {completedChallenges.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                <CheckCircle className="h-5 w-5 text-primary" />
                                Completed
                            </h2>
                            <div className="grid gap-4">
                                {completedChallenges.map((challenge) => (
                                    <Card
                                        key={challenge.id}
                                        className="bg-background/40 backdrop-blur-sm opacity-75"
                                    >
                                        <CardContent className="p-6">
                                            <div className="flex items-start gap-4">
                                                <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                                    <CheckCircle className="h-6 w-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <h3 className="font-semibold">{challenge.name}</h3>
                                                        <Badge
                                                            variant="secondary"
                                                            className="bg-primary/10 text-foreground"
                                                        >
                                                            +{challenge.xpReward} XP Earned
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {challenge.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {challenges.length === 0 && (
                        <Card className="bg-background/60">
                            <CardContent className="pt-6">
                                <div className="text-center py-12">
                                    <Target className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No challenges yet</h3>
                                    <p className="text-muted-foreground">
                                        Check back soon for new challenges!
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
            </PageShell>
        </AppBackground>
    );
}
