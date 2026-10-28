// @vitest-environment node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { d1Client, TABLES } from "@/lib/app-data/d1-postgrest";
import * as projection from "@/lib/spots/projection";

/**
 * Supabase exit guardrail (shared/plans/localley-decisions.md 2026-10-24): every `.from("<table>")` chain in the app
 * either targets a facade table with only supported methods and plain column selects, or is listed below as still
 * served by Supabase / waiting for a hand port. A new table or a new chain shape fails here instead of at runtime
 * under DATA_BACKEND=d1. Shrink these lists as tables move; never grow them without a plan line.
 */
const STILL_ON_SUPABASE = new Set<string>([
  // Dead code: lib/web-push.ts (only caller lib/notification-triggers.ts has no importer) queries tables that do not
  // exist in Supabase (PGRST205); notifications live in AUTH_DB. Removed with the Supabase clients in step 8.
  "notifications", "notification_preferences", "push_subscriptions",
]);

/** Chains on facade tables that the facade cannot answer yet (embedded selects etc.): "file#table" -> reason. */
const HAND_PORT_PENDING: Record<string, string> = {
  // D1 branch done (two owner-scoped reads); the embed stays on the Supabase branch until Supabase is removed.
  "app/api/conversations/route.ts#conversations": "embed kept for the Supabase branch",
  "app/api/admin/payouts/execute/route.ts#guide_earnings": "guide_earnings embeds guide_profiles!inner (admin payouts, 0 rows)",
  "app/spots/[id]/page.tsx#social_spot_submissions": "contains(research); the D1 detail path (PR582) reads it by hand",
};

/**
 * Live queries that name columns Postgres does not have (42703 on Supabase too). Listed until their fix ships:
 * "file#table" -> reason. The guard found them; each entry needs a plan line.
 */
const KNOWN_SCHEMA_BUGS: Record<string, string> = {
  "app/api/user/email-preferences/route.ts#users": "users.email_preferences has no column; storage decided at the D1 cutover",
};

/** Postgres functions not ported yet: name -> why calling them under DATA_BACKEND=d1 cannot happen today. */
const DEFERRED_RPCS: Record<string, string> = {
  calculate_monthly_earnings: "guide payouts are not live (guide tables have 0 rows); port before the first payout run",
};

const SUPPORTED = new Set(["select", "insert", "upsert", "update", "delete", "ilike", "match", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not",
  "order", "limit", "range", "single", "maybeSingle", "abortSignal"]);

/** A select argument resolved to its possible string values; null = could not resolve statically. */
type Chain = { file: string; line: number; table: string; methods: string[]; selects: (string[] | null)[] };

/** Imported select constants, resolved by their runtime value. */
const IMPORTED: Record<string, string> = { PUBLIC_SPOT_SELECT: projection.PUBLIC_SPOT_SELECT, PUBLIC_SPOT_CARD_SELECT: projection.PUBLIC_SPOT_CARD_SELECT };

function resolveStrings(node: ts.Node, source: ts.SourceFile, seen = new Set<ts.Node>()): string[] | null {
  if (seen.has(node)) return null;
  seen.add(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return resolveStrings(node.expression, source, seen);
  if (ts.isConditionalExpression(node)) {
    const a = resolveStrings(node.whenTrue, source, seen), b = resolveStrings(node.whenFalse, source, seen);
    return a && b ? [...a, ...b] : null;
  }
  const name = ts.isIdentifier(node) ? node.text : ts.isCallExpression(node) && ts.isIdentifier(node.expression) ? node.expression.text : null;
  if (!name) return null;
  if (ts.isIdentifier(node) && name in IMPORTED) return [IMPORTED[name]];
  let found: string[] | null = null;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(node) && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      found = resolveStrings(n.initializer, source, seen);
    }
    if (ts.isCallExpression(node) && ts.isFunctionDeclaration(n) && n.name?.text === name && n.body) {
      const returns: string[] = [];
      let ok = true;
      const collect = (r: ts.Node) => {
        if (ts.isReturnStatement(r) && r.expression) { const v = resolveStrings(r.expression, source, seen); if (v) returns.push(...v); else ok = false; }
        ts.forEachChild(r, collect);
      };
      collect(n.body);
      found = ok && returns.length ? returns : null;
    }
    ts.forEachChild(n, visit);
  };
  visit(source);
  return found;
}

function chains(): Chain[] {
  const files = execSync("git ls-files ':(glob)app/**/*.ts' ':(glob)app/**/*.tsx' ':(glob)lib/**/*.ts' ':(glob)lib/**/*.tsx'", { encoding: "utf8" }).trim().split("\n");
  const out: Chain[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(".from(")) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "from"
        && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
        && !/(storage|Buffer|Array|Uint8Array|Object)\s*$/.test(node.expression.expression.getText(source))) {
        const chain: Chain = { file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, table: node.arguments[0].text, methods: [], selects: [] };
        let current: ts.Node = node;
        while (ts.isPropertyAccessExpression(current.parent) && ts.isCallExpression(current.parent.parent)) {
          const call = current.parent.parent;
          chain.methods.push(current.parent.name.text);
          if (current.parent.name.text === "select" && call.arguments[0]) chain.selects.push(resolveStrings(call.arguments[0], source));
          current = call;
        }
        out.push(chain);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

const NO_DB = { prepare: () => { throw new Error("no database in the coverage guard"); }, batch: async () => [] } as never;

describe("D1 facade coverage", () => {
  const all = chains().filter((c) => !c.file.startsWith("lib/app-data/"));

  it("finds the app's Supabase chains", () => {
    expect(all.length).toBeGreaterThan(200);
  });

  it("every table is on the facade or explicitly still on Supabase", () => {
    const unknown = [...new Set(all.map((c) => c.table))].filter((t) => !(t in TABLES) && !STILL_ON_SUPABASE.has(t));
    expect(unknown).toEqual([]);
  });

  it("chains on facade tables use only supported methods and plain column selects", () => {
    const problems = all.filter((c) => c.table in TABLES && !(`${c.file}#${c.table}` in HAND_PORT_PENDING)
      && !(`${c.file}#${c.table}` in KNOWN_SCHEMA_BUGS)).flatMap((c) => {
      const bad = c.methods.filter((m) => !SUPPORTED.has(m)).map((m) => `method ${m}`);
      for (const candidates of c.selects) {
        if (!candidates) { bad.push("unresolved select"); continue; }
        // Validate with the facade's own parser (no database access happens on select()).
        for (const candidate of candidates) {
          try { d1Client(NO_DB, { role: "service" }).from(c.table).select(candidate); }
          catch (e) { bad.push(`select "${candidate.replace(/\s+/g, " ").slice(0, 50)}": ${(e as Error).message.slice(0, 60)}`); }
        }
      }
      return bad.map((b) => `${c.file}:${c.line} ${c.table} ${b}`);
    });
    expect(problems).toEqual([]);
  });

  it("every rpc() is ported to D1 or explicitly deferred with a reason", async () => {
    const { D1_RPCS } = await import("@/lib/app-data/d1-rpc");
    const files = execSync("git ls-files ':(glob)app/**/*.ts' ':(glob)app/**/*.tsx' ':(glob)lib/**/*.ts'", { encoding: "utf8" }).trim().split("\n")
      .filter((f) => !f.startsWith("lib/app-data/"));
    const names = new Set(files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\.rpc\(\s*["']([a-z_0-9]+)["']/g)].map((m) => m[1])));
    expect([...names].filter((n) => !(n in D1_RPCS) && !(n in DEFERRED_RPCS))).toEqual([]);
    expect(Object.keys(DEFERRED_RPCS).filter((n) => !names.has(n) || n in D1_RPCS)).toEqual([]);
  });

  it("known schema bugs are still present (remove an entry once its fix ships)", () => {
    const stillFailing = new Set(all.flatMap((c) => c.selects.flatMap((candidates) => (candidates ?? []).flatMap((candidate) => {
      try { d1Client(NO_DB, { role: "service" }).from(c.table).select(candidate); return []; } catch { return [`${c.file}#${c.table}`]; }
    }))));
    expect(Object.keys(KNOWN_SCHEMA_BUGS).filter((k) => !stillFailing.has(k))).toEqual([]);
  });

  it("lists only tables that still exist in the code", () => {
    const used = new Set(all.map((c) => c.table));
    expect([...STILL_ON_SUPABASE].filter((t) => !used.has(t) || t in TABLES)).toEqual([]);
  });
});
