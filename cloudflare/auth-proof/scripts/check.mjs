import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Only Node built-ins load before the clean child process starts.
const root = fileURLToPath(new URL("../", import.meta.url));
const probe = process.argv[2] === "--verify-environment";
if (process.argv.length > (probe ? 3 : 2)) throw new Error("Unsupported check arguments");
await mkdir(join(root, ".local"), { recursive: true });
const run = await mkdtemp(join(root, ".local/check-"));
try {
  for (const name of ["home", "tmp", "xdg-config", "xdg-cache", "xdg-state", "npm-cache"]) {
    await mkdir(join(run, name), { mode: 0o700 });
  }
  for (const name of ["user.npmrc", "global.npmrc"]) {
    await writeFile(join(run, name), "", { flag: "wx", mode: 0o600 });
  }
  const env = {
    PATH: [dirname(process.execPath), process.env.PATH ?? ""].join(delimiter),
    HOME: join(run, "home"), TMPDIR: join(run, "tmp"),
    XDG_CONFIG_HOME: join(run, "xdg-config"), XDG_CACHE_HOME: join(run, "xdg-cache"), XDG_STATE_HOME: join(run, "xdg-state"),
    npm_config_userconfig: join(run, "user.npmrc"), npm_config_globalconfig: join(run, "global.npmrc"),
    npm_config_cache: join(run, "npm-cache"), npm_config_registry: "https://registry.npmjs.org/",
    npm_config_offline: "true", npm_config_ignore_scripts: "true",
    npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false",
    WRANGLER_SEND_METRICS: "false", AUTH_PROOF_CLEAN_CHECK: "1",
  };
  const execute = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit", timeout: 240_000 });
    if (result.error) throw new Error("Clean check child could not complete");
    return result.status ?? 1;
  };
  if (probe) {
    process.exitCode = execute(process.execPath, ["test/host-environment.mjs"]);
  } else {
    process.exitCode = execute(process.execPath, ["--test", "test/clean-environment.test.mjs"]);
    if (process.exitCode === 0) process.exitCode = execute("npm", ["run", "check:inner"]);
  }
} finally {
  await rm(run, { recursive: true, force: true });
}
