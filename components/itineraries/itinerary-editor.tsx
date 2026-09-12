"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { SpotPlanStaging } from "./spot-plan-staging";
import { insertPlanningSpot, itinerarySnapshot, isItinerarySnapshot, planningCitiesMatch, type ItinerarySnapshot, type PlanningSpot } from "@/lib/itineraries/spot-planning";
import { DayEditor } from "./day-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, X, Check } from "lucide-react";
import {
    normalizeDailyPlansForDisplay,
    parseDailyPlans,
    type ItineraryInsight,
} from "@/lib/itineraries/normalize-daily-plans";

export interface Activity {
    spotId?: string;
    lat?: number;
    lng?: number;
    name: string;
    description?: string;
    time?: string;
    duration?: string;
    cost?: string;
    address?: string;
    type?: string;
    localleyScore?: number;
}

export interface DayPlan {
    day: number;
    theme?: string;
    activities: Activity[];
}

export interface EditorItinerary extends ItinerarySnapshot {
    id: string;
    title: string;
    city: string;
    days: number;
    activities: unknown;
}

export interface ItinerarySavePayload {
    title: string;
    city: string;
    days: DayPlan[];
    insights: ItineraryInsight[];
    highlights: string[];
    estimated_cost: string;
    expected: ItinerarySnapshot;
}

export interface ItineraryEditorProps {
    itinerary: EditorItinerary;
    planningSpot?: PlanningSpot | null;
    spotNotice?: string;
    onNavigate: (path: string) => void;
    saveRequest: (payload: ItinerarySavePayload, signal?: AbortSignal) => Promise<Response>;
}

export class ItineraryAccessError extends Error {}

export function ItineraryEditor({ itinerary, planningSpot, spotNotice, onNavigate, saveRequest }: ItineraryEditorProps) {
    const { toast } = useToast();
    // Keep raw database values separate from the normalized display baseline.
    const expected = useRef(itinerarySnapshot(itinerary));
    const saveLock = useRef(false);
    const lifetime = useRef<AbortController | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        return () => { controller.abort(); };
    }, []);

    const parsedPlan = useMemo(
        () => normalizeDailyPlansForDisplay<DayPlan>(parseDailyPlans(itinerary.activities)),
        [itinerary.activities]
    );

    const [title, setTitle] = useState(itinerary.title);
    const [city, setCity] = useState(itinerary.city);
    const [dayPlans, setDayPlans] = useState<DayPlan[]>(parsedPlan.dailyPlans);
    const [insights, setInsights] = useState<ItineraryInsight[]>(parsedPlan.insights);
    const [highlights, setHighlights] = useState<string[]>(itinerary.highlights || []);
    const [estimatedCost, setEstimatedCost] = useState(itinerary.estimated_cost || "");

    const [isSaving, setIsSaving] = useState(false);
    const [saveBlocked, setSaveBlocked] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [stagingNotice, setStagingNotice] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

    const draft = JSON.stringify({ title, city, days: dayPlans, insights, highlights, estimated_cost: estimatedCost });
    const [savedBaseline, setSavedBaseline] = useState(draft);
    const hasUnsavedChanges = draft !== savedBaseline;

    // Warn on navigation if unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges || isSaving) {
                e.preventDefault();
                e.returnValue = "";
            }
        };

        const handleLink = (event: MouseEvent) => {
            const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
            if (link && (hasUnsavedChanges || isSaving) && !confirm("Your draft may not be saved. Leave this editor?")) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("click", handleLink, true);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("click", handleLink, true);
        };
    }, [hasUnsavedChanges, isSaving]);

    // Auto-save with debounce (30 seconds after last change)
    useEffect(() => {
        if (!hasUnsavedChanges || isSaving || saveBlocked || saveError) return;

        const timeoutId = setTimeout(() => {
            handleSave(true);
        }, 30000); // 30 second debounce

        return () => clearTimeout(timeoutId);
        // Existing autosave pattern intentionally re-arms when edited fields change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, hasUnsavedChanges, isSaving, saveBlocked, saveError]);

    const handleSave = async (isAutoSave = false) => {
        const controller = lifetime.current;
        if (!controller || controller.signal.aborted || saveLock.current || saveBlocked || !hasUnsavedChanges) return;
        saveLock.current = true;
        const submittedDraft = draft;
        setIsSaving(true);
        setSaveError(null);
        setSaveStatus("saving");

        try {
            const response = await saveRequest({ ...JSON.parse(submittedDraft), expected: expected.current }, controller.signal);
            if (controller.signal.aborted) return;

            if (!response.ok) {
                if (response.status === 409 || response.status === 428) {
                    setSaveBlocked(true);
                    throw new Error("This itinerary changed or its save snapshot is missing. Preserve your draft before reloading.");
                }
                throw new Error("Your changes were not saved. Try Save again.");
            }

            const result = await response.json();
            if (controller.signal.aborted) return;
            if (!result || !isItinerarySnapshot(result.itinerary)) {
                setSaveBlocked(true);
                throw new Error("We could not confirm the saved version. Preserve your draft before reloading.");
            }
            expected.current = itinerarySnapshot(result.itinerary);
            setSavedBaseline(submittedDraft);

            setSaveStatus("saved");

            toast({
                title: isAutoSave ? "Auto-saved" : "Saved successfully",
                description: "Your changes have been saved.",
            });

        } catch (error) {
            if (controller.signal.aborted) return;
            if (error instanceof ItineraryAccessError) {
                setSaveBlocked(true);
                setSaveStatus("error");
                setSaveError(error.message);
                return;
            }
            console.error("Save error:", error);
            setSaveStatus("error");
            const message = `${error instanceof Error ? error.message : "Your changes were not saved."} Your draft remains here. Automatic saving has stopped.`;
            setSaveError(message);

            toast({
                title: "Save failed",
                description: message,
                variant: "destructive",
            });

        } finally {
            if (!controller.signal.aborted) {
                saveLock.current = false;
                setIsSaving(false);
            }
        }
    };

    const handleCancel = () => {
        if (isSaving) return;
        if (hasUnsavedChanges) {
            if (confirm("You have unsaved changes. Are you sure you want to cancel?")) {
                onNavigate(`/itineraries/${itinerary.id}`);
            }
        } else {
            onNavigate(`/itineraries/${itinerary.id}`);
        }
    };

    const handleDayUpdate = (index: number, updatedDay: DayPlan) => {
        const updatedDays = [...dayPlans];
        updatedDays[index] = updatedDay;
        setDayPlans(updatedDays);
    };

    const handleHighlightsChange = (value: string) => {
        // Convert comma-separated string to array
        const highlightsArray = value
            .split(",")
            .map((h) => h.trim())
            .filter((h) => h.length > 0);
        setHighlights(highlightsArray);
    };

    const handleInsightsChange = (value: string) => {
        const nextInsights = value
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((text, index) => ({
                id: insights[index]?.id || `trip-insight-${index + 1}`,
                label: insights[index]?.label || "Trip insight",
                kind: insights[index]?.kind || "insight",
                text,
            }));

        setInsights(nextInsights);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header with Save/Cancel */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4 -mx-4">
                <div className="flex flex-wrap gap-3 items-center justify-between max-w-5xl mx-auto">
                    <div className="flex min-w-0 flex-wrap items-center gap-3">
                        <h1 className="w-full text-2xl font-bold sm:w-auto">Edit Itinerary</h1>
                        {saveStatus === "saving" && (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Saving...
                            </span>
                        )}
                        {saveStatus === "saved" && !hasUnsavedChanges && (
                            <span className="text-sm text-green-700 dark:text-green-300 flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                Saved
                            </span>
                        )}
                        {saveStatus === "error" && (
                            <span className="text-sm text-red-700 dark:text-red-300">
                                Save failed
                            </span>
                        )}
                        {hasUnsavedChanges && !isSaving && (
                            <span className="text-sm text-amber-700 dark:text-amber-300">
                                Unsaved changes
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={handleCancel}
                            variant="outline"
                            disabled={isSaving}
                        >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                        </Button>
                        <Button
                            onClick={() => handleSave(false)}
                            disabled={isSaving || saveBlocked || !hasUnsavedChanges}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Save
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {saveError && <p role="alert" className="rounded-md border border-destructive p-4 text-sm">{saveError}</p>}
            {spotNotice && <p role="status" className="rounded-md border bg-background p-4 text-sm">{spotNotice}</p>}
            {planningSpot && <SpotPlanStaging key={planningSpot.id} spot={planningSpot} city={city} plans={dayPlans} onConfirm={(day, position) => {
                if (!planningCitiesMatch(city, planningSpot.city)) return;
                try {
                    setDayPlans(insertPlanningSpot(dayPlans, planningSpot, day, position));
                    setStagingNotice("Spot added to your draft. Save now, or wait for automatic saving after 30 seconds.");
                } catch (error) {
                    setStagingNotice(error instanceof Error ? error.message : "Could not add this spot.");
                }
            }} />}
            {stagingNotice && hasUnsavedChanges && !saveError && <p role="status" className="text-sm">{stagingNotice}</p>}

            {/* Basic Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">
                            Itinerary Title
                        </label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., 3-Day Seoul Adventure"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">
                            City
                        </label>
                        <Input
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="e.g., Seoul"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">
                            Estimated Cost
                        </label>
                        <Input
                            value={estimatedCost}
                            onChange={(e) => setEstimatedCost(e.target.value)}
                            placeholder="e.g., $500-800"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">
                            Highlights (comma-separated)
                        </label>
                        <Textarea
                            value={highlights.join(", ")}
                            onChange={(e) => handleHighlightsChange(e.target.value)}
                            placeholder="e.g., Traditional markets, K-pop culture, Street food"
                            rows={2}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Trip insights</CardTitle>
                </CardHeader>
                <CardContent>
                    <label className="text-sm font-medium mb-1 block">
                        Tips and getting-around notes
                    </label>
                    <Textarea
                        value={insights.map((insight) => insight.text).join("\n")}
                        onChange={(e) => handleInsightsChange(e.target.value)}
                        placeholder="Add one trip-level insight per line. These stay outside the day sections."
                        rows={Math.max(3, Math.min(6, insights.length + 1))}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                        These notes appear as trip insights, not as activities inside a day.
                    </p>
                </CardContent>
            </Card>

            {/* Day Plans */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Day-by-Day Plan</h2>
                {dayPlans.map((day, index) => (
                    <DayEditor
                        key={`day-${day.day}`}
                        dayPlan={day}
                        onUpdate={(updatedDay) => handleDayUpdate(index, updatedDay)}
                    />
                ))}
            </div>

            {/* Bottom Save/Cancel */}
            <div className="flex justify-end gap-2 pb-8">
                <Button
                    onClick={handleCancel}
                    variant="outline"
                    disabled={isSaving}
                >
                    Cancel
                </Button>
                <Button
                    onClick={() => handleSave(false)}
                    disabled={isSaving || saveBlocked || !hasUnsavedChanges}
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
