// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { D1Sqlite } from "../helpers/d1-sqlite";
import {
  CONFIRM_TTL_SECONDS, cleanCity, cleanSource, confirm, isToken, normalizeEmail, releaseConfirm, sha256Hex, subscribe, unsubscribe,
} from "@/lib/newsletter/store";

const MIGRATION = readFileSync(path.resolve(__dirname, "../../migrations/app-preview/0051_newsletter_subscribers.sql"), "utf8");
const T0 = 1_800_000_000;
let db: D1Sqlite;
const row = (email: string) => db.sqlite.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").get(email) as Record<string, unknown>;
const count = () => (db.sqlite.prepare("SELECT count(*) AS n FROM newsletter_subscribers").get() as { n: number }).n;

beforeEach(() => { db = new D1Sqlite(); db.sqlite.exec(MIGRATION); });
afterEach(() => db.sqlite.close());

describe("input cleaning", () => {
  it("normalizes and rejects addresses", () => {
    expect(normalizeEmail("  Traveller@Example.COM ")).toBe("traveller@example.com");
    for (const bad of ["", "no-at", "a@b", "a b@example.com", "<x>@example.com", 42, null, `${"a".repeat(250)}@example.com`]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
  it("keeps only safe source and city slugs", () => {
    expect(cleanSource("city-hub")).toBe("city-hub");
    expect(cleanSource("<script>")).toBe("site");
    expect(cleanCity("seoul")).toBe("seoul");
    expect(cleanCity("Seoul'--")).toBeNull();
  });
  it("accepts only 64-hex tokens", () => {
    expect(isToken("a".repeat(64))).toBe(true);
    expect(isToken("A".repeat(64))).toBe(false);
    expect(isToken("a".repeat(63))).toBe(false);
  });
});

describe("double opt-in", () => {
  it("stores a pending row with a hashed confirm token and a random unsubscribe token", async () => {
    const result = await subscribe(db, { email: "t@example.com", source: "city-hub", city: "seoul" }, T0);
    expect(result.send).toBe(true);
    if (!result.send) throw new Error("expected send");
    const r = row("t@example.com");
    expect(r.status).toBe("pending");
    expect(r.confirm_hash).toBe(await sha256Hex(result.confirmToken));
    expect(r.confirm_hash).not.toBe(result.confirmToken);
    expect(r.confirm_expires).toBe(T0 + CONFIRM_TTL_SECONDS);
    expect(isToken(r.unsubscribe_token)).toBe(true);
    expect(r.unsubscribe_token).not.toBe(result.confirmToken);
    expect([r.source, r.city, r.created_at]).toEqual(["city-hub", "seoul", T0]);
    expect(String(r.consent_text)).toMatch(/Localley newsletter v1/);
  });

  it("sends at most one link per address per 24 h, then a fresh one", async () => {
    const first = await subscribe(db, { email: "t@example.com" }, T0);
    expect(await subscribe(db, { email: "t@example.com" }, T0 + 60)).toEqual({ send: false });
    const again = await subscribe(db, { email: "t@example.com" }, T0 + CONFIRM_TTL_SECONDS);
    expect(again.send).toBe(true);
    expect(count()).toBe(1);
    if (!first.send || !again.send) throw new Error("expected send");
    expect(await confirm(db, first.confirmToken, T0 + CONFIRM_TTL_SECONDS + 1)).toBe(false); // replaced link is dead
    expect(await confirm(db, again.confirmToken, T0 + CONFIRM_TTL_SECONDS + 1)).toBe(true);
  });

  it("confirms once, rejects expired and unknown tokens, and never re-sends to a confirmed address", async () => {
    const r = await subscribe(db, { email: "t@example.com" }, T0);
    if (!r.send) throw new Error("expected send");
    expect(await confirm(db, r.confirmToken, T0 + CONFIRM_TTL_SECONDS)).toBe(false); // expired at the edge
    expect(await confirm(db, "b".repeat(64), T0 + 1)).toBe(false);
    expect(await confirm(db, "not-a-token", T0 + 1)).toBe(false);
    expect(row("t@example.com").status).toBe("pending");
    const fresh = await subscribe(db, { email: "t@example.com" }, T0 + CONFIRM_TTL_SECONDS);
    if (!fresh.send) throw new Error("expected send");
    expect(await confirm(db, fresh.confirmToken, T0 + CONFIRM_TTL_SECONDS + 5)).toBe(true);
    expect(await confirm(db, fresh.confirmToken, T0 + CONFIRM_TTL_SECONDS + 6)).toBe(false); // single use
    const confirmed = row("t@example.com");
    expect([confirmed.status, confirmed.confirmed_at, confirmed.confirm_hash]).toEqual(["confirmed", T0 + CONFIRM_TTL_SECONDS + 5, null]);
    expect(await subscribe(db, { email: "t@example.com" }, T0 + 10 * CONFIRM_TTL_SECONDS)).toEqual({ send: false });
    expect(row("t@example.com").status).toBe("confirmed");
  });

  it("releases the 24 h lock after a failed confirmation send", async () => {
    await subscribe(db, { email: "t@example.com" }, T0);
    await releaseConfirm(db, "t@example.com");
    expect((await subscribe(db, { email: "t@example.com" }, T0 + 1)).send).toBe(true);
  });
});

describe("unsubscribe", () => {
  it("is idempotent, keeps the first time, and re-subscribing starts double opt-in again", async () => {
    const r = await subscribe(db, { email: "t@example.com" }, T0);
    if (!r.send) throw new Error("expected send");
    await confirm(db, r.confirmToken, T0 + 1);
    const token = String(row("t@example.com").unsubscribe_token);
    expect(await unsubscribe(db, token, T0 + 2)).toBe(true);
    expect(await unsubscribe(db, token, T0 + 3)).toBe(true);
    expect([row("t@example.com").status, row("t@example.com").unsubscribed_at]).toEqual(["unsubscribed", T0 + 2]);
    expect(await unsubscribe(db, "c".repeat(64), T0)).toBe(false);
    expect(await unsubscribe(db, "x", T0)).toBe(false);
    const back = await subscribe(db, { email: "t@example.com" }, T0 + 4);
    expect(back.send).toBe(true);
    expect([row("t@example.com").status, row("t@example.com").unsubscribed_at]).toEqual(["pending", null]);
    expect(row("t@example.com").unsubscribe_token).toBe(token); // links in old mails keep working
  });

  it("works for a pending row and kills its confirm link", async () => {
    const r = await subscribe(db, { email: "t@example.com" }, T0);
    if (!r.send) throw new Error("expected send");
    expect(await unsubscribe(db, String(row("t@example.com").unsubscribe_token), T0 + 1)).toBe(true);
    expect(await confirm(db, r.confirmToken, T0 + 2)).toBe(false);
  });
});
