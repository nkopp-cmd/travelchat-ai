import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { XP_REWARDS, getLevel } from "@/lib/gamification";
import { gamificationActionSchema, validateBody } from "@/lib/validations";

export async function POST(req: Request) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const validation = await validateBody(req, gamificationActionSchema);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const { action } = validation.data;

        // Determine XP amount based on action
        let amount = 0;
        switch (action) {
            case "verify":
            case "verify_spot":
                amount = XP_REWARDS.VERIFY_SPOT;
                break;
            case "share":
            case "share_spot":
                amount = XP_REWARDS.SHARE_SPOT;
                break;
            case "checkin":
            case "discover_spot":
                amount = XP_REWARDS.DISCOVER_SPOT;
                break;
            case "create_itinerary":
                amount = XP_REWARDS.CREATE_ITINERARY;
                break;
            case "daily_login":
                amount = XP_REWARDS.DAILY_LOGIN;
                break;
            case "streak_bonus":
                amount = XP_REWARDS.STREAK_BONUS;
                break;
        }

        const supabase = createSupabaseAdmin();

        // Get user's database ID from clerk_id
        const { data: existingUser, error: userError } = await supabase
            .from("users")
            .select("id, xp, level")
            .eq("clerk_id", userId)
            .single();

        let user = existingUser;

        // User doesn't exist in our database yet, create them
        if (userError || !user) {
            const { data: newUser, error: createError } = await supabase
                .from("users")
                .insert([{ clerk_id: userId, xp: 0, level: 1 }])
                .select("id, xp, level")
                .single();

            if (createError) {
                console.error("Error creating user:", createError);
                return NextResponse.json(
                    { error: "Failed to create user record" },
                    { status: 500 }
                );
            }

            user = newUser;

            // Create initial user_progress record
            await supabase
                .from("user_progress")
                .insert([{ user_id: newUser.id }]);
        }

        if (!user) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        const currentXp = user.xp || 0;
        const newXp = currentXp + amount;
        const oldLevel = getLevel(currentXp);
        const newLevel = getLevel(newXp);
        const levelUp = newLevel > oldLevel;

        // Update XP and level in users table
        const { error: updateUserError } = await supabase
            .from("users")
            .update({
                xp: newXp,
                level: newLevel
            })
            .eq("id", user.id);

        if (updateUserError) {
            console.error("Error updating user XP:", updateUserError);
            return NextResponse.json(
                { error: "Failed to update XP" },
                { status: 500 }
            );
        }

        // Update progress stats based on action type
        const { data: progress } = await supabase
            .from("user_progress")
            .select("*")
            .eq("user_id", user.id)
            .single();

        if (progress) {
            const progressUpdates: Record<string, unknown> = {
                updated_at: new Date().toISOString()
            };

            if (action === "discover_spot" || action === "checkin") {
                progressUpdates.spots_visited = (progress.spots_visited || 0) + 1;
            }
            if (action === "verify" || action === "verify_spot") {
                progressUpdates.discoveries = (progress.discoveries || 0) + 1;
            }

            await supabase
                .from("user_progress")
                .update(progressUpdates)
                .eq("user_id", user.id);
        }

        return NextResponse.json({
            success: true,
            xpAwarded: amount,
            newTotalXp: newXp,
            newLevel: newLevel,
            levelUp: levelUp,
            message: levelUp
                ? `Level up! You're now level ${newLevel}! +${amount} XP`
                : `You earned ${amount} XP!`
        });
    } catch (error) {
        console.error("Error awarding XP:", error);
        return NextResponse.json(
            { error: "Failed to award XP" },
            { status: 500 }
        );
    }
}
