export class StoryBackgroundPendingError extends Error {
    constructor() {
        super("Backgrounds are still processing. Completion is not confirmed. Check again later.");
        this.name = "StoryBackgroundPendingError";
    }
}

/** Poll the existing job, never create a new attempt on a transport retry. */
export async function requestStoryBackground(
    body: string,
    signal: AbortSignal,
    deadline = Date.now() + 90_000,
): Promise<{ image: string; source: string; provider?: string; state?: never } | { state: "failed" } | undefined> {
    signal.throwIfAborted();
    if (Date.now() >= deadline) throw new StoryBackgroundPendingError();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new StoryBackgroundPendingError()), deadline - Date.now());
    const localSignal = controller.signal;
    let wasPending = false;
    let rejectAborted: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
        rejectAborted = () => reject(localSignal.reason);
        localSignal.addEventListener("abort", rejectAborted, { once: true });
    });
    try {
        return await Promise.race([aborted, (async () => {
            while (true) {
                localSignal.throwIfAborted();
                if (Date.now() >= deadline) throw new StoryBackgroundPendingError();
                const response = await fetch("/api/images/story-background", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body,
                    signal: localSignal,
                });
                localSignal.throwIfAborted();
                if (!response.ok) {
                    if (wasPending) throw new StoryBackgroundPendingError();
                    return undefined;
                }
                const data = await response.json();
                localSignal.throwIfAborted();
                if (response.status !== 202 && !data.pending) {
                    // Only a successful HTTP response with durable failure confirmation
                    // permits a new paid attempt. Error text and transport errors do not.
                    if (data.success === false && data.state === "failed") return { state: "failed" as const };
                    return data.success && typeof data.image === "string"
                        ? { image: data.image, source: data.source, provider: data.provider }
                        : undefined;
                }
                wasPending = true;
                await new Promise<void>((resolve, reject) => {
                    const onAbort = () => {
                        clearTimeout(wait);
                        reject(localSignal.reason);
                    };
                    const wait = setTimeout(() => {
                        localSignal.removeEventListener("abort", onAbort);
                        resolve();
                    }, 4_000);
                    localSignal.addEventListener("abort", onAbort, { once: true });
                });
            }
        })()]);
    } catch (error) {
        if (localSignal.aborted) throw localSignal.reason;
        if (error instanceof StoryBackgroundPendingError) throw error;
        if (wasPending) throw new StoryBackgroundPendingError();
        // HTTP, malformed responses, and transport failures use the existing fallback.
        return undefined;
    } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        localSignal.removeEventListener("abort", rejectAborted);
    }
}
