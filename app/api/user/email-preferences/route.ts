import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export interface EmailPreferences {
    marketing: boolean;
    weekly_digest: boolean;
    product_updates: boolean;
    itinerary_shared: boolean;
}

const defaultPreferences: EmailPreferences = {
    marketing: true,
    weekly_digest: true,
    product_updates: true,
    itinerary_shared: true,
};

// GET current email preferences
export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const supabase = createSupabaseAdmin();

        const { data: user } = await supabase
            .from("users")
            .select("email_preferences")
            .eq("clerk_id", userId)
            .single();

        const preferences = (user?.email_preferences as EmailPreferences) || defaultPreferences;

        return NextResponse.json({
            preferences: {
                ...defaultPreferences,
                ...preferences,
            },
        });
    } catch (error) {
        console.error("Error fetching email preferences:", error);
        return NextResponse.json(
            { error: "Failed to fetch preferences" },
            { status: 500 }
        );
    }
}

// PUT update email preferences
export async function PUT(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { preferences } = body as { preferences: Partial<EmailPreferences> };

        if (!preferences) {
            return NextResponse.json(
                { error: "Missing preferences" },
                { status: 400 }
            );
        }

        const supabase = createSupabaseAdmin();

        // Get existing preferences
        const { data: user } = await supabase
            .from("users")
            .select("email_preferences")
            .eq("clerk_id", userId)
            .single();

        const existingPrefs = (user?.email_preferences as EmailPreferences) || defaultPreferences;
        const updatedPrefs = {
            ...existingPrefs,
            ...preferences,
        };

        // Update preferences
        const { error } = await supabase
            .from("users")
            .update({
                email_preferences: updatedPrefs,
                updated_at: new Date().toISOString(),
            })
            .eq("clerk_id", userId);

        if (error) {
            console.error("Error updating email preferences:", error);
            return NextResponse.json(
                { error: "Failed to update preferences" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            preferences: updatedPrefs,
        });
    } catch (error) {
        console.error("Error updating email preferences:", error);
        return NextResponse.json(
            { error: "Failed to update preferences" },
            { status: 500 }
        );
    }
}
