import { Button } from "@/components/ui/button";
import {
  Download,
  ArrowLeft,
  MessageSquare,
  Edit2,
} from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ShareDialog } from "@/components/itineraries/share-dialog";
import { EmailDialog } from "@/components/itineraries/email-dialog";
import { StoryDialog } from "@/components/itineraries/story-dialog";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { ItineraryInsightsPanel } from "@/components/itinerary/itinerary-insights-panel";
import { DayRouteSection } from "@/components/itinerary/day-route-section";
import { ViatorSuggestions } from "@/components/activities/viator-suggestions";
import { HeroSection } from "@/components/itinerary/hero-section";
import { auth } from "@clerk/nextjs/server";
import { getUserTier } from "@/lib/usage-tracking";
import { SubscriptionTier } from "@/lib/subscription";
import { validateCityForItinerary } from "@/lib/cities";
import { getDisplayCity } from "@/lib/city-images";
import {
  normalizeDailyPlansForDisplay,
  parseDailyPlans,
} from "@/lib/itineraries/normalize-daily-plans";
import type { Metadata } from "next";

// Type definitions for itinerary data
interface ItineraryActivity {
  name: string;
  nameKo?: string;
  description?: string;
  time?: string;
  duration?: string;
  cost?: string;
  address?: string;
  type?: string;
  category?: string;
  localleyScore?: number;
  image?: string;
}

interface DayPlan {
  day: number;
  theme?: string;
  activities: ItineraryActivity[];
  highlights?: string[];
}

/**
 * Resolve city name — handles "Unknown City" from chat-saved itineraries
 * by trying to extract city from the title using known cities list.
 */
function resolveCity(itinerary: { city: string; title: string }): string {
  if (
    itinerary.city &&
    itinerary.city.toLowerCase() !== "unknown city" &&
    itinerary.city.trim() !== ""
  ) {
    return itinerary.city;
  }
  // Try extracting from title
  const validation = validateCityForItinerary(itinerary.title);
  if (validation.valid && validation.city) return validation.city.name;
  return getDisplayCity(itinerary.city);
}

// Fetch itinerary from Supabase
async function getItinerary(id: string) {
  const supabase = createSupabaseAdmin();

  const { data: itinerary, error } = await supabase
    .from("itineraries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !itinerary) {
    console.error("Error fetching itinerary:", error);
    return null;
  }

  return {
    id: itinerary.id,
    title: itinerary.title,
    subtitle: itinerary.subtitle,
    city: itinerary.city,
    days: itinerary.days,
    activities: itinerary.activities,
    localScore: itinerary.local_score,
    highlights: itinerary.highlights,
    estimatedCost: itinerary.estimated_cost,
    createdAt: itinerary.created_at,
  };
}

// Get user's subscription tier
async function getUserSubscriptionTier(): Promise<SubscriptionTier> {
  try {
    const { userId } = await auth();
    if (!userId) return "free";
    return await getUserTier(userId);
  } catch {
    return "free";
  }
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const itinerary = await getItinerary(id);

  if (!itinerary) {
    return {
      title: "Itinerary Not Found - Localley",
      description: "The requested itinerary could not be found.",
    };
  }

  const title = `${itinerary.title} - Localley`;
  const description =
    itinerary.highlights && itinerary.highlights.length > 0
      ? `Discover ${itinerary.city} with ${itinerary.days} ${itinerary.days === 1 ? "day" : "days"} of authentic local experiences. ${itinerary.highlights.slice(0, 3).join(" • ")}`
      : `Explore ${itinerary.city} with a ${itinerary.days}-day local itinerary curated by Alley.`;

  const keywords = [
    itinerary.city,
    "travel itinerary",
    "local guide",
    "hidden gems",
    "travel planning",
    ...(itinerary.highlights || []),
  ].join(", ");

  return {
    title,
    description,
    keywords,
    openGraph: {
      title: itinerary.title,
      description,
      type: "website",
      siteName: "Localley",
      images: [
        {
          url: `/api/og?title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(itinerary.city)}&days=${itinerary.days}`,
          width: 1200,
          height: 630,
          alt: itinerary.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: itinerary.title,
      description,
      images: [
        `/api/og?title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(itinerary.city)}&days=${itinerary.days}`,
      ],
    },
  };
}

export default async function ItineraryViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [itinerary, userTier] = await Promise.all([
    getItinerary(id),
    getUserSubscriptionTier(),
  ]);

  if (!itinerary) {
    notFound();
  }

  // Resolve city name (handles "Unknown City" from chat-saved itineraries)
  const displayCity = resolveCity(itinerary);

  // Parse activities if they're stored as JSON
  const parsedDailyPlans = parseDailyPlans(itinerary.activities);
  const { dailyPlans: dailyPlansForDisplay, insights: itineraryInsights } =
    normalizeDailyPlansForDisplay<DayPlan>(parsedDailyPlans);

  // Prepare JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: itinerary.title,
    description:
      itinerary.highlights && itinerary.highlights.length > 0
        ? itinerary.highlights.join(", ")
        : `A ${itinerary.days}-day travel itinerary for ${itinerary.city}`,
    touristType: "Local experiences",
    itinerary:
      dailyPlansForDisplay.map((day: DayPlan) => ({
        "@type": "TouristAttraction",
        name: day.theme || `Day ${day.day}`,
        description:
          day.activities?.map((a: ItineraryActivity) => a.name).join(", ") ||
          "",
      })) || [],
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto w-full max-w-5xl space-y-5 px-3 pb-8 pt-3 sm:px-4 sm:pb-10 md:space-y-6 md:px-0 md:pt-0">
        {/* Back Button */}
        <Link
          href="/itineraries"
          className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-white/[0.045] px-3 text-sm font-medium text-violet-100/70 transition hover:border-violet-300/30 hover:bg-white/[0.075] hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          My trips
        </Link>

        {/* Hero Section */}
        <HeroSection
          title={itinerary.title}
          subtitle={itinerary.subtitle}
          city={displayCity}
          days={itinerary.days}
          localScore={
            itinerary.localScore ? itinerary.localScore * 10 : undefined
          }
          highlights={itinerary.highlights}
          className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-violet-950/20"
        />

        {/* Action Bar */}
        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#0b0714]/72 p-2 shadow-2xl shadow-violet-950/20 backdrop-blur-xl md:flex-wrap md:overflow-visible">
          <Link href={`/itineraries/${itinerary.id}/edit`}>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-2 rounded-xl border-white/15 bg-white/[0.055] hover:bg-white/[0.09]"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Link
            href={`/dashboard?itinerary=${itinerary.id}&title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(displayCity)}&days=${itinerary.days}`}
          >
            <Button
              size="sm"
              className="h-10 shrink-0 gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700"
            >
              <MessageSquare className="h-4 w-4" />
              Revise with Alley
            </Button>
          </Link>
          <a
            href={`/api/itineraries/${itinerary.id}/export`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-2 rounded-xl border-white/15 bg-white/[0.055] hover:bg-white/[0.09]"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </a>
          <ShareDialog
            itineraryId={itinerary.id}
            itineraryTitle={itinerary.title}
          />
          <EmailDialog
            itineraryId={itinerary.id}
            itineraryTitle={itinerary.title}
          />
          <StoryDialog
            itineraryId={itinerary.id}
            itineraryTitle={itinerary.title}
            totalDays={itinerary.days}
            city={displayCity}
            dailyPlans={dailyPlansForDisplay}
          />
        </div>

        {/* Interactive Map */}
        <div className="space-y-4">
          {dailyPlansForDisplay.length > 0 && (
            <ItineraryMap
              city={displayCity}
              dailyPlans={dailyPlansForDisplay}
              userTier={userTier}
            />
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_312px] lg:items-start">
          {/* Itinerary-level Tips */}
          <aside className="order-2 lg:order-2 lg:sticky lg:top-24">
            <ItineraryInsightsPanel
              insights={itineraryInsights}
              title="Trip notes"
              description="Useful local context, transport notes, and practical details for the whole trip."
              className="border-violet-300/15 bg-[#160d29]/82"
            />
          </aside>

          {/* Daily Plans */}
          <div className="order-1 space-y-4 sm:space-y-5 lg:order-1">
            <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-200/70">
                  Day schedule
                </p>
                <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl">
                  Route by day
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {dailyPlansForDisplay.length}{" "}
                {dailyPlansForDisplay.length === 1 ? "route day" : "route days"}
              </p>
            </div>
            {dailyPlansForDisplay.map((dayPlan: DayPlan, dayIndex: number) => (
              <DayRouteSection
                key={dayIndex}
                dayPlan={dayPlan}
                dayIndex={dayIndex}
                city={displayCity}
                userTier={userTier}
              />
            ))}

            {/* Fallback if no activities */}
            {dailyPlansForDisplay.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6 text-center text-muted-foreground backdrop-blur-xl">
                No activities planned yet. Start exploring!
              </div>
            )}
          </div>
        </div>

        {/* Viator Activity Suggestions */}
        <ViatorSuggestions city={displayCity} userTier={userTier} limit={4} />

        {/* Footer Actions */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-violet-950/15 backdrop-blur-xl sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-semibold">Ready to use this trip?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Share it, send it, or export a clean copy for the road.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ShareDialog
                itineraryId={itinerary.id}
                itineraryTitle={itinerary.title}
              />
              <EmailDialog
                itineraryId={itinerary.id}
                itineraryTitle={itinerary.title}
              />
              <StoryDialog
                itineraryId={itinerary.id}
                itineraryTitle={itinerary.title}
                totalDays={itinerary.days}
                city={displayCity}
                dailyPlans={dailyPlansForDisplay}
              />
              <a
                href={`/api/itineraries/${itinerary.id}/export`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </a>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
