#!/usr/bin/env node
// Production release for the Gravity release lane (.gravity/release.json; shared/plans/gravity-autorelease.md).
// Stages (argv, no shell):
//   build    -> `npm run cf:build` with only the public NEXT_PUBLIC_* values (from the lane), under run-heavy
//   deploy   -> record the live version, upload with BUILD_SHA, refuse unless the new version's bindings equal
//               config/production-bindings.json, promote to 100 %, confirm the deployment
//   rollback -> promote the version recorded by `deploy` again
// The release commit comes from GRAVITY_RELEASE_SHA (set by the lane) or --sha <sha>.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ACCOUNT = "664f242340bcec2f32daaeee15f58bde";
const SCRIPT = "localley-next";
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}`;
const RUN_HEAVY = "/home/dev/projects/CyberLink/shared/scripts/run-heavy.sh";
const STATE = path.resolve(".release");

const stage = process.argv[2];
const shaFlag = process.argv.indexOf("--sha");
const sha = (shaFlag > 0 ? process.argv[shaFlag + 1] : process.env.GRAVITY_RELEASE_SHA) ?? "";

function fail(message) {
  console.error(`[release] ${message}`);
  process.exit(1);
}

function run(argv, { env = process.env, capture = false } = {}) {
  const result = spawnSync(argv[0], argv.slice(1), { env, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", maxBuffer: 64 * 1024 * 1024 });
  if (capture) process.stdout.write(result.stdout ?? "");
  return result;
}

async function cloudflare(pathname) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) fail("CLOUDFLARE_API_TOKEN missing");
  const response = await fetch(API + pathname, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  const body = await response.json();
  if (!response.ok || !body.success) fail(`Cloudflare read failed: ${pathname}`);
  return body.result;
}

const activeVersions = async () => (await cloudflare("/deployments")).deployments[0].versions;

if (!/^[0-9a-f]{40}$/.test(sha)) fail("release sha missing or invalid");

// Public build-time values (inlined into the browser bundle). The lane passes them from
// ~/secrets/keys.env (names in shared/config/gravity-releases.json); none are committed.
const PUBLIC_BUILD_ENV = [
  "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_KAKAO_MAPS_APP_KEY", "NEXT_PUBLIC_KAKAO_REST_API_KEY", "NEXT_PUBLIC_MAPBOX_TOKEN",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED",
];

if (stage === "build") {
  const missing = PUBLIC_BUILD_ENV.filter((name) => !process.env[name]);
  if (missing.length) fail(`public build values missing: ${missing.join(", ")}`);
  // Only the public values and the basics reach the build; never the Cloudflare token.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG ?? "C.UTF-8", CI: "1",
    ...Object.fromEntries(PUBLIC_BUILD_ENV.map((name) => [name, process.env[name]])), BUILD_SHA: sha, NEXT_TELEMETRY_DISABLED: "1" };
  for (let attempt = 1; attempt <= 30; attempt++) {
    const result = run(existsSync(RUN_HEAVY) ? [RUN_HEAVY, "npm", "run", "cf:build"] : ["npm", "run", "cf:build"], { env });
    if (result.status === 0) process.exit(0);
    if (result.status !== 75) fail(`build failed (exit ${result.status})`);
    console.log(`[release] host busy (run-heavy 75), retry ${attempt}/30 in 30 s`);
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  fail("host stayed busy");
}

if (stage === "deploy") {
  mkdirSync(STATE, { recursive: true });
  const before = await activeVersions();
  if (before.length !== 1 || before[0].percentage !== 100) fail("production is not on one version at 100 %; refusing");
  writeFileSync(path.join(STATE, "previous.json"), JSON.stringify(before[0]));

  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT };
  const upload = run(["node", "node_modules/@opennextjs/cloudflare/dist/cli/index.js", "upload", "--env", "production", "--keep-vars",
    "--var", `BUILD_SHA:${sha}`, "--message", `release ${sha.slice(0, 7)}`], { env, capture: true });
  if (upload.status !== 0) fail(`upload failed (exit ${upload.status}): ${(upload.stderr ?? "").slice(-400)}`);
  const id = /Worker Version ID:\s*([0-9a-f-]{36})/.exec(upload.stdout ?? "")?.[1];
  if (!id) fail("upload did not report a version id");

  const expected = JSON.parse(readFileSync("config/production-bindings.json", "utf8")).bindings.map((b) => `${b.name}:${b.type}`).sort();
  const actual = (await cloudflare(`/versions/${id}`)).resources.bindings.map((b) => `${b.name}:${b.type}`).sort();
  const missing = expected.filter((b) => !actual.includes(b));
  const extra = actual.filter((b) => !expected.includes(b));
  if (missing.length || extra.length) fail(`bindings differ; not promoting ${id}. missing=${missing.join(",")} extra=${extra.join(",")}`);

  const promote = run(["node", "node_modules/wrangler/bin/wrangler.js", "versions", "deploy", `${id}@100%`, "--env", "production", "--yes",
    "--message", `release ${sha.slice(0, 7)}`], { env });
  if (promote.status !== 0) fail(`promote failed (exit ${promote.status})`);
  const after = await activeVersions();
  if (after.length !== 1 || after[0].version_id !== id || after[0].percentage !== 100) fail(`promote not confirmed for ${id}`);
  console.log(`[release] live ${sha.slice(0, 7)} = Worker ${id} (previous ${before[0].version_id})`);
  process.exit(0);
}

if (stage === "rollback") {
  const file = path.join(STATE, "previous.json");
  if (!existsSync(file)) fail("no recorded previous version; nothing to roll back");
  const previous = JSON.parse(readFileSync(file, "utf8"));
  const result = run(["node", "node_modules/wrangler/bin/wrangler.js", "versions", "deploy", `${previous.version_id}@100%`, "--env", "production", "--yes",
    "--message", `rollback from ${sha.slice(0, 7)}`], { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
  if (result.status !== 0) fail(`rollback failed (exit ${result.status})`);
  console.log(`[release] rolled back to ${previous.version_id}`);
  process.exit(0);
}

fail(`unknown stage "${stage}" (build | deploy | rollback)`);
