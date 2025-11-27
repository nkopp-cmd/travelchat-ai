import { NextResponse } from "next/server";
import { XP_REWARDS } from "@/lib/gamification";

// Mock database update
async function awardXpToUser(userId: string, amount: number, action: string) {
    // In a real app, update Supabase 'user_progress' table
    console.log(`Awarding ${amount} XP to user ${userId} for ${action}`);
    return { newXp: 1300, levelUp: false };
}

export async function POST(req: Request) {
    try {
        const { action } = await req.json();
        // In a real app, get userId from session
        const userId = "user_123";

        let amount = 0;
        switch (action) {
            case "verify":
                amount = XP_REWARDS.VERIFY_SPOT;
                break;
            case "share":
                amount = XP_REWARDS.SHARE_SPOT;
                break;
            case "checkin":
                amount = XP_REWARDS.DISCOVER_SPOT;
                break;
            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        const result = await awardXpToUser(userId, amount, action);

        return NextResponse.json({
            success: true,
            xpAwarded: amount,
            newTotalXp: result.newXp,
            message: `You earned ${amount} XP!`
        });
    } catch (error) {
        console.error("Error awarding XP:", error);
        return NextResponse.json(
            { error: "Failed to award XP" },
            { status: 500 }
        );
    }
}
