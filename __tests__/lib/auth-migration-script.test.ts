// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { toInsertSql, toMigrationUser } from "@/scripts/auth/clerk-to-better-auth.mjs";

const clerkUser = {
  id: "user_38VRexample", first_name: "Nils", last_name: "O'Brien", password_enabled: false,
  primary_email_address_id: "idn_2",
  email_addresses: [
    { id: "idn_1", email_address: "old@example.test", verification: { status: "unverified" } },
    { id: "idn_2", email_address: "Primary@Example.test", verification: { status: "verified", strategy: "from_oauth_google" } },
  ],
  external_accounts: [{ provider: "oauth_google", avatar_url: "https://lh3.googleusercontent.com/a/x", image_url: "https://img.clerk.com/y" }],
  created_at: Date.parse("2026-01-20T08:00:00Z"), updated_at: Date.parse("2026-07-24T08:00:00Z"),
  unsafe_metadata: { bio: "Travel nerd" },
};

describe("Clerk export mapping", () => {
  it("keeps the Clerk id and the primary verified email", () => {
    expect(toMigrationUser(clerkUser)).toMatchObject({
      id: "user_38VRexample", email: "primary@example.test", emailVerified: true,
      name: "Nils O'Brien", firstName: "Nils", lastName: "O'Brien",
      image: "https://lh3.googleusercontent.com/a/x", bio: "Travel nerd",
      createdAt: "2026-01-20T08:00:00.000Z", providers: ["oauth_google"], hadPassword: false,
    });
  });

  it("skips a user without an email", () => {
    expect(toMigrationUser({ ...clerkUser, email_addresses: [] })).toEqual({ skip: "no email", id: "user_38VRexample" });
  });

  it("writes idempotent, escaped SQL and rejects unexpected ids", () => {
    const sql = toInsertSql([toMigrationUser(clerkUser)]);
    expect(sql).toContain(`'Nils O''Brien'`);
    expect(sql).toContain(`ON CONFLICT("id") DO NOTHING;`);
    expect(sql).not.toMatch(/password|account/i);
    expect(() => toInsertSql([{ ...toMigrationUser(clerkUser), id: "x'); drop table user; --" }])).toThrow(/Clerk id/);
  });
});
