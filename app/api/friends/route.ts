import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getRankTitle } from "@/lib/gamification";

// GET - List followers/following
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type") || "following"; // "following" or "followers"
        const targetUserId = searchParams.get("userId") || userId;

        const supabase = createSupabaseAdmin();

        if (type === "followers") {
            // Get users who follow the target user
            const { data: follows, error } = await supabase
                .from("follows")
                .select("follower_id, created_at")
                .eq("following_id", targetUserId)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Error fetching followers:", error);
                return NextResponse.json({ error: "Failed to fetch followers" }, { status: 500 });
            }

            // Get user details for each follower
            const followerIds = follows?.map((f) => f.follower_id) || [];
            const { data: users } = await supabase
                .from("users")
                .select("clerk_id, username, xp, level")
                .in("clerk_id", followerIds.length > 0 ? followerIds : ["none"]);

            const usersMap = new Map(users?.map((u) => [u.clerk_id, u]) || []);

            const followers = follows?.map((f) => {
                const user = usersMap.get(f.follower_id);
                return {
                    clerkId: f.follower_id,
                    username: user?.username || "Explorer",
                    xp: user?.xp || 0,
                    level: user?.level || 1,
                    title: getRankTitle(user?.level || 1),
                    followedAt: f.created_at,
                };
            }) || [];

            return NextResponse.json({
                success: true,
                type: "followers",
                count: followers.length,
                users: followers,
            });
        } else {
            // Get users the target user follows
            const { data: follows, error } = await supabase
                .from("follows")
                .select("following_id, created_at")
                .eq("follower_id", targetUserId)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Error fetching following:", error);
                return NextResponse.json({ error: "Failed to fetch following" }, { status: 500 });
            }

            // Get user details
            const followingIds = follows?.map((f) => f.following_id) || [];
            const { data: users } = await supabase
                .from("users")
                .select("clerk_id, username, xp, level")
                .in("clerk_id", followingIds.length > 0 ? followingIds : ["none"]);

            const usersMap = new Map(users?.map((u) => [u.clerk_id, u]) || []);

            const following = follows?.map((f) => {
                const user = usersMap.get(f.following_id);
                return {
                    clerkId: f.following_id,
                    username: user?.username || "Explorer",
                    xp: user?.xp || 0,
                    level: user?.level || 1,
                    title: getRankTitle(user?.level || 1),
                    followedAt: f.created_at,
                };
            }) || [];

            return NextResponse.json({
                success: true,
                type: "following",
                count: following.length,
                users: following,
            });
        }
    } catch (error) {
        console.error("Friends API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST - Follow a user
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { targetUserId } = await req.json();

        if (!targetUserId) {
            return NextResponse.json({ error: "Target user ID required" }, { status: 400 });
        }

        if (targetUserId === userId) {
            return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
        }

        const supabase = createSupabaseAdmin();

        // Check if already following
        const { data: existing } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", userId)
            .eq("following_id", targetUserId)
            .single();

        if (existing) {
            return NextResponse.json({
                success: true,
                following: true,
                message: "Already following this user",
            });
        }

        // Create follow relationship
        const { error } = await supabase.from("follows").insert({
            follower_id: userId,
            following_id: targetUserId,
        });

        if (error) {
            console.error("Error following user:", error);
            return NextResponse.json({ error: "Failed to follow user" }, { status: 500 });
        }

        // Award XP for social activity (fire and forget)
        try {
            await fetch(`${req.nextUrl.origin}/api/gamification/award`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": req.headers.get("cookie") || "",
                },
                body: JSON.stringify({ action: "share_spot" }), // Reusing share action for social XP
            });
        } catch (xpError) {
            console.error("Error awarding XP:", xpError);
        }

        return NextResponse.json({
            success: true,
            following: true,
            message: "Now following user",
        });
    } catch (error) {
        console.error("Follow error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE - Unfollow a user
export async function DELETE(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { targetUserId } = await req.json();

        if (!targetUserId) {
            return NextResponse.json({ error: "Target user ID required" }, { status: 400 });
        }

        const supabase = createSupabaseAdmin();

        const { error } = await supabase
            .from("follows")
            .delete()
            .eq("follower_id", userId)
            .eq("following_id", targetUserId);

        if (error) {
            console.error("Error unfollowing user:", error);
            return NextResponse.json({ error: "Failed to unfollow user" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            following: false,
            message: "Unfollowed user",
        });
    } catch (error) {
        console.error("Unfollow error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
