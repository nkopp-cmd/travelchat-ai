/**
 * Send one Localley newsletter issue (shared/plans/localley-newsletter.md).
 *
 *   npx tsx scripts/newsletter/send-issue.tsx --issue 2026-11-first --to <email> --token <unsubscribe token> \
 *     [--html-out file.html] [--send]
 *
 * Without --send it only renders. v1 sends to ONE explicit recipient that must be an owner-default address: the bulk
 * send comes with the first real issue, after Nils approves the test issue. Transport: Localley's own Resend account
 * (localley.io is verified there), key LOCALLEY_RESEND_SENDING_API_KEY from the environment, never printed.
 * Every mail carries List-Unsubscribe + List-Unsubscribe-Post (RFC 8058 one-click).
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { render } from "@react-email/components";
import { Resend } from "resend";
import NewsletterIssueEmail, { type NewsletterIssue } from "../../emails/newsletter-issue-email";

const OWNER_DEFAULT_EMAILS = new Set(["nkopp@my-goodlife.com"]);
const SITE = "https://www.localley.io";

export function issueHeaders(token: string) {
  return {
    "List-Unsubscribe": `<${SITE}/api/newsletter/unsubscribe?token=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function main() {
  const { values } = parseArgs({
    options: { issue: { type: "string" }, to: { type: "string" }, token: { type: "string" }, "html-out": { type: "string" }, send: { type: "boolean" } },
  });
  if (!values.issue || !/^[0-9a-z-]+$/.test(values.issue)) throw new Error("--issue <name> required");
  if (!values.to || !OWNER_DEFAULT_EMAILS.has(values.to)) throw new Error("--to must be an owner-default address in v1");
  if (!values.token || !/^[0-9a-f]{64}$/.test(values.token)) throw new Error("--token <64-hex unsubscribe token> required");
  const { issue } = (await import(`./issues/${values.issue}.ts`)) as { issue: NewsletterIssue };
  const element = NewsletterIssueEmail({ issue, unsubscribeUrl: `${SITE}/newsletter/unsubscribe?token=${values.token}` });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  if (values["html-out"]) writeFileSync(values["html-out"], html);
  if (!values.send) {
    console.log(`rendered ${values.issue}: ${html.length} bytes html`);
    return;
  }
  const key = process.env.LOCALLEY_RESEND_SENDING_API_KEY;
  if (!key) throw new Error("LOCALLEY_RESEND_SENDING_API_KEY is not set");
  const { data, error } = await new Resend(key).emails.send({
    from: "Localley <hello@localley.io>",
    to: values.to,
    replyTo: "hello@localley.io",
    subject: issue.subject,
    html,
    text,
    headers: issueHeaders(values.token),
    tags: [{ name: "kind", value: "newsletter" }, { name: "issue", value: values.issue.replace(/[^a-z0-9_-]/g, "_") }],
  });
  if (error) throw new Error(`resend: ${error.name}`);
  console.log(`sent ${values.issue} to 1 recipient, id ${data?.id}`);
}

if (process.argv[1]?.endsWith("send-issue.tsx")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "send failed");
    process.exit(1);
  });
}
