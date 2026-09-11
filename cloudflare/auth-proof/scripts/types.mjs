import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const isolated = process.env.AUTH_PROOF_CLEAN_CHECK === "1";
const home = isolated ? process.env.HOME : `${process.cwd()}/.local`;
const tmp = isolated ? process.env.TMPDIR : `${process.cwd()}/.local/tmp`;
await mkdir(tmp, { recursive: true });
try {
  await writeFile(".dev.vars", `BETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}\nCLAIM_SECRET=${randomBytes(48).toString("hex")}\nPREVIEW_ALLOWED_EMAILS=types-only@example.invalid\nACCESS_SERVICE_CLIENT_CN=types-only.invalid\n`, { flag: "wx", mode: 0o600 });
} catch {
  throw new Error("Type generation requires an absent .dev.vars file; no existing secret file was changed.");
}
try {
  for (const args of [["--strict-vars=false"], ["preview-configuration.d.ts", "--config", "wrangler.preview.template.jsonc", "--env-interface", "PreviewEnv", "--include-runtime=false", "--strict-vars=false"]]) {
    const result = spawnSync("node", ["node_modules/wrangler/bin/wrangler.js", "types", ...args], {
      stdio: "inherit",
      env: { PATH: process.env.PATH, HOME: home, TMPDIR: tmp, XDG_CONFIG_HOME: isolated ? process.env.XDG_CONFIG_HOME : home, XDG_CACHE_HOME: isolated ? process.env.XDG_CACHE_HOME : home, XDG_STATE_HOME: isolated ? process.env.XDG_STATE_HOME : home, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: `${home}/wrangler.log` },
    });
    process.exitCode = result.status ?? 1;
    if (result.status === 0) {
      const file = args[0] === "preview-configuration.d.ts" ? args[0] : "worker-configuration.d.ts";
      const generated = await readFile(file, "utf8");
      await writeFile(file, generated.replace(/[\t ]+$/gm, ""));
    }
    if (result.status !== 0) break;
  }
} finally {
  await rm(".dev.vars");
}
