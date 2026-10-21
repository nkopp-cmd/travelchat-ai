"use client";

import { Button } from "@/components/ui/button";
import { Loader2, Bookmark, Calendar, Check, Gem, MapPin, Sparkles, Star } from "@/components/ui/icons";
import type { LucideIcon } from "@/components/ui/icons";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ItineraryInsightsPanel } from "@/components/itinerary/itinerary-insights-panel";
import { CityImageAvatar } from "@/components/ui/city-image";
import { usePlacePhoto } from "@/hooks/use-place-photo";
import {
    cleanChatItineraryDescription,
    getChatTipKind,
    parseChatItineraryPreview,
} from "@/lib/itineraries/chat-preview-parser";
import type { ItineraryInsight } from "@/lib/itineraries/normalize-daily-plans";
import type { ParsedChatActivity } from "@/lib/itineraries/chat-preview-parser";

interface ItineraryPreviewProps {
    content: string;
    conversationId?: string;
}

export function buildChatPreviewInsights(tips: string[]): ItineraryInsight[] {
    const seen = new Set<string>();

    return tips.reduce<ItineraryInsight[]>((items, rawTip) => {
        const tip = rawTip.trim();
        const key = tip.toLowerCase().replace(/\s+/g, " ");
        if (!tip || seen.has(key)) return items;

        seen.add(key);
        const kind = getChatTipKind(tip);
        items.push({
            id: `chat-tip-${items.length + 1}`,
            label: kind === "transport" ? "Getting around" : kind === "local" ? "Local tip" : "Trip insight",
            text: tip,
            kind,
        });

        return items;
    }, []);
}

function getDayTheme(dayTitle: string): string {
    const match = dayTitle.match(/^Day\s+\d+\s*[:\-\u2013\u2014]\s*(.+)$/iu);
    return match?.[1]?.trim() || dayTitle;
}

function getDayRouteSummary(activities: ParsedChatActivity[]): string {
    const names = activities
        .map((activity) => activity.title.trim())
        .filter(Boolean);

    if (names.length === 0) return "No stops yet";
    if (names.length === 1) return names[0];

    return `${names[0]} to ${names[names.length - 1]}`;
}

function ChatPreviewActivityImage({
    activity,
    city,
    icon: Icon,
}: {
    activity: ParsedChatActivity;
    city: string;
    icon: LucideIcon;
}) {
    const [failedImage, setFailedImage] = useState<string | null>(null);
    const placeData = usePlacePhoto(activity.title, city, {
        enabled: Boolean(activity.title && city && city !== "Unknown City"),
    });
    const photoUrl =
        placeData.photoUrl && placeData.photoUrl !== failedImage
            ? placeData.photoUrl
            : null;

    return (
        <span className="relative mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-raised sm:h-14 sm:w-14">
            {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={photoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => setFailedImage(photoUrl)}
                />
            ) : (
                <CityImageAvatar
                    city={city}
                    className="h-full w-full rounded-none"
                    imageClassName="saturate-110"
                    imageWidth={320}
                    quality={90}
                    sizes="56px"
                />
            )}
            <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-foreground backdrop-blur">
                <Icon className="h-3 w-3" aria-hidden="true" />
            </span>
            {placeData.isLoading && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                </span>
            )}
        </span>
    );
}

export function ItineraryPreview({ content, conversationId }: ItineraryPreviewProps) {
    const [isSaved, setIsSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const { title, city, days, tips } = parseChatItineraryPreview(content);
    const insights = buildChatPreviewInsights(tips);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const activities = days.map((day, index) => ({
                day: index + 1,
                theme: getDayTheme(day.day),
                activities: day.activities.map((act, actIndex) => {
                    let extractedAddress = "";
                    const addressLineMatch = act.description.match(/(?:Address|Location|Where)\s*[:\-\u2013\u2014]\s*(.+?)(?:\n|$)/iu);
                    if (addressLineMatch) {
                        extractedAddress = addressLineMatch[1].trim();
                    } else {
                        const locatedAtMatch = act.description.match(/Located at\s+([^.]+)/i);
                        if (locatedAtMatch) {
                            extractedAddress = locatedAtMatch[1].trim();
                        } else {
                            const inMatch = act.description.match(/\bin\s+([A-Z][^,.]+(?:,\s*[A-Z][^,.]+)?)/);
                            if (inMatch) {
                                extractedAddress = `${inMatch[1].trim()}, ${city}`;
                            }
                        }
                    }

                    const cleanedDescription = cleanChatItineraryDescription(act.description);

                    return {
                        time: `${9 + actIndex * 2}:00 AM`,
                        type: actIndex < 2 ? "morning" : actIndex < 4 ? "afternoon" : "evening",
                        name: act.title,
                        address: act.address || extractedAddress || `${act.title}, ${city}`,
                        description: cleanedDescription || act.title,
                        category: "attraction",
                        localleyScore: act.type === 'hidden-gem' ? 6 : act.type === 'local-favorite' ? 5 : 4,
                        duration: "1-2 hours",
                        cost: "$10-30"
                    };
                })
            }));

            const response = await fetch('/api/itineraries/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    city,
                    days: days.length,
                    activities,
                    insights,
                    localScore: 7,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save');
            }

            const savedItinerary = await response.json();
            setIsSaved(true);

            // Link conversation to saved itinerary
            if (conversationId && savedItinerary.itinerary?.id) {
                fetch('/api/conversations', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationId,
                        linked_itinerary_id: savedItinerary.itinerary.id,
                    }),
                }).catch(() => { /* non-critical */ });
            }

            toast({
                title: "Itinerary saved!",
                description: "You can find it in your My Itineraries page",
            });
        } catch (error) {
            console.error('Save error:', error);
            toast({
                title: "Failed to save",
                description: "Please try again",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const getTypeBadge = (type: string) => {
        switch (type) {
            case 'hidden-gem': return { label: 'Hidden Gem', className: 'text-foreground bg-primary/15 ' };
            case 'local-favorite': return { label: 'Local Fave', className: 'text-sky-100 bg-sky-500/15 ' };
            case 'mixed': return { label: 'Mixed', className: 'text-amber-100 bg-amber-500/15 ' };
            default: return null;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'hidden-gem': return Gem;
            case 'local-favorite': return Star;
            case 'mixed': return Sparkles;
            default: return MapPin;
        }
    };

    return (
        <div className="overflow-hidden rounded-2xl bg-surface text-foreground backdrop-blur-xl">
            {/* Header */}
            <div className=" px-4 pb-4 pt-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                        <CityImageAvatar
                            city={city}
                            className="h-12 w-12 rounded-xl"
                            imageClassName="saturate-110"
                            imageWidth={360}
                            quality={90}
                            sizes="48px"
                        />
                        <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
                                <h3 className="min-w-0 break-words text-lg font-bold leading-tight text-foreground sm:text-xl">{title}</h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                                <span>{city}</span>
                                <span className="text-muted-foreground">|</span>
                                <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                                <span>{days.length} {days.length === 1 ? 'day' : 'days'}</span>
                            </div>
                        </div>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={isSaved || isSaving}
                        size="sm"
                        className={isSaved
                            ? "w-full rounded-full bg-raised text-foreground hover:bg-raised sm:w-auto"
                            : "w-full rounded-full sm:w-auto"
                        }
                    >
                        {isSaved ? (
                            <>
                                <Check className="h-4 w-4 mr-1.5" />
                                Saved
                            </>
                        ) : isSaving ? (
                            <span className="flex items-center gap-1.5">
                                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                                Saving...
                            </span>
                        ) : (
                            <>
                                <Bookmark className="h-4 w-4 mr-1.5" />
                                Save
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Days */}
            <div className="space-y-3 px-3 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
                <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Day schedule
                        </p>
                        <h4 className="text-sm font-bold leading-tight text-foreground">
                            Route by day
                        </h4>
                    </div>
                    <span className="shrink-0 rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {days.length} {days.length === 1 ? "day" : "days"}
                    </span>
                </div>

                <div className="space-y-3" data-testid="chat-day-schedule">
                    {days.map((day, dayIndex) => (
                        <div key={dayIndex} className="overflow-hidden rounded-2xl bg-raised">
                            {/* Day Header - Gradient */}
                            <div className="grid gap-2 bg-primary/15 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4">
                                <div className="flex min-w-0 items-start gap-2">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-foreground">
                                        {dayIndex + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="min-w-0 break-words text-sm font-semibold leading-snug text-foreground sm:truncate" title={day.day}>
                                            {day.day}
                                        </h4>
                                        <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-muted-foreground">
                                            {getDayRouteSummary(day.activities)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 pl-9 sm:justify-end sm:pl-0">
                                    <span className="rounded-full bg-raised px-2 py-0.5 text-[13px] font-medium text-muted-foreground">
                                        Route order
                                    </span>
                                    <span className="w-fit shrink-0 whitespace-nowrap rounded-full bg-raised px-2 py-0.5 text-xs text-muted-foreground">
                                        {day.activities.length} {day.activities.length === 1 ? 'spot' : 'spots'}
                                    </span>
                                </div>
                            </div>

                            {/* Activities */}
                            <div className="space-y-2 p-2 sm:p-3">
                                {day.activities.map((activity, actIndex) => {
                                    const badge = getTypeBadge(activity.type);
                                    const desc = cleanChatItineraryDescription(activity.description);
                                    const TypeIcon = getTypeIcon(activity.type);

                                    return (
                                        <div key={actIndex} className="relative rounded-xl bg-surface p-2.5 transition-colors hover:bg-raised sm:p-3">
                                            <div className="relative flex items-start gap-2.5 sm:gap-3">
                                                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[13px] font-bold text-foreground sm:h-8 sm:w-8">
                                                    {actIndex + 1}
                                                </span>
                                                <ChatPreviewActivityImage
                                                    activity={activity}
                                                    city={city}
                                                    icon={TypeIcon}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                        <h5 className="min-w-0 break-words text-sm font-semibold leading-snug text-foreground sm:text-[15px]">
                                                            {activity.title}
                                                        </h5>
                                                        {badge && (
                                                            <span className={`rounded-full px-1.5 py-0.5 text-[13px] font-medium ${badge.className}`}>
                                                                {badge.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {activity.address && (
                                                        <div className="mt-1.5 flex min-w-0 items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                                                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                                                            <span className="line-clamp-2 min-w-0 break-words">{activity.address}</span>
                                                        </div>
                                                    )}
                                                    {desc && (
                                                        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                                                            {desc}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {insights.length > 0 && (
                    <div className="pt-1" data-testid="chat-trip-notes">
                        <div className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Outside the day schedule
                        </div>
                        <ItineraryInsightsPanel
                            insights={insights}
                            title="Trip notes"
                            description="Tips, transit, and booking notes stay outside the day schedule."
                            compact
                            className=" bg-raised shadow-none"
                        />
                    </div>
                )}

            </div>
        </div>
    );
}
