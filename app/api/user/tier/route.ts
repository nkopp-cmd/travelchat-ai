import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserTier } from "@/lib/usage-tracking";

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ tier: "free" });
        }

        const tier = await getUserTier(userId);
        return NextResponse.json({ tier });
    } catch (error) {
        console.error("[USER_TIER] Error:", error);
        return NextResponse.json({ tier: "free" });
    }
}
