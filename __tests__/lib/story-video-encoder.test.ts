// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exec: vi.fn(), rm: vi.fn(), write: vi.fn(), probe: {} as Record<string, unknown> }));
vi.mock("node:child_process", () => ({ execFile: mocks.exec }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(), mkdtemp: vi.fn(async () => "/tmp/story-encoder-private"), realpath: vi.fn(async (p: string) => p),
  lstat: vi.fn(async () => ({ isSymbolicLink: () => false, isFile: () => true, nlink: 1, size: 100 })),
  writeFile: mocks.write, readFile: vi.fn(async () => Buffer.from("output")), rm: mocks.rm,
}));
vi.mock("../../lib/story-video-overlay", () => ({ renderStoryVideoOverlay: vi.fn(async () => Buffer.from("png")) }));
import { encodeStoryVideo } from "../../lib/story-video-encoder";
const input = Buffer.from("0000ftypisom");
const options = { title: "Seoul", caption: "AI generated", durationSeconds: 4 };
const video = { codec_type: "video", codec_name: "h264", width: 768, height: 1360, sample_aspect_ratio: "1:1", avg_frame_rate: "24/1", r_frame_rate: "24/1", nb_frames: "96" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.probe = { format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "4" }, streams: [{ ...video }] };
  mocks.exec.mockImplementation((_command, args, _opts, callback) => {
    let probe = mocks.probe;
    if (args.includes("/artifacts/output.mp4")) probe = { ...probe, streams: [{ ...video, width: 1080, height: 1920, pix_fmt: "yuv420p" }] };
    callback(null, args.includes("ffprobe") ? JSON.stringify(probe) : "");
  });
});
describe("isolated story encoder", () => {
  it.each([Buffer.alloc(0), Buffer.alloc(32 * 1024 * 1024 + 1), Buffer.from("not an mp4")])("rejects bytes before subprocess execution", async bytes => {
    await expect(encodeStoryVideo(bytes, options)).rejects.toThrow();
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it.each([
    { width: 2049 }, { height: 0 }, { width: 1080, height: 1080 }, { codec_name: "vp9" },
    { sample_aspect_ratio: "2:1" }, { avg_frame_rate: "61/1" }, { r_frame_rate: "0/0" }, { nb_frames: "401" }, { duration: "7" },
    { tags: { rotate: "90" } }, { disposition: { attached_pic: 1 } },
    { side_data_list: [{ side_data_type: "Display Matrix", rotation: 90 }] },
  ])("rejects unsafe video properties %j", async patch => {
    mocks.probe.streams = [{ ...video, ...patch }];
    await expect(encodeStoryVideo(input, options)).rejects.toThrow("constraints");
    expect(mocks.rm).toHaveBeenCalledWith("/tmp/story-encoder-private", { recursive: true, force: true });
  });
  it.each([
    [], [video, { codec_type: "subtitle" }], [video, { codec_type: "data" }],
    [video, { codec_type: "audio", codec_name: "mp3" }], [video, video],
    [video, { codec_type: "audio", codec_name: "aac" }, { codec_type: "audio", codec_name: "aac" }],
  ].map(streams => [streams]))("rejects unsafe stream sets %j", async streams => {
    mocks.probe.streams = streams;
    await expect(encodeStoryVideo(input, options)).rejects.toThrow("constraints");
  });
  it.each(["3.79", "4.21", "7", "NaN"])("rejects duration %s", async duration => {
    mocks.probe.format = { format_name: "mp4", duration };
    await expect(encodeStoryVideo(input, options)).rejects.toThrow("constraints");
  });
  it("isolates every parser and decoder and cleans the private directory", async () => {
    mocks.probe.streams = [{ ...video, nb_frames: undefined }, { codec_type: "audio", codec_name: "aac" }];
    await expect(encodeStoryVideo(input, options)).resolves.toEqual(Buffer.from("output"));
    const runs = mocks.exec.mock.calls.filter(call => call[1][0] === "run");
    expect(runs).toHaveLength(5);
    for (const [command, args, opts] of runs) {
      expect(command).toBe("docker");
      for (const flag of ["--read-only", "--cap-drop", "ALL", "--network", "none", "--cpus", "0.5", "--memory", "512m", "--pids-limit", "128", "no-new-privileges", "never", "file,pipe"]) expect(args).toContain(flag);
      expect(args).not.toContain("--env");
      expect(opts.timeout).toBeLessThanOrEqual(120000);
      expect(Object.keys(opts.env).sort()).toEqual(["HOME", "NODE_ENV", "PATH"]);
    }
    expect(runs.filter(call => call[1].includes("-xerror"))).toHaveLength(3);
    expect(mocks.write.mock.calls.every(call => call[2].flag === "wx" && call[2].mode === 0o600)).toBe(true);
    expect(mocks.rm).toHaveBeenCalled();
  });
  it("removes failed containers without leaking stderr", async () => {
    mocks.exec.mockImplementation((_command, _args, _opts, callback) => callback(new Error("secret URL"), "", "secret URL"));
    await expect(encodeStoryVideo(input, options)).rejects.toThrow("Story encoder process failed or timed out");
    expect(mocks.exec.mock.calls.some(call => call[1][0] === "rm")).toBe(true);
    expect(mocks.rm).toHaveBeenCalled();
  });
  it("rejects invalid encoded output before returning bytes", async () => {
    mocks.exec.mockImplementation((_command, args, _opts, callback) => callback(null, args.includes("ffprobe") ? JSON.stringify(mocks.probe) : ""));
    await expect(encodeStoryVideo(input, options)).rejects.toThrow("constraints");
    expect(mocks.rm).toHaveBeenCalled();
  });
  it("rejects a full decode error after valid probing", async () => {
    mocks.exec.mockImplementation((_command, args, _opts, callback) => {
      callback(args.includes("ffmpeg") ? new Error("private parser failure") : null, args.includes("ffprobe") ? JSON.stringify(mocks.probe) : "");
    });
    await expect(encodeStoryVideo(input, options)).rejects.toThrow("Story encoder process failed or timed out");
    expect(mocks.rm).toHaveBeenCalled();
  });
});
