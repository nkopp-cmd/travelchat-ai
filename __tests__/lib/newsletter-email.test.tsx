// @vitest-environment node
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import NewsletterConfirmEmail from "@/emails/newsletter-confirm-email";
import NewsletterIssueEmail from "@/emails/newsletter-issue-email";
import { issue } from "@/scripts/newsletter/issues/2026-11-first";
import { issueHeaders } from "@/scripts/newsletter/send-issue";

const TOKEN = "e".repeat(64);

describe("newsletter mails", () => {
  it("issue carries the unsubscribe link and the legal footer", async () => {
    const html = await render(NewsletterIssueEmail({ issue, unsubscribeUrl: `https://www.localley.io/newsletter/unsubscribe?token=${TOKEN}` }));
    expect(html).toContain(`/newsletter/unsubscribe?token=${TOKEN}`);
    for (const text of ["Unsubscribe", "https://www.localley.io/privacy", "https://www.localley.io/terms", "Contact:", issue.title]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("#b9a1ff"); // Localley violet action color
    for (const pick of issue.picks) expect(pick.url).toMatch(/^https:\/\/www\.localley\.io\/.*utm_source=newsletter/);
  });

  it("confirmation has the button link and no unsubscribe (not on the list yet)", async () => {
    const url = `https://www.localley.io/newsletter/confirm?token=${TOKEN}`;
    const html = await render(NewsletterConfirmEmail({ confirmUrl: url }));
    expect(html).toContain(url);
    expect(html).toContain("24 hours");
    expect(html).not.toContain("Unsubscribe");
  });

  it("issue headers offer RFC 8058 one-click unsubscribe", () => {
    expect(issueHeaders(TOKEN)).toEqual({
      "List-Unsubscribe": `<https://www.localley.io/api/newsletter/unsubscribe?token=${TOKEN}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
