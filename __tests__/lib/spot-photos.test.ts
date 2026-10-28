// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown, bucket: null as unknown }));
vi.mock("@/lib/app-data/backend", () => ({ appDataDb: () => mocks.db }));
vi.mock("@/lib/community/photos", () => ({ photoBucket: () => mocks.bucket }));
import { createTip } from "@/lib/community/tips";
import { promoteTipPhoto, spotPhotoPath } from "@/lib/community/spot-photos";
import { GET } from "@/app/media/spot/[spotId]/[file]/route";

const SPOT = "11111111-1111-4111-8111-111111111111";
const webp = (fill: number) => new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, fill, fill, fill]).buffer;
const sha = (bytes: ArrayBuffer) => createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
type Db = Parameters<typeof createTip>[0];
let db: Db & { prepare(sql: string): { bind(...v: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> }; run(): Promise<unknown> } };
let objects: Map<string, ArrayBuffer>;

beforeEach(async () => {
  const d1 = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) d1.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  d1.sqlite.exec(`INSERT INTO spots (id, name, description, category, visible) VALUES ('${SPOT}', '{"en":"Cafe"}', '{}', 'Food', 1)`);
  db = d1 as unknown as typeof db;
  objects = new Map([["tips/t1/a.webp", webp(1)], ["tips/t2/b.webp", webp(2)], ["tips/t3/c.webp", webp(3)]]);
  mocks.db = db;
  mocks.bucket = {
    get: vi.fn(async (key: string) => objects.has(key) ? { body: new Blob([objects.get(key)!]).stream(), arrayBuffer: async () => objects.get(key)! } : null),
    put: vi.fn(async (key: string, value: ArrayBuffer) => { objects.set(key, value); }),
    delete: vi.fn(async (key: string) => { objects.delete(key); }),
  };
  const author = { userId: "u1", name: "Mina" };
  await createTip(db, author, SPOT, { body: "Closed on Mondays.", visitedOn: null, photoKey: "tips/t1/a.webp", photoConsent: true }, "t1");
  await createTip(db, author, SPOT, { body: "Cash only here.", visitedOn: null, photoKey: "tips/t2/b.webp", photoConsent: false }, "t2");
  await createTip(db, author, SPOT, { body: "Short queue early.", visitedOn: null, photoKey: "tips/t3/c.webp", photoConsent: true }, "t3");
  await createTip(db, author, SPOT, { body: "Consent without a photo.", visitedOn: null, photoConsent: true }, "t4");
});

const bucket = () => mocks.bucket as Parameters<typeof promoteTipPhoto>[1];
const get = (spotId: string, file: string) => GET(new NextRequest(`https://www.localley.io/media/spot/${spotId}/${file}`), { params: Promise.resolve({ spotId, file }) });

describe("own spot photos from tips", () => {
  it("stores consent only with a photo", async () => {
    const consent = (id: string) => db.prepare("SELECT photo_spot_consent c FROM spot_tips WHERE id = ?").bind(id).first<{ c: number }>();
    expect([(await consent("t1"))?.c, (await consent("t2"))?.c, (await consent("t4"))?.c]).toEqual([1, 0, 0]);
  });

  it("promotes only a visible, consented tip photo; copies it content-addressed and serves it publicly", async () => {
    expect(await promoteTipPhoto(db, bucket(), "t2", "admin-1")).toMatchObject({ ok: false });
    await db.prepare("UPDATE spot_tips SET status = 'hidden' WHERE id = 't3'").bind().run();
    expect(await promoteTipPhoto(db, bucket(), "t3", "admin-1")).toMatchObject({ ok: false });

    const result = await promoteTipPhoto(db, bucket(), "t1", "admin-1");
    const key = `spot-photos/${SPOT}/${sha(webp(1))}.webp`;
    expect(result).toEqual({ ok: true, key });
    expect(objects.has(key)).toBe(true);
    const row = await db.prepare("SELECT source, licence, author, tip_id, approved_by FROM spot_photos WHERE spot_id = ?").bind(SPOT).first();
    expect(row).toEqual({ source: "tip", licence: "Localley contributor consent", author: "Mina", tip_id: "t1", approved_by: "admin-1" });
    expect(spotPhotoPath(key)).toBe(`/media/spot/${SPOT}/${sha(webp(1))}.webp`);

    const response = await get(SPOT, `${sha(webp(1))}.webp`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("Content-Type")).toBe("image/webp");
  });

  it("a new choice replaces the old object; unknown, malformed or unlisted keys are 404 no-store", async () => {
    await promoteTipPhoto(db, bucket(), "t1", "admin-1");
    await db.prepare("UPDATE spot_tips SET status = 'visible' WHERE id = 't3'").bind().run();
    expect(await promoteTipPhoto(db, bucket(), "t3", "admin-2")).toMatchObject({ ok: true });
    expect(objects.has(`spot-photos/${SPOT}/${sha(webp(1))}.webp`)).toBe(false);
    expect((await get(SPOT, `${sha(webp(1))}.webp`)).status).toBe(404);
    expect((await get(SPOT, `${sha(webp(3))}.webp`)).status).toBe(200);
    objects.set(`spot-photos/${SPOT}/${"a".repeat(64)}.webp`, webp(9)); // object without a row
    for (const [spotId, file] of [[SPOT, `${"a".repeat(64)}.webp`], [SPOT, "../x.webp"], ["not-a-spot", `${sha(webp(3))}.webp`], [SPOT, `${sha(webp(3))}.png`]]) {
      const response = await get(spotId, file);
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});
