// @vitest-environment node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A "use client" module must never reach server-only code through its imports: Next.js refuses to build, and before
 * the marker existed the Supabase admin client was silently bundled into browser JS (2026-10-24, notification-center
 * -> lib/notifications -> lib/supabase). PR CI has no production build, so this graph walk is the guard.
 */
const ROOT = path.resolve(__dirname, "..");
const FORBIDDEN = ["lib/supabase.ts", "lib/supabase-server.ts"];

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate;
  }
  return null;
}

/** Runtime imports only: `import type` / `export type` are erased and never bundled. */
function imports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specs = [...text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/gm)].map((m) => m[1]);
  return specs.map((s) => resolveImport(file, s)).filter((f): f is string => Boolean(f));
}

describe("client/server boundary", () => {
  it("no client component reaches server-only modules or the Supabase client factories", () => {
    const files = execSync("git ls-files ':(glob)app/**/*.tsx' ':(glob)app/**/*.ts' ':(glob)components/**/*.tsx' ':(glob)components/**/*.ts' ':(glob)hooks/**/*.ts' ':(glob)hooks/**/*.tsx' ':(glob)providers/**/*.tsx'", { cwd: ROOT, encoding: "utf8" })
      .trim().split("\n").map((f) => path.join(ROOT, f));
    const clients = files.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    expect(clients.length).toBeGreaterThan(50);
    const problems: string[] = [];
    for (const client of clients) {
      const seen = new Set<string>(), stack: [string, string[]][] = [[client, []]];
      while (stack.length) {
        const [file, trail] = stack.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const rel = path.relative(ROOT, file);
        const serverOnly = file !== client && /^\s*import\s+["']server-only["']/m.test(readFileSync(file, "utf8"));
        if (serverOnly || FORBIDDEN.includes(rel)) {
          problems.push([path.relative(ROOT, client), ...trail, rel].join(" -> "));
          continue;
        }
        for (const next of imports(file)) stack.push([next, file === client ? [] : [...trail, rel]]);
      }
    }
    expect(problems).toEqual([]);
  });
});
