import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The planner and preview pages ship these files to the browser. zod and the static manifests
// (parsed with zod at import) added 31 KB gzip plus the manifest data to both routes.
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const importsOf = (source: string) => [...source.matchAll(/^\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/gm)].filter(m => !/^\s*import\s+type\b/.test(m[0])).map(m => m[1]);
const banned = /^(zod|zod\/.*)$|corridor-network|transport-manifest|seed-manifest|manifest-schema|corridor-planner$/;
const wizard = readdirSync(join(process.cwd(), "components/itineraries/wizard")).filter(f => /\.tsx?$/.test(f)).map(f => `components/itineraries/wizard/${f}`);

describe("planner client bundle stays free of zod and manifests", () => {
  it.each([...wizard, "app/itineraries/new/planner-client.tsx", "app/itineraries/preview/preview-client.tsx", "lib/trips/generated-preview.ts", "lib/trips/planner-query.ts", "lib/trips/corridor-select.ts"])("%s", file => {
    expect(importsOf(read(file)).filter(spec => banned.test(spec))).toEqual([]);
  });
  it("corridor-select has no imports at all", () => {
    expect(importsOf(read("lib/trips/corridor-select.ts"))).toEqual([]);
  });
});
