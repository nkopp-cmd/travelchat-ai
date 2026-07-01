"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    AlertTriangle,
    Camera,
    CheckCircle2,
    Copy,
    ExternalLink,
    ImageIcon,
    Images,
    Loader2,
    MapPin,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SpotQualityIssue, SpotQualityItem, SpotQualityQueue } from "@/lib/admin/spot-quality";
import { buildSpotQualityItemResearchLinks } from "@/lib/admin/spot-quality-research";

type IssueFilter = SpotQualityIssue | "all";

const ISSUE_OPTIONS: Array<{ value: IssueFilter; label: string }> = [
    { value: "all", label: "All issues" },
    { value: "missing_real_photo", label: "Images" },
    { value: "inexact_location", label: "Location" },
    { value: "missing_place_id", label: "Place ID" },
    { value: "broad_place_name", label: "Name" },
];

const ISSUE_LABELS: Record<SpotQualityIssue, string> = {
    missing_real_photo: "Needs real image",
    inexact_location: "Needs exact address",
    missing_place_id: "Needs Place ID",
    broad_place_name: "Broad name",
    missing_name: "Missing name",
};

const PLACE_ID_MIGRATION_COMMAND =
    'npx supabase db query --linked --file supabase/migrations/006_spots_google_place_id.sql';

interface EditState {
    address: string;
    lat: string;
    lng: string;
    photos: string;
    googlePlaceId: string;
}

interface PhotoBackfillPreviewResult {
    success?: boolean;
    dryRun?: boolean;
    processed?: number;
    wouldUpdate?: number;
    skipped?: number;
    failed?: number;
    results?: Array<{
        id: string;
        name: string;
        status: "updated" | "would_update" | "skipped" | "failed";
        reason?: string;
        placeName?: string | null;
        placeId?: string | null;
        query?: string | null;
        photoCount?: number;
        updatedFields?: string[];
    }>;
}

function getPrimaryPhoto(item: SpotQualityItem): string | null {
    return item.photos.find((photo) => photo && !photo.toLowerCase().includes("placeholder")) || null;
}

function createEditState(item: SpotQualityItem): EditState {
    return {
        address: item.address,
        lat: item.lat ? String(item.lat) : "",
        lng: item.lng ? String(item.lng) : "",
        photos: item.photos.join("\n"),
        googlePlaceId: item.googlePlaceId || "",
    };
}

function parsePhotos(value: string): string[] | undefined {
    const photos = value
        .split(/\n|,/)
        .map((photo) => photo.trim())
        .filter(Boolean);

    return photos.length > 0 ? photos : undefined;
}

function parseCoordinate(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function SummaryTile({
    label,
    value,
    tone,
}: {
    label: string;
    value: number | string;
    tone?: "good" | "warn" | "danger";
}) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
            <p className="text-xs font-medium text-violet-50/55">{label}</p>
            <p className={cn(
                "mt-1 text-2xl font-semibold",
                tone === "good"
                    ? "text-emerald-200"
                    : tone === "warn"
                        ? "text-amber-200"
                        : tone === "danger"
                            ? "text-rose-200"
                            : "text-white"
            )}>
                {typeof value === "number" ? value.toLocaleString() : value}
            </p>
        </div>
    );
}

function IssueBadges({ issues }: { issues: SpotQualityIssue[] }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {issues.map((issue) => (
                <Badge
                    key={issue}
                    className={cn(
                        "rounded-md border px-1.5 py-0 text-[10px]",
                        issue === "missing_real_photo"
                            ? "border-rose-200/25 bg-rose-400/10 text-rose-100"
                            : issue === "inexact_location"
                                ? "border-amber-200/25 bg-amber-400/10 text-amber-100"
                                : "border-violet-200/25 bg-violet-400/10 text-violet-100"
                    )}
                >
                    {ISSUE_LABELS[issue]}
                </Badge>
            ))}
        </div>
    );
}

export function SpotQualityWorkbench() {
    const searchParams = useSearchParams();
    const [queue, setQueue] = useState<SpotQualityQueue | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [issue, setIssue] = useState<IssueFilter>("all");
    const [city, setCity] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [previewingPhotoBackfill, setPreviewingPhotoBackfill] = useState(false);
    const [applyingPhotoBackfill, setApplyingPhotoBackfill] = useState(false);
    const [photoBackfillPreview, setPhotoBackfillPreview] = useState<PhotoBackfillPreviewResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [editState, setEditState] = useState<EditState | null>(null);

    const selectedItem = useMemo(
        () => queue?.items.find((item) => item.id === selectedId) || queue?.items[0] || null,
        [queue, selectedId]
    );
    const requestedSpotId = searchParams.get("spot");
    const selectedResearch = useMemo(
        () => selectedItem ? buildSpotQualityItemResearchLinks(selectedItem) : null,
        [selectedItem]
    );

    const loadQueue = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
            issue,
            limit: "80",
        });
        if (city.trim()) params.set("city", city.trim());

        try {
            const response = await fetch(`/api/admin/spots/quality?${params.toString()}`);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to load spot quality queue");
            }
            setQueue(data);
            setSelectedId((current) => {
                if (current && data.items.some((item: SpotQualityItem) => item.id === current)) return current;
                if (requestedSpotId && data.items.some((item: SpotQualityItem) => item.id === requestedSpotId)) {
                    return requestedSpotId;
                }
                return data.items[0]?.id || null;
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load spot quality queue");
        } finally {
            setLoading(false);
        }
    }, [city, issue, requestedSpotId]);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    useEffect(() => {
        if (selectedItem) {
            setEditState(createEditState(selectedItem));
            setPhotoBackfillPreview(null);
        } else {
            setEditState(null);
        }
    }, [selectedItem]);

    const runSelectedPhotoBackfill = async (dryRun: boolean) => {
        if (!selectedItem) return;

        if (dryRun) {
            setPreviewingPhotoBackfill(true);
        } else {
            setApplyingPhotoBackfill(true);
        }
        setError(null);
        setNotice(null);
        if (dryRun) setPhotoBackfillPreview(null);

        try {
            const response = await fetch("/api/admin/spots/backfill-photos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    spotId: selectedItem.id,
                    limit: 1,
                    maxProcessed: 1,
                    dryRun,
                    upgradeToPlacePhotos: true,
                }),
            });
            const data = (await response.json()) as PhotoBackfillPreviewResult & { error?: string; details?: string };
            if (!response.ok) {
                throw new Error(data.details || data.error || "Failed to preview photo backfill");
            }
            setPhotoBackfillPreview(data);
            const firstResult = data.results?.[0];
            if (!dryRun && firstResult?.status === "updated") {
                setNotice(`Applied place-photo backfill with ${firstResult.photoCount || 0} image candidate${firstResult.photoCount === 1 ? "" : "s"}.`);
                await loadQueue();
            } else if (firstResult?.status === "would_update") {
                setNotice(`Photo dry run found ${firstResult.photoCount || 0} image candidate${firstResult.photoCount === 1 ? "" : "s"}.`);
            } else if (firstResult?.status === "skipped") {
                setNotice(`Photo dry run skipped: ${firstResult.reason || "no update candidate"}.`);
            } else {
                setNotice(dryRun ? "Photo dry run completed." : "Photo backfill completed.");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to run photo backfill");
        } finally {
            setPreviewingPhotoBackfill(false);
            setApplyingPhotoBackfill(false);
        }
    };

    const previewSelectedPhotoBackfill = () => runSelectedPhotoBackfill(true);
    const applySelectedPhotoBackfill = () => runSelectedPhotoBackfill(false);

    const saveSelected = async () => {
        if (!selectedItem || !editState) return;

        setSaving(true);
        setError(null);
        setNotice(null);

        const lat = parseCoordinate(editState.lat);
        const lng = parseCoordinate(editState.lng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            setSaving(false);
            setError("Latitude and longitude must be valid numbers.");
            return;
        }

        const body = {
            id: selectedItem.id,
            address: editState.address.trim() || undefined,
            lat,
            lng,
            photos: parsePhotos(editState.photos),
            googlePlaceId: editState.googlePlaceId.trim(),
        };

        try {
            const response = await fetch("/api/admin/spots/quality", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Failed to save spot quality update");
            }
            setNotice(`Saved ${data.updatedFields.join(", ")}`);
            await loadQueue();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save spot quality update");
        } finally {
            setSaving(false);
        }
    };

    const copyText = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setNotice(`Copied ${label}`);
        } catch {
            setError(`Could not copy ${label}.`);
        }
    };

    return (
        <div className="mx-auto max-w-7xl px-3 py-4 text-white sm:px-5 lg:px-6">
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-violet-200/15 bg-[#100b1c]/88 p-4 shadow-lg shadow-violet-950/20 backdrop-blur-xl lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-100">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Spot Quality
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Enrichment Queue</h1>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-violet-50/60">
                        Review spots blocked by image, location, name, or place identity quality gates.
                    </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,12rem)_auto]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-50/40" />
                        <Input
                            value={city}
                            onChange={(event) => setCity(event.target.value)}
                            placeholder="City"
                            className="h-10 border-white/10 bg-white/[0.06] pl-9 text-white placeholder:text-violet-50/35"
                        />
                    </div>
                    <Select value={issue} onValueChange={(value) => setIssue(value as IssueFilter)}>
                        <SelectTrigger className="h-10 border-white/10 bg-white/[0.06] text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {ISSUE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={loadQueue} disabled={loading} className="h-10 bg-violet-600 hover:bg-violet-700">
                        <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {queue && (
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <SummaryTile label="Needs work" value={queue.summary.needsWork} tone="warn" />
                    <SummaryTile label="Public ready" value={queue.summary.publicReady} tone="good" />
                    <SummaryTile label="Images" value={queue.summary.missingRealPhoto} />
                    <SummaryTile label="Locations" value={queue.summary.inexactLocation} />
                    <SummaryTile
                        label="Place IDs"
                        value={queue.hasGooglePlaceIdColumn ? queue.summary.missingPlaceId : "Blocked"}
                        tone={queue.hasGooglePlaceIdColumn ? undefined : "danger"}
                    />
                    <SummaryTile label="Names" value={queue.summary.broadPlaceName + queue.summary.missingName} />
                </div>
            )}

            {queue?.hasGooglePlaceIdColumn === false && (
                <div className="mb-4 rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-sm text-amber-50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 font-semibold">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                Place ID storage is blocked by a missing database column
                            </div>
                            <p className="mt-1 leading-6 text-amber-50/75">
                                Apply `supabase/migrations/006_spots_google_place_id.sql` before saving durable Google Place IDs for exact directions and photo provenance.
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => copyText(PLACE_ID_MIGRATION_COMMAND, "migration command")}
                            className="h-9 shrink-0 border-amber-200/25 bg-amber-100/10 text-xs text-amber-50 hover:bg-amber-100/15 hover:text-white"
                        >
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            Copy command
                        </Button>
                    </div>
                </div>
            )}

            {error && (
                <div className="mb-4 rounded-lg border border-rose-300/25 bg-rose-500/10 p-3 text-sm text-rose-100">
                    {error}
                </div>
            )}
            {notice && (
                <div className="mb-4 rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    {notice}
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
                <section className="space-y-2">
                    {loading && !queue ? (
                        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 text-sm text-violet-50/70">
                            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                            Loading queue
                        </div>
                    ) : queue?.items.length ? (
                        queue.items.map((item) => {
                            const photo = getPrimaryPhoto(item);
                            const selected = item.id === selectedItem?.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSelectedId(item.id)}
                                    className={cn(
                                        "grid w-full grid-cols-[5.25rem_minmax(0,1fr)] gap-3 rounded-lg border p-2 text-left transition sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]",
                                        selected
                                            ? "border-violet-300/60 bg-violet-500/15"
                                            : "border-white/10 bg-[#100b1c]/76 hover:border-violet-300/35 hover:bg-white/[0.055]"
                                    )}
                                >
                                    <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-violet-950/70">
                                        {photo ? (
                                            <Image src={photo} alt="" fill sizes="112px" className="object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-violet-100/40">
                                                <ImageIcon className="h-6 w-6" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 items-start justify-between gap-2">
                                            <h2 className="line-clamp-1 text-sm font-semibold text-white sm:text-base">{item.name || "Unnamed spot"}</h2>
                                            {item.publicReady ? (
                                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                                            ) : (
                                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                                            )}
                                        </div>
                                        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-violet-50/55">
                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                                            <span className="truncate">{item.address || "No address"}</span>
                                        </p>
                                        <div className="mt-2">
                                            <IssueBadges issues={item.issues} />
                                        </div>
                                    </div>
                                    <div className="hidden min-w-[7rem] text-right text-xs text-violet-50/55 sm:block">
                                        <p>{item.category || "Uncategorized"}</p>
                                        <p className="mt-1">{item.locationConfidence.label}</p>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 text-sm text-violet-50/70">
                            No spots match this queue filter.
                        </div>
                    )}
                </section>

                <aside className="lg:sticky lg:top-20 lg:self-start">
                    <div className="rounded-lg border border-violet-200/15 bg-[#100b1c]/92 p-3 shadow-xl shadow-violet-950/20 backdrop-blur-xl sm:p-4">
                        {selectedItem && editState ? (
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 className="line-clamp-2 text-lg font-semibold text-white">{selectedItem.name || "Unnamed spot"}</h2>
                                        <p className="mt-1 text-xs text-violet-50/55">{selectedItem.id}</p>
                                    </div>
                                    <Link href={`/spots/${selectedItem.id}`} target="_blank" className="rounded-md border border-white/10 bg-white/[0.055] p-2 text-violet-100 hover:bg-white/10">
                                        <ExternalLink className="h-4 w-4" />
                                        <span className="sr-only">Open public spot</span>
                                    </Link>
                                </div>

                                <IssueBadges issues={selectedItem.issues} />

                                <div className={cn(
                                    "rounded-lg border p-3",
                                    selectedItem.photoReadiness.tone === "good"
                                        ? "border-emerald-300/20 bg-emerald-400/10"
                                        : selectedItem.photoReadiness.tone === "warn"
                                            ? "border-amber-300/20 bg-amber-400/10"
                                            : "border-rose-300/20 bg-rose-400/10"
                                )}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                                <Camera className="h-4 w-4 text-violet-200" />
                                                {selectedItem.photoReadiness.label}
                                            </div>
                                            <p className="mt-1 text-xs leading-5 text-violet-50/65">
                                                {selectedItem.photoReadiness.description}
                                            </p>
                                            <p className="mt-1 text-xs text-violet-50/45">
                                                {selectedItem.photoReadiness.realPhotoCount} real / {selectedItem.photoSummary.total} stored photo{selectedItem.photoSummary.total === 1 ? "" : "s"}
                                            </p>
                                            <p className={cn(
                                                "mt-1 text-xs font-medium",
                                                selectedItem.placePhotoIdentity.ready
                                                    ? "text-emerald-100/80"
                                                    : selectedItem.placePhotoIdentity.hasIdentityMismatch
                                                        ? "text-rose-100/80"
                                                        : "text-amber-100/80"
                                            )}>
                                                {selectedItem.placePhotoIdentity.ready
                                                    ? "Own Google Place image + ID ready"
                                                    : selectedItem.placePhotoIdentity.hasIdentityMismatch
                                                        ? "Photo place ID does not match stored Place ID"
                                                        : selectedItem.placePhotoIdentity.hasGooglePlacePhoto
                                                            ? "Google Place image found; durable Place ID still needed"
                                                            : "Needs own Google Place image"}
                                            </p>
                                        </div>
                                        <Badge className="shrink-0 rounded-md border border-white/10 bg-white/[0.055] text-[10px] text-violet-100">
                                            {selectedItem.photoSummary.primaryKind}
                                        </Badge>
                                    </div>

                                    {selectedItem.photoReadiness.canAutoBackfill && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={previewSelectedPhotoBackfill}
                                            disabled={previewingPhotoBackfill}
                                            className="mt-3 h-9 w-full border-white/10 bg-white/[0.05] text-xs text-white hover:bg-white/10 hover:text-white"
                                        >
                                            {previewingPhotoBackfill ? (
                                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Sparkles className="mr-2 h-3.5 w-3.5" />
                                            )}
                                            Preview photo backfill
                                        </Button>
                                    )}

                                    {photoBackfillPreview?.results?.[0] && (
                                        <div className="mt-3 rounded-md border border-white/10 bg-black/15 p-2 text-xs leading-5 text-violet-50/70">
                                            <p className="font-semibold text-white">
                                                {photoBackfillPreview.results[0].status.replace("_", " ")}
                                            </p>
                                            {photoBackfillPreview.results[0].placeName && (
                                                <p>Matched: {photoBackfillPreview.results[0].placeName}</p>
                                            )}
                                            {photoBackfillPreview.results[0].placeId && (
                                                <p>Place ID: {photoBackfillPreview.results[0].placeId}</p>
                                            )}
                                            {photoBackfillPreview.results[0].query && (
                                                <p>Query: {photoBackfillPreview.results[0].query}</p>
                                            )}
                                            {photoBackfillPreview.results[0].photoCount !== undefined && (
                                                <p>{photoBackfillPreview.results[0].photoCount} photo candidate{photoBackfillPreview.results[0].photoCount === 1 ? "" : "s"}</p>
                                            )}
                                            {photoBackfillPreview.results[0].updatedFields?.length ? (
                                                <p>Would update: {photoBackfillPreview.results[0].updatedFields.join(", ")}</p>
                                            ) : null}
                                            {photoBackfillPreview.results[0].reason && (
                                                <p>Reason: {photoBackfillPreview.results[0].reason}</p>
                                            )}
                                            {photoBackfillPreview.results[0].status === "would_update" && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={applySelectedPhotoBackfill}
                                                    disabled={applyingPhotoBackfill}
                                                    className="mt-2 h-8 w-full bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                                                >
                                                    {applyingPhotoBackfill ? (
                                                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                                                    )}
                                                    Apply place photos
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {selectedResearch && (
                                    <div className="rounded-lg border border-violet-200/15 bg-white/[0.045] p-3">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-white">Research assist</h3>
                                                <p className="mt-1 text-xs leading-5 text-violet-50/55">
                                                    {selectedResearch.recommendedFocus}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 shrink-0 text-violet-100 hover:bg-white/10 hover:text-white"
                                                onClick={() => copyText(selectedResearch.query, "research query")}
                                            >
                                                <Copy className="h-4 w-4" />
                                                <span className="sr-only">Copy research query</span>
                                            </Button>
                                        </div>

                                        <div className="rounded-md border border-white/10 bg-black/15 p-2 text-xs leading-5 text-violet-50/70">
                                            {selectedResearch.query}
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <Link
                                                href={selectedResearch.mapsUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.055] px-3 text-xs font-semibold text-violet-100 transition hover:bg-white/10"
                                            >
                                                <MapPin className="h-3.5 w-3.5" />
                                                Maps
                                            </Link>
                                            <Link
                                                href={selectedResearch.imageSearchUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.055] px-3 text-xs font-semibold text-violet-100 transition hover:bg-white/10"
                                            >
                                                <Images className="h-3.5 w-3.5" />
                                                Images
                                            </Link>
                                        </div>

                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-9 border-white/10 bg-white/[0.04] text-xs text-white hover:bg-white/10 hover:text-white"
                                                onClick={() => copyText(selectedResearch.query, "research query")}
                                            >
                                                <Copy className="mr-2 h-3.5 w-3.5" />
                                                Copy query
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={!selectedResearch.coordinateText}
                                                className="h-9 border-white/10 bg-white/[0.04] text-xs text-white hover:bg-white/10 hover:text-white disabled:opacity-45"
                                                onClick={() => selectedResearch.coordinateText && copyText(selectedResearch.coordinateText, "coordinates")}
                                            >
                                                <Copy className="mr-2 h-3.5 w-3.5" />
                                                Copy coords
                                            </Button>
                                        </div>

                                        <Link
                                            href={selectedResearch.placeIdSearchUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2 inline-flex items-center text-xs font-medium text-violet-200/85 underline-offset-4 hover:text-white hover:underline"
                                        >
                                            Place ID lookup guide
                                            <ExternalLink className="ml-1 h-3 w-3" />
                                        </Link>
                                    </div>
                                )}

                                <label className="block space-y-1.5 text-sm">
                                    <span className="font-medium text-violet-50/75">Address</span>
                                    <Textarea
                                        value={editState.address}
                                        onChange={(event) => setEditState({ ...editState, address: event.target.value })}
                                        className="min-h-20 border-white/10 bg-white/[0.06] text-white placeholder:text-violet-50/35"
                                    />
                                </label>

                                <div className="grid grid-cols-2 gap-2">
                                    <label className="block space-y-1.5 text-sm">
                                        <span className="font-medium text-violet-50/75">Latitude</span>
                                        <Input
                                            value={editState.lat}
                                            onChange={(event) => setEditState({ ...editState, lat: event.target.value })}
                                            className="border-white/10 bg-white/[0.06] text-white"
                                        />
                                    </label>
                                    <label className="block space-y-1.5 text-sm">
                                        <span className="font-medium text-violet-50/75">Longitude</span>
                                        <Input
                                            value={editState.lng}
                                            onChange={(event) => setEditState({ ...editState, lng: event.target.value })}
                                            className="border-white/10 bg-white/[0.06] text-white"
                                        />
                                    </label>
                                </div>

                                <label className="block space-y-1.5 text-sm">
                                    <span className="font-medium text-violet-50/75">Photos</span>
                                    <Textarea
                                        value={editState.photos}
                                        onChange={(event) => setEditState({ ...editState, photos: event.target.value })}
                                        className="min-h-28 border-white/10 bg-white/[0.06] text-white placeholder:text-violet-50/35"
                                    />
                                </label>

                                <label className="block space-y-1.5 text-sm">
                                    <span className="font-medium text-violet-50/75">Google Place ID</span>
                                    <Input
                                        value={editState.googlePlaceId}
                                        onChange={(event) => setEditState({ ...editState, googlePlaceId: event.target.value })}
                                        disabled={queue?.hasGooglePlaceIdColumn === false}
                                        className="border-white/10 bg-white/[0.06] text-white disabled:opacity-50"
                                    />
                                </label>

                                {queue?.hasGooglePlaceIdColumn === false && (
                                    <div className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-2 text-xs leading-5 text-amber-100">
                                        Apply `supabase/migrations/006_spots_google_place_id.sql` before saving Place IDs.
                                    </div>
                                )}

                                <div className="sticky bottom-0 -mx-3 -mb-3 border-t border-white/10 bg-[#100b1c]/96 p-3 backdrop-blur-xl sm:-mx-4 sm:-mb-4 sm:p-4 lg:static lg:m-0 lg:border-0 lg:bg-transparent lg:p-0">
                                    <Button onClick={saveSelected} disabled={saving} className="h-11 w-full bg-violet-600 hover:bg-violet-700">
                                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Save spot
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 text-sm text-violet-50/70">
                                Select a spot from the queue.
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
