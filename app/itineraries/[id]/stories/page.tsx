import { Metadata } from "next";
import { createSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StoriesClient } from "./stories-client";

async function getItinerary(id: string) {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
        .from("itineraries")
        .select("id, title, city, days, story_slides, highlights")
        .eq("id", id)
        .single();

    if (error || !data) return null;
    return data;
}

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
    const { id } = await params;
    const itinerary = await getItinerary(id);

    if (!itinerary) {
        return { title: "Stories Not Found | Localley" };
    }

    const title = `${itinerary.city} Story Slides | Localley`;
    const description = `Download ${itinerary.days}-day ${itinerary.city} travel story slides — ready to share on Instagram & TikTok.`;

    const storySlides = itinerary.story_slides as Record<string, string> | null;
    const coverUrl = storySlides?.cover;

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            type: "article",
            siteName: "Localley",
            ...(coverUrl && {
                images: [{ url: coverUrl, width: 1080, height: 1920, alt: `${itinerary.city} travel story` }],
            }),
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            ...(coverUrl && { images: [coverUrl] }),
        },
    };
}

export default async function StoriesPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const itinerary = await getItinerary(id);

    if (!itinerary) {
        notFound();
    }

    const storySlides = (itinerary.story_slides && typeof itinerary.story_slides === "object")
        ? itinerary.story_slides as Record<string, string>
        : null;

    if (!storySlides || Object.keys(storySlides).length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <h1 className="text-2xl font-bold mb-2">Stories Not Ready Yet</h1>
                    <p className="text-muted-foreground mb-6">
                        Story slides for this {itinerary.city} trip haven&apos;t been generated yet.
                    </p>
                    <Link
                        href={`/itineraries/${id}`}
                        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                    >
                        Go to Itinerary
                    </Link>
                </div>
            </div>
        );
    }

    // Build ordered slide list
    const slides: Array<{ key: string; label: string; url: string }> = [];

    if (storySlides.cover) {
        slides.push({ key: "cover", label: "Cover", url: storySlides.cover });
    }

    for (let i = 1; i <= (itinerary.days || 0); i++) {
        const key = `day${i}`;
        if (storySlides[key]) {
            slides.push({ key, label: `Day ${i}`, url: storySlides[key] });
        }
    }

    if (storySlides.summary) {
        slides.push({ key: "summary", label: "Summary", url: storySlides.summary });
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-gray-950 dark:to-gray-900">
            {/* Header */}
            <div className="max-w-5xl mx-auto px-4 pt-8 pb-4">
                <div className="flex items-center gap-3 mb-2">
                    <Link href="/" className="text-xl font-bold text-primary">
                        Localley
                    </Link>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold">
                    {itinerary.title}
                </h1>
                <p className="text-muted-foreground mt-1">
                    {itinerary.days}-day {itinerary.city} trip &middot; {slides.length} story slides ready to share
                </p>
            </div>

            {/* Client component for interactions */}
            <StoriesClient
                slides={slides}
                city={itinerary.city}
                days={itinerary.days}
                itineraryId={id}
            />
        </div>
    );
}
