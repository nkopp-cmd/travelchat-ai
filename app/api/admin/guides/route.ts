import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { createConnectAccount, createOnboardingLink } from "@/lib/stripe-connect";

/**
 * GET /api/admin/guides
 * List all guide applications/profiles.
 *
 * PATCH /api/admin/guides
 * Approve or reject a guide application.
 * Body: { clerkUserId: string, action: "approve" | "reject" | "suspend" }
 */
export async function GET(req: NextRequest) {
    const adminCheck = await requireAdmin("/api/admin/guides", "list_guides");
    if (adminCheck.response) return adminCheck.response;

    const supabase = createSupabaseAdmin();
    const status = req.nextUrl.searchParams.get("status"); // filter by status

    let query = supabase
        .from("guide_profiles")
        .select("*")
        .order("applied_at", { ascending: false });

    if (status) {
        query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: "Failed to fetch guides" }, { status: 500 });
    }

    return NextResponse.json({ guides: data || [] });
}

export async function PATCH(req: NextRequest) {
    const adminCheck = await requireAdmin("/api/admin/guides", "manage_guide");
    if (adminCheck.response) return adminCheck.response;

    try {
        const body = await req.json();
        const { clerkUserId, action } = body;

        if (!clerkUserId || !["approve", "reject", "suspend"].includes(action)) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }

        const supabase = createSupabaseAdmin();

        if (action === "approve") {
            // Get guide info for Stripe account creation
            const { data: guide } = await supabase
                .from("guide_profiles")
                .select("*")
                .eq("clerk_user_id", clerkUserId)
                .single();

            if (!guide) {
                return NextResponse.json({ error: "Guide not found" }, { status: 404 });
            }

            // Update status
            await supabase
                .from("guide_profiles")
                .update({
                    status: "approved",
                    approved_at: new Date().toISOString(),
                    approved_by: adminCheck.userId,
                })
                .eq("clerk_user_id", clerkUserId);

            // Create Stripe Express account if not exists
            let onboardingUrl = null;
            if (!guide.stripe_account_id) {
                // Get user email from users table
                const { data: user } = await supabase
                    .from("users")
                    .select("email")
                    .eq("clerk_id", clerkUserId)
                    .single();

                if (user?.email) {
                    const accountId = await createConnectAccount(clerkUserId, user.email);
                    if (accountId) {
                        await supabase
                            .from("guide_profiles")
                            .update({ stripe_account_id: accountId })
                            .eq("clerk_user_id", clerkUserId);

                        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localley.io";
                        onboardingUrl = await createOnboardingLink(
                            accountId,
                            `${baseUrl}/guide/dashboard?onboarding=complete`,
                            `${baseUrl}/guide/dashboard?onboarding=refresh`
                        );
                    }
                }
            }

            return NextResponse.json({
                status: "approved",
                onboardingUrl,
                message: "Guide approved. Onboarding link generated.",
            });
        }

        // Reject or suspend
        await supabase
            .from("guide_profiles")
            .update({ status: action === "reject" ? "rejected" : "suspended" })
            .eq("clerk_user_id", clerkUserId);

        return NextResponse.json({ status: action === "reject" ? "rejected" : "suspended" });
    } catch (error) {
        console.error("Guide management error:", error);
        return NextResponse.json({ error: "Failed to manage guide" }, { status: 500 });
    }
}
