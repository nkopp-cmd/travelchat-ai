"use client";

import { useState, useEffect, useCallback } from "react";
import { DayEditor } from "./day-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, X, Check } from "lucide-react";

interface Activity {
    name: string;
    description?: string;
    time?: string;
    duration?: string;
    cost?: string;
    address?: string;
    type?: string;
    localleyScore?: number;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: Activity[];
    localTip?: string;
    transportTips?: string;
}

interface Itinerary {
    id: string;
    title: string;
    city: string;
    days: any; // This is actually the number of days
    activities: any; // This contains the day plans
    highlights?: string[];
    estimated_cost?: string;
}

interface EditFormProps {
    itinerary: Itinerary;
}

export function EditForm({ itinerary }: EditFormProps) {
    const router = useRouter();
    const { toast } = useToast();

    // Parse activities (which contains the day plans) if they're stored as JSON string
    const parsedDays = typeof itinerary.activities === 'string'
        ? JSON.parse(itinerary.activities)
        : Array.isArray(itinerary.activities)
            ? itinerary.activities
            : [];

    const [title, setTitle] = useState(itinerary.title);
    const [city, setCity] = useState(itinerary.city);
    const [dayPlans, setDayPlans] = useState<DayPlan[]>(parsedDays);
    const [highlights, setHighlights] = useState<string[]>(itinerary.highlights || []);
    const [estimatedCost, setEstimatedCost] = useState(itinerary.estimated_cost || "");

    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

    // Track changes
    useEffect(() => {
        const hasChanges =
            title !== itinerary.title ||
            city !== itinerary.city ||
            estimatedCost !== (itinerary.estimated_cost || "") ||
            JSON.stringify(dayPlans) !== JSON.stringify(parsedDays) ||
            JSON.stringify(highlights) !== JSON.stringify(itinerary.highlights || []);

        setHasUnsavedChanges(hasChanges);
    }, [title, city, dayPlans, highlights, estimatedCost, itinerary, parsedDays]);

    // Warn on navigation if unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = "";
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // Auto-save with debounce (30 seconds after last change)
    useEffect(() => {
        if (!hasUnsavedChanges) return;

        const timeoutId = setTimeout(() => {
            handleSave(true);
        }, 30000); // 30 second debounce

        return () => clearTimeout(timeoutId);
    }, [title, city, dayPlans, highlights, estimatedCost, hasUnsavedChanges]);

    const handleSave = async (isAutoSave = false) => {
        setIsSaving(true);
        setSaveStatus("saving");

        try {
            const response = await fetch(`/api/itineraries/${itinerary.id}/update`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title,
                    city,
                    days: dayPlans,
                    highlights,
                    estimated_cost: estimatedCost,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to save itinerary");
            }

            setSaveStatus("saved");
            setHasUnsavedChanges(false);

            toast({
                title: isAutoSave ? "Auto-saved" : "Saved successfully",
                description: "Your changes have been saved.",
            });

            // Reset saved status after 3 seconds
            setTimeout(() => {
                setSaveStatus("idle");
            }, 3000);
        } catch (error) {
            console.error("Save error:", error);
            setSaveStatus("error");

            toast({
                title: "Save failed",
                description: "Failed to save your changes. Please try again.",
                variant: "destructive",
            });

            setTimeout(() => {
                setSaveStatus("idle");
            }, 3000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        if (hasUnsavedChanges) {
            if (confirm("You have unsaved changes. Are you sure you want to cancel?")) {
                router.push(`/itineraries/${itinerary.id}`);
            }
        } else {
            router.push(`/itineraries/${itinerary.id}`);
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

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header with Save/Cancel */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4 -mx-4">
                <div className="flex items-center justify-between max-w-5xl mx-auto">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">Edit Itinerary</h1>
                        {saveStatus === "saving" && (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Saving...
                            </span>
                        )}
                        {saveStatus === "saved" && (
                            <span className="text-sm text-green-600 flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                Saved
                            </span>
                        )}
                        {saveStatus === "error" && (
                            <span className="text-sm text-destructive">
                                Save failed
                            </span>
                        )}
                        {hasUnsavedChanges && saveStatus === "idle" && (
                            <span className="text-sm text-amber-600">
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
                            disabled={isSaving || !hasUnsavedChanges}
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
                    disabled={isSaving || !hasUnsavedChanges}
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
