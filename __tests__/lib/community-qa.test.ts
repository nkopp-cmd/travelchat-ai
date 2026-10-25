// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

vi.mock("server-only", () => ({}));
const { createAnswer, createQuestion, getQuestion, listQuestions, openReportCounts, report, setStatus, toggleVote } = await import("@/lib/community/qa");
const { checkAnswer, checkQuestion, DAILY_LIMITS } = await import("@/lib/community/rules");

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
