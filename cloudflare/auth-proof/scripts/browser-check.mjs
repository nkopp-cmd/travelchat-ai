import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Opt-in, clean host process. Never inherit provider secrets or TLS overrides.
const root = fileURLToPath(new URL("../", import.meta.url));
let mode;
let executablePath;
for (const arg of process.argv.slice(2)) {
  if (["--serve", "--fresh"].includes(arg) && !mode) mode = arg;
  else if (arg.startsWith("--browser-executable=") && !executablePath && arg.slice(21)) executablePath = resolve(arg.slice(21));
  else throw new Error("Unsupported browser-check arguments");
}
if (executablePath && !(await stat(executablePath)).isFile()) throw new Error("Missing browser executable");
if (!(await stat(join(root, "scripts"))).isDirectory()) throw new Error("Missing package scripts");
await mkdir(join(root, ".local"), { recursive: true, mode: 0o700 });
const run = await mkdtemp(join(root, ".local/browser-check-"));
try {
  for (const name of ["home", "tmp", "config", "cache", "state"]) await mkdir(join(run, name), { mode: 0o700 });
  const env = {
    PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`, HOME: join(run, "home"), TMPDIR: join(run, "tmp"),
    XDG_CONFIG_HOME: join(run, "config"), XDG_CACHE_HOME: join(run, "cache"), XDG_STATE_HOME: join(run, "state"),
    AUTH_PROOF_BROWSER_CHILD: "1", WRANGLER_SEND_METRICS: "false",
    PLAYWRIGHT_BROWSERS_PATH: join(root, "node_modules/.cache/playwright"),
    ...(executablePath ? { AUTH_PROOF_BROWSER_EXECUTABLE: executablePath } : {}),
  };
  const execute = (args) => new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit" });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    child.once("error", () => done(1));
    child.once("exit", (code) => { process.off("SIGINT", stop); process.off("SIGTERM", stop); done(code ?? 1); });
  });
  if (mode === "--fresh") {
    // Rebuildable outputs only. Run the exact npm-check entry point with no assets directory.
    await rm(join(root, "dist"), { recursive: true, force: true });
    process.exitCode = await execute(["scripts/check.mjs"]);
  } else process.exitCode = await execute(["scripts/build.mjs"]);
  if (process.exitCode === 0) process.exitCode = await execute(mode === "--serve"
    ? ["scripts/local-server.mjs"] : ["--test", "--test-concurrency=1", "test/browser.test.mjs"]);
} finally { await rm(run, { recursive: true, force: true }); }
