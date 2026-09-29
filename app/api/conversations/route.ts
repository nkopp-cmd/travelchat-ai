import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import { createPreviewConversation, isPreviewConversationCandidate, previewConversations } from "@/lib/app-data/preview-conversations";

// GET - Fetch all conversations for the current user
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        if (isPreviewConversationCandidate(req)) {
            const result = await previewConversations(userId);
            return NextResponse.json(result, {
                headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" },
            });
        }

        const supabase = await createSupabaseServerClient();

        const { data: conversations, error } = await supabase
            .from("conversations")
            .select(`
        id,
        title,
        created_at,
        updated_at,
        linked_itinerary_id,
        messages (
          id,
          role,
          content,
          created_at
        )
      `)
            .eq("clerk_user_id", userId)
            .order("updated_at", { ascending: false });

        if (error) {
            console.error("Error fetching conversations:", error);
            return Errors.databaseError();
        }

        return NextResponse.json({ conversations });
    } catch (error) {
        return handleApiError(error, "conversations-get");
    }
}

// POST - Create a new conversation
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await req.json();
        const { title } = body;

        if (isPreviewConversationCandidate(req)) {
            try {
                const result = await createPreviewConversation(userId, title);
                return NextResponse.json(result, {
                    headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" },
                });
            } catch (error) {
                if (error instanceof RangeError) return Errors.validationError(error.message, ["title"]);
                throw error;
            }
        }

        const supabase = await createSupabaseServerClient();

        const { data: conversation, error } = await supabase
            .from("conversations")
            .insert({
                clerk_user_id: userId,
                title: title || "New Conversation",
            })
            .select()
            .single();

        if (error) {
            console.error("Error creating conversation:", error);
            return Errors.databaseError();
        }

        return NextResponse.json({ conversation });
    } catch (error) {
        return handleApiError(error, "conversations-post");
    }
}

// PATCH - Update a conversation (e.g., link to itinerary)
export async function PATCH(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await req.json();
        const { conversationId, linked_itinerary_id } = body;

        if (!conversationId) {
            return Errors.validationError("Missing conversationId", ["conversationId"]);
        }

        const supabase = await createSupabaseServerClient();

        const { error } = await supabase
            .from("conversations")
            .update({ linked_itinerary_id })
            .eq("id", conversationId)
            .eq("clerk_user_id", userId);

        if (error) {
            console.error("Error updating conversation:", error);
            return Errors.databaseError();
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, "conversations-patch");
    }
}
