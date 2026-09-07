import "server-only";
import { isIP } from "node:net";
import { z } from "zod";

export const MINIMAX_H3_MODEL = "MiniMax-H3";
export const MINIMAX_H3_SETTINGS_REVISION = "shortstory-t2v-768p-9x16-v1";
export const MINIMAX_H3_TIMEOUT_MS = 15_000;
export const MINIMAX_H3_MAX_RESPONSE_BYTES = 64 * 1024;

const durationSchema = z.number().int().min(4).max(6);
const taskIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const seconds = z.number().int().nonnegative().safe();
const taskSchema = z.object({
    id: taskIdSchema,
    model: z.literal(MINIMAX_H3_MODEL),
    status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
    created_at: seconds.optional(),
    updated_at: seconds.optional(),
    duration: seconds.optional(),
    resolution: z.string().max(32).optional(),
    ratio: z.string().max(32).optional(),
    task_type: z.literal("generation").optional(),
    modality: z.literal("video").optional(),
    content: z.object({ url: z.string().max(8192).optional() }).optional(),
    usage: z.object({
        total_seconds: seconds.optional(),
        input_seconds: seconds.optional(),
        output_seconds: seconds.optional(),
        input_image_count: seconds.optional(),
        input_audio_seconds: seconds.optional(),
        total_tokens: seconds.optional(),
        prompt_tokens: seconds.optional(),
        completion_tokens: seconds.optional(),
    }).optional(),
});

export type H3VideoTask = Omit<z.infer<typeof taskSchema>, "content"> & { url?: string };
export type H3VideoErrorCode = "disabled" | "missing_key" | "invalid_input" |
    "http_error" | "timeout" | "transport_error" | "invalid_response" | "response_too_large";

export class H3VideoError extends Error {
    constructor(public readonly code: H3VideoErrorCode, public readonly httpStatus?: number) {
        super(`MiniMax H3: ${code}.`);
        this.name = "H3VideoError";
    }
}

// A task may exist even when its ID was lost. The job service must reconcile, not blindly retry.
export class H3AmbiguousSubmissionError extends H3VideoError {
    constructor(code: H3VideoErrorCode, httpStatus?: number) {
        super(code, httpStatus);
        this.name = "H3AmbiguousSubmissionError";
    }
}

export class H3SubmissionRejectedError extends H3VideoError {
    constructor(httpStatus: number) {
        super("http_error", httpStatus);
        this.name = "H3SubmissionRejectedError";
    }
}

/** Output-only estimate at 8 cents/second. Not a spend reservation or reference-media price. */
export function estimateH3OutputCents(duration: number): number {
    if (!durationSchema.safeParse(duration).success) throw new H3VideoError("invalid_input");
    return duration * 8;
}

async function requestH3(path: string, body?: object): Promise<unknown> {
    const submitting = body !== undefined;
    if (submitting && process.env.ENABLE_MINIMAX_H3 !== "true") throw new H3VideoError("disabled");
    const key = process.env.MINIMAX_API_KEY?.trim();
    if (!key) throw new H3VideoError("missing_key");

    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new H3VideoError("timeout"));
            controller.abort();
        }, MINIMAX_H3_TIMEOUT_MS);
    });
    try {
        return await Promise.race([deadline, (async () => {
            const response = await fetch(`https://api.minimax.io${path}`, {
                method: submitting ? "POST" : "GET",
                headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                ...(submitting ? { body: JSON.stringify(body) } : {}),
                signal: controller.signal,
                redirect: "error",
                cache: "no-store",
            });
            reader = response.body?.getReader();
            if (!response.ok) {
                if (submitting && response.status >= 400 && response.status < 500) {
                    // Includes 429; no automatic retry or inference about billing.
                    throw new H3SubmissionRejectedError(response.status);
                }
                throw new H3VideoError("http_error", response.status);
            }
            if (Number(response.headers.get("content-length")) > MINIMAX_H3_MAX_RESPONSE_BYTES) {
                throw new H3VideoError("response_too_large");
            }
            if (!reader) throw new H3VideoError("invalid_response");
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MINIMAX_H3_MAX_RESPONSE_BYTES) throw new H3VideoError("response_too_large");
                chunks.push(value);
            }
            try {
                return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
            } catch {
                throw new H3VideoError("invalid_response");
            }
        })()]);
    } catch (error) {
        if (error instanceof H3SubmissionRejectedError) throw error;
        const safe = error instanceof H3VideoError ? error : new H3VideoError("transport_error");
        if (submitting) throw new H3AmbiguousSubmissionError(safe.code, safe.httpStatus);
        throw safe;
    } finally {
        clearTimeout(timer);
        controller.abort();
        void reader?.cancel().catch(() => undefined);
    }
}

// Ownership, durable task records, and spend reservation belong to the job service, not this adapter.
// Do not expose a public route before that service has a durable video ledger.
export async function submitH3Video(input: { prompt: string; duration?: number }): Promise<{ taskId: string }> {
    const parsed = z.object({
        prompt: z.string().trim().min(1).max(7000),
        duration: durationSchema.default(4),
    }).strict().safeParse(input);
    if (!parsed.success) throw new H3VideoError("invalid_input");
    const response = await requestH3("/v2/video_generation", {
        model: MINIMAX_H3_MODEL,
        content: [{ type: "text", text: parsed.data.prompt }],
        duration: parsed.data.duration,
        resolution: "768P",
        ratio: "9:16",
    });
    const result = z.object({ task_id: taskIdSchema }).safeParse(response);
    if (!result.success) throw new H3AmbiguousSubmissionError("invalid_response");
    return { taskId: result.data.task_id };
}

/** Server-only metadata. Query remains available when submission is disabled, for reconciliation. */
export async function queryH3Video(taskId: string): Promise<H3VideoTask> {
    if (!taskIdSchema.safeParse(taskId).success) throw new H3VideoError("invalid_input");
    const result = z.object({ task: taskSchema }).safeParse(
        await requestH3(`/v2/query/video_generation/${taskId}`),
    );
    if (!result.success || result.data.task.id !== taskId) throw new H3VideoError("invalid_response");
    const { content, ...task } = result.data.task;
    if (task.status !== "succeeded") return task;
    try {
        const url = new URL(content?.url ?? "");
        const host = url.hostname.replace(/\.$/, "");
        // Conservatively reject all IP literals, including mapped IPv6 and alternate IPv4 notation.
        if (url.protocol !== "https:" || url.username || url.password ||
            isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") ||
            host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
            throw new Error();
        }
        // Never fetch here. Ingestion still requires an allowlist and DNS/redirect checks.
        return { ...task, url: url.href };
    } catch {
        throw new H3VideoError("invalid_response");
    }
}
