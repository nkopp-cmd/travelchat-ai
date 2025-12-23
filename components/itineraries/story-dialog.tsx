"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Camera, Download, Loader2, Instagram, CheckCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

interface DayPlan {
    day: number;
    theme?: string;
    activities?: Array<{ name: string }>;
}

interface StoryDialogProps {
    itineraryId: string;
    itineraryTitle: string;
    totalDays: number;
    city?: string;
    dailyPlans?: DayPlan[];
}

type SlideType = "cover" | "day" | "summary";

interface StorySlide {
    type: SlideType;
    day?: number;
    label: string;
    url: string;
    aiBackground?: string; // base64 AI-generated background
}

export function StoryDialog({ itineraryId, itineraryTitle, totalDays, city, dailyPlans }: StoryDialogProps) {
    const [open, setOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [slides, setSlides] = useState<StorySlide[]>([]);
    const [selectedSlide, setSelectedSlide] = useState<number>(0);
    const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
    const [useAiBackgrounds, setUseAiBackgrounds] = useState(false);
    const [aiAvailable, setAiAvailable] = useState(false);
    const [pexelsAvailable, setPexelsAvailable] = useState(false);
    const [generatingAi, setGeneratingAi] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<string>("");
    const { toast } = useToast();

    // Check available image sources
    useEffect(() => {
        fetch("/api/images/story-background")
            .then((res) => res.json())
            .then((data) => {
                setAiAvailable(data.sources?.ai ?? false);
                setPexelsAvailable(data.sources?.pexels ?? false);
            })
            .catch(() => {
                setAiAvailable(false);
                setPexelsAvailable(false);
            });
    }, []);

    const generateSlides = () => {
        const generatedSlides: StorySlide[] = [
            {
                type: "cover",
                label: "Cover",
                url: `/api/itineraries/${itineraryId}/story?slide=cover`,
            },
        ];

        for (let i = 1; i <= totalDays; i++) {
            generatedSlides.push({
                type: "day",
                day: i,
                label: `Day ${i}`,
                url: `/api/itineraries/${itineraryId}/story?slide=day&day=${i}`,
            });
        }

        generatedSlides.push({
            type: "summary",
            label: "Summary",
            url: `/api/itineraries/${itineraryId}/story?slide=summary`,
        });

        return generatedSlides;
    };

    const generateBackground = async (
        slideType: "cover" | "day" | "summary",
        options: { theme: string; dayNumber?: number; activities?: string[] }
    ): Promise<{ image: string; source: string } | undefined> => {
        if (!city) return undefined;
        console.log("[STORY] Generating background for:", { city, slideType, ...options });

        try {
            // Use the new story-background endpoint with fallback support
            const requestBody = {
                type: slideType,
                city,
                theme: options.theme,
                dayNumber: options.dayNumber,
                activities: options.activities || [],
                preferAI: useAiBackgrounds,
                cacheKey: slideType === "day"
                    ? `${itineraryId}-day-${options.dayNumber}`
                    : `${itineraryId}-${slideType}`,
            };

            console.log("[STORY] Sending request to /api/images/story-background:", requestBody);

            const response = await fetch("/api/images/story-background", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            console.log("[STORY] Response status:", response.status);
            const data = await response.json();
            console.log("[STORY] Response data:", {
                success: data.success,
                hasImage: !!data.image,
                source: data.source,
                error: data.error,
            });

            if (data.success && data.image) {
                return { image: data.image, source: data.source };
            } else if (data.error) {
                console.error("[STORY] API returned error:", data.error);
            }
        } catch (error) {
            console.error("[STORY] Background generation failed:", error);
        }
        return undefined;
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        const imageSources: string[] = [];

        try {
            // Generate backgrounds (AI, Pexels, or Unsplash depending on availability)
            if (city) {
                setGeneratingAi(true);

                const backgrounds: Record<string, string> = {};
                const totalSlides = 2 + totalDays; // cover + days + summary

                // Generate cover background
                setGenerationProgress(`Generating cover (1/${totalSlides})...`);
                toast({
                    title: "Generating backgrounds...",
                    description: `Creating cover image (1/${totalSlides})`,
                });

                const coverResult = await generateBackground("cover", {
                    theme: "iconic landmarks and stunning cityscape view",
                });
                if (coverResult) {
                    backgrounds.cover = coverResult.image;
                    imageSources.push(coverResult.source);
                    console.log("[STORY] Cover background generated from:", coverResult.source);
                }

                // Generate day backgrounds (in parallel batches of 2 to avoid rate limits)
                for (let i = 0; i < totalDays; i += 2) {
                    const batch = [];

                    for (let j = i; j < Math.min(i + 2, totalDays); j++) {
                        const dayNumber = j + 1;
                        const dayPlan = dailyPlans?.[j];
                        const theme = dayPlan?.theme || `Day ${dayNumber} adventures`;
                        const activities = dayPlan?.activities?.map(a => a.name) || [];

                        setGenerationProgress(`Generating Day ${dayNumber} (${j + 2}/${totalSlides})...`);

                        batch.push(
                            generateBackground("day", {
                                theme,
                                dayNumber,
                                activities,
                            }).then(result => {
                                if (result) {
                                    backgrounds[`day${dayNumber}`] = result.image;
                                    imageSources.push(result.source);
                                    console.log(`[STORY] Day ${dayNumber} background from:`, result.source);
                                }
                            })
                        );
                    }

                    await Promise.all(batch);
                }

                // Generate summary background
                setGenerationProgress(`Generating summary (${totalSlides}/${totalSlides})...`);
                const summaryResult = await generateBackground("summary", {
                    theme: "beautiful panoramic travel scenery at sunset",
                });
                if (summaryResult) {
                    backgrounds.summary = summaryResult.image;
                    imageSources.push(summaryResult.source);
                    console.log("[STORY] Summary background from:", summaryResult.source);
                }

                // Save backgrounds to database (split into chunks to avoid size limits)
                setGenerationProgress("Saving backgrounds...");

                // Save cover and summary first
                if (backgrounds.cover) {
                    console.log("[STORY] Saving cover background to database...");
                    await fetch(`/api/itineraries/${itineraryId}/ai-backgrounds`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ cover: backgrounds.cover }),
                    });
                }

                if (backgrounds.summary) {
                    console.log("[STORY] Saving summary background to database...");
                    await fetch(`/api/itineraries/${itineraryId}/ai-backgrounds`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ summary: backgrounds.summary }),
                    });
                }

                // Save day backgrounds (one at a time to avoid payload size limits)
                for (let i = 1; i <= totalDays; i++) {
                    const dayKey = `day${i}`;
                    if (backgrounds[dayKey]) {
                        console.log(`[STORY] Saving ${dayKey} background to database...`);
                        await fetch(`/api/itineraries/${itineraryId}/ai-backgrounds`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ [dayKey]: backgrounds[dayKey] }),
                        });
                    }
                }

                setGeneratingAi(false);
                setGenerationProgress("");
            }

            // Generate slides (backgrounds will be fetched from database by story API)
            const generatedSlides = generateSlides();
            console.log("[STORY] Generated slides:", generatedSlides.map(s => ({ label: s.label, url: s.url })));

            setSlides(generatedSlides);
            setSelectedSlide(0);

            // Show source summary in toast
            const uniqueSources = [...new Set(imageSources)];
            const sourceText = uniqueSources.length > 0
                ? ` (${uniqueSources.join(", ")})`
                : "";

            toast({
                title: "Stories generated!",
                description: `${generatedSlides.length} story slides ready${sourceText}`,
            });
        } catch (error) {
            console.error("Error generating stories:", error);
            toast({
                title: "Generation failed",
                description: "Please try again",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
            setGeneratingAi(false);
            setGenerationProgress("");
        }
    };

    const handleDownload = async (index: number) => {
        const slide = slides[index];
        if (!slide) return;

        setDownloadingIndex(index);
        try {
            const response = await fetch(slide.url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `localley-story-${slide.label.toLowerCase().replace(/\s+/g, "-")}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast({
                title: "Downloaded!",
                description: `${slide.label} saved to your device`,
            });
        } catch (error) {
            console.error("Download error:", error);
            toast({
                title: "Download failed",
                description: "Please try again",
                variant: "destructive",
            });
        } finally {
            setDownloadingIndex(null);
        }
    };

    const handleDownloadAll = async () => {
        for (let i = 0; i < slides.length; i++) {
            await handleDownload(i);
            // Small delay between downloads
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Instagram className="h-4 w-4" />
                    Stories
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Camera className="h-5 w-5" />
                        Generate Story Slides
                    </DialogTitle>
                    <DialogDescription>
                        Create Instagram/TikTok-ready story slides for "{itineraryTitle}"
                    </DialogDescription>
                </DialogHeader>

                {slides.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-48 h-80 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-6 shadow-xl">
                            <div className="text-white text-center px-4">
                                <Instagram className="h-12 w-12 mx-auto mb-4 opacity-80" />
                                <p className="text-sm opacity-80">1080 × 1920</p>
                                <p className="text-xs opacity-60">Story Format</p>
                            </div>
                        </div>
                        <p className="text-muted-foreground text-center mb-4 max-w-sm">
                            Generate beautiful story slides optimized for Instagram and TikTok
                        </p>

                        {/* AI Backgrounds Toggle (only show if AI is available) */}
                        {aiAvailable && city && (
                            <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                                <Switch
                                    id="ai-backgrounds"
                                    checked={useAiBackgrounds}
                                    onCheckedChange={setUseAiBackgrounds}
                                />
                                <Label htmlFor="ai-backgrounds" className="flex items-center gap-2 cursor-pointer">
                                    <Sparkles className="h-4 w-4 text-violet-500" />
                                    <span className="text-sm">Use AI-generated backgrounds (Pro)</span>
                                </Label>
                            </div>
                        )}

                        {/* Image source info */}
                        {city && (
                            <p className="text-xs text-muted-foreground text-center mb-4">
                                {useAiBackgrounds && aiAvailable
                                    ? "Using AI-generated images"
                                    : pexelsAvailable
                                        ? "Using high-quality photos from Pexels"
                                        : "Using photos from Unsplash"}
                            </p>
                        )}

                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {generationProgress || (generatingAi ? "Generating AI backgrounds..." : "Generating...")}
                                </>
                            ) : (
                                <>
                                    {useAiBackgrounds ? (
                                        <Sparkles className="mr-2 h-4 w-4" />
                                    ) : (
                                        <Camera className="mr-2 h-4 w-4" />
                                    )}
                                    Generate {totalDays + 2} Slides
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 flex-1 overflow-hidden">
                        {/* Preview */}
                        <div className="flex gap-4 flex-1 min-h-0">
                            {/* Slide selector */}
                            <div className="flex flex-col gap-2 overflow-y-auto pr-2 w-24 flex-shrink-0">
                                {slides.map((slide, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedSlide(index)}
                                        className={`relative w-20 h-36 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                                            selectedSlide === index
                                                ? "border-violet-500 ring-2 ring-violet-500/20"
                                                : "border-border hover:border-violet-300"
                                        }`}
                                    >
                                        <Image
                                            src={slide.url}
                                            alt={slide.label}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] py-1 text-center">
                                            {slide.label}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Main preview */}
                            <div className="flex-1 flex flex-col items-center">
                                <div className="relative w-full max-w-[240px] aspect-[9/16] rounded-2xl overflow-hidden shadow-xl border border-border">
                                    <Image
                                        src={slides[selectedSlide]?.url || ""}
                                        alt={slides[selectedSlide]?.label || ""}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                </div>
                                <p className="text-sm text-muted-foreground mt-3">
                                    {slides[selectedSlide]?.label} • 1080 × 1920
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 justify-end border-t pt-4">
                            <Button
                                variant="outline"
                                onClick={() => handleDownload(selectedSlide)}
                                disabled={downloadingIndex !== null}
                            >
                                {downloadingIndex === selectedSlide ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                )}
                                Download This
                            </Button>
                            <Button
                                onClick={handleDownloadAll}
                                disabled={downloadingIndex !== null}
                                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                            >
                                {downloadingIndex !== null ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Downloading...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Download All ({slides.length})
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
