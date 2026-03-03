"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Copy, Check, Share2, Archive, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

interface Slide {
    key: string;
    label: string;
    url: string;
}

interface StoriesClientProps {
    slides: Slide[];
    city: string;
    days: number;
    itineraryId: string;
}

function getFilename(slide: Slide, city: string, days: number): string {
    const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
    const slideSlug = slide.label.toLowerCase().replace(/\s+/g, "-");
    return `localley-${citySlug}-${days}days-${slideSlug}.png`;
}

async function shareOrDownload(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
    const file = new File([blob], filename, { type: "image/png" });
    if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            return "shared";
        } catch (err) {
            if ((err as Error).name === "AbortError") return "shared";
        }
    }
    // Fallback: standard download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return "downloaded";
}

export function StoriesClient({ slides, city, days, itineraryId }: StoriesClientProps) {
    const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
    const [zipping, setZipping] = useState(false);
    const [copied, setCopied] = useState(false);
    const [previewSlide, setPreviewSlide] = useState<Slide | null>(null);
    const { toast } = useToast();

    const isMobileShare = typeof navigator !== "undefined" && !!navigator.canShare;

    const handleDownload = async (slide: Slide) => {
        setDownloadingKey(slide.key);
        try {
            const res = await fetch(slide.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const filename = getFilename(slide, city, days);
            const result = await shareOrDownload(blob, filename);

            if (result === "shared") {
                toast({ title: "Share sheet opened", description: "Choose 'Save Image' to save to your photos" });
            } else {
                toast({ title: "Downloaded!", description: `${slide.label} saved to your device` });
            }
        } catch (error) {
            console.error("Download error:", error);
            toast({ title: "Download failed", description: "Please try again", variant: "destructive" });
        } finally {
            setDownloadingKey(null);
        }
    };

    const handleDownloadZip = async () => {
        setZipping(true);
        try {
            const JSZip = (await import("jszip")).default;
            const zip = new JSZip();

            for (const slide of slides) {
                const res = await fetch(slide.url);
                if (!res.ok) continue;
                const blob = await res.blob();
                zip.file(getFilename(slide, city, days), blob);
            }

            const zipBlob = await zip.generateAsync({ type: "blob" });
            const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const zipFilename = `localley-${citySlug}-${days}days-stories.zip`;

            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = zipFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast({ title: "Downloaded!", description: `All ${slides.length} slides saved as ZIP` });
        } catch (error) {
            console.error("ZIP error:", error);
            toast({ title: "Download failed", description: "Please try again", variant: "destructive" });
        } finally {
            setZipping(false);
        }
    };

    const handleCopyLink = async () => {
        const url = `${window.location.origin}/itineraries/${itineraryId}/stories`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast({ title: "Link copied!", description: "Share this link with friends" });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast({ title: "Failed to copy", description: "Please copy the URL manually", variant: "destructive" });
        }
    };

    const handleShareLink = async () => {
        const url = `${window.location.origin}/itineraries/${itineraryId}/stories`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${city} Travel Stories`,
                    text: `Check out my ${days}-day ${city} travel story slides!`,
                    url,
                });
            } catch (err) {
                if ((err as Error).name !== "AbortError") {
                    handleCopyLink();
                }
            }
        } else {
            handleCopyLink();
        }
    };

    return (
        <div className="max-w-5xl mx-auto px-4 pb-12">
            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-6">
                <Button onClick={handleDownloadZip} disabled={zipping} className="gap-2">
                    <Archive className="h-4 w-4" />
                    {zipping ? "Creating ZIP..." : `Download All (${slides.length})`}
                </Button>
                <Button variant="outline" onClick={handleShareLink} className="gap-2">
                    <Share2 className="h-4 w-4" />
                    Share
                </Button>
                <Button variant="outline" onClick={handleCopyLink} className="gap-2">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied!" : "Copy Link"}
                </Button>
            </div>

            {/* Slide grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {slides.map((slide) => (
                    <div key={slide.key} className="group relative">
                        {/* Thumbnail */}
                        <button
                            onClick={() => setPreviewSlide(slide)}
                            className="block w-full aspect-[9/16] relative rounded-xl overflow-hidden border border-border shadow-sm hover:shadow-lg transition-shadow cursor-pointer"
                        >
                            <Image
                                src={slide.url}
                                alt={slide.label}
                                fill
                                className="object-cover"
                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                            />
                        </button>

                        {/* Label + download */}
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-sm font-medium">{slide.label}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(slide)}
                                disabled={downloadingKey === slide.key}
                                className="h-8 w-8 p-0"
                            >
                                <Download className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tip */}
            <div className="mt-8 text-center text-sm text-muted-foreground">
                <p>
                    {isMobileShare
                        ? "Tap a slide to preview, then download or share directly to Instagram & TikTok."
                        : "Click a slide to preview full size. Download individually or grab them all as a ZIP."}
                </p>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center">
                <p className="text-sm text-muted-foreground">
                    Made with{" "}
                    <a href="https://www.localley.io" className="text-primary font-medium hover:underline">
                        Localley
                    </a>
                    {" "}&middot; Your local guide to hidden gems
                </p>
            </div>

            {/* Full-size preview lightbox */}
            {previewSlide && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setPreviewSlide(null)}
                >
                    <div
                        className="relative max-h-[90vh] max-w-sm w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setPreviewSlide(null)}
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 z-10"
                        >
                            <X className="h-6 w-6" />
                        </button>
                        <div className="aspect-[9/16] relative rounded-xl overflow-hidden">
                            <Image
                                src={previewSlide.url}
                                alt={previewSlide.label}
                                fill
                                className="object-cover"
                                sizes="384px"
                                priority
                            />
                        </div>
                        <div className="flex gap-2 mt-3 justify-center">
                            <Button
                                onClick={() => handleDownload(previewSlide)}
                                disabled={downloadingKey === previewSlide.key}
                                size="sm"
                                className="gap-2"
                            >
                                <Download className="h-4 w-4" />
                                {isMobileShare ? "Save" : "Download"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
