import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// The CLI uses the same pure TS module through node --import tsx outside Vitest.
import { main, parseNativeSocialArgs, readNativeSocialFeed, NATIVE_STAGED_URL } from "../../scripts/native-social-review.mjs";
const page = (changes = {}) => ({ records: [], discoveryLeads: [], socialSources: [], nextOffset: null,
  nextSocialOffset: null, publicationReady: false, socialEvidenceVersion: "localley-social-evidence-v1", ...changes });
const response = (body: unknown) => new Response(JSON.stringify(body));

describe("native social bounded private feed", () => {
  it("follows BOTH independent cursors through empty record pages", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(page({ nextOffset: 100, nextSocialOffset: 100,
      discoveryLeads: [{ id: "synthetic-lead-1" }] })))
      .mockResolvedValueOnce(response(page({ nextSocialOffset: 200, socialSources: [{ status: "blocked" }] })))
      .mockResolvedValueOnce(response(page({ records: [{ kind: "place", id: "ignored-repeated-terminal-page" }], discoveryLeads: [{ id: "synthetic-lead-2" }] })));
    const result = await readNativeSocialFeed(fetcher);
    expect(result.records).toEqual([]);
    expect(result.discoveryLeads).toHaveLength(2);
    expect(result.socialSources).toEqual([{ status: "blocked" }]);
    expect(fetcher.mock.calls.map(([url]) => [new URL(url).searchParams.get("offset"), new URL(url).searchParams.get("socialOffset")]))
      .toEqual([["0", "0"], ["100", "100"], ["100", "200"]]);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url.startsWith(NATIVE_STAGED_URL + "?")).toBe(true);
      expect(options).toMatchObject({ method: "GET", redirect: "error" });
      expect(options).not.toHaveProperty("body");
      expect(options).not.toHaveProperty("headers");
    }
  });
  it("follows records after auxiliary cursor ends without duplicating leads", async () => {
    const lead = { state: "discovery_lead", metrics: { views: null }, provenance: { jobId: "synthetic" } };
    const fetcher = vi.fn().mockResolvedValueOnce(response(page({ nextOffset: 100, discoveryLeads: [lead] })))
      .mockResolvedValueOnce(response(page({ records: [{ kind: "place" }], discoveryLeads: [lead] })));
    expect(await readNativeSocialFeed(fetcher)).toMatchObject({ records: [{ kind: "place" }], discoveryLeads: [lead] });
  });
  it.each([{ nextOffset: 0 }, { nextSocialOffset: 0 }, { nextSocialOffset: "100" }, { nextSocialOffset: 5001 },
    { nextSocialOffset: undefined }, { socialEvidenceVersion: undefined }, { publicationReady: true }])("fails closed on invalid contract %j", async changes => {
    await expect(readNativeSocialFeed(vi.fn().mockResolvedValue(response(page(changes))))).rejects.toThrow();
  });
  it("bounds page count even when all records are empty", async () => {
    const fetcher = vi.fn(async (url: string) => response(page({ nextOffset: Number(new URL(url).searchParams.get("offset")) + 1 })));
    await expect(readNativeSocialFeed(fetcher)).rejects.toThrow("page bound");
    expect(fetcher).toHaveBeenCalledTimes(51);
  });
  it("bounds bytes before JSON parsing", async () => {
    await expect(readNativeSocialFeed(vi.fn().mockResolvedValue(new Response("x".repeat(8 * 1024 * 1024 + 1))))).rejects.toThrow("byte bound");
  });
  it.each([["--apply"], ["--dry-run", "--live", "--apply"], ["--live"], ["--dry-run", "--live", "--input", "file"],
    ["--dry-run", "--live", "--target", "production-supabase"], ["--dry-run", "--live", "--live"]])("has no apply, publication, or database switch: %j", args => {
    expect(() => parseNativeSocialArgs(args)).toThrow();
  });
  it("requires explicit operator selection of manifest and spot files", () => {
    expect(parseNativeSocialArgs(["--dry-run", "--input", "feed.json", "--spots", "spots.json", "--manifest", "review.json"]))
      .toMatchObject({ "--dry-run": true, "--manifest": "review.json", "--spots": "spots.json" });
  });
  it("writes a private report exclusively and ignores untrusted body approval", async () => {
    const dir = mkdtempSync(join(tmpdir(), "native-social-test-")), input = join(dir, "input.json"), out = join(dir, "report.json");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      writeFileSync(input, JSON.stringify({ ...page(), approved: true, manifest: { approved: true }, existingSpots: [{ approved: true }] }));
      const args = ["--dry-run", "--input", input, "--out", out];
      const result = await main(args);
      expect(result).toMatchObject({ publicationReady: false, rankings: [], counts: { acceptedPosts: 0 } });
      expect(statSync(out).mode & 0o777).toBe(0o600);
      const original = readFileSync(out, "utf8");
      await expect(main(args)).rejects.toThrow();
      expect(readFileSync(out, "utf8")).toBe(original);
    } finally { log.mockRestore(); rmSync(dir, { recursive: true, force: true }); }
  });
});
