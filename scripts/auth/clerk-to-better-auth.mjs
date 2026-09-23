#!/usr/bin/env node
/**
 * Clerk -> Better Auth user migration for Localley (D1 auth store).
 *
 *   export  --out <users.json>                 reads CLERK_SECRET_KEY from the environment
 *   sql     --in <users.json> --out <users.sql>
 *
 * Users keep their Clerk id (user_...) as the Better Auth user id, with a verified
 * email and NO password or account row. They sign in with a magic link, "forgot
 * password", or Google (linked by verified email once GOOGLE_CLIENT_ID is set).
 *
 * The script never talks to D1. Apply the SQL with wrangler:
 *   rehearsal:  npx wrangler d1 execute localley-auth-preview --local --file <users.sql>
 *   production: APPROVAL REQUIRED (docs/AUTH_BETTER_AUTH.md, step A4)
 *
 * Output files hold personal data (emails). They are written with mode 600; keep
 * them in a mode-700 directory and shred them after use. The script prints counts only.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const command = args[0];
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > 0 ? args[i + 1] : undefined;
};

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

export function toMigrationUser(clerkUser) {
  const primary = (clerkUser.email_addresses || []).find((e) => e.id === clerkUser.primary_email_address_id)
    || (clerkUser.email_addresses || [])[0];
  const email = primary?.email_address?.trim().toLowerCase();
  if (!email) return { skip: "no email", id: clerkUser.id };
  const verified = primary.verification?.status === "verified";
  const firstName = clerkUser.first_name || null;
  const lastName = clerkUser.last_name || null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
  // Prefer the provider avatar: img.clerk.com URLs stop working once Clerk is retired.
  const external = (clerkUser.external_accounts || []).find((a) => a.avatar_url || a.image_url);
  const image = external?.avatar_url || null;
  return {
    id: clerkUser.id,
    email,
    emailVerified: verified,
    name,
    firstName,
    lastName,
    image,
    bio: typeof clerkUser.unsafe_metadata?.bio === "string" ? clerkUser.unsafe_metadata.bio : null,
    createdAt: new Date(clerkUser.created_at).toISOString(),
    updatedAt: new Date(clerkUser.updated_at || clerkUser.created_at).toISOString(),
    providers: (clerkUser.external_accounts || []).map((a) => a.provider),
    hadPassword: Boolean(clerkUser.password_enabled),
  };
}

const sqlString = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

export function toInsertSql(users) {
  const lines = [
    "-- Localley Clerk -> Better Auth user import. Idempotent on id; a clashing email aborts the file.",
  ];
  for (const u of users) {
    if (!/^user_[A-Za-z0-9]+$/.test(u.id)) throw new Error("unexpected Clerk id format");
    lines.push(
      `INSERT INTO "user" ("id","name","email","emailVerified","image","createdAt","updatedAt","firstName","lastName","bio") VALUES (`
      + [u.id, u.name, u.email].map(sqlString).join(",")
      + `,${u.emailVerified ? 1 : 0},${sqlString(u.image)},${sqlString(u.createdAt)},${sqlString(u.updatedAt)},`
      + [u.firstName, u.lastName, u.bio].map(sqlString).join(",")
      + `) ON CONFLICT("id") DO NOTHING;`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function exportUsers(out) {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) fail("CLERK_SECRET_KEY is not set");
  const users = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(`https://api.clerk.com/v1/users?limit=100&offset=${offset}&order_by=created_at`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) fail(`Clerk API status ${response.status}`);
    const page = await response.json();
    users.push(...page);
    if (page.length < 100) break;
  }
  const mapped = users.map(toMigrationUser);
  const skipped = mapped.filter((u) => u.skip);
  const ready = mapped.filter((u) => !u.skip);
  writeFileSync(out, `${JSON.stringify(ready, null, 2)}\n`, { mode: 0o600 });
  const providers = {};
  for (const u of ready) for (const p of u.providers.length ? u.providers : ["email"]) providers[p] = (providers[p] || 0) + 1;
  console.log(JSON.stringify({
    exported: ready.length,
    skipped: skipped.length,
    verified: ready.filter((u) => u.emailVerified).length,
    withPassword: ready.filter((u) => u.hadPassword).length,
    providers,
    distinctEmails: new Set(ready.map((u) => u.email)).size,
  }));
}

function writeSql(input, out) {
  const users = JSON.parse(readFileSync(input, "utf8"));
  if (new Set(users.map((u) => u.email)).size !== users.length) fail("duplicate emails in export");
  writeFileSync(out, toInsertSql(users), { mode: 0o600 });
  console.log(JSON.stringify({ statements: users.length }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (command === "export") {
    const out = option("out");
    if (!out) fail("--out is required");
    await exportUsers(out);
  } else if (command === "sql") {
    const input = option("in");
    const out = option("out");
    if (!input || !out) fail("--in and --out are required");
    writeSql(input, out);
  } else {
    fail("usage: clerk-to-better-auth.mjs export --out users.json | sql --in users.json --out users.sql");
  }
}
