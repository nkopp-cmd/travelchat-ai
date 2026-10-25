// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

vi.mock("server-only", () => ({}));
import { d1Client } from "@/lib/app-data/d1-postgrest";
import { parseSpotCoordinates } from "@/lib/spots/coordinates";

const A = "user_alice", B = "user_bob";
const trip = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: D1Sqlite;

beforeEach(() => {
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  db.sqlite.exec(`INSERT INTO owners (id, source) VALUES ('${A}', 'legacy-fixture'), ('${B}', 'legacy-fixture');
    INSERT INTO profiles (id, ownerId) VALUES ('${trip(901)}', '${A}');`);
  const insert = db.sqlite.prepare(`INSERT INTO itineraries (id, ownerId, title, city, days, activities, highlights, local_score, created_at, is_public, like_count, view_count, ai_backgrounds)
    VALUES (?, ?, ?, 'Seoul', 2, '[{"day":1}]', '["Palace"]', ?, ?, ?, 0, ?, ?)`);
  insert.run(trip(1), A, "Alice private", 8.5, "2026-10-01T00:00:00+00:00", 0, 1, '{"cover":"https://x/c.png"}');
  insert.run(trip(2), A, "Alice old", null, "2026-09-01T00:00:00+00:00", 0, 2, null);
  insert.run(trip(3), B, "Bob private", 7, "2026-10-02T00:00:00+00:00", 0, 3, null);
  insert.run(trip(4), B, "Bob public", 9, "2026-10-03T00:00:00+00:00", 1, 4, null);
});

const as = (userId: string) => d1Client(db, { role: "user", userId });
const service = () => d1Client(db, { role: "service" });

describe("D1 PostgREST facade: owner scoping (RLS 'Localley own itinerary' + 'published itinerary read')", () => {
  it("a user reads own rows plus public ones, never another user's private rows", async () => {
    const { data } = await as(A).from("itineraries").select("id, title").order("created_at", { ascending: false });
    expect(data!.map((r) => r.title)).toEqual(["Bob public", "Alice private", "Alice old"]);
    const { data: hidden, error } = await as(A).from("itineraries").select("*").eq("id", trip(3)).single();
    expect(hidden).toBeNull();
    expect(error?.code).toBe("PGRST116");
  });

  it("updates and deletes on another user's rows change nothing, also for public rows", async () => {
    const update = await as(A).from("itineraries").update({ title: "hacked" }).eq("id", trip(4)).select("id");
    expect(update).toMatchObject({ data: [], error: null });
    await as(A).from("itineraries").delete().eq("id", trip(3));
    expect((await service().from("itineraries").select("id, title").in("id", [trip(3), trip(4)]).order("id")).data)
      .toEqual([{ id: trip(3), title: "Bob private" }, { id: trip(4), title: "Bob public" }]);
  });

  it("own updates and deletes work and return the selected rows", async () => {
    const { data } = await as(A).from("itineraries").update({ title: "Renamed", is_favorite: true }).eq("id", trip(1)).select("id, title, is_favorite").single();
    expect(data).toEqual({ id: trip(1), title: "Renamed", is_favorite: true });
    await as(A).from("itineraries").delete().eq("id", trip(2));
    expect((await service().from("itineraries").select("id", { count: "exact", head: true }).eq("clerk_user_id", A)).count).toBe(1);
  });

  it("inserts must carry the caller as owner and only the caller's own profile", async () => {
    const forged = await as(A).from("itineraries").insert({ clerk_user_id: B, title: "x", days: 1, activities: [] });
    expect(forged.error?.code).toBe("42501");
    const foreignProfile = await as(B).from("itineraries").insert({ clerk_user_id: B, user_id: trip(901), days: 1, activities: [] });
    expect(foreignProfile.error?.code).toBe("42501");
    const own = await as(A).from("itineraries").insert({ clerk_user_id: A, user_id: trip(901), title: "New", city: "Tokyo", days: 3, activities: [{ day: 1 }], highlights: ["a"] })
      .select("id, title, shared, is_public, like_count, created_at, highlights").single();
    expect(own.error).toBeNull();
    expect(own.data).toMatchObject({ title: "New", shared: false, is_public: false, like_count: 0, highlights: ["a"] });
    expect(String(own.data!.id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(own.data!.created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T.*\+00:00$/);
  });

  it("a brand-new user gets the owners row the foreign key needs", async () => {
    const result = await as("user_new").from("itineraries").insert({ clerk_user_id: "user_new", days: 1, activities: [] });
    expect(result.error).toBeNull();
    expect(db.sqlite.prepare("SELECT source FROM owners WHERE id = 'user_new'").get()).toEqual({ source: "new" });
  });

  it("anon sees nothing and cannot write (no anon policy on itineraries)", async () => {
    const anon = d1Client(db, { role: "anon" });
    expect((await anon.from("itineraries").select("id")).data).toEqual([]);
    expect((await anon.from("itineraries").insert({ clerk_user_id: A, days: 1, activities: [] })).error?.code).toBe("42501");
    expect((await anon.from("itineraries").update({ title: "x" }).eq("id", trip(4))).error).toBeNull();
    expect((await service().from("itineraries").select("title").eq("id", trip(4)).single()).data).toEqual({ title: "Bob public" });
  });
});

describe("D1 PostgREST facade: PostgREST contracts", () => {
  it("decodes booleans, JSON and text[]; maps clerk_user_id to ownerId", async () => {
    const { data } = await service().from("itineraries").select("*").eq("id", trip(1)).single();
    expect(data).toMatchObject({ clerk_user_id: A, activities: [{ day: 1 }], highlights: ["Palace"], is_public: false,
      shared: false, ai_backgrounds: { cover: "https://x/c.png" }, story_slides: null, local_score: 8.5 });
  });

  it("orders like Postgres: DESC puts NULLs first, ASC last; limit/range page", async () => {
    const desc = await service().from("itineraries").select("id, local_score").order("local_score", { ascending: false });
    expect(desc.data!.map((r) => r.local_score)).toEqual([null, 9, 8.5, 7]);
    const asc = await service().from("itineraries").select("local_score").order("local_score");
    expect(asc.data!.map((r) => r.local_score)).toEqual([7, 8.5, 9, null]);
    const page = await service().from("itineraries").select("view_count").order("view_count").range(1, 2);
    expect(page.data).toEqual([{ view_count: 2 }, { view_count: 3 }]);
  });

  it("single/maybeSingle, count/head, not-is-null, gte/lt, boolean filters", async () => {
    expect((await service().from("itineraries").select("id").eq("clerk_user_id", "nobody").maybeSingle())).toMatchObject({ data: null, error: null });
    expect((await service().from("itineraries").select("id").eq("clerk_user_id", A).maybeSingle()).error?.code).toBe("PGRST116");
    expect((await service().from("itineraries").select("*", { count: "exact", head: true }).eq("clerk_user_id", B))).toMatchObject({ data: null, count: 2 });
    expect((await service().from("itineraries").select("id").not("ai_backgrounds", "is", null)).data).toEqual([{ id: trip(1) }]);
    expect((await service().from("itineraries").select("id").eq("is_public", true)).data).toEqual([{ id: trip(4) }]);
    expect((await service().from("itineraries").select("id").gte("created_at", "2026-10-02").lt("view_count", 4)).data).toEqual([{ id: trip(3) }]);
  });

  it("maps constraint failures to Postgres codes", async () => {
    const duplicate = await service().from("itineraries").insert({ id: trip(1), clerk_user_id: A, days: 1, activities: [] });
    expect(duplicate.error?.code).toBe("23505");
  });

  it("refuses anything it does not implement instead of guessing", () => {
    expect(() => service().from("no_such_table")).toThrow("not migrated");
    expect(() => service().from("itineraries").select("id, spots(name)")).toThrow("embeds");
    expect(() => service().from("itineraries").select("title:name")).toThrow("embeds and aliases");
    expect(() => service().from("itineraries").eq("metadata", 1)).toThrow("unknown column");
    expect(() => service().from("itineraries").not("title", "eq", "x")).toThrow("unsupported not");
    expect(() => d1Client(db, { role: "user", userId: "" })).toThrow("user id");
  });
});

describe("D1 PostgREST facade: conversations, messages, subscriptions, usage_tracking", () => {
  const conv = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  beforeEach(() => {
    db.sqlite.exec(`INSERT INTO conversations (id, ownerId, title, linkedItineraryId, createdAt, updatedAt) VALUES
        ('${conv(1)}', '${A}', 'Alice chat', '${trip(1)}', '2026-10-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00'),
        ('${conv(2)}', '${B}', 'Bob chat', NULL, '2026-10-02T00:00:00+00:00', '2026-10-02T00:00:00+00:00');
      INSERT INTO messages (id, conversationId, role, content, createdAt) VALUES
        ('${conv(11)}', '${conv(1)}', 'user', 'hi', '2026-10-01T00:00:01+00:00'),
        ('${conv(12)}', '${conv(2)}', 'user', 'secret', '2026-10-02T00:00:01+00:00');
      INSERT INTO legacy_subscriptions (id, ownerId, tier, status, cancelAtPeriodEnd, createdAt, updatedAt) VALUES
        ('s1', '${A}', 'pro', 'active', 0, '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00'),
        ('s2', '${B}', 'premium', 'active', 1, '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00');
      INSERT INTO legacy_usage (id, ownerId, usageType, periodType, periodStart, count, createdAt, updatedAt) VALUES
        ('u1', '${A}', 'itineraries_created', 'monthly', '2026-10-01', 2, '2026-10-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00');`);
  });

  it("conversations: own rows only; a linked itinerary must be the caller's on insert and update", async () => {
    expect((await as(A).from("conversations").select("id, title, linked_itinerary_id")).data)
      .toEqual([{ id: conv(1), title: "Alice chat", linked_itinerary_id: trip(1) }]);
    expect((await as(A).from("conversations").insert({ clerk_user_id: A, linked_itinerary_id: trip(3) })).error?.code).toBe("42501");
    expect((await as(A).from("conversations").update({ linked_itinerary_id: trip(3) }).eq("id", conv(1))).error?.code).toBe("42501");
    expect((await as(A).from("conversations").update({ title: "Renamed" }).eq("id", conv(1)).select("title").single()).data).toEqual({ title: "Renamed" });
  });

  it("messages: visible through the conversation owner; inserts into another user's conversation are rejected", async () => {
    expect((await as(A).from("messages").select("content")).data).toEqual([{ content: "hi" }]);
    expect((await as(A).from("messages").insert({ conversation_id: conv(2), role: "user", content: "x" })).error?.code).toBe("42501");
    expect((await as(A).from("messages").update({ content: "edited" }).eq("id", conv(11)).select("content").single()).data).toEqual({ content: "edited" });
    expect((await as(A).from("messages").update({ content: "x" }).eq("id", conv(12)).select("id")).data).toEqual([]);
  });

  it("messages insert runs the update_conversation_on_message trigger", async () => {
    const ok = await as(A).from("messages").insert({ conversation_id: conv(1), role: "assistant", content: "answer" }).select("id, created_at").single();
    expect(ok.error).toBeNull();
    const { data } = await service().from("conversations").select("updated_at").eq("id", conv(1)).single();
    expect(String(data!.updated_at) > "2026-10-01T00:00:00+00:00").toBe(true);
  });

  it("subscriptions and usage_tracking: users read their own rows only and cannot write", async () => {
    expect((await as(A).from("subscriptions").select("tier, cancel_at_period_end")).data).toEqual([{ tier: "pro", cancel_at_period_end: false }]);
    expect((await as(A).from("subscriptions").update({ tier: "premium" }).eq("id", "s1").select("id")).data).toEqual([]);
    expect((await as(A).from("subscriptions").insert({ clerk_user_id: A, tier: "premium" })).error?.code).toBe("42501");
    expect((await as(A).from("usage_tracking").select("usage_type, count, period_start")).data)
      .toEqual([{ usage_type: "itineraries_created", count: 2, period_start: "2026-10-01" }]);
    expect((await as(B).from("usage_tracking").select("id")).data).toEqual([]);
  });

  it("service updates run the update_updated_at trigger", async () => {
    await service().from("usage_tracking").update({ count: 3 }).eq("id", "u1");
    const { data } = await service().from("usage_tracking").select("count, updated_at").eq("id", "u1").single();
    expect(data!.count).toBe(3);
    expect(String(data!.updated_at) > "2026-10-01T00:00:00+00:00").toBe(true);
  });
});

describe("D1 PostgREST facade: users, saved_spots, saved_itineraries (migration 0037)", () => {
  const spot = "20000000-0000-4000-8000-000000000001";

  it("users: Postgres shape on profiles, own row only, username unique", async () => {
    await service().from("users").update({ username: "alice", email: "a@x.test" }).eq("clerk_id", A);
    expect((await as(A).from("users").select("id, clerk_id, username, level, xp, title")).data)
      .toEqual([{ id: trip(901), clerk_id: A, username: "alice", level: 1, xp: 0, title: "Tourist" }]);
    expect((await as(B).from("users").select("id")).data).toEqual([]);
    const created = await as(B).from("users").insert({ clerk_id: B, username: "bob" }).select("clerk_id, level, title").single();
    expect(created.data).toEqual({ clerk_id: B, level: 1, title: "Tourist" });
    expect((await service().from("users").insert({ clerk_id: "user_c", username: "alice" })).error?.code).toBe("23505");
  });

  it("saved_spots: insert/select/delete own; no update policy; createdAtMs follows created_at", async () => {
    const saved = await as(A).from("saved_spots").insert({ clerk_user_id: A, spot_id: spot }).select("id, spot_id, created_at").single();
    expect(saved.error).toBeNull();
    const ms = (db.sqlite.prepare("SELECT createdAtMs FROM saved_spots").get() as { createdAtMs: number }).createdAtMs;
    expect(ms).toBe(Date.parse(String(saved.data!.created_at)));
    expect((await as(A).from("saved_spots").insert({ clerk_user_id: A, spot_id: spot })).error?.code).toBe("23505");
    expect((await as(B).from("saved_spots").select("id")).data).toEqual([]);
    expect((await as(A).from("saved_spots").update({ spot_id: spot }).eq("id", String(saved.data!.id)).select("id")).data).toEqual([]);
    await as(B).from("saved_spots").delete().eq("spot_id", spot);
    expect((await as(A).from("saved_spots").select("id", { count: "exact", head: true })).count).toBe(1);
    await as(A).from("saved_spots").delete().eq("spot_id", spot);
    expect((await as(A).from("saved_spots").select("id", { count: "exact", head: true })).count).toBe(0);
  });

  it("saved_itineraries: own rows; cascade with the itinerary", async () => {
    expect((await as(A).from("saved_itineraries").insert({ clerk_user_id: B, itinerary_id: trip(4) })).error?.code).toBe("42501");
    expect((await as(A).from("saved_itineraries").insert({ clerk_user_id: A, itinerary_id: trip(4) })).error).toBeNull();
    expect((await as(B).from("saved_itineraries").select("id")).data).toEqual([]);
    db.sqlite.exec("PRAGMA foreign_keys = ON");
    await service().from("itineraries").delete().eq("id", trip(4));
    expect((await as(A).from("saved_itineraries").select("id")).data).toEqual([]);
  });
});

describe("D1 PostgREST facade: upsert and emulated CHECKs", () => {
  it("upsert onConflict updates only payload columns, keeps id/created_at, runs the updated_at trigger", async () => {
    await service().from("subscriptions").insert({ id: "s9", clerk_user_id: A, tier: "free", status: "active", created_at: "2026-01-01T00:00:00+00:00", updated_at: "2026-01-01T00:00:00+00:00" });
    const { error } = await service().from("subscriptions").upsert({ clerk_user_id: A, tier: "pro", stripe_customer_id: "cus_1" }, { onConflict: "clerk_user_id" });
    expect(error).toBeNull();
    const { data } = await service().from("subscriptions").select("id, tier, status, stripe_customer_id, created_at, updated_at").eq("clerk_user_id", A).single();
    expect(data).toMatchObject({ id: "s9", tier: "pro", status: "active", stripe_customer_id: "cus_1", created_at: "2026-01-01T00:00:00+00:00" });
    expect(String(data!.updated_at) > "2026-01-01T00:00:00+00:00").toBe(true);
  });

  it("ignoreDuplicates keeps the existing row; a new key inserts", async () => {
    await service().from("subscriptions").upsert({ clerk_user_id: A, tier: "premium", status: "active" }, { onConflict: "clerk_user_id" });
    await service().from("subscriptions").upsert({ clerk_user_id: A, tier: "free", status: "active" }, { onConflict: "clerk_user_id", ignoreDuplicates: true });
    expect((await service().from("subscriptions").select("tier").eq("clerk_user_id", A).single()).data).toEqual({ tier: "premium" });
    await service().from("users").upsert({ clerk_id: "user_new2", username: "n2" }, { onConflict: "clerk_id", ignoreDuplicates: true });
    expect((await service().from("users").select("username, level").eq("clerk_id", "user_new2").single()).data).toEqual({ username: "n2", level: 1 });
  });

  it("subscriptions CHECK constraints are enforced with code 23514", async () => {
    expect((await service().from("subscriptions").insert({ clerk_user_id: A, tier: "gold", status: "active" })).error?.code).toBe("23514");
    await service().from("subscriptions").insert({ clerk_user_id: B, tier: "free", status: "active" });
    expect((await service().from("subscriptions").update({ status: "paused" }).eq("clerk_user_id", B)).error?.code).toBe("23514");
    expect((await service().from("subscriptions").update({ billing_cycle: "weekly" }).eq("clerk_user_id", B)).error?.code).toBe("23514");
  });
});

describe("D1 PostgREST facade: generated Supabase-only tables (migration 0034)", () => {
  it("the committed generated specs equal a fresh generation from the pinned catalog", async () => {
    // @ts-expect-error plain .mjs script
    const { generateSpecs, mergedCatalog, CATALOGS } = await import("../../scripts/d1-migration/facade-specs.mjs");
    const schema = mergedCatalog(CATALOGS.map((f: string) => path.resolve(__dirname, "../..", f)));
    expect(readFileSync(path.resolve(__dirname, "../../lib/app-data/d1-generated-specs.ts"), "utf8")).toBe(generateSpecs(schema));
  });

  it("challenges: public read for anon and users, no writes", async () => {
    await service().from("challenges").insert({ name: "Market run", description: "d", xp_reward: 50, requirements: { visits: 3 } });
    expect((await d1Client(db, { role: "anon" }).from("challenges").select("name, requirements")).data).toEqual([{ name: "Market run", requirements: { visits: 3 } }]);
    expect((await as(A).from("challenges").insert({ name: "x", description: "d", xp_reward: 1 })).error?.code).toBe("42501");
  });

  it("follows: anyone reads; only the follower writes or deletes their own follow", async () => {
    expect((await as(A).from("follows").insert({ follower_id: B, following_id: A })).error?.code).toBe("42501");
    expect((await as(A).from("follows").insert({ follower_id: A, following_id: B })).error).toBeNull();
    expect((await d1Client(db, { role: "anon" }).from("follows").select("follower_id, following_id")).data).toEqual([{ follower_id: A, following_id: B }]);
    await as(B).from("follows").delete().eq("follower_id", A);
    expect((await service().from("follows").select("id", { count: "exact", head: true })).count).toBe(1);
  });

  it("user_progress: owner through the caller's profile row", async () => {
    await service().from("user_progress").insert({ user_id: trip(901), discoveries: 2, unlocked_cities: ["seoul"] });
    expect((await as(A).from("user_progress").select("discoveries, unlocked_cities")).data).toEqual([{ discoveries: 2, unlocked_cities: ["seoul"] }]);
    expect((await as(B).from("user_progress").select("discoveries")).data).toEqual([]);
    expect((await as(B).from("user_progress").insert({ user_id: trip(901), discoveries: 9 })).error?.code).toBe("42501");
  });

  it("service-only tables return nothing to users and anon; geography columns are refused", async () => {
    expect((await as(A).from("social_spot_submissions").select("id")).data).toEqual([]);
    expect((await d1Client(db, { role: "anon" }).from("weekly_city_spot_rankings").select("spot_id")).data).toEqual([]);
    expect(() => service().from("geo_destinations").select("*")).toThrow("geography/geometry");
    expect((await d1Client(db, { role: "anon" }).from("geo_destinations").select("slug")).error).toBeNull();
  });
});

describe("D1 PostgREST facade: spots (migration 0039, write hook)", () => {
  const sid = "40000000-0000-4000-8000-000000000001";
  const photo = "/api/places/photo?name=places%2FChIJsame123%2Fphotos%2Fp1&w=1200";
  const insertSpot = () => service().from("spots").insert({ id: sid, name: { en: "Ikseon Tea Room" }, description: { en: "A quiet tea room." },
    address: { en: "17 Supyo-ro 28-gil, Jongno-gu, Seoul" }, category: "Cafe", location: "POINT(126.9908 37.5744)", photos: [photo], localley_score: 5 });

  it("reads location as PostgREST EWKB and stores WKT input as latitude/longitude", async () => {
    expect((await insertSpot()).error).toBeNull();
    const { data } = await service().from("spots").select("location, address, photos").eq("id", sid).single();
    // Encoding proven byte-identical to PostgREST on all 3,295 live rows; here: prefix + exact round trip.
    expect(String(data!.location)).toMatch(/^0101000020E6100000[0-9A-F]{32}$/);
    expect(parseSpotCoordinates(String(data!.location))).toEqual({ lat: 37.5744, lng: 126.9908 });
    expect(db.sqlite.prepare("SELECT latitude, longitude FROM spots WHERE id = ?").get(sid)).toEqual({ latitude: 37.5744, longitude: 126.9908 });
  });

  it("the write hook derives visible, city, text address and the listing place; updates recompute them", async () => {
    await insertSpot();
    const row = () => ({ ...db.sqlite.prepare("SELECT visible, city, address, visibility_version FROM spots WHERE id = ?").get(sid) as object });
    expect(row()).toMatchObject({ visible: 1, city: "Seoul", address: "17 Supyo-ro 28-gil, Jongno-gu, Seoul" });
    expect(db.sqlite.prepare("SELECT place_id, source FROM spot_listing_places WHERE spot_id = ?").get(sid))
      .toEqual({ place_id: "ChIJsame123", source: "live catalog photo reference" });
    await service().from("spots").update({ photos: [] }).eq("id", sid);
    expect(row()).toMatchObject({ visible: 0 });
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM spot_listing_places").get()).toEqual({ n: 0 });
  });

  it("JSON-path ilike / not ilike and the empty-array filter behave like PostgREST", async () => {
    await insertSpot();
    expect((await service().from("spots").select("id").ilike("address->>en", "%seoul%")).data).toEqual([{ id: sid }]);
    expect((await service().from("spots").select("id").not("name->>en", "ilike", "%Tea%")).data).toEqual([]);
    expect((await service().from("spots").select("id").not("photos", "eq", "{}")).data).toEqual([{ id: sid }]);
  });

  it("anon and users read spots; only the service role writes", async () => {
    await insertSpot();
    expect((await d1Client(db, { role: "anon" }).from("spots").select("id")).data).toEqual([{ id: sid }]);
    expect((await as(A).from("spots").update({ category: "Bar" }).eq("id", sid).select("id")).data).toEqual([]);
    expect((await as(A).from("spots").insert({ name: { en: "x" }, description: { en: "x" }, address: { en: "x" }, category: "x", location: "POINT(1 1)" })).error?.code).toBe("42501");
  });
});

describe("D1 PostgREST facade: gate 2 write journal", () => {
  const entries = () => db.sqlite.prepare("SELECT table_name, op, pk FROM _journal ORDER BY seq").all().map((r) => ({ ...r }));

  it("journals insert, update, upsert and delete keys in order", async () => {
    await as(A).from("conversations").insert({ id: "10000000-0000-4000-8000-000000000077", clerk_user_id: A, title: "x" });
    await as(A).from("itineraries").update({ title: "y" }).eq("id", trip(1));
    await service().from("subscriptions").upsert({ clerk_user_id: B, tier: "pro", status: "active" }, { onConflict: "clerk_user_id" });
    await as(A).from("itineraries").delete().eq("id", trip(2));
    expect(entries()).toEqual([
      { table_name: "conversations", op: "upsert", pk: '{"id":"10000000-0000-4000-8000-000000000077"}' },
      { table_name: "itineraries", op: "upsert", pk: `{"id":"${trip(1)}"}` },
      { table_name: "subscriptions", op: "upsert", pk: `{"clerk_user_id":"${B}"}` },
      { table_name: "itineraries", op: "delete", pk: `{"id":"${trip(2)}"}` },
    ]);
  });

  it("writes that change nothing (other owner) journal nothing; the import mode never journals", async () => {
    await as(A).from("itineraries").update({ title: "z" }).eq("id", trip(3));
    await d1Client(db, { role: "service" }, { triggers: false }).from("itineraries").insert({ clerk_user_id: A, days: 1, activities: [] });
    expect(entries()).toEqual([]);
    expect(() => d1Client(db, { role: "anon" }, { triggers: false })).toThrow("service role");
  });
});
