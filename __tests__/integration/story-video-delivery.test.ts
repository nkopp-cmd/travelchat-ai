// @vitest-environment node
// Opt in: RUN_STORY_VIDEO_ENCODER_TEST=1 npx vitest run __tests__/integration/story-video-delivery.test.ts
import { afterEach, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { processStoryVideoJob } from "@/lib/story-video-processing";
import { pollStoryVideoJob } from "@/lib/story-video-jobs";

const m = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), bucket: vi.fn(), from: vi.fn(),
    upload: vi.fn(), read: vi.fn(), download: vi.fn(), provider: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: m.admin }));
vi.mock("@/lib/story-video-download", () => ({ downloadStoryVideo: m.download, STORY_VIDEO_DOWNLOAD_MAX_BYTES: 33554432 }));
vi.mock("@/lib/minimax-video", () => ({ submitH3Video: m.provider, queryH3Video: m.provider }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

it.skipIf(process.env.RUN_STORY_VIDEO_ENCODER_TEST !== "1")(
    "delivers a real encoded synthetic MP4 through mocked private storage and ledger", async () => {
        vi.stubEnv("ENABLE_STORY_VIDEO_PROCESSING", "true");
        const localFetch = globalThis.fetch;
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            // Satori loads its bundled Yoga WASM through a data URI, not a network request.
            if (typeof input === "string" && input.startsWith("data:application/octet-stream;base64,")) {
                return localFetch(input, init);
            }
            throw new Error("Network is forbidden in this proof");
        }));
        const parent = resolve("test-results");
        expect(await realpath(parent)).toBe(parent);
        const directory = resolve(parent, "story-video-delivery");
        await mkdir(directory, { recursive: true });
        expect(await realpath(directory)).toBe(directory);
        for (const file of ["sample.mp4", "frame.png"]) {
            const stat = await lstat(resolve(directory, file)).catch(error => {
                if (error.code !== "ENOENT") throw error;
                return null;
            });
            if (stat) { expect(stat.isFile()).toBe(true); expect(stat.nlink).toBe(1); }
        }
        vi.stubEnv("STORY_VIDEO_WORK_DIR", resolve(directory, "work"));
        const input = await readFile(resolve(parent, "story-video-overlay/base.mp4"));
        const jobId = "51e781e9-1ce8-4d01-b986-4e70154ff3d8";
        const itineraryId = "31e781e9-1ce8-4d01-b986-4e70154ff3d8";
        const token = "71e781e9-1ce8-4d01-b986-4e70154ff3d8";
        const outputKey = `${jobId}/${token}.mp4`;
        const claim = { jobId, itineraryId, userId: "fixture-owner", token, outputKey, attempt: 1, duration: 4,
            providerUrl: "https://synthetic.invalid/stored.mp4?private=fixture",
            title: "Synthetic delivery proof", caption: "Seoul - AI-generated travel scene" };
        const statusUrl = `/api/itineraries/${itineraryId}/story/video/${jobId}`;
        const publicJob = { jobId, status: "delivered", statusUrl, downloadUrl: `${statusUrl}/download`, errorCode: null };
        let stored: Buffer | undefined;
        let readbackVerified = false;
        let finalized = false;
        m.admin.mockReturnValue({ rpc: m.rpc, storage: { getBucket: m.bucket, from: m.from } });
        m.bucket.mockResolvedValue({ data: { id: "story-videos", public: false }, error: null });
        m.from.mockImplementation(bucket => {
            expect(bucket).toBe("story-videos");
            return { upload: m.upload, download: m.read };
        });
        m.download.mockImplementation(async (url, hosts) => {
            expect(url).toBe(claim.providerUrl); expect(hosts).toEqual(["synthetic.invalid"]);
            return { buffer: input, contentType: "video/mp4" };
        });
        m.upload.mockImplementation(async (key, bytes, options) => {
            expect(key).toBe(outputKey); expect(options).toEqual({ contentType: "video/mp4", upsert: false });
            expect(stored).toBeUndefined(); expect(Buffer.isBuffer(bytes)).toBe(true);
            stored = Buffer.from(bytes);
            return { data: { path: key }, error: null };
        });
        m.read.mockImplementation(async key => {
            expect(key).toBe(outputKey); expect(stored).toBeDefined();
            readbackVerified = true;
            return { data: new Blob([new Uint8Array(stored!)]), error: null };
        });
        m.rpc.mockImplementation(async (name, args) => {
            if (name === "claim_story_video_processing") {
                expect(args).toEqual({ p_job: jobId }); return { data: claim, error: null };
            }
            if (name === "finish_story_video_processing") {
                expect(readbackVerified).toBe(true); expect(stored).toBeDefined();
                expect(args).toEqual({ p_job: jobId, p_token: token, p_key: outputKey,
                    p_sha256: createHash("sha256").update(stored!).digest("hex"), p_bytes: stored!.length });
                finalized = true;
                return { data: publicJob, error: null };
            }
            if (name === "claim_story_video_poll") {
                expect(finalized).toBe(true);
                expect(args).toEqual({ p_user: "fixture-owner", p_itinerary: itineraryId, p_job: jobId });
                return { data: { job: publicJob, pollFence: null, taskId: null, duration: 4 }, error: null };
            }
            throw new Error("Unexpected ledger call");
        });
        // Do not mock the encoder, overlay, child_process, filesystem, probes, or full decode checks.
        const { encodeStoryVideo } = await import("@/lib/story-video-encoder");
        const encode = vi.fn(encodeStoryVideo);
        expect(await processStoryVideoJob(jobId, { allowedHosts: ["synthetic.invalid"], encode }))
            .toEqual({ jobId, status: "delivered" });
        expect(encode).toHaveBeenCalledExactlyOnceWith(input, {
            title: claim.title, caption: claim.caption, durationSeconds: 4,
        });
        expect(stored!.length).toBeGreaterThan(0); expect(stored!.length).toBeLessThanOrEqual(33554432);
        expect(stored!.equals(input)).toBe(false);
        expect(m.upload).toHaveBeenCalledTimes(1); expect(m.read).toHaveBeenCalledTimes(1);
        const status = await pollStoryVideoJob("fixture-owner", itineraryId, jobId);
        expect(status).toEqual(publicJob);
        expect(JSON.stringify(status)).not.toContain(claim.providerUrl);
        expect(JSON.stringify(status)).not.toContain(token);
        await writeFile(resolve(directory, "sample.mp4"), stored!, { mode: 0o600 });

        const execute = promisify(execFile);
        const run = async (args: string[]) => (await execute("docker", [
            "run", "--rm", "--pull", "never", "--network", "none", "--cpus", "0.5", "--memory", "512m",
            "--memory-swap", "512m", "--pids-limit", "128", "--read-only", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges", "--user", `${process.getuid!()}:${process.getgid!()}`,
            "--mount", `type=bind,src=${directory},dst=/artifacts`, "localley-story-encoder:proof", ...args,
        ], { timeout: 30_000, maxBuffer: 1024 * 1024,
            env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/nonexistent", NODE_ENV: "test" } })).stdout;
        const probe = JSON.parse(await run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", "/artifacts/sample.mp4"]));
        expect(probe.streams).toHaveLength(1);
        expect(probe.streams[0]).toMatchObject({ width: 1080, height: 1920, codec_name: "h264", pix_fmt: "yuv420p",
            avg_frame_rate: "24/1", nb_frames: "96" });
        expect(Number(probe.format.duration)).toBe(4);
        await run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "1",
            "-filter_threads", "1", "-ss", "2", "-i", "/artifacts/sample.mp4", "-frames:v", "1", "-threads", "1", "/artifacts/frame.png"]);
        expect(m.provider).not.toHaveBeenCalled();
        for (const [url] of vi.mocked(fetch).mock.calls) {
            expect(typeof url === "string" && url.startsWith("data:application/octet-stream;base64,")).toBe(true);
        }
        console.log(`Mock-storage delivery proof: ${stored!.length} bytes, H.264 1080x1920, 24 fps, 4 seconds; sample.mp4 and frame.png saved.`);
    }, 180_000,
);
