import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const proof = join(root, "cloudflare/auth-proof");
if (process.argv.length !== 2 && (process.argv.length !== 4 || process.argv[2] !== "--browser")) throw new Error("Use --browser <local executable>");
const executable = process.argv[3] ? resolve(process.argv[3]) : join(proof,
  ".preview-private/browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell");
await stat(executable);
await mkdir(join(proof, ".local"), { recursive: true, mode: 0o700 });
const run = await mkdtemp(join(proof, ".local/root-integration-"));
try {
  for (const name of ["home", "tmp", "config", "cache", "state"]) await mkdir(join(run, name), { mode: 0o700 });
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: join(run, "home"), TMPDIR: join(run, "tmp"),
    XDG_CONFIG_HOME: join(run, "config"), XDG_CACHE_HOME: join(run, "cache"), XDG_STATE_HOME: join(run, "state"),
    AUTH_PROOF_BROWSER_CHILD: "1", WRANGLER_SEND_METRICS: "false", LOCAL_INTEGRATION_BROWSER: executable };
  const execute = (args) => new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: proof, env, stdio: "inherit" });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    child.once("error", () => done(1));
    child.once("exit", (code) => { process.off("SIGINT", stop); process.off("SIGTERM", stop); done(code ?? 1); });
  });
  process.exitCode = await execute([join(root, "node_modules/typescript/bin/tsc"), "--project", join(root, "scripts/better-auth-integration/tsconfig.json")]);
  if (!process.exitCode) process.exitCode = await execute(["scripts/build.mjs"]);
  if (!process.exitCode) process.exitCode = await execute(["--test", "--test-concurrency=1", join(root, "scripts/better-auth-integration/native.test.mjs")]);
} finally { await rm(run, { recursive: true, force: true }); }
