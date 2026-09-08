import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

// Import this before third-party host modules. Fail without printing names or secret values.
assert.equal(process.env.AUTH_PROOF_CLEAN_CHECK, "1", "Use npm run check for the isolated validation path");
for (const key of Object.keys(process.env)) {
  assert.ok(!/^(CLOUDFLARE_|CF_|STRIPE_|BETTER_AUTH_|CLAIM_|CLERK_|SUPABASE_|AWS_|AUTH_PROOF_POISON)/i.test(key), "Host service credentials must be absent");
  assert.ok(!/(^|_)(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIALS)(_|$)/i.test(key), "Host secret variables must be absent");
  assert.ok(!/^(NODE_OPTIONS|NODE_PATH|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|npm_config__auth)$/i.test(key), "Host preload and transport overrides must be absent");
}
const run = dirname(process.env.HOME);
assert.ok(run.startsWith(resolve(".local") + sep + "check-"), "Host paths must use a fresh package-local check directory");
for (const key of ["HOME", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME", "npm_config_cache"]) {
  assert.equal(dirname(process.env[key]), run, "Host state must remain in the check directory");
  assert.ok((await stat(process.env[key])).isDirectory());
}
assert.ok(process.env.npm_config_userconfig !== process.env.npm_config_globalconfig, "npm configuration files must be distinct");
for (const key of ["npm_config_userconfig", "npm_config_globalconfig"]) {
  assert.equal(dirname(process.env[key]), run);
  assert.equal(await readFile(process.env[key], "utf8"), "", "npm configuration must be empty");
}
assert.equal(process.env.npm_config_offline, "true");
assert.equal(process.env.npm_config_ignore_scripts, "true");
assert.equal(process.env.npm_config_registry, "https://registry.npmjs.org/");
