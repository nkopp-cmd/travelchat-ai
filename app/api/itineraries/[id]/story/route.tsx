import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export const runtime = "edge";

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
                position: "relative",
            }}
        >
            {/* Background layer */}
            {backgroundImage ? (
                <>
                    {/* AI-generated background image */}
                    <img
                        src={backgroundImage}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "center",
                        }}
                    />
                    {/* Dark overlay for text readability */}
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            background: "linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4))",
                        }}
                    />
                </>
            ) : (
                /* Gradient fallback */
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

            {/* Content layer */}
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 80,
                }}
            >
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
        </div>
    );
}

// Day slide template
function DaySlide({ dayPlan, dayNumber, totalDays }: { dayPlan: DayPlan; dayNumber: number; totalDays: number }) {
    const activities = dayPlan.activities?.slice(0, 4) || [];

    return (
        <div
            style={{
                width: STORY_WIDTH,
                height: STORY_HEIGHT,
                display: "flex",
                flexDirection: "column",
                background: "linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)",
                padding: 60,
            }}
        >
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
                position: "relative",
            }}
        >
            {/* Background layer */}
            {backgroundImage ? (
                <>
                    {/* AI-generated background image */}
                    <img
                        src={backgroundImage}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            objectPosition: "center",
                        }}
                    />
                    {/* Dark overlay for text readability */}
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            background: "linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4))",
                        }}
                    />
                </>
            ) : (
                /* Gradient fallback */
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

            {/* Content layer */}
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 80,
                }}
            >
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
        const aiBackgrounds = itinerary.ai_backgrounds as { cover?: string; summary?: string } | null;
        let aiBackground: string | undefined;

        if (aiBackgrounds) {
            if (slide === "cover" && aiBackgrounds.cover) {
                aiBackground = aiBackgrounds.cover;
            } else if (slide === "summary" && aiBackgrounds.summary) {
                aiBackground = aiBackgrounds.summary;
            }
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
