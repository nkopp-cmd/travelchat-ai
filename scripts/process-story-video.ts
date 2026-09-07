/** Run on an approved non-root Linux Docker host with server secrets configured.
 * node --conditions=react-server --import tsx scripts/process-story-video.ts <job-uuid>
 * Processes one existing job. Never submits a new provider request or configures spending.
 */
import { execFileSync } from "node:child_process";
import { isIP } from "node:net";

async function main() {
    const [jobId, ...extra] = process.argv.slice(2);
    if (extra.length || !jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
        throw new Error("usage");
    }
    if (process.env.ENABLE_STORY_VIDEO_PROCESSING !== "true") throw new Error("disabled");
    const allowedHosts = (process.env.STORY_VIDEO_ALLOWED_HOSTS ?? "").split(",").map(host => host.trim().toLowerCase());
    if (!allowedHosts.length || allowedHosts.length > 10 || allowedHosts.some(host =>
        host.length > 253 || isIP(host) || !host.includes(".") || host.endsWith(".local") || host.endsWith(".localhost") || host.split(".").some(label =>
            label.startsWith("xn--") || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) {
        throw new Error("hosts");
    }
    if (!process.getuid?.() || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("runtime");
    }
    try {
        execFileSync("docker", ["image", "inspect", "--format", "{{.Id}}", "localley-story-encoder:proof"], {
            env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/nonexistent", NODE_ENV: "production" }, stdio: "pipe", timeout: 10_000,
        });
    } catch { throw new Error("runtime"); }
    // Validate local configuration before importing modules that access server resources.
    const { processStoryVideoJob } = await import("../lib/story-video-processing");
    const { encodeStoryVideo } = await import("../lib/story-video-encoder");
    const result = await processStoryVideoJob(jobId, { allowedHosts, encode: encodeStoryVideo });
    console.log(JSON.stringify({ jobId: result.jobId, status: result.status }));
}

main().catch(error => {
    const messages: Record<string, string> = {
        usage: "Usage: process-story-video.ts <job-uuid>",
        disabled: "Story video processing is disabled.",
        hosts: "Configure exact approved STORY_VIDEO_ALLOWED_HOSTS before processing.",
        runtime: "Configure the server connection and local encoder image on a non-root Linux Docker host.",
    };
    console.error(messages[error instanceof Error ? error.message : ""] ?? "Story video processing failed; inspect the private job state before retrying.");
    process.exitCode = 1;
});
