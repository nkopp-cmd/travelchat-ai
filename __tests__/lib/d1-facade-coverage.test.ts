// @vitest-environment node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { TABLES } from "@/lib/app-data/d1-postgrest";

/**
 * Supabase exit guardrail (shared/plans/localley-decisions.md 2026-10-24): every `.from("<table>")` chain in the app
 * either targets a facade table with only supported methods and plain column selects, or is listed below as still
 * served by Supabase / waiting for a hand port. A new table or a new chain shape fails here instead of at runtime
 * under DATA_BACKEND=d1. Shrink these lists as tables move; never grow them without a plan line.
 */
const STILL_ON_SUPABASE = new Set([
  "affiliate_clicks", "affiliate_earnings", "apify_spot_candidates", "challenges", "contribution_token_ledger", "follows",
  "geo_destinations", "guide_earnings", "guide_profiles", "review_helpful_votes", "social_spot_submission_aliases",
  "social_spot_submission_candidates", "social_spot_submissions", "spot_contributors", "spot_reviews", "spots",
  "user_challenges", "user_progress", "weekly_city_spot_rankings",
]);

/** Chains on facade tables that the facade cannot answer yet (embedded selects etc.): file -> reason. */
const HAND_PORT_PENDING: Record<string, string> = {
  // D1 branch done (two owner-scoped reads); the embed stays on the Supabase branch until Supabase is removed.
  "app/api/conversations/route.ts": "embed kept for the Supabase branch",
};

const SUPPORTED = new Set(["select", "insert", "upsert", "update", "delete", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not",
  "order", "limit", "range", "single", "maybeSingle", "abortSignal"]);

type Chain = { file: string; line: number; table: string; methods: string[]; selects: string[] };

function chains(): Chain[] {
  const files = execSync("git ls-files 'app/**/*.ts' 'app/**/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx'", { encoding: "utf8" }).trim().split("\n");
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
          if (current.parent.name.text === "select" && call.arguments[0]) chain.selects.push(call.arguments[0].getText(source));
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
    const problems = all.filter((c) => c.table in TABLES && !(c.file in HAND_PORT_PENDING)).flatMap((c) => {
      const bad = c.methods.filter((m) => !SUPPORTED.has(m)).map((m) => `method ${m}`);
      for (const select of c.selects) {
        const literal = select.match(/^(["'`])([\s\S]*)\1$/);
        if (!literal) { bad.push(`dynamic select ${select.slice(0, 40)}`); continue; }
        if (/[():]/.test(literal[2]) || literal[2].includes("${")) bad.push(`select "${literal[2].replace(/\s+/g, " ").slice(0, 60)}"`);
      }
      return bad.map((b) => `${c.file}:${c.line} ${c.table} ${b}`);
    });
    expect(problems).toEqual([]);
  });

  it("lists only tables that still exist in the code", () => {
    const used = new Set(all.map((c) => c.table));
    expect([...STILL_ON_SUPABASE].filter((t) => !used.has(t) || t in TABLES)).toEqual([]);
  });
});
