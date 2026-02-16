"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, Bookmark, Check } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { validateCityForItinerary } from "@/lib/cities";

interface ItineraryPreviewProps {
    content: string;
}

interface ParsedDay {
    day: string;
    activities: {
        title: string;
        description: string;
        type: "hidden-gem" | "local-favorite" | "mixed" | "normal";
    }[];
}

export function ItineraryPreview({ content }: ItineraryPreviewProps) {
    const [isSaved, setIsSaved] = useState(false);
    const { toast } = useToast();

    // Parse the itinerary content
    const parseItinerary = (): { title: string; city: string; days: ParsedDay[] } => {
        const lines = content.split('\n');
        const fullTitle = lines[0]?.replace(/^[#*]+\s*|\*+$/g, '').trim() || "Your Itinerary";

        // Extract city from title (multiple patterns)
        // Pattern 1: "X Days in [City]" or "in [City]"
        // Pattern 2: "[City] Adventure" or "[City]:" at start
        let city = "";
        const inCityMatch = fullTitle.match(/in\s+([A-Za-z\s]+?)(?:\s*[:\-,]|$)/i);
        const cityFirstMatch = fullTitle.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:Adventure|Guide|Trip|Experience|Itinerary)/i);
        const cityColonMatch = fullTitle.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):\s+/);

        if (inCityMatch) {
            city = inCityMatch[1].trim();
        } else if (cityFirstMatch) {
            city = cityFirstMatch[1].trim();
        } else if (cityColonMatch) {
            city = cityColonMatch[1].trim();
        }

        // Validate against known cities — catches cases regex missed
        if (!city || city === "Unknown City") {
            const validation = validateCityForItinerary(fullTitle);
            if (validation.valid && validation.city) {
                city = validation.city.name;
            }
        }

        // Create SHORT title (3-5 words max) following form itinerary format
        let title = fullTitle;
        const words = fullTitle.split(/\s+/);
        if (words.length > 5) {
            // Try to extract meaningful short title
            if (city) {
                title = `${city} Hidden Gems`;
            } else {
                title = words.slice(0, 4).join(' ');
            }
        }

        const days: ParsedDay[] = [];
        let currentDay: ParsedDay | null = null;

        lines.forEach(line => {
            const trimmed = line.trim();

            // Day header (handles **, ***, ###, etc.)
            if (/^[#*]+\s*Day \d+:/i.test(trimmed)) {
                if (currentDay) days.push(currentDay);
                currentDay = {
                    day: trimmed.replace(/^[#*]+\s*|\*+$/g, '').trim(),
                    activities: []
                };
            }
            // Activity with bold marker (- **Title**: description)
            else if (currentDay && /^-\s*\*+/.test(trimmed)) {
                const match = trimmed.match(/- \*+(.+?)\*+:\s*(.+)/);
                if (match) {
                    const fullTitle = match[1];
                    const description = match[2];

                    // Extract type from parentheses
                    const typeMatch = fullTitle.match(/\((.+?)\)/);
                    const type = typeMatch ?
                        (typeMatch[1].includes('Hidden Gem') ? 'hidden-gem' :
                            typeMatch[1].includes('Local Favorite') ? 'local-favorite' :
                                typeMatch[1].includes('Mixed') ? 'mixed' : 'normal') : 'normal';

                    // Remove type marker from title
                    const cleanTitle = fullTitle.replace(/\s*\(.+?\)\s*$/, '').trim();

                    currentDay.activities.push({
                        title: cleanTitle,
                        description,
                        type
                    });
                }
            }
            // Plain activity (- Title: description OR - Title)
            else if (currentDay && trimmed.startsWith('- ') && !trimmed.startsWith('  -')) {
                // Check if it has a colon separator
                const colonMatch = trimmed.match(/^- (.+?):\s*(.+)$/);
                if (colonMatch) {
                    const fullTitle = colonMatch[1];
                    const description = colonMatch[2];

                    // Extract type from parentheses
                    const typeMatch = fullTitle.match(/\((.+?)\)/);
                    const type = typeMatch ?
                        (typeMatch[1].includes('Hidden Gem') ? 'hidden-gem' :
                            typeMatch[1].includes('Local Favorite') ? 'local-favorite' :
                                typeMatch[1].includes('Mixed') ? 'mixed' : 'normal') : 'normal';

                    // Remove type marker from title
                    const cleanTitle = fullTitle.replace(/\s*\(.+?\)\s*$/, '').trim();

                    currentDay.activities.push({
                        title: cleanTitle,
                        description,
                        type
                    });
                } else {
                    // No colon, treat whole line as title
                    const fullTitle = trimmed.substring(2).trim();

                    // Extract type from parentheses
                    const typeMatch = fullTitle.match(/\((.+?)\)/);
                    const type = typeMatch ?
                        (typeMatch[1].includes('Hidden Gem') ? 'hidden-gem' :
                            typeMatch[1].includes('Local Favorite') ? 'local-favorite' :
                                typeMatch[1].includes('Mixed') ? 'mixed' : 'normal') : 'normal';

                    // Remove type marker from title
                    const cleanTitle = fullTitle.replace(/\s*\(.+?\)\s*$/, '').trim();

                    currentDay.activities.push({
                        title: cleanTitle,
                        description: '',
                        type
                    });
                }
            }
            // Sub-items (indented with spaces)
            else if (currentDay && trimmed.startsWith('  -')) {
                const lastActivity = currentDay.activities[currentDay.activities.length - 1];
                if (lastActivity) {
                    const subItem = trimmed.substring(2).trim();
                    if (lastActivity.description) {
                        lastActivity.description += '\n' + subItem;
                    } else {
                        lastActivity.description = subItem;
                    }
                }
            }
        });

        if (currentDay) days.push(currentDay);
        return { title, city: city || "Unknown City", days };
    };

    const { title, city, days } = parseItinerary();

    const handleSave = async () => {
        try {
            // Convert parsed days to API format
            const activities = days.map((day, index) => ({
                day: index + 1,
                theme: day.day,
                activities: day.activities.map((act, actIndex) => {
                    // Extract address from description (robust multi-pattern)
                    let extractedAddress = "";

                    // Pattern 1: "Address: [address]" (new structured format from chat prompt)
                    const addressLineMatch = act.description.match(/Address:\s*(.+?)(?:\n|$)/i);
                    if (addressLineMatch) {
                        extractedAddress = addressLineMatch[1].trim();
                    } else {
                        // Pattern 2: "Located at [address]" (legacy format)
                        const locatedAtMatch = act.description.match(/Located at\s+([^.]+)/i);
                        if (locatedAtMatch) {
                            extractedAddress = locatedAtMatch[1].trim();
                        } else {
                            // Pattern 3: "in [District]" pattern
                            const inMatch = act.description.match(/\bin\s+([A-Z][^,.]+(?:,\s*[A-Z][^,.]+)?)/);
                            if (inMatch) {
                                extractedAddress = `${inMatch[1].trim()}, ${city}`;
                            }
                        }
                    }

                    return {
                        time: `${9 + actIndex * 2}:00 AM`, // Generate approximate times
                        type: actIndex < 2 ? "morning" : actIndex < 4 ? "afternoon" : "evening",
                        name: act.title,
                        address: extractedAddress || `${act.title}, ${city}`, // Use place name + city for better geocoding
                        description: act.description,
                        category: "attraction", // Default category
                        localleyScore: act.type === 'hidden-gem' ? 6 : act.type === 'local-favorite' ? 5 : 4,
                        duration: "1-2 hours",
                        cost: "$10-30"
                    };
                })
            }));

            // Save to database via API
            const response = await fetch('/api/itineraries/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    city,
                    days: days.length,
                    activities,
                    localScore: 7, // Estimated score
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save');
            }

            const savedItinerary = await response.json();
            setIsSaved(true);

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
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'hidden-gem': return 'text-violet-600 bg-violet-50 border-violet-200';
            case 'local-favorite': return 'text-blue-600 bg-blue-50 border-blue-200';
            case 'mixed': return 'text-amber-600 bg-amber-50 border-amber-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'hidden-gem': return '💎';
            case 'local-favorite': return '⭐';
            case 'mixed': return '🌟';
            default: return '📍';
        }
    };

    // Truncate description to max 4 words
    const truncateDescription = (text: string): string => {
        if (!text) return '';
        const words = text.split(/\s+/);
        if (words.length <= 4) return text;
        return words.slice(0, 4).join(' ') + '...';
    };

    // Get concise location title (extract place name)
    const getLocationTitle = (title: string): string => {
        // Remove time prefixes like "Morning:", "Afternoon:", etc.
        const cleaned = title.replace(/^(Morning|Afternoon|Evening|Lunch|Dinner|Breakfast):\s*/i, '');
        // If still too long, truncate
        const words = cleaned.split(/\s+/);
        if (words.length <= 3) return cleaned;
        return words.slice(0, 3).join(' ');
    };

    return (
        <Card className="p-4 space-y-4 bg-gradient-to-br from-violet-50/50 to-indigo-50/50 border-violet-200">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-violet-900">{title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        {days.length} {days.length === 1 ? 'day' : 'days'} • AI-generated itinerary
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaved}
                    size="sm"
                    className={isSaved
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-violet-600 hover:bg-violet-700"
                    }
                >
                    {isSaved ? (
                        <>
                            <Check className="h-4 w-4 mr-2" />
                            Saved
                        </>
                    ) : (
                        <>
                            <Bookmark className="h-4 w-4 mr-2" />
                            Save Itinerary
                        </>
                    )}
                </Button>
            </div>

            {/* Days */}
            <div className="space-y-4">
                {days.map((day, dayIndex) => (
                    <div key={dayIndex} className="space-y-3">
                        {/* Day Header */}
                        <div className="flex items-center gap-2 pb-2 border-b border-violet-200">
                            <Calendar className="h-4 w-4 text-violet-600" />
                            <h4 className="font-semibold text-violet-900">{day.day}</h4>
                        </div>

                        {/* Activities */}
                        <div className="space-y-2 pl-2">
                            {day.activities.map((activity, actIndex) => (
                                <div
                                    key={actIndex}
                                    className={`p-2 rounded-lg border ${getTypeColor(activity.type)}`}
                                >
                                    <div className="flex items-start gap-2">
                                        <span className="text-base">{getTypeIcon(activity.type)}</span>
                                        <div className="flex-1 min-w-0">
                                            <h5 className="font-semibold text-xs leading-tight">
                                                {getLocationTitle(activity.title)}
                                            </h5>
                                            {activity.description && (
                                                <p className="text-[10px] mt-0.5 text-muted-foreground">
                                                    {truncateDescription(activity.description)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer Tips */}
            {content.includes('Local Tips') && (
                <div className="pt-3 border-t border-violet-200">
                    <p className="text-xs text-violet-700 font-medium">
                        💡 Local Tips included - check the full itinerary for insider advice!
                    </p>
                </div>
            )}
        </Card>
    );
}
