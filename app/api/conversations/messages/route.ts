import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import { createPreviewConversationMessage, isPreviewConversationCandidate,
    previewConversationMessages } from "@/lib/app-data/preview-conversations";

// GET - Fetch messages for a conversation
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const { searchParams } = new URL(req.url);
        const conversationId = searchParams.get("conversationId");

        if (!conversationId) {
            return Errors.validationError("Missing conversationId", ["conversationId"]);
        }

        if (isPreviewConversationCandidate(req)) {
            const result = await previewConversationMessages(userId, conversationId);
            if (!result) return Errors.notFound("Conversation");
            return NextResponse.json(result, {
                headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" },
            });
        }

        const supabase = await createSupabaseServerClient();

        // Verify conversation belongs to user
        const { data: conversation } = await supabase
            .from("conversations")
            .select("id")
            .eq("id", conversationId)
            .eq("clerk_user_id", userId)
            .single();

        if (!conversation) {
            return Errors.notFound("Conversation");
        }

        // Fetch messages ordered chronologically
        const { data: messages, error } = await supabase
            .from("messages")
            .select("id, role, content, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });

        if (error) {
            console.error("Error fetching messages:", error);
            return Errors.databaseError();
        }

        return NextResponse.json({ messages: messages || [] });
    } catch (error) {
        return handleApiError(error, "messages-get");
    }
}

// POST - Add a message to a conversation
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await req.json();
        const { conversationId, role, content } = body;

        if (!conversationId || !role || !content) {
            return Errors.validationError("Missing required fields", ["conversationId", "role", "content"]);
        }

        if (isPreviewConversationCandidate(req)) {
            try {
                const result = await createPreviewConversationMessage(userId, conversationId, role, content);
                if (!result) return Errors.notFound("Conversation");
                return NextResponse.json(result, {
                    headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" },
                });
            } catch (error) {
                if (error instanceof RangeError) return Errors.validationError(error.message, ["role", "content"]);
                throw error;
            }
        }

        const supabase = await createSupabaseServerClient();

        // Verify conversation belongs to user
        const { data: conversation } = await supabase
            .from("conversations")
            .select("id")
            .eq("id", conversationId)
            .eq("clerk_user_id", userId)
            .single();

        if (!conversation) {
            return Errors.notFound("Conversation");
        }

        // Insert message
        const { data: message, error } = await supabase
            .from("messages")
            .insert({
                conversation_id: conversationId,
                role,
                content,
            })
            .select()
            .single();

        if (error) {
            console.error("Error creating message:", error);
            return Errors.databaseError();
        }

        return NextResponse.json({ message });
    } catch (error) {
        return handleApiError(error, "messages-post");
    }
}
