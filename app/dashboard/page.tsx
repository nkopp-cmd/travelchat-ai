import { ErrorBoundary } from "@/components/error-boundary";
import { ChatInterface } from "@/components/chat/chat-interface";
import { MobileChatFAB } from "@/components/chat/mobile-chat-fab";
import { createSupabaseAdmin } from "@/lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { getTemplateById } from "@/lib/templates";
import { RecentStories } from "@/components/dashboard/recent-stories";
import { MobileDashboardContent } from "@/components/dashboard/mobile-dashboard-content";
import { OnboardingPanel } from "@/components/dashboard/onboarding-panel";
import { AppBackground } from "@/components/layout/app-background";

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
        <AppBackground ambient className="h-[calc(100vh-4rem)]" contentClassName="h-full">
            <div className="flex flex-col h-full overflow-hidden">
                {/* Top: Recent Itineraries Stories */}
                {recentItineraries.length > 0 && (
                    <div className="flex-shrink-0 border-b border-black/5 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-sm px-4 py-3">
                        <RecentStories itineraries={recentItineraries} />
                    </div>
                )}

                {/* Main Content: Full-width Chat Interface */}
                <div className="flex-1 flex flex-col px-2 sm:px-4 py-4 overflow-hidden">
                    {/* Desktop - Chat or Onboarding */}
                    <div className="hidden lg:flex flex-1 min-h-0 w-full max-w-5xl xl:max-w-6xl mx-auto">
                        {recentItineraries.length === 0 && !itineraryContext && !selectedTemplate ? (
                            // Show onboarding panel for new users
                            <div className="flex-1 flex items-center justify-center p-8">
                                <OnboardingPanel className="max-w-2xl w-full" />
                            </div>
                        ) : (
                            // Show chat interface for returning users
                            <ErrorBoundary>
                                <ChatInterface
                                    className="h-full w-full"
                                    itineraryContext={itineraryContext}
                                    selectedTemplate={selectedTemplate}
                                />
                            </ErrorBoundary>
                        )}
                    </div>

                    {/* Mobile/Tablet - Show useful content */}
                    <div className="flex lg:hidden flex-1 min-h-0 overflow-y-auto">
                        <MobileDashboardContent itineraries={recentItineraries} />
                    </div>
                </div>

                {/* Mobile Chat FAB + Bottom Sheet */}
                <MobileChatFAB
                    itineraryContext={itineraryContext}
                    selectedTemplate={selectedTemplate}
                />
            </div>
        </AppBackground>
    );
}
