import { ErrorBoundary } from "@/components/error-boundary";
import { ChatInterface } from "@/components/chat/chat-interface";
import { MobileChatFAB } from "@/components/chat/mobile-chat-fab";
import { createSupabaseAdmin } from "@/lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { getTemplateById } from "@/lib/templates";
import { RecentStories } from "@/components/dashboard/recent-stories";

// Fetch user's recent itineraries
async function getRecentItineraries() {
    const { userId } = await auth();
    if (!userId) return [];

    const supabase = createSupabaseAdmin();
    const { data } = await supabase
        .from("itineraries")
        .select("id, title, city, days, created_at")
        .eq("clerk_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6);

    return data || [];
}

export default async function DashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ itinerary?: string; title?: string; city?: string; days?: string; template?: string }>;
}) {
    const recentItineraries = await getRecentItineraries();
    const params = await searchParams;

    // Check if a template was selected
    const selectedTemplate = params.template ? getTemplateById(params.template) : undefined;

    // Parse itinerary context from URL if present
    const itineraryContext = params.itinerary
        ? {
              id: params.itinerary,
              title: params.title || "Untitled Itinerary",
              city: params.city || "Unknown City",
              days: parseInt(params.days || "1", 10),
          }
        : undefined;

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
            {/* Top: Recent Itineraries Stories */}
            {recentItineraries.length > 0 && (
                <div className="flex-shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-sm px-4 py-3">
                    <RecentStories itineraries={recentItineraries} />
                </div>
            )}

            {/* Main Content: Full-width Chat Interface */}
            <div className="flex-1 flex flex-col px-2 sm:px-4 py-4 overflow-hidden">
                {/* Desktop Chat - Responsive Width */}
                <div className="hidden lg:flex flex-1 min-h-0 w-full max-w-5xl xl:max-w-6xl mx-auto">
                    <ErrorBoundary>
                        <ChatInterface
                            className="h-full w-full"
                            itineraryContext={itineraryContext}
                            selectedTemplate={selectedTemplate}
                        />
                    </ErrorBoundary>
                </div>

                {/* Mobile/Tablet - Show a welcome message, chat via FAB */}
                <div className="flex lg:hidden flex-1 flex-col items-center justify-center text-center px-4">
                    <div className="h-20 w-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/30">
                        <span className="text-3xl font-bold text-white">A</span>
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Hey there!</h2>
                    <p className="text-muted-foreground max-w-sm">
                        Tap the chat button to start exploring hidden gems with Alley, your local guide.
                    </p>
                </div>
            </div>

            {/* Mobile Chat FAB + Bottom Sheet */}
            <MobileChatFAB
                itineraryContext={itineraryContext}
                selectedTemplate={selectedTemplate}
            />
        </div>
    );
}
