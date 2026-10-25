import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildPrompt, parseVerdicts, updateStatements, SCHEMA } from "./community-moderation.mjs";

const items = [
  { kind: "question", id: "q1", text: "Is the market open on Sunday?" },
  { kind: "answer", id: "a1", text: "WhatsApp me +66 81 234 5678 for a cheap tour" },
  { kind: "tip", id: "t1", text: "Cash only", photoFile: "/tmp/1.webp", photoIndex: 0 },
];

test("prompt lists every item once and numbers attached photos", () => {
  const prompt = buildPrompt(items);
  for (const item of items) assert.ok(prompt.includes(`"id":"${item.id}"`));
  assert.ok(prompt.includes("attached image #1"));
  assert.equal(SCHEMA.properties.verdicts.items.properties.verdict.enum.join(","), "allow,hide");
});

test("only well-formed verdicts for ids in the batch count; the rest is retried", () => {
  const raw = JSON.stringify({ verdicts: [
    { id: "q1", verdict: "allow", reason: "ordinary question" },
    { id: "a1", verdict: "hide", reason: "contact details   and tout offer" },
    { id: "a1", verdict: "allow", reason: "duplicate ignored" },
    { id: "zz", verdict: "hide", reason: "unknown id" },
    { id: "t1", verdict: "maybe", reason: "bad value" },
  ] });
  const verdicts = parseVerdicts(`noise ${raw} noise`, items);
  assert.deepEqual([...verdicts.keys()], ["q1", "a1"]);
  assert.equal(verdicts.get("a1").reason, "contact details and tout offer");
  assert.equal(parseVerdicts("not json", items).size, 0);
});

test("statements update only unreviewed rows, hide on 'hide', and recount answers", () => {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations/app-preview").filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(`migrations/app-preview/${f}`, "utf8"));
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`INSERT INTO community_questions (id, user_id, author_name, city, topic, title, answer_count) VALUES ('q1', 'u1', 'A', 'seoul', 'food', 'Is the market open on Sunday?', 1);
    INSERT INTO community_answers (id, question_id, user_id, author_name, body) VALUES ('a1', 'q1', 'u2', 'B', 'WhatsApp me for a tour');`);
  const verdicts = new Map([["q1", { verdict: "allow", reason: "ok" }], ["a1", { verdict: "hide", reason: "contact details" }]]);
  for (const s of updateStatements(items, verdicts, "2026-10-25T00:00:00.000Z")) db.prepare(s.sql).run(...s.params);
  assert.deepEqual({ ...db.prepare("SELECT status, ai_verdict, answer_count FROM community_questions WHERE id = 'q1'").get() }, { status: "visible", ai_verdict: "allow", answer_count: 0 });
  assert.deepEqual({ ...db.prepare("SELECT status, ai_verdict, ai_reason FROM community_answers WHERE id = 'a1'").get() }, { status: "hidden", ai_verdict: "hide", ai_reason: "contact details" });
  // A second run never overwrites an earlier review (or an admin decision after it).
  db.exec("UPDATE community_answers SET status = 'visible' WHERE id = 'a1'");
  for (const s of updateStatements(items, new Map([["a1", { verdict: "hide", reason: "again" }]]))) db.prepare(s.sql).run(...s.params);
  assert.equal(db.prepare("SELECT status FROM community_answers WHERE id = 'a1'").get().status, "visible");
});
