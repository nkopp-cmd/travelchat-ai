"use client";

import { useEffect, useSyncExternalStore } from "react";

export type VideoDuration = 4 | 5 | 6;
const statuses = ["reserved", "submitting", "queued", "running", "provider_ready", "processing", "delivered", "processing_failed", "submission_unknown", "failed", "cancelled"] as const;
export type VideoStatus = typeof statuses[number];
export const videoTerminal = (status?: VideoStatus) => !!status && ["delivered", "processing_failed", "failed", "cancelled"].includes(status);
export const videoReasons: Record<string, string> = {
    premium_required: "Video requires Premium.",
    unavailable: "Video is not available now.",
    unsupported_story_text: "This story contains text that video does not support yet.",
    limit: "The video limit has been reached.",
    processing_unavailable: "Video processing is not available now.",
    unauthorized: "Sign in to check video availability.",
    not_found: "This itinerary or video is not available.",
};
type Readiness = { canSubmit: boolean; reason: string | null; eligibleDurations: VideoDuration[] };
type Job = { jobId: string; status: VideoStatus; downloadUrl?: string; errorCode: string | null };
type Attempt = { key: string; duration: VideoDuration; status: VideoStatus; job?: Job };
type Snapshot = { readiness?: Readiness; error?: string; attempt?: Attempt; busy: boolean };
type Entry = { snapshot: Snapshot; listeners: Set<() => void>; active: number; controller?: AbortController; post?: AbortController; polling?: AbortController; timer?: ReturnType<typeof setTimeout>; poll?: () => Promise<void> };
const empty: Snapshot = { busy: false };
const entries = new Map<string, Entry>();
let owner: string | null = null;

function publish(entry: Entry, patch: Partial<Snapshot>) {
    entry.snapshot = { ...entry.snapshot, ...patch };
    entry.listeners.forEach(listener => listener());
}

function stop(entry: Entry) {
    entry.controller?.abort();
    entry.post?.abort();
    clearTimeout(entry.timer);
    if (entry.snapshot.busy && entry.snapshot.attempt) {
        publish(entry, { busy: false, attempt: { ...entry.snapshot.attempt, status: "submission_unknown" } });
    }
}

// Called by each dialog even while closed, so logout removes private state.
export function setStoryVideoOwner(userId: string | null) {
    if (owner === userId) return;
    owner = userId;
    for (const [scope, entry] of entries) {
        if (userId && JSON.parse(scope)[0] === userId) continue;
        stop(entry);
        entry.snapshot = empty;
        entry.listeners.forEach(listener => listener());
        entries.delete(scope);
    }
}

function parseJob(data: unknown, base: string, expectedId?: string): Job {
    const value = data as Record<string, unknown> | null;
    if (!value || typeof value.jobId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value.jobId)
        || (expectedId && value.jobId !== expectedId) || !statuses.includes(value.status as VideoStatus)
        || value.statusUrl !== `${base}/${value.jobId}`) throw new Error("invalid_response");
    const download = `${base}/${value.jobId}/download`;
    return {
        jobId: value.jobId, status: value.status as VideoStatus,
        errorCode: typeof value.errorCode === "string" ? value.errorCode : null,
        downloadUrl: value.status === "delivered" && value.downloadUrl === download ? download : undefined,
    };
}

async function readJson(response: Response) {
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data?.errorCode === "string" ? data.errorCode : "unavailable");
    return data;
}

export function useStoryVideo(userId: string | null, itineraryId: string, active: boolean) {
    const scope = JSON.stringify([userId, itineraryId]);
    let entry = entries.get(scope);
    if (!entry) {
        entry = { snapshot: empty, listeners: new Set(), active: 0 };
        entries.set(scope, entry);
    }
    const current = entry;
    const base = `/api/itineraries/${encodeURIComponent(itineraryId)}/story/video`;
    const snapshot = useSyncExternalStore(
        listener => { current.listeners.add(listener); return () => { current.listeners.delete(listener); }; },
        () => current.snapshot,
        () => empty,
    );

    useEffect(() => {
        if (!active || !userId) return;
        current.active++;
        if (current.active === 1) {
            const controller = new AbortController();
            current.controller = controller;
            const { signal } = controller;
            const readiness = async () => {
                try {
                    const data = await readJson(await fetch(base, { signal, cache: "no-store" }));
                    if (signal.aborted) return;
                    if (data.model !== "MiniMax-H3" || data.format !== "mp4" || data.ratio !== "9:16"
                        || typeof data.canSubmit !== "boolean" || !Array.isArray(data.eligibleDurations)
                        || !(data.reason === null || Object.hasOwn(videoReasons, data.reason))) throw new Error("unavailable");
                    publish(current, { error: undefined, readiness: {
                        canSubmit: data.canSubmit && data.reason === null,
                        reason: data.reason,
                        eligibleDurations: [4, 5, 6].filter(value => data.eligibleDurations.includes(value)) as VideoDuration[],
                    } });
                } catch (error) {
                    if (!signal.aborted) publish(current, { readiness: undefined, error: (error as Error).message });
                }
            };
            const poll = async () => {
                const attempt = current.snapshot.attempt;
                if (signal.aborted || current.polling === controller) return;
                current.polling = controller;
                try {
                    if (attempt?.job && !videoTerminal(attempt.status) && !current.snapshot.busy) {
                        const data = await readJson(await fetch(`${base}/${attempt.job.jobId}`, { signal, cache: "no-store" }));
                        const job = parseJob(data, base, attempt.job.jobId);
                        if (signal.aborted || current.snapshot.attempt !== attempt) return;
                        publish(current, { attempt: { ...attempt, job, status: job.status }, error: undefined });
                        if (videoTerminal(job.status)) { await readiness(); return; }
                    }
                } catch (error) {
                    if (signal.aborted) return;
                    publish(current, { error: (error as Error).message });
                } finally {
                    if (current.polling === controller) current.polling = undefined;
                    if (!signal.aborted && current.snapshot.attempt && !videoTerminal(current.snapshot.attempt.status)) {
                        clearTimeout(current.timer);
                        current.timer = setTimeout(poll, 10_000);
                    }
                }
            };
            current.poll = poll;
            publish(current, { readiness: undefined, error: undefined });
            void readiness();
            void poll();
        }
        return () => { if (--current.active === 0) stop(current); };
    }, [active, userId, base, current]);

    const submit = async (duration: VideoDuration, retry = false) => {
        if (!active || !userId || owner !== userId || current.snapshot.busy) return;
        const previous = current.snapshot.attempt;
        if (retry ? previous?.status !== "submission_unknown" : previous && !videoTerminal(previous.status)) return;
        if (retry && previous?.job) {
            clearTimeout(current.timer);
            await current.poll?.();
            return;
        }
        const ready = current.snapshot.readiness;
        if (!retry && (!ready?.canSubmit || !ready.eligibleDurations.includes(duration))) return;
        const attempt: Attempt = retry && previous ? previous : { key: crypto.randomUUID(), duration, status: "submitting" };
        const controller = new AbortController();
        current.post = controller;
        publish(current, { busy: true, error: undefined, attempt: { ...attempt, status: "submitting" } });
        try {
            const response = await fetch(base, {
                method: "POST", signal: controller.signal,
                headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key },
                body: JSON.stringify({ duration: attempt.duration }),
            });
            const data = await readJson(response);
            if (response.status !== 202) throw new Error("invalid_response");
            const job = parseJob(data, base);
            if (controller.signal.aborted) return;
            publish(current, { busy: false, attempt: { ...attempt, job, status: job.status } });
            clearTimeout(current.timer);
            if (!videoTerminal(job.status) && current.poll && current.polling !== current.controller) current.timer = setTimeout(current.poll, 10_000);
        } catch (error) {
            if (controller.signal.aborted) return;
            // An error response does not prove that no reservation or provider submission exists.
            publish(current, { busy: false, error: (error as Error).message, attempt: { ...attempt, status: "submission_unknown" } });
        }
    };
    return { ...snapshot, submit };
}
