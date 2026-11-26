import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertApproval, parseSubscriberExport, pending, readLedger, recipientsFrom, recordSent,
} from "../../scripts/newsletter/list-send";
import { approval } from "../../scripts/newsletter/issues/2026-11-first";

const tok = (c: string) => c.repeat(64);

describe("newsletter list send", () => {
  it("keeps only confirmed, not-unsubscribed rows with valid tokens, de-duplicated", () => {
    const rows = [
      { email: "a@x.io", status: "confirmed", unsubscribe_token: tok("a"), unsubscribed_at: null },
      { email: "A@x.io", status: "confirmed", unsubscribe_token: tok("b"), unsubscribed_at: null },
      { email: "p@x.io", status: "pending", unsubscribe_token: tok("c"), unsubscribed_at: null },
      { email: "u@x.io", status: "confirmed", unsubscribe_token: tok("d"), unsubscribed_at: "2026-11-14" },
      { email: "s@x.io", status: "unsubscribed", unsubscribe_token: tok("e"), unsubscribed_at: "2026-11-14" },
      { email: "t@x.io", status: "confirmed", unsubscribe_token: "short", unsubscribed_at: null },
      { email: "not-an-email", status: "confirmed", unsubscribe_token: tok("f"), unsubscribed_at: null },
    ];
    expect(recipientsFrom(rows)).toEqual([{ email: "a@x.io", token: tok("a") }]);
  });

  it("reads the wrangler --json export shape and a plain array", () => {
    const row = { email: "a@x.io", status: "confirmed", unsubscribe_token: tok("a"), unsubscribed_at: null };
    expect(parseSubscriberExport(JSON.stringify([{ results: [row], success: true }]))).toEqual([row]);
    expect(parseSubscriberExport(JSON.stringify([row]))).toEqual([row]);
    expect(() => parseSubscriberExport("{}")).toThrow();
  });

  it("refuses the list send without the issue's exact approval tag", () => {
    expect(approval).toBe("NL-20261126");
    expect(() => assertApproval(approval, undefined)).toThrow(/--approval NL-20261126/);
    expect(() => assertApproval(approval, "ok")).toThrow();
    expect(() => assertApproval(undefined, "anything")).toThrow(/no approval tag/);
    expect(() => assertApproval(approval, "NL-20261126")).not.toThrow();
  });

  describe("ledger", () => {
    let dir = "";
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
    it("skips addresses already sent, so a re-run mails nobody twice", () => {
      dir = mkdtempSync(path.join(tmpdir(), "nl-ledger-"));
      const file = path.join(dir, "sent.txt");
      const all = [{ email: "a@x.io", token: tok("a") }, { email: "B@x.io", token: tok("b") }];
      expect(pending(all, readLedger(file))).toHaveLength(2);
      recordSent(file, "B@x.io");
      expect(pending(all, readLedger(file))).toEqual([{ email: "a@x.io", token: tok("a") }]);
    });
  });
});
