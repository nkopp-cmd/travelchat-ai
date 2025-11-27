import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

// POST - Add a message to a conversation
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { conversationId, role, content } = body;

        if (!conversationId || !role || !content) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const supabase = createSupabaseAdmin();

        // Verify conversation belongs to user
        const { data: conversation } = await supabase
            .from("conversations")
            .select("id")
            .eq("id", conversationId)
            .eq("clerk_user_id", userId)
            .single();

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversation not found" },
                { status: 404 }
            );
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
            return NextResponse.json(
                { error: "Failed to create message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ message });
    } catch (error) {
        console.error("[MESSAGES_POST]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
