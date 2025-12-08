"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

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
            return "text-violet-500 bg-violet-500/10";
        case "saved_spots":
            return "text-red-500 bg-red-500/10";
        case "following_count":
        case "followers_count":
            return "text-blue-500 bg-blue-500/10";
        case "streak":
            return "text-orange-500 bg-orange-500/10";
        default:
            return "text-gray-500 bg-gray-500/10";
    }
}

export default function ChallengesPage() {
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [completedCount, setCompletedCount] = useState(0);
    const { toast } = useToast();

    useEffect(() => {
        fetchChallenges();
    }, []);

    const fetchChallenges = async () => {
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
    };

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
        <div className="max-w-4xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
            {/* Back Button */}
            <Link
                href="/profile"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Profile
            </Link>

            {/* Header */}
            <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-3">
                    <Target className="h-10 w-10 text-violet-500" />
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
                        Challenges
                    </h1>
                </div>
                <p className="text-muted-foreground">
                    Complete challenges to earn XP and unlock achievements
                </p>
            </div>

            {/* Progress Summary */}
            <Card className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border-violet-500/20">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Completed</p>
                            <p className="text-3xl font-bold">
                                {completedCount}/{challenges.length}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Trophy className="h-8 w-8 text-yellow-500" />
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
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                </div>
            ) : (
                <>
                    {/* In Progress */}
                    {inProgressChallenges.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-violet-500" />
                                In Progress
                            </h2>
                            <div className="grid gap-4">
                                {inProgressChallenges.map((challenge) => (
                                    <Card
                                        key={challenge.id}
                                        className={`border-border/40 bg-background/60 backdrop-blur-sm transition-all ${
                                            challenge.canClaim
                                                ? "ring-2 ring-green-500/50 bg-green-500/5"
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
                                                        className="bg-green-600 hover:bg-green-700 shrink-0"
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
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                Completed
                            </h2>
                            <div className="grid gap-4">
                                {completedChallenges.map((challenge) => (
                                    <Card
                                        key={challenge.id}
                                        className="border-border/40 bg-background/40 backdrop-blur-sm opacity-75"
                                    >
                                        <CardContent className="p-6">
                                            <div className="flex items-start gap-4">
                                                <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
                                                    <CheckCircle className="h-6 w-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <h3 className="font-semibold">{challenge.name}</h3>
                                                        <Badge
                                                            variant="secondary"
                                                            className="bg-green-500/10 text-green-600"
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
                        <Card className="border-border/40 bg-background/60">
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
        </div>
    );
}
