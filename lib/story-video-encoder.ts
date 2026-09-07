import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderStoryVideoOverlay } from "./story-video-overlay";

const MAX_BYTES = 32 * 1024 * 1024;
const env: NodeJS.ProcessEnv = { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/nonexistent", NODE_ENV: "production" };
type Options = { title: string; caption: string; durationSeconds: number };

/** Local Linux Docker only. The caller supplies the AI disclosure in caption. */
export async function encodeStoryVideo(input: Buffer, options: Options): Promise<Buffer> {
  const deadline = Date.now() + 180_000;
  if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_BYTES) throw new Error("Video must contain 1 to 32MB");
  if (input.length < 12 || input.toString("ascii", 4, 8) !== "ftyp" ||
      !["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso8", "iso9", "mp41", "mp42", "avc1", "hvc1", "hev1", "dash", "M4V "].includes(input.toString("ascii", 8, 12))) {
    throw new Error("Video must be MP4");
  }
  const png = await renderStoryVideoOverlay({ title: options?.title, caption: options?.caption, durationSeconds: options?.durationSeconds });
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (!uid || gid === undefined) throw new Error("Encoder requires a non-root Linux Docker host");
  const root = resolve(process.env.STORY_VIDEO_WORK_DIR || tmpdir());
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root || root.includes(",")) {
    throw new Error("Encoder work directory must be a real local directory");
  }
  const directory = await mkdtemp(join(root, "story-encoder-"));
  const name = `localley-story-${randomUUID()}`;
  const execute = (args: string[], timeout: number): Promise<string> => new Promise((accept, reject) => {
    execFile("docker", args, { env, timeout, killSignal: "SIGKILL", maxBuffer: 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
      // Never expose media metadata, parser stderr, or local paths to callers.
      if (error) reject(new Error("Story encoder process failed or timed out"));
      else accept(stdout);
    });
  });
  const cleanup = () => execute(["rm", "-f", name], 5_000).catch(() => "");
  const run = async (args: string[], writable = false) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Story encoder deadline exceeded");
    try {
      return await execute([
        "run", "--rm", "--pull", "never", "--name", name,
        "--network", "none", "--cpus", "0.5", "--memory", "512m", "--memory-swap", "512m",
        "--pids-limit", "128", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--user", `${uid}:${gid}`, "--ulimit", `fsize=${MAX_BYTES}:${MAX_BYTES}`,
        "--mount", `type=bind,src=${directory},dst=/artifacts${writable ? "" : ",readonly"}`,
        "localley-story-encoder:proof", ...args,
      ], Math.min(120_000, remaining));
    } catch (error) {
      await cleanup();
      throw error;
    }
  };
  const probe = async (file: string, output = false) => {
    const data = JSON.parse(await run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov",
      "-show_streams", "-show_format", "-of", "json", file]));
    const fail = () => { throw new Error("Video does not meet story encoder media constraints"); };
    const duration = Number(data.format?.duration);
    if (!data.format?.format_name?.split(",").includes("mp4") || !Number.isFinite(duration) || duration <= 0 ||
        duration > 6.5 || Math.abs(duration - options.durationSeconds) > 0.2 ||
        !Array.isArray(data.streams) || data.streams.length < 1 || data.streams.length > (output ? 1 : 2)) fail();
    let videos = 0;
    let audios = 0;
    for (const stream of data.streams) {
      if (stream.duration !== undefined && (!Number.isFinite(Number(stream.duration)) || Number(stream.duration) <= 0 ||
          Number(stream.duration) > 6.5 || Math.abs(Number(stream.duration) - options.durationSeconds) > 0.2)) fail();
      if (stream.disposition?.attached_pic || stream.tags?.rotate && Number(stream.tags.rotate) !== 0 ||
          stream.side_data_list?.some((side: { rotation?: number; side_data_type?: string }) =>
            side.side_data_type !== "Display Matrix" || side.rotation !== 0)) fail();
      if (stream.codec_type === "audio") {
        if (output || stream.codec_name !== "aac" || ++audios > 1) fail();
        continue;
      }
      if (stream.codec_type !== "video" || ++videos > 1 || !["h264", "hevc"].includes(stream.codec_name)) fail();
      const { width, height } = stream;
      const rate = (value: string) => {
        if (typeof value !== "string" || !/^\d+\/\d+$/.test(value)) return NaN;
        const [n, d] = value.split("/").map(Number);
        return n / d;
      };
      const fps = rate(stream.avg_frame_rate);
      const peak = rate(stream.r_frame_rate);
      const frames = stream.nb_frames === undefined || stream.nb_frames === "N/A" ? Math.ceil(duration * Math.max(fps, peak)) : Number(stream.nb_frames);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 2048 || height > 2048 ||
          Math.abs(width / height / (9 / 16) - 1) > 0.02 || stream.sample_aspect_ratio !== "1:1" ||
          !Number.isFinite(fps) || fps <= 0 || fps > 60 || !Number.isFinite(peak) || peak <= 0 || peak > 60 ||
          !Number.isInteger(frames) || frames <= 0 || frames > 400) fail();
      if (output && (width !== 1080 || height !== 1920 || stream.codec_name !== "h264" ||
          stream.pix_fmt !== "yuv420p" || fps !== 24 || Math.abs(duration - options.durationSeconds) > 1 / 24 + 0.001 ||
          frames !== Math.ceil(options.durationSeconds * 24))) fail();
    }
    if (videos !== 1) fail();
  };
  const ffmpeg = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-xerror", "-threads", "1",
    "-filter_threads", "1", "-filter_complex_threads", "1"];
  const mediaInput = (file: string) => ["-err_detect", "explode", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov", "-i", file];
  const decode = (file: string) => run([...ffmpeg, ...mediaInput(file), "-map", "0", "-threads", "1", "-f", "null", "-"]);
  try {
    await writeFile(join(directory, "input.mp4"), input, { mode: 0o600, flag: "wx" });
    await writeFile(join(directory, "overlay.png"), png, { mode: 0o600, flag: "wx" });
    await probe("/artifacts/input.mp4");
    await decode("/artifacts/input.mp4");
    await run([...ffmpeg, ...mediaInput("/artifacts/input.mp4"),
      "-protocol_whitelist", "file,pipe", "-threads", "1", "-i", "/artifacts/overlay.png",
      "-filter_complex", "[0:v:0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=0.2[base];[base][1:v:0]overlay=0:0,format=yuv420p[v]",
      "-map", "[v]", "-an", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1",
      "-t", String(options.durationSeconds), "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "/artifacts/output.mp4"], true);
    const path = join(directory, "output.mp4");
    const stat = await lstat(path);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size <= 0 || stat.size > MAX_BYTES) throw new Error("Invalid encoded video size or file");
    await probe("/artifacts/output.mp4", true);
    await decode("/artifacts/output.mp4");
    if (Date.now() >= deadline) throw new Error("Story encoder deadline exceeded");
    return await readFile(path);
  } finally {
    await cleanup();
    await rm(directory, { recursive: true, force: true });
  }
}
