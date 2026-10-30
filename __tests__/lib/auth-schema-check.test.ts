// @vitest-environment node
import { describe, expect, it } from "vitest";
import { schemaCheckFor } from "@better-auth/core/db/internal";
import { createAuthTestDatabase } from "../helpers/d1-sqlite";
import { createAuth } from "@/lib/auth/config";

// Better Auth >= 1.7.14 compares its expected schema with the database on the
// first adapter call and fails every auth request on a mismatch. The auth D1
// migrations must stay in step with the Better Auth config.
function authFor(db: ReturnType<typeof createAuthTestDatabase>) {
  return createAuth({
    database: db as never,
    secret: "s".repeat(48),
    baseURL: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000"],
    sendMail: async () => {},
    google: { clientId: "id", clientSecret: "secret" },
    insecureCookies: true,
    rateLimit: false,
  });
}

describe("Better Auth schema check", () => {
  it("passes on the auth D1 migrations", async () => {
    const ctx = await authFor(createAuthTestDatabase()).$context;
    const check = schemaCheckFor(ctx.adapter);
    expect(check).toBeTypeOf("function");
    await expect(check!()).resolves.toBeUndefined();
  });

  it("fails on a required column Better Auth never writes", async () => {
    const db = createAuthTestDatabase();
    // Shape of the 1.7.0-1.7.2 account table: issuer NOT NULL without a default.
    db.sqlite.exec(`DROP TABLE "account"; CREATE TABLE "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null, "createdAt" date not null, "updatedAt" date not null, "issuer" text not null)`);
    const check = schemaCheckFor((await authFor(db).$context).adapter)!;
    await expect(check()).rejects.toThrow(/schema mismatch/i);
  });
});
