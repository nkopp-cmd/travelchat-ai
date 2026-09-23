/**
 * Rehearses the Clerk -> Better Auth import on a THROWAWAY SQLite/D1 file.
 *
 *   npx tsx scripts/auth/rehearse-migration.mts --users <users.json> --db <file.sqlite>
 *
 * <file.sqlite> is a local file: either a fresh path, or the miniflare file behind
 * `wrangler d1 execute ... --local --persist-to <dir>` after the import SQL ran there.
 * For every exported user it checks: the row exists with the Clerk id and a verified
 * email; a magic link signs in as that id; forgot-password sets a first password and
 * email+password then signs in as that id. Mail goes to an in-memory list. Prints
 * counts and booleans only, never emails. Never point it at a remote database.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { D1Sqlite } from "../../__tests__/helpers/d1-sqlite";
import { createAuth, type AuthMail } from "../../lib/auth/config";
// @ts-expect-error plain ESM script without types
import { toInsertSql } from "./clerk-to-better-auth.mjs";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const usersFile = arg("users");
  const dbFile = arg("db");
  if (!usersFile || !dbFile) throw new Error("--users and --db are required");
  const users = JSON.parse(readFileSync(usersFile, "utf8")) as Array<{ id: string; email: string }>;
  const d1 = new D1Sqlite(dbFile);
  const hasSchema = d1.sqlite.prepare(`select count(*) n from sqlite_master where name = 'user'`).get() as { n: number };
  if (!hasSchema.n) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations/auth");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) d1.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
    d1.sqlite.exec(toInsertSql(users));
  }

  const mails: AuthMail[] = [];
  const base = "http://localhost:3000";
  const auth = createAuth({
    database: d1 as never, secret: "rehearsal-only-secret-5c1f0e9a7b3d2c4e6f8a", baseURL: base, trustedOrigins: [base],
    sendMail: async (m) => { mails.push(m); }, insecureCookies: true, rateLimit: false,
  });
  const cookieOf = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");
  const post = (p: string, body: unknown) => auth.handler(new Request(`${base}/api/auth${p}`, {
    method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify(body),
  }));
  const sessionUserId = async (cookie: string) =>
    (await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id ?? null;

  const result = { users: users.length, rowsWithSameId: 0, verified: 0, magicLinkKeepsId: 0, resetThenPasswordKeepsId: 0, accountsBefore: 0, newUsersCreated: 0 };
  result.accountsBefore = (d1.sqlite.prepare(`select count(*) n from account`).get() as { n: number }).n;
  const userCountBefore = (d1.sqlite.prepare(`select count(*) n from "user"`).get() as { n: number }).n;

  for (const u of users) {
    const row = d1.sqlite.prepare(`select id, emailVerified from "user" where email = ?`).get(u.email) as { id: string; emailVerified: number } | undefined;
    if (row?.id === u.id) result.rowsWithSameId++;
    if (row?.emailVerified === 1) result.verified++;

    await post("/sign-in/magic-link", { email: u.email, callbackURL: "/dashboard" });
    const magic = mails.filter((m) => m.kind === "magic-link" && m.to === u.email).at(-1);
    if (magic) {
      const landed = await auth.handler(new Request(magic.url, { redirect: "manual" }));
      if ((await sessionUserId(cookieOf(landed))) === u.id) result.magicLinkKeepsId++;
    }

    await post("/request-password-reset", { email: u.email, redirectTo: "/reset-password" });
    const reset = mails.filter((m) => m.kind === "reset-password" && m.to === u.email).at(-1);
    if (reset) {
      const token = new URL(reset.url).pathname.split("/").pop()!;
      const password = `Rehearsal-${Math.random().toString(36).slice(2)}-9`;
      const done = await post("/reset-password", { token, newPassword: password });
      const signIn = await post("/sign-in/email", { email: u.email, password });
      if (done.ok && signIn.ok && (await sessionUserId(cookieOf(signIn))) === u.id) result.resetThenPasswordKeepsId++;
    }
  }
  result.newUsersCreated = (d1.sqlite.prepare(`select count(*) n from "user"`).get() as { n: number }).n - userCountBefore;
  console.log(JSON.stringify(result));
  const ok = result.rowsWithSameId === users.length && result.verified === users.length
    && result.magicLinkKeepsId === users.length && result.resetThenPasswordKeepsId === users.length && result.newUsersCreated === 0;
  if (!ok) process.exit(1);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
