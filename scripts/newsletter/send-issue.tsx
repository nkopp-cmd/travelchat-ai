/**
 * Send one Localley newsletter issue (shared/plans/localley-newsletter.md).
 *
 * Test mode (one owner-default recipient):
 *   npx tsx scripts/newsletter/send-issue.tsx --issue 2026-11-first --to <email> --token <unsubscribe token> \
 *     [--html-out file.html] [--send]
 *
 * List mode (confirmed subscribers, after Nils' Telegram ok for the issue's approval tag):
 *   npx wrangler d1 execute localley-app --remote --json \
 *     --command "SELECT email, status, unsubscribe_token, unsubscribed_at FROM newsletter_subscribers WHERE status = 'confirmed' AND unsubscribed_at IS NULL" \
 *     2>/dev/null > subscribers.json
 *   npx tsx scripts/newsletter/send-issue.tsx --issue 2026-11-first --list subscribers.json \
 *     --approval NL-20261114-rich --ledger sent-2026-11-first.txt [--send]
 *
 * Without --send nothing is sent (list mode prints the recipient count only, never addresses). List mode re-filters
 * the export (confirmed, not unsubscribed, valid token, de-duplicated) and skips every address in the ledger, so a
 * re-run after a failure never mails anyone twice. Transport: Localley's own Resend account, key
 * LOCALLEY_RESEND_SENDING_API_KEY from the environment, never printed. Every mail carries its own List-Unsubscribe +
 * List-Unsubscribe-Post (RFC 8058 one-click).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { render } from "@react-email/components";
import { Resend } from "resend";
import NewsletterIssueEmail, { type NewsletterIssue } from "../../emails/newsletter-issue-email";
import { assertApproval, parseSubscriberExport, pending, readLedger, recipientsFrom, recordSent } from "./list-send";

const OWNER_DEFAULT_EMAILS = new Set(["nkopp@my-goodlife.com"]);
const SITE = "https://www.localley.io";
const SEND_GAP_MS = 600; // Resend default limit is 2 requests/second.

export function issueHeaders(token: string) {
  return {
    "List-Unsubscribe": `<${SITE}/api/newsletter/unsubscribe?token=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function renderFor(issue: NewsletterIssue, token: string) {
  const element = NewsletterIssueEmail({ issue, unsubscribeUrl: `${SITE}/newsletter/unsubscribe?token=${token}` });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}

function sender() {
  const key = process.env.LOCALLEY_RESEND_SENDING_API_KEY;
  if (!key) throw new Error("LOCALLEY_RESEND_SENDING_API_KEY is not set");
  const resend = new Resend(key);
  return async (issueName: string, issue: NewsletterIssue, to: string, token: string) => {
    const { html, text } = await renderFor(issue, token);
    const { data, error } = await resend.emails.send({
      from: "Localley <hello@localley.io>",
      to,
      replyTo: "hello@localley.io",
      subject: issue.subject,
      html,
      text,
      headers: issueHeaders(token),
      tags: [{ name: "kind", value: "newsletter" }, { name: "issue", value: issueName.replace(/[^a-z0-9_-]/g, "_") }],
    });
    if (error) throw new Error(`resend: ${error.name}`);
    return data?.id;
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      issue: { type: "string" }, to: { type: "string" }, token: { type: "string" }, "html-out": { type: "string" },
      send: { type: "boolean" }, list: { type: "string" }, approval: { type: "string" }, ledger: { type: "string" },
    },
  });
  if (!values.issue || !/^[0-9a-z-]+$/.test(values.issue)) throw new Error("--issue <name> required");
  const mod = (await import(`./issues/${values.issue}.ts`)) as { issue: NewsletterIssue; approval?: string };
  const { issue } = mod;

  if (values.list) {
    if (values.to || values.token) throw new Error("--list cannot be combined with --to/--token");
    assertApproval(mod.approval, values.approval);
    if (!values.ledger) throw new Error("--ledger <file> required in list mode");
    const all = recipientsFrom(parseSubscriberExport(readFileSync(values.list, "utf8")));
    const todo = pending(all, readLedger(values.ledger));
    console.log(`list ${values.issue}: ${all.length} confirmed, ${all.length - todo.length} already sent, ${todo.length} to send`);
    if (!values.send) return;
    const send = sender();
    let sent = 0;
    for (const r of todo) {
      await send(values.issue, issue, r.email, r.token);
      recordSent(values.ledger, r.email);
      sent += 1;
      if (sent < todo.length) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    }
    console.log(`sent ${values.issue} to ${sent} recipients`);
    return;
  }

  if (!values.to || !OWNER_DEFAULT_EMAILS.has(values.to)) throw new Error("--to must be an owner-default address (use --list for subscribers)");
  if (!values.token || !/^[0-9a-f]{64}$/.test(values.token)) throw new Error("--token <64-hex unsubscribe token> required");
  const { html } = await renderFor(issue, values.token);
  if (values["html-out"]) writeFileSync(values["html-out"], html);
  if (!values.send) {
    console.log(`rendered ${values.issue}: ${html.length} bytes html`);
    return;
  }
  const id = await sender()(values.issue, issue, values.to, values.token);
  console.log(`sent ${values.issue} to 1 recipient, id ${id}`);
}

if (process.argv[1]?.endsWith("send-issue.tsx")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "send failed");
    process.exit(1);
  });
}
