// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("story video worker startup", () => {
    const job = "f287ade0-0461-4d89-8146-dc66dcf4409e";
    function run(args: string[], config: Record<string, string> = {}) {
        try {
            execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/process-story-video.ts", ...args], {
                env: { PATH: process.env.PATH, ...config }, encoding: "utf8", timeout: 10_000, stdio: "pipe",
            });
            throw new Error("Expected startup to reject before server imports");
        } catch (error) {
            const result = error as { status?: number; stderr?: string; stdout?: string };
            expect(result.status).toBe(1);
            expect(result.stdout).toBe("");
            return result.stderr ?? "";
        }
    }
    it.each([{ args: [] }, { args: ["not-a-job"] }, { args: [job, "extra"] }])("rejects invalid arguments %j", ({ args }) => {
        expect(run(args)).toContain("Usage:");
    });
    it("does not import server code or connect when disabled", () => {
        expect(run([job])).toContain("processing is disabled");
    });
    it.each(["", "*.example.com", "https://example.com", "example.com:443", "example.com,", "xn--fake.example.com", "127.0.0.1", "media.local"])("rejects invalid host configuration %s before server imports", hosts => {
        expect(run([job], { ENABLE_STORY_VIDEO_PROCESSING: "true", STORY_VIDEO_ALLOWED_HOSTS: hosts })).toContain("exact approved");
    });
});
