"use client";

import { useState } from "react";
import { Download, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useStoryVideo, videoReasons, videoTerminal, type VideoDuration, type VideoStatus } from "@/lib/story-video-client";

const stages: Record<VideoStatus, string> = {
    reserved: "Your video request is reserved.",
    submitting: "Submitting your video request.",
    queued: "Your video is queued.",
    running: "Your video is being generated.",
    provider_ready: "Generation finished. Your download is not ready yet.",
    processing: "Preparing your private MP4 download.",
    delivered: "Your video is ready.",
    processing_failed: "Video processing failed. No download is available.",
    submission_unknown: "The request needs review. Check the existing request before starting another video.",
    failed: "Video generation failed.",
    cancelled: "The video request was cancelled.",
};

export function StoryVideoPanel({ userId, itineraryId, active }: { userId: string | null; itineraryId: string; active: boolean }) {
    const { readiness, attempt, busy, error, submit } = useStoryVideo(userId, itineraryId, active);
    const [selected, setSelected] = useState<VideoDuration>(4);
    const duration = readiness?.eligibleDurations.includes(selected) ? selected : readiness?.eligibleDurations[0];
    const terminal = videoTerminal(attempt?.status);
    const locked = !!attempt && !terminal;
    const reason = !userId ? videoReasons.unauthorized : error ? (Object.hasOwn(videoReasons, error) ? videoReasons[error] : "Video status is not available. Check again later.")
        : readiness?.reason ? videoReasons[readiness.reason] : readiness && (!readiness.canSubmit || !duration) ? videoReasons.unavailable : undefined;

    return <section className="space-y-5 py-4" aria-label="Video pilot">
        <div className="flex items-start gap-3">
            <Video className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
                <h3 className="font-semibold">Video pilot</h3>
                <p className="text-sm text-muted-foreground">A short portrait video for your story. MiniMax-H3.</p>
            </div>
        </div>
        <RadioGroup aria-label="Video duration" value={String(locked ? attempt.duration : duration ?? "")}
            onValueChange={value => setSelected(Number(value) as VideoDuration)} className="gap-2">
            {([4, 5, 6] as const).map(value => <label key={value}
                className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <RadioGroupItem className="border-muted-foreground" value={String(value)} disabled={locked || !readiness?.eligibleDurations.includes(value)} />
                <span>{value} seconds · Portrait MP4</span>
            </label>)}
        </RadioGroup>
        <div role="status" aria-live="polite" className="space-y-2 text-sm">
            {attempt && <p>{stages[attempt.status]}</p>}
            {reason && <p className="text-muted-foreground">{reason}</p>}
            {!readiness && !error && userId && <p className="text-muted-foreground">Checking video availability...</p>}
            {attempt?.status === "delivered" && !attempt.job?.downloadUrl && <p>Download is not available.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
            {readiness?.canSubmit && duration && (!attempt || terminal) && <Button disabled={busy} onClick={() => void submit(duration)}>
                <Video className="mr-2 h-4 w-4" aria-hidden="true" />
                {attempt ? "Create another video" : "Create video"}
            </Button>}
            {attempt?.status === "submission_unknown" && <Button variant="outline" disabled={busy}
                onClick={() => void submit(attempt.duration, true)}>Check existing request</Button>}
            {attempt?.status === "delivered" && attempt.job?.downloadUrl && <Button asChild>
                <a href={attempt.job.downloadUrl} download><Download className="mr-2 h-4 w-4" aria-hidden="true" />Download MP4</a>
            </Button>}
        </div>
        <p className="text-xs text-muted-foreground">Videos stay private. They do not appear on the image sharing page.</p>
        {attempt && <p className="text-xs text-muted-foreground">Closing this dialog or browser does not cancel generation. Keep this page to check this request later.</p>}
    </section>;
}
