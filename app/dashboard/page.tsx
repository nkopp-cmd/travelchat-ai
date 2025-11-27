import { ErrorBoundary } from "@/components/error-boundary";
import { ChatInterface } from "@/components/chat/chat-interface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Map, TrendingUp, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { getTemplateById } from "@/lib/templates";
import { RecommendationsWidget } from "@/components/dashboard/recommendations-widget";

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
        .limit(3);

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
            {/* Top Banner: Recommendations */}
            <div className="flex-shrink-0 border-b border-border/40 bg-gradient-to-r from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20">
                <ErrorBoundary>
                    <RecommendationsWidget compact />
                </ErrorBoundary>
            </div>

            {/* Main Content: Chat Interface */}
            <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
                {/* Left Side: Quick Actions + Recent Itineraries */}
                <div className="lg:w-80 flex-shrink-0 space-y-4 overflow-y-auto">
                {/* Primary CTA: Create Itinerary */}
                <Card className="border-violet-200/50 bg-gradient-to-br from-violet-500/5 to-indigo-500/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Sparkles className="h-5 w-5 text-violet-600" />
                            Discover Hidden Gems
                        </CardTitle>
                        <CardDescription>
                            Let Alley create your perfect local itinerary
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Link href="/itineraries/new" className="block">
                            <Button className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/20">
                                <Sparkles className="mr-2 h-5 w-5" />
                                Generate Itinerary
                            </Button>
                        </Link>
                        <Link href="/templates" className="block">
                            <Button variant="outline" className="w-full">
                                <LayoutTemplate className="mr-2 h-4 w-4" />
                                Browse Templates
                            </Button>
                        </Link>
                        <Link href="/spots" className="block">
                            <Button variant="outline" className="w-full">
                                <Map className="mr-2 h-4 w-4" />
                                Browse Spots
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                {/* Recent Itineraries */}
                {recentItineraries.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-violet-600" />
                                Recent Itineraries
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {recentItineraries.map((itinerary) => (
                                <Link
                                    key={itinerary.id}
                                    href={`/itineraries/${itinerary.id}`}
                                    className="block p-3 rounded-lg border border-border/40 hover:bg-accent transition-colors"
                                >
                                    <h4 className="font-semibold text-sm line-clamp-1">{itinerary.title}</h4>
                                    <p className="text-xs text-muted-foreground">
                                        {itinerary.city} • {itinerary.days} days
                                    </p>
                                </Link>
                            ))}
                            <Link href="/itineraries">
                                <Button variant="ghost" size="sm" className="w-full mt-2">
                                    View All Itineraries
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                )}
            </div>

                {/* Right Side: Chat Interface */}
                <div className="flex-1 min-h-0">
                    <ErrorBoundary>
                        <ChatInterface
                            className="h-full"
                            itineraryContext={itineraryContext}
                            selectedTemplate={selectedTemplate}
                        />
                    </ErrorBoundary>
                </div>
            </div>
        </div>
    );
}
