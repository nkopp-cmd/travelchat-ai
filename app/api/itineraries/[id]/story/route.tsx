import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export const runtime = "edge";

// Curated Unsplash images for fallback (when no ai_backgrounds in database)
const CITY_IMAGES: Record<string, string[]> = {
    'seoul': [
        'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=1080&h=1920&fit=crop',
    ],
    'tokyo': [
        'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1080&h=1920&fit=crop',
    ],
    'bangkok': [
        'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=1080&h=1920&fit=crop',
    ],
    'singapore': [
        'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1080&h=1920&fit=crop',
        'https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=1080&h=1920&fit=crop',
    ],
};

const DEFAULT_TRAVEL_IMAGES = [
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1080&h=1920&fit=crop',
    'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=1080&h=1920&fit=crop',
];

function getFallbackImage(city: string): string {
    const normalizedCity = city.toLowerCase().trim();
    const images = CITY_IMAGES[normalizedCity] || DEFAULT_TRAVEL_IMAGES;
    const randomIndex = Math.floor(Math.random() * images.length);
    return images[randomIndex];
}

// Story dimensions (9:16 aspect ratio for Instagram/TikTok)
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

// Social media safety zones (Instagram/TikTok/Facebook)
// These areas are covered by UI elements (username, likes, comments, captions)
const SAFE_ZONE = {
    TOP: 180,        // Username, timestamp, close button
    BOTTOM: 320,     // Caption area, reply bar, swipe up
    LEFT: 48,        // Generally safe, small margin
    RIGHT: 140,      // Like, comment, share, bookmark buttons
};

interface Activity {
    name: string | Record<string, string>;
    description?: string;
    time?: string;
    localleyScore?: number;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: Activity[];
}

/**
 * Safely convert any value to a display string.
 * Handles MultiLang objects ({en: "...", ko: "..."}), nulls, numbers, etc.
 */
function safeString(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        return String(obj.en || obj.ko || obj.name || fallback);
    }
    return fallback;
}

// Cover slide template
function CoverSlide({ title, city, days, backgroundImage }: { title: string; city: string; days: number; backgroundImage?: string }) {
    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Background image layer - always show, use gradient as fallback */}
            {backgroundImage ? (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        objectFit: "cover",
                    }}
                />
            ) : (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                    }}
                />
            )}
            {/* Gradient overlay for text readability */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.6) 100%)",
                }}
            />

            {/* Safe zone content container */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP,
                    paddingBottom: SAFE_ZONE.BOTTOM,
                    paddingLeft: SAFE_ZONE.LEFT,
                    paddingRight: SAFE_ZONE.RIGHT,
                    flex: 1,
                }}
            >
                {/* Logo - Glassmorphism style - positioned at top of safe zone */}
                <div
                    style={{
                        position: "absolute",
                        top: SAFE_ZONE.TOP + 20,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: "rgba(0,0,0,0.3)",
                        padding: "12px 28px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.2)",
                    }}
                >
                    <span style={{ fontSize: 32, color: "white", fontWeight: "bold" }}>
                        Localley
                    </span>
                </div>

                {/* Main content card - Glassmorphism */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "44px 52px",
                        borderRadius: 32,
                        border: "1px solid rgba(255,255,255,0.15)",
                        maxWidth: STORY_WIDTH - SAFE_ZONE.LEFT - SAFE_ZONE.RIGHT - 60,
                    }}
                >
                    {/* City Badge */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "12px 24px",
                            borderRadius: 100,
                            marginBottom: 28,
                            border: "1px solid rgba(255,255,255,0.2)",
                        }}
                    >
                        <span style={{ fontSize: 28, color: "white" }}>📍 {city}</span>
                    </div>

                    {/* Title */}
                    <h1
                        style={{
                            fontSize: 56,
                            fontWeight: "bold",
                            color: "white",
                            textAlign: "center",
                            lineHeight: 1.2,
                            margin: "0 0 28px 0",
                            textShadow: "0 4px 20px rgba(0,0,0,0.5)",
                        }}
                    >
                        {title}
                    </h1>

                    {/* Days info */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 16,
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "16px 32px",
                            borderRadius: 20,
                            border: "1px solid rgba(255,255,255,0.15)",
                        }}
                    >
                        <span style={{ fontSize: 26, color: "white" }}>
                            🗓️ {days} {days === 1 ? "Day" : "Days"} of Adventure
                        </span>
                    </div>
                </div>

                {/* Swipe indicator - positioned above bottom safe zone */}
                <div
                    style={{
                        position: "absolute",
                        bottom: 40,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span style={{ fontSize: 22, color: "rgba(255,255,255,0.8)" }}>
                        Swipe to explore →
                    </span>
                </div>
            </div>
        </div>
    );
}

// Day slide template
function DaySlide({ dayPlan, dayNumber, backgroundImage, isPaidUser }: { dayPlan: DayPlan; dayNumber: number; backgroundImage?: string; isPaidUser?: boolean }) {
    const activities = dayPlan.activities?.slice(0, 3) || []; // Limit to 3 activities to fit within safe zones

    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Background image layer - always show full size */}
            {backgroundImage ? (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        objectFit: "cover",
                    }}
                />
            ) : (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
                    }}
                />
            )}
            {/* Subtle gradient overlay for readability - lets background show through */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.5) 100%)",
                }}
            />

            {/* Safe zone content container */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP,
                    paddingBottom: SAFE_ZONE.BOTTOM,
                    paddingLeft: SAFE_ZONE.LEFT,
                    paddingRight: SAFE_ZONE.RIGHT,
                    flex: 1,
                }}
            >
                {/* Header - Logo only, no page numbers */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-start",
                        alignItems: "center",
                        marginBottom: 24,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "10px 22px",
                            borderRadius: 100,
                            border: "1px solid rgba(255,255,255,0.2)",
                        }}
                    >
                        <span style={{ fontSize: 24, color: "white", fontWeight: "bold" }}>
                            Localley
                        </span>
                    </div>
                </div>

                {/* Day Title - Glassmorphism card */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "28px 36px",
                        borderRadius: 24,
                        border: "1px solid rgba(255,255,255,0.15)",
                        marginBottom: 24,
                    }}
                >
                    <span
                        style={{
                            fontSize: 48,
                            fontWeight: "bold",
                            color: "white",
                            textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                        }}
                    >
                        Day {dayPlan.day || dayNumber}
                    </span>
                    {dayPlan.theme && (
                        <span style={{ fontSize: 28, color: "rgba(255,255,255,0.9)", marginTop: 8 }}>
                            {safeString(dayPlan.theme)}
                        </span>
                    )}
                </div>

                {/* Activities - Glassmorphism cards */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 16,
                        flex: 1,
                    }}
                >
                    {activities.map((activity, index) => (
                        <div
                            key={index}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                backgroundColor: "rgba(0,0,0,0.35)",
                                borderRadius: 20,
                                padding: 24,
                                border: "1px solid rgba(255,255,255,0.15)",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 14,
                                    marginBottom: 6,
                                }}
                            >
                                <span style={{ fontSize: 26 }}>
                                    {Number(activity.localleyScore) >= 5
                                        ? "💎"
                                        : Number(activity.localleyScore) >= 4
                                            ? "⭐"
                                            : "📍"}
                                </span>
                                <span
                                    style={{
                                        fontSize: 28,
                                        fontWeight: "bold",
                                        color: "white",
                                        textShadow: "0 2px 8px rgba(0,0,0,0.4)",
                                    }}
                                >
                                    {safeString(activity.name, "Activity")}
                                </span>
                            </div>
                            {activity.time && (
                                <span style={{ fontSize: 20, color: "rgba(255,255,255,0.8)" }}>
                                    🕐 {safeString(activity.time)}
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Footer - only show CTA for free users */}
                {!isPaidUser && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            paddingTop: 16,
                        }}
                    >
                        <span style={{ fontSize: 20, color: "rgba(255,255,255,0.6)" }}>
                            localley.io
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

// Summary slide template
function SummarySlide({ title, city, highlights, backgroundImage, isPaidUser }: { title: string; city: string; highlights: string[]; backgroundImage?: string; isPaidUser?: boolean }) {
    // Ensure highlights is an array and has content
    const safeHighlights = Array.isArray(highlights) && highlights.length > 0
        ? highlights
        : [`Explore ${city}`, "Discover local gems", "Create memories", "Experience culture"];

    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Background image layer - always show full size */}
            {backgroundImage ? (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        objectFit: "cover",
                    }}
                />
            ) : (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%)",
                    }}
                />
            )}
            {/* Subtle gradient overlay for readability - lets background show through */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.5) 100%)",
                }}
            />

            {/* Safe zone content container */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "relative",
                    paddingTop: SAFE_ZONE.TOP,
                    paddingBottom: SAFE_ZONE.BOTTOM,
                    paddingLeft: SAFE_ZONE.LEFT,
                    paddingRight: SAFE_ZONE.RIGHT,
                    flex: 1,
                }}
            >
                {/* Logo - Glassmorphism style - positioned at top of safe zone */}
                <div
                    style={{
                        position: "absolute",
                        top: SAFE_ZONE.TOP + 20,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: "rgba(0,0,0,0.3)",
                        padding: "10px 24px",
                        borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.2)",
                    }}
                >
                    <span style={{ fontSize: 28, color: "white", fontWeight: "bold" }}>
                        Localley
                    </span>
                </div>

                {/* Main content card - Glassmorphism */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        backgroundColor: "rgba(0,0,0,0.35)",
                        padding: "32px 40px",
                        borderRadius: 28,
                        border: "1px solid rgba(255,255,255,0.15)",
                        maxWidth: STORY_WIDTH - SAFE_ZONE.LEFT - SAFE_ZONE.RIGHT - 40,
                        width: "100%",
                    }}
                >
                    {/* Title */}
                    <span
                        style={{
                            fontSize: 36,
                            color: "rgba(255,255,255,0.9)",
                            marginBottom: 16,
                        }}
                    >
                        ✨ Trip Highlights
                    </span>

                    <h2
                        style={{
                            fontSize: 40,
                            fontWeight: "bold",
                            color: "white",
                            textAlign: "center",
                            marginBottom: 28,
                            textShadow: "0 4px 16px rgba(0,0,0,0.4)",
                        }}
                    >
                        {title}
                    </h2>

                    {/* Highlights - Glassmorphism cards - limit to 4 for safe zone */}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            width: "100%",
                        }}
                    >
                        {safeHighlights.slice(0, 4).map((highlight, index) => (
                            <div
                                key={index}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 14,
                                    backgroundColor: "rgba(0,0,0,0.3)",
                                    padding: "16px 24px",
                                    borderRadius: 14,
                                    border: "1px solid rgba(255,255,255,0.15)",
                                }}
                            >
                                <span style={{ fontSize: 24, color: "#6ee7b7" }}>•</span>
                                <span style={{ fontSize: 24, color: "white" }}>{highlight}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA - only show for free users */}
                {!isPaidUser && (
                    <div
                        style={{
                            position: "absolute",
                            bottom: 40,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                backgroundColor: "rgba(255,255,255,0.95)",
                                padding: "14px 36px",
                                borderRadius: 100,
                                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                            }}
                        >
                            <span style={{ fontSize: 22, fontWeight: "bold", color: "#059669" }}>
                                Plan yours at localley.io
                            </span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                backgroundColor: "rgba(0,0,0,0.3)",
                                padding: "8px 20px",
                                borderRadius: 100,
                                border: "1px solid rgba(255,255,255,0.2)",
                            }}
                        >
                            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.9)" }}>
                                📍 {city}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const slide = searchParams.get("slide") || "cover";
        const dayIndex = parseInt(searchParams.get("day") || "1", 10) - 1;
        // Check if user is paid (passed from client that knows the tier)
        const isPaidUser = searchParams.get("paid") === "true";

        const supabase = createSupabaseAdmin();

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("title, city, days, activities, highlights, ai_backgrounds")
            .eq("id", id)
            .single();

        if (error || !itinerary) {
            return new Response("Itinerary not found", { status: 404 });
        }

        // Extract AI backgrounds from database
        const aiBackgrounds = itinerary.ai_backgrounds as Record<string, string> | null;
        let aiBackground: string | undefined;

        console.log("[STORY_ROUTE] Rendering slide:", {
            slide,
            dayIndex,
            hasAiBackgrounds: !!aiBackgrounds,
            backgroundKeys: aiBackgrounds ? Object.keys(aiBackgrounds) : [],
        });

        if (aiBackgrounds) {
            if (slide === "cover" && aiBackgrounds.cover) {
                aiBackground = aiBackgrounds.cover;
                console.log("[STORY_ROUTE] Using cover background, length:", aiBackground.length);
            } else if (slide === "summary" && aiBackgrounds.summary) {
                aiBackground = aiBackgrounds.summary;
                console.log("[STORY_ROUTE] Using summary background, length:", aiBackground.length);
            } else if (slide === "day") {
                // Check for day-specific background
                const dayBgKey = `day${dayIndex + 1}`;
                if (aiBackgrounds[dayBgKey]) {
                    aiBackground = aiBackgrounds[dayBgKey];
                    console.log("[STORY_ROUTE] Using", dayBgKey, "background, length:", aiBackground.length);
                } else {
                    console.log("[STORY_ROUTE] No background for", dayBgKey, "- using fallback");
                }
            }
        } else {
            console.log("[STORY_ROUTE] No ai_backgrounds in database for itinerary:", id);
        }

        // Use fallback image if no background was found
        if (!aiBackground && itinerary.city) {
            aiBackground = getFallbackImage(itinerary.city);
            console.log("[STORY_ROUTE] Using fallback image for", itinerary.city, ":", aiBackground);
        }

        // Robust activities parsing — handle all possible data shapes
        let rawActivities: unknown = itinerary.activities;
        if (typeof rawActivities === "string") {
            try { rawActivities = JSON.parse(rawActivities); } catch { rawActivities = []; }
        }
        const parsedActivities = Array.isArray(rawActivities) ? rawActivities : [];

        // Normalize: detect DayPlan[] (has nested .activities) vs other formats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dailyPlans: DayPlan[] = parsedActivities.length > 0 && (parsedActivities[0] as any)?.activities
            ? parsedActivities as DayPlan[]
            : [];

        console.log("[STORY_ROUTE] Parsed activities:", {
            rawType: typeof itinerary.activities,
            isArray: Array.isArray(rawActivities),
            parsedLength: parsedActivities.length,
            dailyPlansLength: dailyPlans.length,
            hasDayActivities: dailyPlans.length > 0 ? !!dailyPlans[0]?.activities : false,
        });

        let element;

        switch (slide) {
            case "cover":
                element = (
                    <CoverSlide
                        title={itinerary.title}
                        city={itinerary.city}
                        days={itinerary.days}
                        backgroundImage={aiBackground || undefined}
                    />
                );
                break;

            case "day":
                // Graceful fallback: if dayPlan doesn't exist, render a minimal day slide
                // instead of returning 404 (which causes broken image icon in the client)
                const dayPlan = dailyPlans[dayIndex] || {
                    day: dayIndex + 1,
                    theme: `Day ${dayIndex + 1}`,
                    activities: [],
                };
                console.log("[STORY_ROUTE] Day slide data:", {
                    dayIndex,
                    hasDayPlan: !!dailyPlans[dayIndex],
                    activitiesCount: dayPlan.activities?.length || 0,
                    theme: dayPlan.theme,
                });
                element = (
                    <DaySlide
                        dayPlan={dayPlan}
                        dayNumber={dayIndex + 1}
                        backgroundImage={aiBackground || undefined}
                        isPaidUser={isPaidUser}
                    />
                );
                break;

            case "summary":
                element = (
                    <SummarySlide
                        title={itinerary.title}
                        city={itinerary.city}
                        highlights={itinerary.highlights || []}
                        backgroundImage={aiBackground || undefined}
                        isPaidUser={isPaidUser}
                    />
                );
                break;

            default:
                return new Response("Invalid slide type", { status: 400 });
        }

        // Wrap ImageResponse in try-catch to never return error responses
        try {
            return new ImageResponse(element, {
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
            });
        } catch (renderError) {
            console.error("[STORY_ROUTE] ImageResponse render failed:", renderError);
            // Return a minimal gradient PNG instead of a 500 text error
            const fallbackLabel = slide === "day" ? `Day ${dayIndex + 1}` : slide === "cover" ? (itinerary.title || "Your Trip") : "Summary";
            return new ImageResponse(
                (
                    <div style={{
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                    }}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            backgroundColor: "rgba(0,0,0,0.3)",
                            padding: "12px 28px",
                            borderRadius: 100,
                            border: "1px solid rgba(255,255,255,0.2)",
                            marginBottom: 40,
                        }}>
                            <span style={{ fontSize: 32, color: "white", fontWeight: "bold" }}>Localley</span>
                        </div>
                        <span style={{ fontSize: 56, color: "white", fontWeight: "bold", textShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                            {fallbackLabel}
                        </span>
                    </div>
                ),
                { width: STORY_WIDTH, height: STORY_HEIGHT }
            );
        }
    } catch (error) {
        console.error("[STORY_ROUTE] Fatal error:", error);
        // Even the outermost catch should try to return a PNG, not text
        try {
            return new ImageResponse(
                (
                    <div style={{
                        width: STORY_WIDTH,
                        height: STORY_HEIGHT,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                    }}>
                        <span style={{ fontSize: 48, color: "white", fontWeight: "bold" }}>Localley</span>
                    </div>
                ),
                { width: STORY_WIDTH, height: STORY_HEIGHT }
            );
        } catch {
            return new Response("Failed to generate story", { status: 500 });
        }
    }
}
