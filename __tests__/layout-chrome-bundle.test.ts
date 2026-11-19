import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Push AS4: the root layout's client chrome loads on every public page (privacy, credits, pricing...).
// tailwind-merge (~8 KB gzip, via cn in @/lib/utils) must not be in its eager module graph.
const CHROME = [
  "components/layout/conditional-navbar.tsx",
  "components/layout/main-content-shell.tsx",
  "components/layout/mobile-bottom-nav.tsx",
  "components/ui/toaster.tsx",
  "providers/index.tsx",
  "components/accessibility/skip-link.tsx",
];
// Push AT3: the client modules the home page ("/") renders eagerly. A new client island on "/" belongs here.
const HOME = [
  "components/landing/planner.tsx",
  "components/landing/hero-card-placer.tsx",
  "components/landing/pick-conditions.tsx",
  "components/brand/logo.tsx",
];
// Loaded only after an intent or for a signed-in visitor (next/dynamic with ssr: false, or an awaited import).
const LAZY = new Set([
  "components/layout/navbar-account.tsx",
  "components/layout/navbar-drawer.tsx",
  "components/ui/radix-toaster.tsx",
  "lib/auth/auth-client.ts",
]);
const FORBIDDEN = new Set(["tailwind-merge", "lib/utils.ts", "components/ui/button.tsx"]);

function resolve(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? path.join(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) if (existsSync(base + ext)) return base + ext;
  return null;
}

function eagerGraph(roots: string[] = CHROME): Map<string, string> {
  const seen = new Map<string, string>();
  const visit = (file: string, from: string) => {
    if (seen.has(file)) return;
    seen.set(file, from);
    const source = readFileSync(file, "utf8");
    const specs = [
      ...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm),
      ...source.matchAll(/import\("([^"]+)"\)/g),
    ].map((match) => match[1]);
    for (const spec of specs) {
      if (spec === "tailwind-merge") seen.set("tailwind-merge", file);
      const next = resolve(spec, file);
      if (next && !LAZY.has(next)) visit(next, file);
    }
  };
  for (const file of roots) visit(file, "entry");
  return seen;
}

describe("public layout chrome bundle (Push AS4)", () => {
  it("walks the real chrome modules", () => {
    const graph = eagerGraph();
    expect(graph.has("components/layout/navbar.tsx")).toBe(true);
    expect(graph.has("components/brand/logo.tsx")).toBe(true);
  });

  it("keeps tailwind-merge, cn and Button out of the eager chrome graph", () => {
    const hits = [...eagerGraph()].filter(([file]) => FORBIDDEN.has(file)).map(([file, by]) => `${file} <- ${by}`);
    expect(hits).toEqual([]);
  });

  it("keeps the shared page header server-only, so its cn call never ships to the browser", () => {
    for (const file of ["components/layout/page-header.tsx", "components/ui/gradient-text.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/^\s*["']use client["']/m);
    }
  });
});

describe("home page client bundle (Push AT3)", () => {
  it("lists every client module app/page.tsx imports directly", () => {
    const page = readFileSync("app/page.tsx", "utf8");
    const clients = [...page.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)]
      .map((match) => resolve(match[1], "app/page.tsx"))
      .filter((file): file is string => !!file && /^\s*["']use client["']/m.test(readFileSync(file, "utf8")));
    expect(clients.length).toBeGreaterThan(0);
    for (const file of clients) expect(HOME).toContain(file);
  });

  it("keeps tailwind-merge, cn and Button out of the home islands", () => {
    const graph = eagerGraph(HOME);
    expect(graph.has("components/ui/city-image.tsx")).toBe(true);
    const hits = [...graph].filter(([file]) => FORBIDDEN.has(file)).map(([file, by]) => `${file} <- ${by}`);
    expect(hits).toEqual([]);
  });
});
