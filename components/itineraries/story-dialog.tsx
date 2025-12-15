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

interface StoryDialogProps {
    itineraryId: string;
    itineraryTitle: string;
    totalDays: number;
    city?: string;
}

type SlideType = "cover" | "day" | "summary";

interface StorySlide {
    type: SlideType;
    day?: number;
    label: string;
    url: string;
    aiBackground?: string; // base64 AI-generated background
}

export function StoryDialog({ itineraryId, itineraryTitle, totalDays, city }: StoryDialogProps) {
    const [open, setOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [slides, setSlides] = useState<StorySlide[]>([]);
    const [selectedSlide, setSelectedSlide] = useState<number>(0);
    const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
    const [useAiBackgrounds, setUseAiBackgrounds] = useState(false);
    const [aiAvailable, setAiAvailable] = useState(false);
    const [generatingAi, setGeneratingAi] = useState(false);
    const { toast } = useToast();

    // Check if AI image generation is available
    useEffect(() => {
        fetch("/api/images/generate")
            .then((res) => res.json())
            .then((data) => setAiAvailable(data.available))
            .catch(() => setAiAvailable(false));
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

    const generateAiBackground = async (theme: string): Promise<string | undefined> => {
        if (!city) return undefined;
        console.log("[STORY] Generating AI background for:", { city, theme });
        try {
            const requestBody = {
                type: "story_background",
                city,
                theme,
                style: "vibrant",
                cacheKey: `story-${itineraryId}-${theme.replace(/\s+/g, "-").toLowerCase()}`,
            };
            console.log("[STORY] Sending request to /api/images/generate:", requestBody);

            const response = await fetch("/api/images/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            console.log("[STORY] Response status:", response.status);
            const data = await response.json();
            console.log("[STORY] Response data:", { success: data.success, hasImage: !!data.image, error: data.error });

            if (data.success && data.image) {
                return `data:image/png;base64,${data.image}`;
            } else if (data.error) {
                console.error("[STORY] API returned error:", data.error, data.details);
            }
        } catch (error) {
            console.error("[STORY] AI background generation failed:", error);
        }
        return undefined;
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const generatedSlides = generateSlides();

            // If AI backgrounds enabled, generate them
            if (useAiBackgrounds && aiAvailable && city) {
                setGeneratingAi(true);
                toast({
                    title: "Generating AI backgrounds...",
                    description: "This may take a moment",
                });

                // Generate cover background
                const coverBg = await generateAiBackground("iconic landmarks and cityscape");
                if (coverBg) generatedSlides[0].aiBackground = coverBg;

                // Generate summary background
                const summaryBg = await generateAiBackground("beautiful travel scenery");
                if (summaryBg) generatedSlides[generatedSlides.length - 1].aiBackground = summaryBg;

                setGeneratingAi(false);
            }

            setSlides(generatedSlides);
            setSelectedSlide(0);
            toast({
                title: "Stories generated!",
                description: `${generatedSlides.length} story slides ready to download${useAiBackgrounds ? " with AI backgrounds" : ""}`,
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

                        {/* AI Backgrounds Toggle */}
                        {aiAvailable && city && (
                            <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                                <Switch
                                    id="ai-backgrounds"
                                    checked={useAiBackgrounds}
                                    onCheckedChange={setUseAiBackgrounds}
                                />
                                <Label htmlFor="ai-backgrounds" className="flex items-center gap-2 cursor-pointer">
                                    <Sparkles className="h-4 w-4 text-violet-500" />
                                    <span className="text-sm">AI-generated backgrounds</span>
                                </Label>
                            </div>
                        )}

                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {generatingAi ? "Generating AI backgrounds..." : "Generating..."}
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
