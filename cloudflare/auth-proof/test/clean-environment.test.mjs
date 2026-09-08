import "./host-environment.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { test } from "node:test";

test("clean wrapper strips poisoned host variables and removes its temporary directory", async () => {
  const before = (await readdir(".local")).filter((name) => name.startsWith("check-")).sort();
  const result = spawnSync(process.execPath, ["scripts/check.mjs", "--verify-environment"], {
    cwd: process.cwd(), timeout: 15_000, encoding: "utf8",
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: "fake-poison-marker", STRIPE_SECRET_KEY: "fake-poison-marker",
      BETTER_AUTH_SECRET: "fake-poison-marker", CLAIM_SECRET: "fake-poison-marker",
      NPM_TOKEN: "fake-poison-marker", npm_config__auth: "fake-poison-marker",
      npm_config_userconfig: "/fake-poison/user.npmrc", npm_config_globalconfig: "/fake-poison/global.npmrc",
      HTTPS_PROXY: "https://fake-poison.invalid", NODE_PATH: "/fake-poison", NODE_OPTIONS: "--no-warnings",
      AUTH_PROOF_POISON: "fake-poison-marker",
    },
  });
  // Do not print child output: a regression could include inherited credentials.
  assert.equal(result.status, 0, "Poisoned-parent probe must pass the child environment assertions");
  assert.equal(result.stdout.length + result.stderr.length, 0, "Probe must not print environment values");
  assert.deepEqual((await readdir(".local")).filter((name) => name.startsWith("check-")).sort(), before);
});
