import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const isolated = process.env.AUTH_PROOF_CLEAN_CHECK === "1";
const home = isolated ? process.env.HOME : `${process.cwd()}/.local`;
const tmp = isolated ? process.env.TMPDIR : `${process.cwd()}/.local/tmp`;
await mkdir(tmp, { recursive: true });
try {
  await writeFile(".dev.vars", `BETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}\nCLAIM_SECRET=${randomBytes(48).toString("hex")}\n`, { flag: "wx", mode: 0o600 });
} catch {
  throw new Error("Type generation requires an absent .dev.vars file; no existing secret file was changed.");
}
try {
  const result = spawnSync("node", ["node_modules/wrangler/bin/wrangler.js", "types"], {
    stdio: "inherit",
    env: { PATH: process.env.PATH, HOME: home, TMPDIR: tmp, XDG_CONFIG_HOME: isolated ? process.env.XDG_CONFIG_HOME : home, XDG_CACHE_HOME: isolated ? process.env.XDG_CACHE_HOME : home, XDG_STATE_HOME: isolated ? process.env.XDG_STATE_HOME : home, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: `${home}/wrangler.log` },
  });
  process.exitCode = result.status ?? 1;
  if (result.status === 0) {
    const generated = await readFile("worker-configuration.d.ts", "utf8");
    await writeFile("worker-configuration.d.ts", generated.replace(/[\t ]+$/gm, ""));
  }
} finally {
  await rm(".dev.vars");
}
