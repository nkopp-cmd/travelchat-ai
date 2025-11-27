import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

// GET - Fetch all conversations for the current user
export async function GET(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const supabase = createSupabaseAdmin();

        const { data: conversations, error } = await supabase
            .from("conversations")
            .select(`
        id,
        title,
        created_at,
        updated_at,
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
            return NextResponse.json(
                { error: "Failed to fetch conversations" },
                { status: 500 }
            );
        }

        return NextResponse.json({ conversations });
    } catch (error) {
        console.error("[CONVERSATIONS_GET]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}

// POST - Create a new conversation
export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { title } = body;

        const supabase = createSupabaseAdmin();

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
            return NextResponse.json(
                { error: "Failed to create conversation" },
                { status: 500 }
            );
        }

        return NextResponse.json({ conversation });
    } catch (error) {
        console.error("[CONVERSATIONS_POST]", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
