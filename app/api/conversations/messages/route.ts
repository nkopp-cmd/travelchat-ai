import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";

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
