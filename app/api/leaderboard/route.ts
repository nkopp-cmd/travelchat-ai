import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getRankTitle } from "@/lib/gamification";

export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type") || "global";
        const city = searchParams.get("city");
        const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

        const supabase = createSupabaseAdmin();

        // Base query for top users by XP
        let query = supabase
            .from("users")
            .select("id, clerk_id, username, xp, level")
            .order("xp", { ascending: false })
            .limit(limit);

        // For city-specific leaderboard, we'd need to track user locations
        // For now, global leaderboard is the main feature

        const { data: users, error } = await query;

        if (error) {
            console.error("Leaderboard fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch leaderboard" },
                { status: 500 }
            );
        }

        // Get additional user info from Clerk for display names
        // For now, use username or generate placeholder
        const leaderboard = (users || []).map((user, index) => ({
            rank: index + 1,
            id: user.id,
            clerkId: user.clerk_id,
            username: user.username || `Explorer${index + 1}`,
            xp: user.xp || 0,
            level: user.level || 1,
            title: getRankTitle(user.level || 1),
            isCurrentUser: user.clerk_id === userId,
        }));

        // Find current user's rank if not in top results
        let currentUserRank = null;
        if (userId) {
            const userInList = leaderboard.find((u) => u.isCurrentUser);
            if (!userInList) {
                // Get current user's rank
                const { data: currentUser } = await supabase
                    .from("users")
                    .select("id, clerk_id, username, xp, level")
                    .eq("clerk_id", userId)
                    .single();

                if (currentUser) {
                    // Count users with more XP
                    const { count } = await supabase
                        .from("users")
                        .select("*", { count: "exact", head: true })
                        .gt("xp", currentUser.xp || 0);

                    currentUserRank = {
                        rank: (count || 0) + 1,
                        id: currentUser.id,
                        clerkId: currentUser.clerk_id,
                        username: currentUser.username || "You",
                        xp: currentUser.xp || 0,
                        level: currentUser.level || 1,
                        title: getRankTitle(currentUser.level || 1),
                        isCurrentUser: true,
                    };
                }
            }
        }

        return NextResponse.json({
            success: true,
            type,
            leaderboard,
            currentUserRank,
            total: leaderboard.length,
        });
    } catch (error) {
        console.error("Leaderboard error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
