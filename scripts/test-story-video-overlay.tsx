/** Run: node --import tsx scripts/test-story-video-overlay.tsx
 * Build first: docker build -t localley-story-encoder:proof infra/story-encoder
 * No production route. Requires a local Linux Docker host, not Vercel/Workers.
 * No paid calls. Only fixed argv; no supplied media paths, filters, or shell.
 * sharp is already installed through Next; no packages are installed by this test.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, lstat, realpath, writeFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { renderStoryVideoOverlay } from "../lib/story-video-overlay";
import { encodeStoryVideo } from "../lib/story-video-encoder";

async function main() {
  assert.equal(process.argv.length, 2, "This test accepts no external inputs");
  assert(process.getuid && process.getuid() !== 0, "Run as a non-root Linux user");
  const parent = resolve("test-results");
  assert.equal((await lstat(parent)).isSymbolicLink(), false);
  assert.equal(await realpath(parent), parent);
  const directory = resolve(parent, "story-video-overlay");
  await mkdir(directory, { recursive: true });
  assert.equal((await lstat(directory)).isSymbolicLink(), false);
  assert.equal(await realpath(directory), directory);
  const artifacts = ["overlay.png", "base.mp4", "sample.mp4", "base-frame.png", "frame.png", "evidence.json"];
  assert((await readdir(directory)).every(file => artifacts.includes(file)), "Do not mount unrelated files or secrets");
  for (const file of artifacts) {
    const stat = await lstat(resolve(directory, file)).catch(error => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    assert(!stat || (stat.isFile() && stat.nlink === 1), "Artifacts must be regular, unlinked local files");
  }
  const options = { title: "서울 골목 여행", caption: "성수동에서 만나는 동네 이야기\nAI-generated travel scene\nTEST / SYNTHETIC INPUT", durationSeconds: 4 };
  const png = await renderStoryVideoOverlay(options);
  await writeFile(resolve(directory, "overlay.png"), png);
  const image = "localley-story-encoder:proof";
  const name = `localley-overlay-proof-${process.pid}`;
  // Do not inherit application credentials, Docker overrides, or environment files.
  const env: NodeJS.ProcessEnv = { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/nonexistent", NODE_ENV: "test" };
  const docker = (args: string[], timeout = 180_000) => {
    const result = spawnSync("docker", args, { env, encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error("Offline Docker check failed");
    return result.stdout;
  };
  const run = (args: string[]) => docker([
    "run", "--rm", "--pull", "never", "--name", name, "--network", "none", "--cpus", "0.5", "--memory", "512m",
    "--memory-swap", "512m", "--pids-limit", "128", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--user", `${process.getuid!()}:${process.getgid!()}`,
    "--mount", `type=bind,src=${directory},dst=/artifacts`, image, ...args,
  ]);
  const cleanup = () => spawnSync("docker", ["rm", "-f", name], { env, timeout: 10_000, stdio: "ignore" });
  const interrupt = () => { cleanup(); process.exit(130); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const ffmpeg = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"];
  try {
    const imageId = docker(["image", "inspect", "--format", "{{.Id}}", image]).trim();
    run([...ffmpeg, "-f", "lavfi", "-i", "color=c=0x302050:s=768x1360:r=24:d=4", "-t", "4", "-an", "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-metadata", "title=TEST synthetic solid color - no real footage", "/artifacts/base.mp4"]);
    process.env.STORY_VIDEO_WORK_DIR = resolve(parent, "story-encoder-work");
    await writeFile(resolve(directory, "sample.mp4"), await encodeStoryVideo(await readFile(resolve(directory, "base.mp4")), options));
    assert.deepEqual(await readdir(process.env.STORY_VIDEO_WORK_DIR), [], "Private job directory must be removed");
    const probe = JSON.parse(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", "/artifacts/sample.mp4"]));
    assert.equal(probe.streams.length, 1);
    const stream = probe.streams[0];
    assert.equal(stream.codec_name, "h264");
    assert.equal(stream.pix_fmt, "yuv420p");
    assert.equal(stream.width, 1080);
    assert.equal(stream.height, 1920);
    assert.equal(stream.display_aspect_ratio, "9:16");
    assert.equal(Number(probe.format.duration), 4);
    assert.equal(Number(stream.nb_frames), 96);
    run([...ffmpeg, "-ss", "2", "-i", "/artifacts/sample.mp4", "-frames:v", "1", "-threads", "1", "/artifacts/frame.png"]);
    run([...ffmpeg, "-ss", "2", "-i", "/artifacts/base.mp4", "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1", "-frames:v", "1", "-threads", "1", "/artifacts/base-frame.png"]);
    const overlay = await sharp(png).ensureAlpha().raw().toBuffer();
    const frame = await sharp(await readFile(resolve(directory, "frame.png"))).ensureAlpha().raw().toBuffer();
    const base = await sharp(await readFile(resolve(directory, "base-frame.png"))).ensureAlpha().raw().toBuffer();
    let textPixels = 0;
    let burnedPixels = 0;
    let clearPixels = 0;
    let unchangedPixels = 0;
    for (let y = 0; y < 1920; y++) for (let x = 0; x < 1080; x++) {
      const i = (y * 1080 + x) * 4;
      const difference = Math.max(...[0, 1, 2].map(c => Math.abs(frame[i + c] - base[i + c])));
      // Title/caption glyph interiors, not the fixed TEST label or a panel.
      if (y >= 960 && y < 1400 && overlay[i + 3] === 255) {
        textPixels++;
        if (difference > 100 && frame[i] > 220 && frame[i + 1] > 220 && frame[i + 2] > 220) burnedPixels++;
      }
      if (y < 180 || y >= 1600) {
        clearPixels++;
        if (difference <= 8) unchangedPixels++;
      }
    }
    assert(textPixels > 1000);
    assert(burnedPixels / textPixels > 0.95, "Text must be present in decoded MP4 pixels");
    assert(unchangedPixels / clearPixels > 0.99, "Safe zones must preserve the base video");
    const evidence = { imageId, options, probe, textPixels, burnedPixels, clearPixels, unchangedPixels, synthetic: true, paidCalls: 0 };
    await writeFile(resolve(directory, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ directory, textPixels, burnedPixels, duration: probe.format.duration, codec: stream.codec_name }));
  } finally {
    cleanup();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
