import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import { isPreviewEmailPreferencesCandidate, parsePreviewEmailPreferencePatch,
    previewEmailPreferences, updatePreviewEmailPreferences } from "@/lib/app-data/preview-email-preferences";

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
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        if (isPreviewEmailPreferencesCandidate(req)) {
            const headers = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };
            const user = await currentUser();
            if (user?.id !== userId || !user.emailVerified
                || !user.primaryEmailAddress?.emailAddress.toLowerCase().endsWith("@preview.localley.test")) {
                return NextResponse.json({ error: "Historical email preferences unavailable" }, { status: 503, headers });
            }
            try {
                return NextResponse.json({ preferences: await previewEmailPreferences(userId) }, { headers });
            } catch (error) {
                console.error("[PREVIEW_EMAIL_PREFERENCES] Read unavailable", error);
                return NextResponse.json({ error: "Email preferences unavailable" }, { status: 503, headers });
            }
        }

        const supabase = await createSupabaseServerClient();

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
        return handleApiError(error, "email-preferences-get");
    }
}

// PUT update email preferences
export async function PUT(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await req.json();
        const { preferences } = body as { preferences: Partial<EmailPreferences> };

        if (!preferences) {
            return Errors.validationError("Missing preferences");
        }

        if (isPreviewEmailPreferencesCandidate(req)) {
            const headers = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };
            const patch = parsePreviewEmailPreferencePatch(preferences);
            if (!patch) return NextResponse.json({ error: "Invalid email preferences" }, { status: 400, headers });
            const user = await currentUser();
            if (user?.id !== userId || !user.emailVerified
                || !user.primaryEmailAddress?.emailAddress.toLowerCase().endsWith("@preview.localley.test")) {
                return NextResponse.json({ error: "Historical email preferences unavailable" }, { status: 503, headers });
            }
            try {
                const updated = await updatePreviewEmailPreferences(userId, patch);
                return NextResponse.json({ success: true, preferences: updated }, { headers });
            } catch (error) {
                console.error("[PREVIEW_EMAIL_PREFERENCES] Write unavailable", error);
                return NextResponse.json({ error: "Email preferences unavailable" }, { status: 503, headers });
            }
        }

        const supabase = await createSupabaseServerClient();

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
            return Errors.databaseError();
        }

        return NextResponse.json({
            success: true,
            preferences: updatedPrefs,
        });
    } catch (error) {
        return handleApiError(error, "email-preferences-update");
    }
}
