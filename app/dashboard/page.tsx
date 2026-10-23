import { ErrorBoundary } from "@/components/error-boundary";
import { ChatInterface } from "@/components/chat/chat-interface";
import { MobileChatFAB } from "@/components/chat/mobile-chat-fab";
import { createSupabaseAdmin } from "@/lib/supabase";
import { auth, getPublicSession } from "@/lib/auth/server";
import { getTemplateById } from "@/lib/templates";
import { RecentStories } from "@/components/dashboard/recent-stories";
import { MobileDashboardContent } from "@/components/dashboard/mobile-dashboard-content";
import { OnboardingPanel } from "@/components/dashboard/onboarding-panel";
import { AppBackground } from "@/components/layout/app-background";
import { isPreviewItineraryListCandidate, previewRecentItineraries } from "@/lib/app-data/preview-itinerary-list";
import { headers } from "next/headers";
import { SessionSeed } from "@/components/auth/session-seed";

// Fetch user's recent itineraries. Candidate requests read only D1 (no Supabase fallback).
async function getRecentItineraries(candidate: boolean) {
    const { userId } = await auth();
    if (!userId) return [];
    if (candidate) return previewRecentItineraries(userId);

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
    searchParams: Promise<{ itinerary?: string; title?: string; city?: string; days?: string; template?: string; data_candidate?: string }>;
}) {
    const params = await searchParams;
    const candidate = isPreviewItineraryListCandidate((await headers()).get("host"), params.data_candidate);
    const recentItineraries = await getRecentItineraries(candidate);

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

    // Private, no-store page: hand the already validated session to the client store.
    const sessionSeed = await getPublicSession();
    return (
        <AppBackground ambient fitParent className="lg:h-[calc(100dvh-var(--ll-topbar-height)-4rem)]" contentClassName="lg:h-full">
            <SessionSeed session={sessionSeed} />
            <div className="flex flex-col h-full overflow-hidden">
                {/* Top: Recent Itineraries Stories */}
                {recentItineraries.length > 0 && (
                    <div className="container mx-auto flex-shrink-0 px-4 pt-4">
                        <RecentStories itineraries={recentItineraries} />
                    </div>
                )}

                {/* Main Content: Full-width Chat Interface */}
                <div className="flex-1 flex flex-col py-4 overflow-hidden">
                    {/* Desktop - Chat or Onboarding */}
                    <div className="container mx-auto hidden min-h-0 w-full flex-1 px-4 lg:flex">
                        {recentItineraries.length === 0 && !itineraryContext && !selectedTemplate ? (
                            // Show onboarding panel for new users
                            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-6">
                                <div className="flex min-h-full items-start justify-center">
                                    <OnboardingPanel className="max-w-2xl w-full pb-10" />
                                </div>
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
