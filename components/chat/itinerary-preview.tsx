"use client";

import { Button } from "@/components/ui/button";
import { Bookmark, Calendar, Check, Gem, MapPin, Sparkles, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

function getDayTheme(dayTitle: string): string {
    const match = dayTitle.match(/^Day\s+\d+\s*[:\-\u2013\u2014]\s*(.+)$/iu);
    return match?.[1]?.trim() || dayTitle;
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
        <span className="relative mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-violet-300/20 bg-violet-950/40 shadow-lg shadow-violet-950/10 sm:h-14 sm:w-14">
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
            <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-md border border-white/15 bg-black/60 text-violet-100 backdrop-blur">
                <Icon className="h-3 w-3" aria-hidden="true" />
            </span>
            {placeData.isLoading && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
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
    const insights: ItineraryInsight[] = tips.map((tip, index) => {
        const kind = getChatTipKind(tip);
        return {
            id: `chat-tip-${index + 1}`,
            label: kind === "transport" ? "Getting around" : kind === "local" ? "Local tip" : "Trip insight",
            text: tip,
            kind,
        };
    });

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

                    return {
                        time: `${9 + actIndex * 2}:00 AM`,
                        type: actIndex < 2 ? "morning" : actIndex < 4 ? "afternoon" : "evening",
                        name: act.title,
                        address: act.address || extractedAddress || `${act.title}, ${city}`,
                        description: act.description,
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
            case 'hidden-gem': return { label: 'Hidden Gem', className: 'text-violet-100 bg-violet-500/15 border-violet-300/25' };
            case 'local-favorite': return { label: 'Local Fave', className: 'text-sky-100 bg-sky-500/15 border-sky-300/25' };
            case 'mixed': return { label: 'Mixed', className: 'text-amber-100 bg-amber-500/15 border-amber-300/25' };
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
        <div className="overflow-hidden rounded-lg border border-violet-200/15 bg-[#100b1c]/92 text-white shadow-2xl shadow-violet-950/20 backdrop-blur-xl">
            {/* Header */}
            <div className="border-b border-white/10 px-4 pb-4 pt-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                        <CityImageAvatar
                            city={city}
                            className="h-12 w-12 rounded-xl border border-violet-300/20 shadow-lg shadow-violet-950/15"
                            imageClassName="saturate-110"
                            imageWidth={360}
                            quality={90}
                            sizes="48px"
                        />
                        <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 flex-shrink-0 text-violet-300" />
                                <h3 className="min-w-0 break-words text-lg font-bold leading-tight text-white sm:text-xl">{title}</h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-violet-50/60">
                                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" />
                                <span>{city}</span>
                                <span className="text-white/20">|</span>
                                <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-indigo-300" />
                                <span>{days.length} {days.length === 1 ? 'day' : 'days'}</span>
                            </div>
                        </div>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={isSaved || isSaving}
                        size="sm"
                        className={isSaved
                            ? "h-10 w-full rounded-lg bg-emerald-600 shadow-md hover:bg-emerald-700 sm:w-auto"
                            : "h-10 w-full rounded-lg bg-violet-600 shadow-md shadow-violet-500/20 hover:bg-violet-700 sm:w-auto"
                        }
                    >
                        {isSaved ? (
                            <>
                                <Check className="h-4 w-4 mr-1.5" />
                                Saved
                            </>
                        ) : isSaving ? (
                            <span className="flex items-center gap-1.5">
                                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
            <div className="space-y-3 px-3 pb-4 sm:px-5 sm:pb-5">
                {days.map((day, dayIndex) => (
                    <div key={dayIndex} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.045] shadow-lg shadow-violet-950/10 backdrop-blur">
                        {/* Day Header - Gradient */}
                        <div className="flex flex-col gap-2 border-b border-white/10 bg-violet-500/16 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                            <div className="flex min-w-0 items-start gap-2">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-200/20 bg-violet-500/25 text-xs font-bold text-violet-100">
                                    {dayIndex + 1}
                                </span>
                                <h4 className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-white sm:truncate" title={day.day}>
                                    {day.day}
                                </h4>
                            </div>
                            <span className="w-fit shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-xs text-violet-50/80">
                                {day.activities.length} {day.activities.length === 1 ? 'spot' : 'spots'}
                            </span>
                        </div>

                        {/* Activities */}
                        <div className="space-y-2 p-2 sm:p-3">
                            {day.activities.map((activity, actIndex) => {
                                const badge = getTypeBadge(activity.type);
                                const desc = cleanChatItineraryDescription(activity.description);
                                const TypeIcon = getTypeIcon(activity.type);

                                return (
                                    <div key={actIndex} className="relative rounded-lg border border-white/10 bg-white/[0.04] p-2.5 shadow-sm shadow-violet-950/10 sm:p-3">
                                        <div
                                            className="absolute bottom-3 left-[21px] top-12 w-px bg-violet-300/20 sm:left-[25px]"
                                            aria-hidden="true"
                                        />
                                        <div className="relative flex items-start gap-2.5 sm:gap-3">
                                            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-200/25 bg-violet-500/25 text-[11px] font-bold text-violet-50 shadow-lg shadow-violet-950/20 sm:h-8 sm:w-8">
                                                {actIndex + 1}
                                            </span>
                                            <ChatPreviewActivityImage
                                                activity={activity}
                                                city={city}
                                                icon={TypeIcon}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                    <h5 className="min-w-0 break-words text-sm font-semibold leading-snug text-white sm:text-[15px]">
                                                        {activity.title}
                                                    </h5>
                                                    {badge && (
                                                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
                                                            {badge.label}
                                                        </span>
                                                    )}
                                                </div>
                                                {activity.address && (
                                                    <div className="mt-1.5 flex min-w-0 items-start gap-1.5 text-xs leading-5 text-violet-50/58">
                                                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden="true" />
                                                        <span className="line-clamp-2 min-w-0 break-words">{activity.address}</span>
                                                    </div>
                                                )}
                                                {desc && (
                                                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-violet-50/64 sm:text-[13px]">
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

                {insights.length > 0 && (
                    <ItineraryInsightsPanel
                        insights={insights}
                        title="Trip notes"
                        compact
                        className="border-violet-300/15 bg-violet-950/[0.18] shadow-none"
                    />
                )}
            </div>
        </div>
    );
}
