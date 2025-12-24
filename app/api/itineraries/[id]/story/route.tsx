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

interface Activity {
    name: string;
    description?: string;
    time?: string;
    localleyScore?: number;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: Activity[];
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
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                padding: 80,
            }}
        >
            {/* Background image layer */}
            {backgroundImage && (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                    }}
                />
            )}
            {/* Dark overlay */}
            {backgroundImage && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "rgba(0,0,0,0.4)",
                    }}
                />
            )}
            {/* Logo */}
            <div
                style={{
                    position: "absolute",
                    top: 60,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                <span style={{ fontSize: 48, color: "white", fontWeight: "bold" }}>
                    Localley
                </span>
            </div>

            {/* City Badge */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: "rgba(255,255,255,0.2)",
                    padding: "16px 32px",
                    borderRadius: 100,
                    marginBottom: 40,
                }}
            >
                <span style={{ fontSize: 36, color: "white" }}>📍 {city}</span>
            </div>

            {/* Title */}
            <h1
                style={{
                    fontSize: 72,
                    fontWeight: "bold",
                    color: "white",
                    textAlign: "center",
                    lineHeight: 1.2,
                    margin: "0 0 40px 0",
                    textShadow: "0 4px 20px rgba(0,0,0,0.3)",
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
                    backgroundColor: "rgba(255,255,255,0.15)",
                    padding: "24px 48px",
                    borderRadius: 24,
                }}
            >
                <span style={{ fontSize: 32, color: "white" }}>
                    🗓️ {days} {days === 1 ? "Day" : "Days"} of Adventure
                </span>
            </div>

            {/* Swipe indicator */}
            <div
                style={{
                    position: "absolute",
                    bottom: 80,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <span style={{ fontSize: 24, color: "rgba(255,255,255,0.7)" }}>
                    Swipe to explore →
                </span>
            </div>
        </div>
    );
}

// Day slide template
function DaySlide({ dayPlan, dayNumber, totalDays, backgroundImage }: { dayPlan: DayPlan; dayNumber: number; totalDays: number; backgroundImage?: string }) {
    const activities = dayPlan.activities?.slice(0, 4) || [];

    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
                padding: 60,
            }}
        >
            {/* Background image layer */}
            {backgroundImage && (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                    }}
                />
            )}
            {/* Dark overlay for readability */}
            {backgroundImage && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(rgba(30, 27, 75, 0.85), rgba(49, 46, 129, 0.9))",
                    }}
                />
            )}
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 40,
                }}
            >
                <span style={{ fontSize: 32, color: "rgba(255,255,255,0.6)" }}>
                    Localley
                </span>
                <span style={{ fontSize: 28, color: "rgba(255,255,255,0.6)" }}>
                    {dayNumber}/{totalDays}
                </span>
            </div>

            {/* Day Title */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    marginBottom: 48,
                }}
            >
                <span
                    style={{
                        fontSize: 64,
                        fontWeight: "bold",
                        color: "#a78bfa",
                    }}
                >
                    Day {dayPlan.day || dayNumber}
                </span>
                {dayPlan.theme && (
                    <span style={{ fontSize: 36, color: "white", marginTop: 8 }}>
                        {dayPlan.theme}
                    </span>
                )}
            </div>

            {/* Activities */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 24,
                    flex: 1,
                }}
            >
                {activities.map((activity, index) => (
                    <div
                        key={index}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            backgroundColor: "rgba(255,255,255,0.1)",
                            borderRadius: 24,
                            padding: 32,
                            borderLeft: "4px solid #a78bfa",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 16,
                                marginBottom: 12,
                            }}
                        >
                            <span style={{ fontSize: 32 }}>
                                {activity.localleyScore && activity.localleyScore >= 5
                                    ? "💎"
                                    : activity.localleyScore && activity.localleyScore >= 4
                                        ? "⭐"
                                        : "📍"}
                            </span>
                            <span
                                style={{
                                    fontSize: 36,
                                    fontWeight: "bold",
                                    color: "white",
                                }}
                            >
                                {activity.name}
                            </span>
                        </div>
                        {activity.time && (
                            <span style={{ fontSize: 24, color: "rgba(255,255,255,0.6)" }}>
                                🕐 {activity.time}
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    paddingTop: 32,
                }}
            >
                <span style={{ fontSize: 24, color: "rgba(255,255,255,0.5)" }}>
                    Generated by Localley
                </span>
            </div>
        </div>
    );
}

// Summary slide template
function SummarySlide({ title, city, highlights, backgroundImage }: { title: string; city: string; highlights: string[]; backgroundImage?: string }) {
    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                background: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%)",
                padding: 80,
            }}
        >
            {/* Background image layer */}
            {backgroundImage && (
                <img
                    src={backgroundImage}
                    alt=""
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                    }}
                />
            )}
            {/* Dark overlay */}
            {backgroundImage && (
                <div
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        background: "rgba(0,0,0,0.4)",
                    }}
                />
            )}
            {/* Title */}
            <span
                style={{
                    fontSize: 48,
                    color: "rgba(255,255,255,0.8)",
                    marginBottom: 24,
                }}
            >
                ✨ Trip Highlights
            </span>

            <h2
                style={{
                    fontSize: 56,
                    fontWeight: "bold",
                    color: "white",
                    textAlign: "center",
                    marginBottom: 48,
                }}
            >
                {title}
            </h2>

            {/* Highlights */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 24,
                    width: "100%",
                }}
            >
                {highlights.slice(0, 5).map((highlight, index) => (
                    <div
                        key={index}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 20,
                            backgroundColor: "rgba(255,255,255,0.15)",
                            padding: "24px 32px",
                            borderRadius: 20,
                        }}
                    >
                        <span style={{ fontSize: 32 }}>✓</span>
                        <span style={{ fontSize: 32, color: "white" }}>{highlight}</span>
                    </div>
                ))}
            </div>

            {/* CTA */}
            <div
                style={{
                    position: "absolute",
                    bottom: 100,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 16,
                }}
            >
                <div
                    style={{
                        backgroundColor: "white",
                        padding: "20px 48px",
                        borderRadius: 100,
                    }}
                >
                    <span style={{ fontSize: 28, fontWeight: "bold", color: "#059669" }}>
                        Plan yours at localley.app
                    </span>
                </div>
                <span style={{ fontSize: 24, color: "rgba(255,255,255,0.7)" }}>
                    📍 {city}
                </span>
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

        const supabase = createSupabaseAdmin();

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("*")
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

        const dailyPlans: DayPlan[] = typeof itinerary.activities === "string"
            ? JSON.parse(itinerary.activities)
            : itinerary.activities || [];

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
                const dayPlan = dailyPlans[dayIndex];
                if (!dayPlan) {
                    return new Response("Day not found", { status: 404 });
                }
                element = (
                    <DaySlide
                        dayPlan={dayPlan}
                        dayNumber={dayIndex + 1}
                        totalDays={dailyPlans.length}
                        backgroundImage={aiBackground || undefined}
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
                    />
                );
                break;

            default:
                return new Response("Invalid slide type", { status: 400 });
        }

        return new ImageResponse(element, {
            width: STORY_WIDTH,
            height: STORY_HEIGHT,
        });
    } catch (error) {
        console.error("Story generation error:", error);
        return new Response("Failed to generate story", { status: 500 });
    }
}
