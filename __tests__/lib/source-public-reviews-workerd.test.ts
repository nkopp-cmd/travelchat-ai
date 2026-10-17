// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { Miniflare, Log, LogLevel } from "miniflare";

// Run the actual helper in Workerd. Only Next's response/URL wrappers are adapted
// to native Fetch objects; service fetch, request options and streams stay native.
const id = "00000000-0000-4000-8000-000000000009";
const body = { reviews: [], total: 0, averageRating: 0, ratingDistribution: [0, 0, 0, 0, 0] };
let mf: Miniflare;
let state: string;
let outboundHits = 0;
beforeAll(async () => {
  state = await mkdtemp(join(process.env.TMPDIR || tmpdir(), "localley-review-workerd-"));
  const source = ts.transpileModule((await readFile("lib/source-public-reviews.ts", "utf8"))
    .replace('import { NextRequest, NextResponse } from "next/server";', 'const NextResponse = Response;'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const worker = (name: string, contents: string, env = {}) => ({ config: {
    name, compatibilityDate: "2026-09-08", compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    manifest: { mainModule: "worker.mjs", modulesRoot: state, modules: { "worker.mjs": { type: "esm" as const, contents } } }, env,
  }, dev: { outboundService: { type: "fetcher" as const, handler: () => { outboundHits++; return Response.json(body); } } } });
  mf = new Miniflare({ workers: [worker("bridge", source + `
    export default { async fetch(request, env) {
      globalThis[Symbol.for("__cloudflare-context__")] = {env};
      const url = new URL(request.url);
      const projected = await readProductionReviewsForPreview({method: "GET", nextUrl: url}, "${id}");
      return projected;
    }};`, { PUBLIC_REVIEW_SOURCE: { type: "worker", worker: "projection" } }),
  worker("projection", `export default {fetch(request) {
    const url = new URL(request.url);
    if (request.headers.has("cookie") || request.headers.has("authorization") || request.headers.has("cloudflare-workers-version-overrides")) return new Response("Identity leaked", {status: 403});
    if (url.hostname !== "www.localley.io" || url.pathname !== "/api/spots/${id}/reviews") return new Response("Wrong target", {status: 400});
    if (url.searchParams.get("offset") === "1") return new Response(null, {status: 302, headers: {Location: "https://forbidden.test/"}});
    return Response.json(${JSON.stringify(body)});
  }};`)], resourcePersistencePath: state, resourceTmpPath: state, telemetry: { enabled: false }, cf: false,
  logRequests: false, unsafeLocalExplorer: false, log: new Log(LogLevel.ERROR) });
}, 60000);
afterAll(async () => { await mf?.dispose(); if (state) await rm(state, { recursive: true, force: true }); });

describe("public review bridge in Workerd", () => {
  it("reads the bounded public projection through the native service binding", async () => {
    const response = await mf.dispatchFetch(`https://localley-next-preview.nkopp.workers.dev/api/spots/${id}/reviews`, {
      headers: {Cookie: "private-preview", Authorization: "private-token", "Cloudflare-Workers-Version-Overrides": "private-version"},
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses redirects without following them", async () => {
    const response = await mf.dispatchFetch(`https://localley-next-preview.nkopp.workers.dev/api/spots/${id}/reviews?offset=1`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error: "Reviews unavailable"});
    expect(outboundHits).toBe(0);
  });
});
