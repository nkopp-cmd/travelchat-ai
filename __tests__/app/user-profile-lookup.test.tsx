import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
import { generateMetadata } from "@/app/users/[username]/page";

type Row = Record<string, unknown>;
let users: Row[];
const calls: Array<[string, string, unknown]> = [];
function client() {
  return {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters.push([column, value]); calls.push([table, column, value]); return query; },
        or: () => { throw new Error("or() must not be used"); },
        maybeSingle: async () => {
          const rows = users.filter((row) => filters.every(([column, value]) => row[column] === value));
          return rows.length > 1 ? { data: null, error: { code: "PGRST116" } } : { data: rows[0] ?? null, error: null };
        },
        single: async () => ({ data: null, error: { code: "PGRST116" } }),
      };
      return query;
    },
  };
}
beforeEach(() => {
  calls.length = 0;
  users = [
    { id: "1", clerk_id: "user_abc", username: "mina", name: "Mina", email: "mina@example.com", created_at: "2026-01-01" },
    { id: "2", clerk_id: "user_def", username: "jun", name: "Jun", email: "jun@example.com", created_at: "2026-01-01" },
  ];
  mocks.admin.mockImplementation(client);
});

describe("public profile lookup", () => {
  it("finds a profile by exact username, then by exact user id", async () => {
    expect((await generateMetadata({ params: Promise.resolve({ username: "mina" }) })).title).toContain("Mina");
    expect((await generateMetadata({ params: Promise.resolve({ username: "user_def" }) })).title).toContain("Jun");
    expect(calls.filter(([table]) => table === "users")).toEqual([
      ["users", "username", "mina"], ["users", "username", "user_def"], ["users", "clerk_id", "user_def"],
    ]);
  });

  it("rejects PostgREST filter syntax before any query", async () => {
    for (const segment of ["x,email.eq.mina@example.com", "a)", "mina.eq", "name.ilike.*", "", "a".repeat(65)]) {
      expect((await generateMetadata({ params: Promise.resolve({ username: segment }) })).title).toBe("User Not Found | Localley");
    }
    expect(calls).toEqual([]);
  });

  it("fails closed when a username is not unique", async () => {
    users.push({ id: "3", clerk_id: "user_ghi", username: "mina", name: "Other", created_at: "2026-01-01" });
    expect((await generateMetadata({ params: Promise.resolve({ username: "mina" }) })).title).toBe("User Not Found | Localley");
  });

  it("never builds a filter string from the URL", () => {
    expect(readFileSync("app/users/[username]/page.tsx", "utf8")).not.toMatch(/\.or\(`/);
  });
});
