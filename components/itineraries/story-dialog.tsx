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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Camera, Download, Loader2, Instagram, CheckCircle, Sparkles, Archive, Share2, Lock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

interface ModelOption {
    provider: string;
    label: string;
    description: string;
    credits: number;
    available: boolean;
    tierLocked: boolean;
}

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

/** Generate a descriptive filename for a story slide */
function getSlideFilename(slide: StorySlide, city?: string, totalDays?: number): string {
    const citySlug = city
        ? city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")
        : "trip";
    const daysStr = totalDays ? `${totalDays}days` : "";
    const slideSlug = slide.label.toLowerCase().replace(/\s+/g, "-");
    return `localley-${citySlug}-${daysStr}-${slideSlug}.png`;
}

/** Direct download via <a download> — saves to Downloads/Files folder */
function downloadViaAnchor(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

/** Open native share sheet (mobile only) */
async function shareViaShareSheet(blob: Blob, filename: string): Promise<boolean> {
    const file = new File([blob], filename, { type: "image/png" });
    if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            return true;
        } catch (err) {
            if ((err as Error).name === "AbortError") return true; // User cancelled
        }
    }
    return false;
}

/**
 * On mobile: open share sheet (lets user save directly to Photos).
 * On desktop (or if share unavailable): standard <a download>.
 */
async function shareOrDownload(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
    const file = new File([blob], filename, { type: "image/png" });
    if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            return "shared";
        } catch (err) {
            if ((err as Error).name === "AbortError") return "shared"; // User dismissed
        }
    }
    downloadViaAnchor(blob, filename);
    return "downloaded";
}

export function StoryDialog({ itineraryId, itineraryTitle, totalDays, city, dailyPlans }: StoryDialogProps) {
    const [open, setOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [slides, setSlides] = useState<StorySlide[]>([]);
    const [selectedSlide, setSelectedSlide] = useState<number>(0);
    const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
    const [useAiBackgrounds, setUseAiBackgrounds] = useState(false);
    const [aiAvailable, setAiAvailable] = useState(false);
    const [tripAdvisorAvailable, setTripAdvisorAvailable] = useState(false);
    const [pexelsAvailable, setPexelsAvailable] = useState(false);
    const [generatingAi, setGeneratingAi] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<string>("");
    const [isPaidUser, setIsPaidUser] = useState(false);
    const [aiQuota, setAiQuota] = useState<{ used: number; limit: number } | null>(null);
    const [brokenSlides, setBrokenSlides] = useState<Set<number>>(new Set());
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
    const [savedSlides, setSavedSlides] = useState<Record<string, string> | null>(null);
    const [usedProviders, setUsedProviders] = useState<string[]>([]);
    const { toast } = useToast();

    const handleImageError = (index: number) => {
        setBrokenSlides(prev => new Set(prev).add(index));
    };

    // Check available image sources, models, and user tier
    useEffect(() => {
        fetch("/api/images/story-background")
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => {
                setAiAvailable(data.sources?.ai ?? false);
                setTripAdvisorAvailable(data.sources?.tripadvisor ?? false);
                setPexelsAvailable(data.sources?.pexels ?? false);
                // Load model options from the API
                if (data.models && Array.isArray(data.models)) {
                    setAvailableModels(data.models);
                    // Auto-select the first available model
                    const firstAvailable = data.models.find((m: ModelOption) => m.available);
                    if (firstAvailable) {
                        setSelectedModel(firstAvailable.provider);
                    }
                }
            })
            .catch((err) => {
                console.error("[STORY_DIALOG] Failed to check sources:", err);
                setAiAvailable(false);
                setTripAdvisorAvailable(false);
                setPexelsAvailable(false);
            });

        fetch("/api/user/tier")
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => {
                const tier = data.tier || "free";
                setIsPaidUser(tier === "pro" || tier === "premium");
            })
            .catch((err) => {
                console.error("[STORY_DIALOG] Failed to check tier:", err);
                setIsPaidUser(false);
            });

        fetch("/api/subscription/status")
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => {
                if (data.limits && data.usage) {
                    setAiQuota({
                        used: data.usage.aiImagesThisMonth || 0,
                        limit: data.limits.aiImagesPerMonth || 0,
                    });
                }
            })
            .catch(() => setAiQuota(null));
    }, []);

    // Auto-enable AI backgrounds when available and user has access (with quota remaining)
    useEffect(() => {
        if (aiAvailable && isPaidUser) {
            // Disable if quota exhausted
            if (aiQuota && aiQuota.limit > 0 && aiQuota.used >= aiQuota.limit) {
                setUseAiBackgrounds(false);
            } else {
                setUseAiBackgrounds(true);
            }
        }
    }, [aiAvailable, isPaidUser, aiQuota]);

    const generateSlides = () => {
        // Add paid=true query param for paid users to remove CTA
        const paidParam = isPaidUser ? "&paid=true" : "";
        // Cache-buster prevents browsers from showing stale gradient PNGs
        const cacheBust = `&_t=${Date.now()}`;

        const generatedSlides: StorySlide[] = [
            {
                type: "cover",
                label: "Cover",
                url: `/api/itineraries/${itineraryId}/story?slide=cover${paidParam}${cacheBust}`,
            },
        ];

        for (let i = 1; i <= totalDays; i++) {
            generatedSlides.push({
                type: "day",
                day: i,
                label: `Day ${i}`,
                url: `/api/itineraries/${itineraryId}/story?slide=day&day=${i}${paidParam}${cacheBust}`,
            });
        }

        generatedSlides.push({
            type: "summary",
            label: "Summary",
            url: `/api/itineraries/${itineraryId}/story?slide=summary${paidParam}${cacheBust}`,
        });

        return generatedSlides;
    };

    const generateBackground = async (
        slideType: "cover" | "day" | "summary",
        options: { theme: string; dayNumber?: number; activities?: string[]; excludeUrls?: string[]; slotIndex?: number }
    ): Promise<{ image: string; source: string; provider?: string } | undefined> => {
        if (!city) return undefined;
        console.log("[STORY] Generating background for:", { city, slideType, ...options });

        try {
            const requestBody = {
                type: slideType,
                city,
                theme: options.theme,
                dayNumber: options.dayNumber,
                activities: options.activities || [],
                preferAI: useAiBackgrounds,
                provider: useAiBackgrounds && selectedModel ? selectedModel : undefined,
                cacheKey: slideType === "day"
                    ? `${itineraryId}-day-${options.dayNumber}`
                    : `${itineraryId}-${slideType}`,
                excludeUrls: options.excludeUrls || [],
                slotIndex: options.slotIndex,
            };

            const response = await fetch("/api/images/story-background", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                console.error("[STORY] Background API returned HTTP", response.status);
                return undefined;
            }

            const data = await response.json();
            console.log("[STORY] Response:", {
                success: data.success,
                hasImage: !!data.image,
                source: data.source,
                provider: data.provider,
                failedProviders: data.failedProviders,
                error: data.error,
            });

            if (data.success && data.image) {
                // Track which AI provider was actually used
                if (data.provider) {
                    setUsedProviders(prev => {
                        const next = [...new Set([...prev, data.provider])];
                        return next;
                    });
                }
                return { image: data.image, source: data.source, provider: data.provider };
            } else if (data.error) {
                console.error("[STORY] API returned error:", data.error, data.failedProviders);
                // Surface AI failures to the user
                if (data.failedProviders?.length > 0) {
                    const providerErrors = data.failedProviders
                        .map((fp: { provider: string; error: string }) => `${fp.provider}: ${fp.error}`)
                        .join(", ");
                    console.error("[STORY] Provider failures:", providerErrors);
                }
            }
        } catch (error) {
            console.error("[STORY] Background generation failed:", error);
        }
        return undefined;
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        setBrokenSlides(new Set());
        setSlides([]); // Clear stale slides from previous generation
        setUsedProviders([]); // Reset provider tracking
        const imageSources: string[] = [];

        try {
            if (city) {
                setGeneratingAi(true);

                const backgrounds: Record<string, string> = {};
                const totalSlides = 2 + totalDays; // cover + days + summary
                let completedCount = 0;
                const usedUrls: string[] = [];

                setGenerationProgress(`Generating backgrounds (0/${totalSlides})...`);
                toast({
                    title: "Generating backgrounds...",
                    description: `Creating ${totalSlides} images`,
                });

                // --- Phase 1: Generate cover first (await) so we get its URL for dedup ---
                const coverResult = await generateBackground("cover", {
                    theme: "iconic landmarks and stunning cityscape view",
                    excludeUrls: [],
                    slotIndex: 0,
                });
                completedCount++;
                const coverProvider = coverResult?.provider;
                const providerHint = coverProvider ? ` via ${coverProvider === "flux" ? "FLUX" : coverProvider === "seedream" ? "Seedream" : coverProvider === "gemini" ? "Gemini" : coverProvider}` : "";
                setGenerationProgress(`Generated ${completedCount}/${totalSlides}${providerHint}...`);
                if (coverResult) {
                    backgrounds.cover = coverResult.image;
                    usedUrls.push(coverResult.image);
                    imageSources.push(coverResult.source);
                }

                // --- Phase 2: Generate all days + summary in parallel, excluding cover URL ---
                const phase2Promises: Promise<void>[] = [];

                for (let j = 0; j < totalDays; j++) {
                    const dayNumber = j + 1;
                    const dayPlan = dailyPlans?.[j];
                    const theme = dayPlan?.theme || `Day ${dayNumber} adventures`;
                    const activities = dayPlan?.activities?.map(a => a.name) || [];

                    phase2Promises.push(
                        generateBackground("day", {
                            theme,
                            dayNumber,
                            activities,
                            excludeUrls: [...usedUrls],
                            slotIndex: dayNumber,
                        }).then(result => {
                            completedCount++;
                            const hint = result?.provider ? ` via ${result.provider === "flux" ? "FLUX" : result.provider === "seedream" ? "Seedream" : result.provider === "gemini" ? "Gemini" : result.provider}` : "";
                            setGenerationProgress(`Generated ${completedCount}/${totalSlides}${hint || providerHint}...`);
                            if (result) {
                                backgrounds[`day${dayNumber}`] = result.image;
                                usedUrls.push(result.image);
                                imageSources.push(result.source);
                            }
                        })
                    );
                }

                phase2Promises.push(
                    generateBackground("summary", {
                        theme: "beautiful panoramic travel scenery at sunset",
                        excludeUrls: [...usedUrls],
                        slotIndex: totalDays + 1,
                    }).then(result => {
                        completedCount++;
                        const hint = result?.provider ? ` via ${result.provider === "flux" ? "FLUX" : result.provider === "seedream" ? "Seedream" : result.provider === "gemini" ? "Gemini" : result.provider}` : "";
                        setGenerationProgress(`Generated ${completedCount}/${totalSlides}${hint || providerHint}...`);
                        if (result) {
                            backgrounds.summary = result.image;
                            usedUrls.push(result.image);
                            imageSources.push(result.source);
                        }
                    })
                );

                await Promise.allSettled(phase2Promises);

                // --- Save backgrounds to database ---
                setGenerationProgress("Saving backgrounds...");
                let saveFailed = false;

                const bgToSave: Record<string, string> = {};
                if (backgrounds.cover) bgToSave.cover = backgrounds.cover;
                if (backgrounds.summary) bgToSave.summary = backgrounds.summary;
                for (let i = 1; i <= totalDays; i++) {
                    const dayKey = `day${i}`;
                    if (backgrounds[dayKey]) bgToSave[dayKey] = backgrounds[dayKey];
                }

                if (Object.keys(bgToSave).length > 0) {
                    console.log("[STORY] Saving backgrounds to database:", Object.keys(bgToSave));
                    try {
                        const saveRes = await fetch(`/api/itineraries/${itineraryId}/ai-backgrounds`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(bgToSave),
                        });
                        if (!saveRes.ok) {
                            const errText = await saveRes.text().catch(() => "unknown");
                            console.error("[STORY] Failed to save backgrounds:", saveRes.status, errText);
                            saveFailed = true;
                        } else {
                            console.log("[STORY] Backgrounds saved successfully");
                        }
                    } catch (err) {
                        console.error("[STORY] Save request failed:", err);
                        saveFailed = true;
                    }
                }

                setGeneratingAi(false);

                // Generate slides (so user can see them while save happens)
                const generatedSlides = generateSlides();
                setSlides(generatedSlides);
                setSelectedSlide(0);

                // Persist rendered PNGs to Supabase Storage for sharing
                setGenerationProgress("Saving slides for sharing...");
                try {
                    const saveRes = await fetch(`/api/itineraries/${itineraryId}/story/save`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ totalDays, paid: isPaidUser }),
                    });
                    if (saveRes.ok) {
                        const saveData = await saveRes.json();
                        setSavedSlides(saveData.slides);
                        console.log("[STORY] Slides saved for sharing:", Object.keys(saveData.slides || {}));

                        // Send email notification after slides are persisted
                        if (isPaidUser) {
                            fetch(`/api/itineraries/${itineraryId}/notify-story-ready`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ city }),
                            }).catch(err => console.log("[STORY] Email notification skipped:", err));
                        }
                    } else {
                        console.error("[STORY] Save failed:", saveRes.status);
                    }
                } catch (err) {
                    console.error("[STORY] Save request failed:", err);
                }

                setGenerationProgress("");

                // Show accurate toast based on actual results
                const bgCount = Object.keys(bgToSave).length;
                const uniqueSources = [...new Set(imageSources)];
                // Build a descriptive source text: prefer showing provider name (e.g. "FLUX") over generic "ai"
                const providerLabel = usedProviders.length > 0
                    ? usedProviders.map(p => p === "flux" ? "FLUX" : p === "seedream" ? "Seedream" : p === "gemini" ? "Gemini" : p).join(", ")
                    : null;
                const sourceDisplay = providerLabel
                    ? providerLabel + (uniqueSources.includes("tripadvisor") || uniqueSources.includes("pexels")
                        ? ` + ${uniqueSources.filter(s => s !== "ai").join(", ")}`
                        : "")
                    : uniqueSources.length > 0 ? uniqueSources.join(", ") : "";
                const sourceText = sourceDisplay ? ` (${sourceDisplay})` : "";

                if (bgCount === 0) {
                    toast({
                        title: "Stories ready (gradient fallback)",
                        description: "Background generation failed — slides use branded gradients",
                        variant: "destructive",
                    });
                } else if (saveFailed) {
                    toast({
                        title: "Stories generated",
                        description: `${bgCount} backgrounds created but failed to save${sourceText}`,
                        variant: "destructive",
                    });
                } else {
                    toast({
                        title: "Stories generated!",
                        description: `${generatedSlides.length} slides ready${sourceText}`,
                    });
                }
            } else {
                // No city — generate slides with gradient fallback
                const generatedSlides = generateSlides();
                setSlides(generatedSlides);
                setSelectedSlide(0);
                toast({
                    title: "Stories generated!",
                    description: `${generatedSlides.length} slides ready (gradient backgrounds)`,
                });
            }
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

    // Detect if Web Share API with files is available (mobile)
    const isMobileShare = typeof navigator !== "undefined" && !!navigator.canShare;

    const handleDownload = async (index: number) => {
        const slide = slides[index];
        if (!slide) return;

        setDownloadingIndex(index);
        try {
            // Prefer saved Supabase CDN URLs (faster, no re-render)
            const slideKey = slide.type === "day" ? `day${slide.day}` : slide.type;
            const downloadUrl = savedSlides?.[slideKey] || slide.url;

            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.startsWith("image/")) {
                throw new Error(`Expected image, got ${contentType}`);
            }
            const blob = await response.blob();
            const filename = getSlideFilename(slide, city, totalDays);
            const result = await shareOrDownload(blob, filename);

            if (result === "shared") {
                toast({
                    title: "Share sheet opened",
                    description: "Choose 'Save Image' to save to your photos",
                });
            } else {
                toast({
                    title: "Image saved!",
                    description: "Check your Downloads folder",
                });
            }
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

    const handleShare = async (index: number) => {
        const slide = slides[index];
        if (!slide) return;

        setDownloadingIndex(index);
        try {
            const slideKey = slide.type === "day" ? `day${slide.day}` : slide.type;
            const downloadUrl = savedSlides?.[slideKey] || slide.url;

            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const filename = getSlideFilename(slide, city, totalDays);
            const shared = await shareViaShareSheet(blob, filename);

            if (shared) {
                toast({ title: "Shared!", description: `${slide.label} sent to share sheet` });
            } else {
                // Fallback to download if share not available
                downloadViaAnchor(blob, filename);
                toast({ title: "Image saved!", description: "Check your Downloads folder" });
            }
        } catch (error) {
            console.error("Share error:", error);
            toast({ title: "Share failed", description: "Please try again", variant: "destructive" });
        } finally {
            setDownloadingIndex(null);
        }
    };

    const handleDownloadAll = async () => {
        if (isMobileShare) {
            // On mobile, individual share sheets per slide is terrible UX — use ZIP instead
            await handleDownloadZip();
            return;
        }
        for (let i = 0; i < slides.length; i++) {
            await handleDownload(i);
            // Small delay between downloads
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    };

    const handleDownloadZip = async () => {
        setDownloadingIndex(-1); // -1 indicates "zipping all"
        try {
            const JSZip = (await import("jszip")).default;
            const zip = new JSZip();

            for (let i = 0; i < slides.length; i++) {
                setGenerationProgress(`Preparing ${i + 1}/${slides.length}...`);
                // Prefer saved Supabase CDN URLs (faster, no re-render)
                const slide = slides[i];
                const slideKey = slide.type === "day" ? `day${slide.day}` : slide.type;
                const downloadUrl = savedSlides?.[slideKey] || slide.url;
                const response = await fetch(downloadUrl);
                if (!response.ok) {
                    console.error(`[STORY] ZIP: Failed to fetch slide ${i}:`, response.status);
                    continue; // Skip failed slides instead of breaking entire ZIP
                }
                const blob = await response.blob();
                const filename = getSlideFilename(slide, city, totalDays);
                zip.file(filename, blob);
            }

            setGenerationProgress("Creating ZIP...");
            const zipBlob = await zip.generateAsync({ type: "blob" });

            const citySlug = city?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "trip";
            const zipFilename = `localley-${citySlug}-${totalDays}days-stories.zip`;

            // ZIP always uses <a download> (no benefit from share sheet)
            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = zipFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast({
                title: "Downloaded!",
                description: `All ${slides.length} slides saved as ZIP`,
            });
        } catch (error) {
            console.error("ZIP download error:", error);
            toast({
                title: "Download failed",
                description: "Please try again",
                variant: "destructive",
            });
        } finally {
            setDownloadingIndex(null);
            setGenerationProgress("");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25 border-0">
                    <Sparkles className="h-4 w-4" />
                    <Instagram className="h-4 w-4" />
                    Stories
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Camera className="h-5 w-5" />
                        Generate Story Slides
                    </DialogTitle>
                    <DialogDescription>
                        Create Instagram/TikTok-ready story slides for &quot;{itineraryTitle}&quot;
                    </DialogDescription>
                </DialogHeader>

                {slides.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 sm:py-12">
                        <div className="w-32 h-56 sm:w-48 sm:h-80 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 sm:mb-6 shadow-xl">
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
                            <div className="flex flex-col items-center gap-2 mb-6">
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                                    <Switch
                                        id="ai-backgrounds"
                                        checked={useAiBackgrounds}
                                        onCheckedChange={setUseAiBackgrounds}
                                        disabled={aiQuota !== null && aiQuota.limit > 0 && aiQuota.used >= aiQuota.limit}
                                    />
                                    <Label htmlFor="ai-backgrounds" className="flex items-center gap-2 cursor-pointer">
                                        <Sparkles className="h-4 w-4 text-violet-500" />
                                        <span className="text-sm">Use AI-generated backgrounds (Pro)</span>
                                    </Label>
                                </div>

                                {/* Model picker (shown when AI toggle is ON) */}
                                {useAiBackgrounds && availableModels.length > 0 && (
                                    <div className="w-full max-w-xs mt-2">
                                        <RadioGroup
                                            value={selectedModel || ""}
                                            onValueChange={setSelectedModel}
                                            className="gap-2"
                                        >
                                            {availableModels.map((model) => (
                                                <label
                                                    key={model.provider}
                                                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                                                        selectedModel === model.provider
                                                            ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40"
                                                            : "border-border hover:border-violet-200"
                                                    } ${!model.available ? "opacity-50 cursor-not-allowed" : ""}`}
                                                >
                                                    <RadioGroupItem
                                                        value={model.provider}
                                                        disabled={!model.available}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-sm font-medium">{model.label}</span>
                                                            {model.tierLocked && (
                                                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                                                    <Lock className="h-2.5 w-2.5" />
                                                                    Premium
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">{model.description}</p>
                                                    </div>
                                                    <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 whitespace-nowrap">
                                                        {model.credits} {model.credits === 1 ? "credit" : "credits"}
                                                    </span>
                                                </label>
                                            ))}
                                        </RadioGroup>
                                        {/* Credit cost summary */}
                                        {selectedModel && (
                                            <p className="text-xs text-muted-foreground text-center mt-2">
                                                This story will use ~{(availableModels.find(m => m.provider === selectedModel)?.credits || 1) * (totalDays + 2)} credits ({totalDays + 2} slides)
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Quota display */}
                                {aiQuota && isPaidUser && (
                                    <p className="text-xs text-muted-foreground">
                                        {aiQuota.limit - aiQuota.used > 0
                                            ? `${aiQuota.limit - aiQuota.used} credits remaining this month`
                                            : "Credit quota reached — using photo sources instead"}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Image source info */}
                        {city && (
                            <>
                                <p className="text-xs text-muted-foreground text-center mb-2">
                                    {useAiBackgrounds && aiAvailable
                                        ? "Using AI-generated images"
                                        : tripAdvisorAvailable
                                            ? "Using real location photos from TripAdvisor"
                                            : pexelsAvailable
                                                ? "Using high-quality photos from Pexels"
                                                : "Gradient backgrounds (no photo API configured)"}
                                </p>
                            </>
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
                                        {brokenSlides.has(index) ? (
                                            <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                                                <span className="text-white text-xs text-center px-1">{slide.label}</span>
                                            </div>
                                        ) : (
                                            <Image
                                                src={slide.url}
                                                alt={slide.label}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                                onError={() => handleImageError(index)}
                                            />
                                        )}
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] py-1 text-center">
                                            {slide.label}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Main preview */}
                            <div className="flex-1 flex flex-col items-center">
                                <div className="relative w-full max-w-[240px] aspect-[9/16] rounded-2xl overflow-hidden shadow-xl border border-border">
                                    {brokenSlides.has(selectedSlide) ? (
                                        <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center p-4">
                                            <span className="text-white text-lg font-bold text-center">{slides[selectedSlide]?.label || "Slide"}</span>
                                        </div>
                                    ) : (
                                        <Image
                                            src={slides[selectedSlide]?.url || ""}
                                            alt={slides[selectedSlide]?.label || ""}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                            onError={() => handleImageError(selectedSlide)}
                                        />
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-3">
                                    {slides[selectedSlide]?.label} • 1080 × 1920
                                </p>
                                {usedProviders.length > 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Backgrounds by {usedProviders.map(p => p === "flux" ? "FLUX" : p === "seedream" ? "Seedream" : p === "gemini" ? "Gemini" : p).join(", ")}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 justify-end border-t pt-4">
                            <Button
                                variant="outline"
                                onClick={() => handleDownload(selectedSlide)}
                                disabled={downloadingIndex !== null}
                            >
                                {downloadingIndex === selectedSlide ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : isMobileShare ? (
                                    <Share2 className="mr-2 h-4 w-4" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                )}
                                {isMobileShare ? "Save to Photos" : "Save Image"}
                            </Button>
                            {isMobileShare && (
                                <Button
                                    variant="outline"
                                    onClick={() => handleShare(selectedSlide)}
                                    disabled={downloadingIndex !== null}
                                >
                                    <Share2 className="mr-2 h-4 w-4" />
                                    Share
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={handleDownloadAll}
                                disabled={downloadingIndex !== null}
                            >
                                {downloadingIndex !== null && downloadingIndex !== -1 ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        {isMobileShare ? `Save All as ZIP (${slides.length})` : `Save All (${slides.length})`}
                                    </>
                                )}
                            </Button>
                            <Button
                                onClick={handleDownloadZip}
                                disabled={downloadingIndex !== null}
                                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                            >
                                {downloadingIndex === -1 ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {generationProgress || "Creating ZIP..."}
                                    </>
                                ) : (
                                    <>
                                        <Archive className="mr-2 h-4 w-4" />
                                        Save as ZIP
                                    </>
                                )}
                            </Button>
                            {savedSlides && (
                                <Link href={`/itineraries/${itineraryId}/stories`} target="_blank">
                                    <Button variant="outline" className="gap-2">
                                        <ExternalLink className="h-4 w-4" />
                                        Shareable Link
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
