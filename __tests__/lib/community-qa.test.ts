// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { D1Sqlite, createAuthTestDatabase } from "@/__tests__/helpers/d1-sqlite";

vi.mock("server-only", () => ({}));
const { createAnswer, createQuestion, getQuestion, listQuestions, openReportCounts, report, setStatus, toggleVote } = await import("@/lib/community/qa");
const { checkAnswer, checkQuestion, checkTip, checkTrip, DAILY_LIMITS, ACTIVE_TRIP_LIMIT, isoWeek, shiftWeek, weekRange } = await import("@/lib/community/rules");
const { addTrip, hidePerson, listMeetups, listTravellers, myTrips, removeTrip, reportTrip, setTripStatus } = await import("@/lib/community/trips");
const { notifyAnswer } = await import("@/lib/community/notify");
const { createTip, listTips, reportTip, setTipStatus } = await import("@/lib/community/tips");

function db() {
  const d1 = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) d1.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
  return d1 as unknown as Parameters<typeof listQuestions>[0];
}

const alice = { userId: "u_alice", name: "Alice" };
const bob = { userId: "u_bob", name: "Bob" };
const ask = { title: "Does the Ximen night market take cards?", body: "", city: "taipei", topic: "money" as const };

describe("community rules", () => {
  it("accepts a normal question and trims it", () => {
    expect(checkQuestion({ title: "  Is Gwangjang market open on Sunday? ", body: "", city: "seoul", topic: "food" }))
      .toEqual({ ok: true, value: { title: "Is Gwangjang market open on Sunday?", body: "", city: "seoul", topic: "food" } });
  });

  it.each([
    [{ title: "short", city: "seoul", topic: "food" }, "at least"],
    [{ title: "Where to buy a SIM card?", city: "atlantis", topic: "food" }, "city"],
    [{ title: "Where to buy a SIM card?", city: "seoul", topic: "nope" }, "topic"],
    [{ title: "Best tour? see www.cheap-tours.com", city: "seoul", topic: "sights" }, "Links"],
    [{ title: "Need a driver, call +82 10 1234 5678", city: "seoul", topic: "transport" }, "phone"],
  ])("rejects %o", (input, message) => {
    const verdict = checkQuestion({ body: "", ...input });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toContain(message);
  });

  it("checks answers", () => {
    expect(checkAnswer(" ")).toMatchObject({ ok: false });
    expect(checkAnswer("Yes, most stalls take cards now.")).toEqual({ ok: true, value: "Yes, most stalls take cards now." });
    expect(checkAnswer("mail me a@b.com")).toMatchObject({ ok: false });
  });
});

describe("community store", () => {
  it("asks, answers, counts answers and lists by city", async () => {
    const d = db();
    const q = await createQuestion(d, alice, ask);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect((await createAnswer(d, bob, q.id, "Most stalls take cards.")).ok).toBe(true);
    const listed = await listQuestions(d, bob.userId, { city: "taipei" });
    expect(listed.map((r) => [r.title, r.answer_count])).toEqual([[ask.title, 1]]);
    expect(await listQuestions(d, bob.userId, { city: "seoul" })).toEqual([]);
  });

  it("upvotes toggle, never count own posts, and keep the score equal to the vote rows", async () => {
    const d = db();
    const q = await createQuestion(d, alice, ask);
    if (!q.ok) throw new Error(q.error);
    expect(await toggleVote(d, alice.userId, "question", q.id)).toBe(false);
    expect(await toggleVote(d, bob.userId, "question", q.id)).toBe(true);
    expect((await getQuestion(d, q.id, bob.userId))!.question).toMatchObject({ score: 1, voted: 1 });
    await toggleVote(d, bob.userId, "question", q.id);
    expect((await getQuestion(d, q.id, bob.userId))!.question).toMatchObject({ score: 0, voted: 0 });
  });

  it("hides reported content for everyone except admins and recounts answers", async () => {
    const d = db();
    const q = await createQuestion(d, alice, ask);
    if (!q.ok) throw new Error(q.error);
    const a = await createAnswer(d, bob, q.id, "Spam answer");
    if (!a.ok) throw new Error(a.error);
    await report(d, alice.userId, "answer", a.id, "spam");
    await report(d, alice.userId, "answer", a.id, "spam");
    expect((await openReportCounts(d, [a.id])).get(a.id)).toBe(1);
    await setStatus(d, "answer", a.id, "hidden");
    expect((await getQuestion(d, q.id, alice.userId))!).toMatchObject({ answers: [], question: { answer_count: 0 } });
    expect((await getQuestion(d, q.id, "admin", true))!.answers).toHaveLength(1);
    expect((await openReportCounts(d, [a.id])).size).toBe(0);
    await setStatus(d, "question", q.id, "hidden");
    expect(await getQuestion(d, q.id, alice.userId)).toBeNull();
    expect((await createAnswer(d, bob, q.id, "late answer")).ok).toBe(false);
  });

  it("stops a user at the daily question limit", async () => {
    const d = db();
    for (let i = 0; i < DAILY_LIMITS.question; i++) expect((await createQuestion(d, alice, { ...ask, title: `${ask.title} ${i}` })).ok).toBe(true);
    expect(await createQuestion(d, alice, ask)).toMatchObject({ ok: false });
    expect((await createQuestion(d, bob, ask)).ok).toBe(true);
  });
});

describe("spot tips", () => {
  const today = new Date("2026-10-25T12:00:00Z");

  it("accepts a tip with or without a visit day in the last two years", () => {
    expect(checkTip({ body: "Closed on Mondays, cash only.", visitedOn: "2026-10-25" }, today))
      .toEqual({ ok: true, value: { body: "Closed on Mondays, cash only.", visitedOn: "2026-10-25" } });
    expect(checkTip({ body: "Short queue before 11.", visitedOn: "" }, today)).toMatchObject({ ok: true, value: { visitedOn: null } });
    for (const visitedOn of ["2026-10-26", "2024-01-01", "2026-02-30", "yesterday"]) {
      expect(checkTip({ body: "Closed on Mondays.", visitedOn }, today)).toMatchObject({ ok: false });
    }
    expect(checkTip({ body: "x".repeat(281), visitedOn: "" }, today)).toMatchObject({ ok: false });
    expect(checkTip({ body: "book at www.example.com", visitedOn: "" }, today)).toMatchObject({ ok: false });
  });

  it("adds tips only to visible spots, hides them for everyone but admins, and blocks self-reports", async () => {
    const d = db() as unknown as Parameters<typeof listTips>[0] & { prepare(sql: string): { run(): Promise<unknown> } };
    await d.prepare("INSERT INTO spots (id, name, description, category, visible) VALUES ('11111111-1111-4111-8111-111111111111', '{\"en\":\"Cafe\"}', '{}', 'Food', 1), ('22222222-2222-4222-8222-222222222222', '{}', '{}', 'Food', 0)").run();
    expect(await createTip(d, alice, "22222222-2222-4222-8222-222222222222", { body: "Nice", visitedOn: null })).toMatchObject({ ok: false });
    const tip = await createTip(d, alice, "11111111-1111-4111-8111-111111111111", { body: "Closed on Mondays.", visitedOn: "2026-10-20" });
    if (!tip.ok) throw new Error(tip.error);
    await reportTip(d, alice.userId, tip.id, "spam");
    expect((await listTips(d, "11111111-1111-4111-8111-111111111111", true))[0]).toMatchObject({ open_reports: 0 });
    await reportTip(d, bob.userId, tip.id, "wrong");
    expect((await listTips(d, "11111111-1111-4111-8111-111111111111", true))[0]).toMatchObject({ open_reports: 1 });
    await setTipStatus(d, tip.id, "hidden");
    expect(await listTips(d, "11111111-1111-4111-8111-111111111111")).toEqual([]);
    expect((await listTips(d, "11111111-1111-4111-8111-111111111111", true))[0]).toMatchObject({ status: "hidden", open_reports: 0 });
  });
});

describe("travelling now", () => {
  const today = new Date("2026-10-25T12:00:00Z");
  const week = weekRange("2026-W44")!;

  it("computes ISO weeks across year ends", () => {
    expect(isoWeek("2026-10-26")).toBe("2026-W44");
    expect(isoWeek("2021-01-03")).toBe("2020-W53");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(weekRange("2025-W53")).toBeNull();
    expect(shiftWeek("2026-W53", 1)).toBe("2027-W01");
    expect(week).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });

  it("checks trips", () => {
    expect(checkTrip({ city: "seoul", from: "2026-10-24", to: "2026-10-30", note: " Street food fan " }, today))
      .toEqual({ ok: true, value: { city: "seoul", from: "2026-10-24", to: "2026-10-30", note: "Street food fan" } });
    for (const input of [
      { city: "mars", from: "2026-10-26", to: "2026-10-27" },
      { city: "seoul", from: "2026-10-27", to: "2026-10-26" },
      { city: "seoul", from: "2026-10-01", to: "2026-10-24" },
      { city: "seoul", from: "2027-12-01", to: "2027-12-02" },
      { city: "seoul", from: "2026-10-26", to: "2027-01-01" },
      { city: "seoul", from: "2026-10-26", to: "2026-10-27", note: "add me on wa +66 81 234 5678" },
    ]) expect(checkTrip({ note: "", ...input }, today)).toMatchObject({ ok: false });
  });

  it("groups by city and week overlap, honours hide-person, limits and leaving", async () => {
    const d = db();
    const day = "2026-10-25";
    const a = await addTrip(d, alice, day, { city: "seoul", from: "2026-10-24", to: "2026-10-27", note: "" });
    const b = await addTrip(d, bob, day, { city: "seoul", from: "2026-11-01", to: "2026-11-05", note: "night markets" });
    await addTrip(d, { userId: "u_carol", name: "Carol" }, day, { city: "seoul", from: "2026-11-02", to: "2026-11-04", note: "" });
    await addTrip(d, { userId: "u_dan", name: "Dan" }, day, { city: "tokyo", from: "2026-10-26", to: "2026-10-28", note: "" });
    if (!a.ok || !b.ok) throw new Error("add failed");
    expect((await listTravellers(d, alice.userId, "seoul", week)).map((t) => t.author_name)).toEqual(["Alice", "Bob"]);
    expect(await addTrip(d, alice, day, { city: "seoul", from: "2026-10-24", to: "2026-10-30", note: "" })).toMatchObject({ ok: false });
    await hidePerson(d, alice.userId, bob.userId);
    await hidePerson(d, alice.userId, alice.userId);
    expect((await listTravellers(d, alice.userId, "seoul", week)).map((t) => t.author_name)).toEqual(["Alice"]);
    expect((await listTravellers(d, bob.userId, "seoul", week)).map((t) => t.author_name)).toEqual(["Alice", "Bob"]);
    await removeTrip(d, bob.userId, a.id);
    expect(await myTrips(d, alice.userId, day)).toHaveLength(1);
    await removeTrip(d, alice.userId, a.id);
    expect(await myTrips(d, alice.userId, day)).toEqual([]);
    for (let i = 0; i < ACTIVE_TRIP_LIMIT; i++) expect((await addTrip(d, alice, day, { city: "seoul", from: `2026-11-1${i}`, to: "2026-11-20", note: "" })).ok).toBe(true);
    expect(await addTrip(d, alice, day, { city: "busan", from: "2026-11-01", to: "2026-11-02", note: "" })).toMatchObject({ ok: false });
  });

  it("reports and admin-hides a trip; meetup posts follow city, week and hidden people", async () => {
    const d = db();
    const b = await addTrip(d, bob, "2026-10-25", { city: "seoul", from: "2026-10-26", to: "2026-10-28", note: "" });
    if (!b.ok) throw new Error(b.error);
    await reportTrip(d, bob.userId, b.id, "spam");
    await reportTrip(d, alice.userId, b.id, "unsafe");
    expect((await listTravellers(d, "admin", "seoul", week, true))[0]).toMatchObject({ open_reports: 1 });
    await setTripStatus(d, b.id, "hidden");
    expect(await listTravellers(d, alice.userId, "seoul", week)).toEqual([]);
    const q = await createQuestion(d, bob, { title: "Group dinner at Gwangjang on Friday?", body: "", city: "seoul", topic: "meetup" });
    if (!q.ok) throw new Error(q.error);
    await (d as unknown as { prepare(s: string): { bind(...v: string[]): { run(): Promise<unknown> } } })
      .prepare("UPDATE community_questions SET created_at = '2026-10-27T10:00:00.000Z' WHERE id = ?").bind(q.id).run();
    expect((await listMeetups(d, alice.userId, "seoul", week)).map((m) => m.id)).toEqual([q.id]);
    expect(await listMeetups(d, alice.userId, "tokyo", week)).toEqual([]);
    await hidePerson(d, alice.userId, bob.userId);
    expect(await listMeetups(d, alice.userId, "seoul", week)).toEqual([]);
  });
});

describe("answer notifications", () => {
  function authDb() {
    const d = createAuthTestDatabase();
    const now = new Date().toISOString();
    const add = d.sqlite.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`);
    add.run("u_alice", "Alice", "alice@example.test", 1, now, now);
    add.run("u_bob", "Bob", "bob@example.test", 1, now, now);
    add.run("u_eve", "Eve", "eve@example.test", 0, now, now);
    return d;
  }
  const inbox = (d: ReturnType<typeof authDb>, user: string) =>
    d.sqlite.prepare("SELECT type, title, message, data FROM auth_notifications WHERE userId = ?").all(user) as { type: string; title: string; message: string; data: string }[];

  it("tells the question author about someone else's answer, with a link back", async () => {
    const app = db(), auth = authDb();
    const q = await createQuestion(app, alice, ask);
    if (!q.ok) throw new Error(q.error);
    expect(await notifyAnswer(app, auth as unknown as Parameters<typeof notifyAnswer>[1], q.id, bob)).toBe(true);
    const [row] = inbox(auth, "u_alice");
    expect(row).toMatchObject({ type: "system", title: "Bob answered your question", message: ask.title });
    expect(JSON.parse(row.data)).toEqual({ url: `/community/${q.id}`, questionId: q.id });
    expect(await notifyAnswer(app, auth as unknown as Parameters<typeof notifyAnswer>[1], q.id, alice)).toBe(false);
    expect(inbox(auth, "u_alice")).toHaveLength(1);
  });

  it("skips unverified authors, authors who turned social off, hidden questions, and never throws", async () => {
    const app = db(), auth = authDb();
    const typedAuth = auth as unknown as Parameters<typeof notifyAnswer>[1];
    const eve = await createQuestion(app, { userId: "u_eve", name: "Eve" }, ask);
    if (!eve.ok) throw new Error(eve.error);
    expect(await notifyAnswer(app, typedAuth, eve.id, bob)).toBe(false);
    auth.sqlite.prepare("INSERT INTO auth_notification_preferences (userId, social) VALUES ('u_alice', 0)").run();
    const q = await createQuestion(app, alice, { ...ask, title: `${ask.title} again` });
    if (!q.ok) throw new Error(q.error);
    expect(await notifyAnswer(app, typedAuth, q.id, bob)).toBe(false);
    auth.sqlite.prepare("UPDATE auth_notification_preferences SET social = 1 WHERE userId = 'u_alice'").run();
    await setStatus(app, "question", q.id, "hidden");
    expect(await notifyAnswer(app, typedAuth, q.id, bob)).toBe(false);
    const broken = { prepare() { throw new Error("down"); }, batch: async () => [] } as unknown as Parameters<typeof notifyAnswer>[1];
    await setStatus(app, "question", q.id, "visible");
    expect(await notifyAnswer(app, broken, q.id, bob)).toBe(false);
  });
});
