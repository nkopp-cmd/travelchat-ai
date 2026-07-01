"use client";

import { Button } from "@/components/ui/button";
import { Bookmark, Calendar, Check, Gem, MapPin, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ItineraryInsightsPanel } from "@/components/itinerary/itinerary-insights-panel";
import {
    cleanChatItineraryDescription,
    getChatTipKind,
    parseChatItineraryPreview,
} from "@/lib/itineraries/chat-preview-parser";
import type { ItineraryInsight } from "@/lib/itineraries/normalize-daily-plans";

interface ItineraryPreviewProps {
    content: string;
    conversationId?: string;
}

function getDayTheme(dayTitle: string): string {
    const match = dayTitle.match(/^Day\s+\d+\s*[:\-\u2013\u2014]\s*(.+)$/iu);
    return match?.[1]?.trim() || dayTitle;
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
            case 'hidden-gem': return { label: 'Hidden Gem', className: 'text-violet-700 dark:text-violet-300 bg-violet-500/10 border-violet-500/20' };
            case 'local-favorite': return { label: 'Local Fave', className: 'text-blue-700 dark:text-blue-300 bg-blue-500/10 border-blue-500/20' };
            case 'mixed': return { label: 'Mixed', className: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' };
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
        <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/[0.15] shadow-[0_0_20px_rgba(139,92,246,0.15)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.08]">
            {/* Header */}
            <div className="px-5 pt-5 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="h-4 w-4 text-violet-500 flex-shrink-0" />
                            <h3 className="min-w-0 break-words text-lg font-bold leading-tight text-foreground sm:truncate">{title}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{city}</span>
                            <span className="text-border">|</span>
                            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{days.length} {days.length === 1 ? 'day' : 'days'}</span>
                        </div>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={isSaved || isSaving}
                        size="sm"
                        className={isSaved
                            ? "w-full bg-green-600 shadow-md hover:bg-green-700 sm:w-auto"
                            : "w-full bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700 sm:w-auto"
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

            {insights.length > 0 && (
                <div className="px-4 pb-3 sm:px-5">
                    <ItineraryInsightsPanel
                        insights={insights}
                        title="Trip notes"
                        compact
                        className="border-violet-300/15 bg-violet-950/[0.18] shadow-none"
                    />
                </div>
            )}

            {/* Days */}
            <div className="space-y-3 px-4 pb-5 sm:px-5">
                {days.map((day, dayIndex) => (
                    <div key={dayIndex} className="overflow-hidden rounded-xl border border-black/5 bg-white/70 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
                        {/* Day Header - Gradient */}
                        <div className="flex flex-col gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                            <h4 className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-white sm:truncate" title={day.day}>
                                {day.day}
                            </h4>
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">
                                {day.activities.length} {day.activities.length === 1 ? 'spot' : 'spots'}
                            </span>
                        </div>

                        {/* Activities */}
                        <div className="divide-y divide-black/5 dark:divide-white/10">
                            {day.activities.map((activity, actIndex) => {
                                const badge = getTypeBadge(activity.type);
                                const desc = cleanChatItineraryDescription(activity.description);
                                const TypeIcon = getTypeIcon(activity.type);

                                return (
                                    <div key={actIndex} className="flex items-start gap-3 px-3.5 py-3 sm:px-4">
                                        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-violet-300/20 bg-violet-400/10 text-violet-200">
                                            <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <h5 className="min-w-0 break-words text-sm font-semibold leading-snug text-foreground">
                                                    {activity.title}
                                                </h5>
                                                {badge && (
                                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badge.className}`}>
                                                        {badge.label}
                                                    </span>
                                                )}
                                            </div>
                                            {desc && (
                                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                                    {desc}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
