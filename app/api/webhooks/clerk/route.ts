import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { WelcomeEmail } from "@/emails/welcome-email";
import { createSupabaseAdmin } from "@/lib/supabase";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
    if (!WEBHOOK_SECRET) {
        console.error("CLERK_WEBHOOK_SECRET is not set");
        return NextResponse.json(
            { error: "Webhook secret not configured" },
            { status: 500 }
        );
    }

    // Get the headers
    const svix_id = req.headers.get("svix-id");
    const svix_timestamp = req.headers.get("svix-timestamp");
    const svix_signature = req.headers.get("svix-signature");

    if (!svix_id || !svix_timestamp || !svix_signature) {
        return NextResponse.json(
            { error: "Missing svix headers" },
            { status: 400 }
        );
    }

    // Get the body
    const payload = await req.json();
    const body = JSON.stringify(payload);

    // Verify the webhook
    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: WebhookEvent;

    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        }) as WebhookEvent;
    } catch (err) {
        console.error("Error verifying webhook:", err);
        return NextResponse.json(
            { error: "Invalid webhook signature" },
            { status: 400 }
        );
    }

    const eventType = evt.type;

    // Handle different event types
    switch (eventType) {
        case "user.created":
            await handleUserCreated(evt.data);
            break;
        case "user.updated":
            await handleUserUpdated(evt.data);
            break;
        case "user.deleted":
            await handleUserDeleted(evt.data);
            break;
        default:
            console.log(`Unhandled webhook event type: ${eventType}`);
    }

    return NextResponse.json({ received: true });
}

async function handleUserCreated(data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    image_url: string;
}) {
    const { id: clerkUserId, email_addresses, first_name, username } = data;
    const primaryEmail = email_addresses[0]?.email_address;

    if (!primaryEmail) {
        console.error("No email address found for new user");
        return;
    }

    const userName = first_name || username || undefined;

    const supabase = createSupabaseAdmin();

    // Create/update user in our database
    const { error: dbError } = await supabase
        .from("users")
        .upsert({
            clerk_id: clerkUserId,
            email: primaryEmail,
            name: userName || null,
            avatar_url: data.image_url,
            email_preferences: {
                marketing: true,
                weekly_digest: true,
                product_updates: true,
                itinerary_shared: true,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, {
            onConflict: "clerk_id",
        });

    if (dbError) {
        console.error("Error creating user in database:", dbError);
    }

    // Create free subscription record
    const { error: subError } = await supabase
        .from("subscriptions")
        .upsert({
            clerk_user_id: clerkUserId,
            tier: "free",
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, {
            onConflict: "clerk_user_id",
        });

    if (subError) {
        console.error("Error creating subscription:", subError);
    }

    // Send welcome email
    if (resend) {
        try {
            const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
                ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
                : "https://localley.app/dashboard";

            await resend.emails.send({
                from: FROM_EMAIL,
                to: primaryEmail,
                subject: "Welcome to Localley! 🌍 Start exploring like a local",
                react: WelcomeEmail({
                    userName,
                    verifyUrl: dashboardUrl,
                }),
            });

            console.log(`Welcome email sent to ${primaryEmail}`);
        } catch (emailError) {
            console.error("Error sending welcome email:", emailError);
        }
    }
}

async function handleUserUpdated(data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    image_url: string;
}) {
    const { id: clerkUserId, email_addresses, first_name, last_name, username, image_url } = data;
    const primaryEmail = email_addresses[0]?.email_address;

    const supabase = createSupabaseAdmin();

    // Update user in our database
    const { error } = await supabase
        .from("users")
        .update({
            email: primaryEmail,
            name: first_name && last_name
                ? `${first_name} ${last_name}`
                : first_name || username || null,
            avatar_url: image_url,
            updated_at: new Date().toISOString(),
        })
        .eq("clerk_id", clerkUserId);

    if (error) {
        console.error("Error updating user in database:", error);
    }
}

async function handleUserDeleted(data: { id?: string }) {
    const clerkUserId = data.id;
    if (!clerkUserId) {
        console.error("No user ID in deleted event");
        return;
    }

    const supabase = createSupabaseAdmin();

    // Soft delete or anonymize user data
    // For GDPR compliance, you might want to delete associated data

    // Cancel any active subscriptions
    const { error: subError } = await supabase
        .from("subscriptions")
        .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
        })
        .eq("clerk_user_id", clerkUserId);

    if (subError) {
        console.error("Error canceling subscription:", subError);
    }

    // Optionally delete user record or mark as deleted
    const { error: userError } = await supabase
        .from("users")
        .update({
            email: `deleted_${clerkUserId}@deleted.local`,
            name: "Deleted User",
            deleted_at: new Date().toISOString(),
        })
        .eq("clerk_id", clerkUserId);

    if (userError) {
        console.error("Error anonymizing user:", userError);
    }

    console.log(`User ${clerkUserId} deleted/anonymized`);
}
