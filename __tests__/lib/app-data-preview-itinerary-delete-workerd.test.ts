// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Miniflare, Log, LogLevel } from "miniflare";
const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
import { deletePreviewItinerary } from "@/lib/app-data/preview-itinerary-delete";
const id = "550e8400-e29b-41d4-a716-446655440000";
let mf: Miniflare, state: string, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let results: { meta: { changes: number }; results?: Record<string, unknown>[] }[];
beforeAll(async () => {
  state = await mkdtemp(join(process.env.TMPDIR || tmpdir(), "localley-delete-workerd-"));
  mf = new Miniflare({ workers: [{ config: {
    name: "delete-proof", compatibilityDate: "2026-09-08",
    manifest: { mainModule: "worker.mjs", modulesRoot: state, modules: {
      "worker.mjs": { type: "esm", contents: 'export default {fetch(){return new Response("Local proof only")}}' },
    } }, env: { DB: { type: "d1", id: "00000000-0000-0000-0000-00000000d1d1", dev: { remote: false } } },
  }, dev: { outboundService: { type: "fetcher", handler: () => new Response("Outbound disabled", { status: 502 }) } } }],
  resourcePersistencePath: state, resourceTmpPath: state, telemetry: { enabled: false }, cf: false,
  logRequests: false, unsafeLocalExplorer: false, log: new Log(LogLevel.ERROR) });
  db = await mf.getD1Database("DB");
  for (const file of readdirSync("migrations/app-preview").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync("migrations/app-preview/" + file, "utf8").split("\n")
      .filter(line => !line.trimStart().startsWith("--")).join(" "));
  }
}, 60000);
afterAll(async () => { await mf?.dispose(); if (state) await rm(state, { recursive: true, force: true }); });
beforeEach(async () => {
  await db.exec(`DELETE FROM messages; DELETE FROM conversations; DELETE FROM legacy_itinerary_media;
    DELETE FROM preview_itinerary_likes; DELETE FROM itineraries; DELETE FROM owners;
    INSERT INTO owners VALUES('auth:a','new'),('auth:b','new');
    INSERT INTO itineraries(id,ownerId,title,city,days,activities) VALUES('${id}','auth:a','Tea route','Seoul',1,'[]');
    INSERT INTO legacy_itinerary_media(itineraryId) VALUES('${id}');
    INSERT INTO preview_itinerary_likes VALUES('auth:b','${id}','2026-01-01');
    INSERT INTO conversations VALUES('00000000-0000-4000-8000-000000000001','auth:a','Keep history','${id}','2026-01-01','2026-01-01');`);
  results = [];
  mocks.reader.mockReturnValue({ prepare: (sql: string) => db.prepare(sql),
    batch: async (statements: Parameters<typeof db.batch>[0]) => { results = await db.batch(statements); return results; } });
  mocks.user.mockResolvedValue({ id: "a", emailVerified: true,
    primaryEmailAddress: { emailAddress: "a@preview.localley.test" } });
});
describe("actual Workerd D1 delete results", () => {
  it("accepts one returned trip when aggregate changes includes the cascaded like", async () => {
    expect(await deletePreviewItinerary(id, "a")).toBe("deleted");
    expect(results[2].meta.changes).toBe(2); // The old exactly-one counter check throws after this committed delete.
    expect(results[2].results).toEqual([{ id }]);
    expect((await db.prepare("SELECT * FROM preview_itinerary_likes").all()).results).toEqual([]);
    expect((await db.prepare("SELECT linkedItineraryId FROM conversations").all()).results).toEqual([{ linkedItineraryId: null }]);
    expect(await deletePreviewItinerary(id, "a")).toBe("missing");
  });
  it("returns forbidden with zero returned rows and retains attached media", async () => {
    await db.exec("UPDATE legacy_itinerary_media SET aiBackgrounds='{}'");
    expect(await deletePreviewItinerary(id, "a")).toBe("forbidden");
    expect(results[2].results).toEqual([]);
    expect((await db.prepare("SELECT linkedItineraryId FROM conversations").all()).results).toEqual([{ linkedItineraryId: id }]);
    expect((await db.prepare("SELECT itineraryId FROM preview_itinerary_likes").all()).results).toEqual([{ itineraryId: id }]);
  });
});
