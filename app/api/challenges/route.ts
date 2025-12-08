import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

interface ChallengeRequirements {
    type: string;
    count?: number;
    days?: number;
}

// GET - List all challenges with user progress
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabase = createSupabaseAdmin();

        // Get user's internal ID
        const { data: userData } = await supabase
            .from("users")
            .select("id")
            .eq("clerk_id", userId)
            .single();

        // Get all challenges
        const { data: challenges, error: challengesError } = await supabase
            .from("challenges")
            .select("*")
            .order("xp_reward", { ascending: true });

        if (challengesError) {
            console.error("Error fetching challenges:", challengesError);
            return NextResponse.json({ error: "Failed to fetch challenges" }, { status: 500 });
        }

        // Get user's completed challenges
        let completedChallengeIds: string[] = [];
        if (userData?.id) {
            const { data: userChallenges } = await supabase
                .from("user_challenges")
                .select("challenge_id")
                .eq("user_id", userData.id)
                .eq("completed", true);

            completedChallengeIds = userChallenges?.map((uc) => uc.challenge_id) || [];
        }

        // Calculate progress for each challenge
        const challengesWithProgress = await Promise.all(
            (challenges || []).map(async (challenge) => {
                const requirements = challenge.requirements as ChallengeRequirements;
                let progress = 0;
                let total = requirements.count || requirements.days || 1;

                if (userData?.id) {
                    switch (requirements.type) {
                        case "itinerary_count": {
                            const { count } = await supabase
                                .from("itineraries")
                                .select("*", { count: "exact", head: true })
                                .eq("clerk_user_id", userId);
                            progress = count || 0;
                            break;
                        }
                        case "saved_spots": {
                            const { count } = await supabase
                                .from("saved_spots")
                                .select("*", { count: "exact", head: true })
                                .eq("clerk_user_id", userId);
                            progress = count || 0;
                            break;
                        }
                        case "following_count": {
                            const { count } = await supabase
                                .from("follows")
                                .select("*", { count: "exact", head: true })
                                .eq("follower_id", userId);
                            progress = count || 0;
                            break;
                        }
                        case "followers_count": {
                            const { count } = await supabase
                                .from("follows")
                                .select("*", { count: "exact", head: true })
                                .eq("following_id", userId);
                            progress = count || 0;
                            break;
                        }
                        case "streak": {
                            const { data: progressData } = await supabase
                                .from("user_progress")
                                .select("current_streak")
                                .eq("user_id", userData.id)
                                .single();
                            progress = progressData?.current_streak || 0;
                            break;
                        }
                    }
                }

                const isCompleted = completedChallengeIds.includes(challenge.id);
                const progressPercentage = Math.min(100, (progress / total) * 100);

                return {
                    id: challenge.id,
                    name: challenge.name,
                    description: challenge.description,
                    xpReward: challenge.xp_reward,
                    requirements,
                    progress,
                    total,
                    progressPercentage,
                    isCompleted,
                    canClaim: progress >= total && !isCompleted,
                };
            })
        );

        return NextResponse.json({
            success: true,
            challenges: challengesWithProgress,
            completedCount: completedChallengeIds.length,
            totalCount: challenges?.length || 0,
        });
    } catch (error) {
        console.error("Challenges API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST - Claim a completed challenge
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { challengeId } = await req.json();

        if (!challengeId) {
            return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });
        }

        const supabase = createSupabaseAdmin();

        // Get user's internal ID
        const { data: userData } = await supabase
            .from("users")
            .select("id")
            .eq("clerk_id", userId)
            .single();

        if (!userData?.id) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Check if already claimed
        const { data: existing } = await supabase
            .from("user_challenges")
            .select("id")
            .eq("user_id", userData.id)
            .eq("challenge_id", challengeId)
            .eq("completed", true)
            .single();

        if (existing) {
            return NextResponse.json({
                success: false,
                error: "Challenge already claimed",
            });
        }

        // Get challenge details
        const { data: challenge } = await supabase
            .from("challenges")
            .select("*")
            .eq("id", challengeId)
            .single();

        if (!challenge) {
            return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
        }

        // Mark challenge as completed
        await supabase.from("user_challenges").upsert({
            user_id: userData.id,
            challenge_id: challengeId,
            completed: true,
            completed_at: new Date().toISOString(),
        });

        // Award XP
        const { data: user } = await supabase
            .from("users")
            .select("xp")
            .eq("id", userData.id)
            .single();

        const newXp = (user?.xp || 0) + challenge.xp_reward;

        await supabase
            .from("users")
            .update({ xp: newXp })
            .eq("id", userData.id);

        return NextResponse.json({
            success: true,
            xpAwarded: challenge.xp_reward,
            newTotalXp: newXp,
            message: `Challenge completed! +${challenge.xp_reward} XP`,
        });
    } catch (error) {
        console.error("Claim challenge error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
