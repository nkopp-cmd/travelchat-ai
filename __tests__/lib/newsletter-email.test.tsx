// @vitest-environment node
import { existsSync } from "node:fs";
import path from "node:path";
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
    const links = [...html.matchAll(/<a[^>]+href="(https:\/\/www\.localley\.io\/[^"]*)"/g)].map((m) => m[1]);
    const content = links.filter((url) => !/\/(privacy|terms|newsletter\/unsubscribe)|^https:\/\/www\.localley\.io\/?$/.test(url));
    expect(content.length).toBeGreaterThan(10);
    for (const url of content) expect(url).toContain("utm_source=newsletter");
  });

  it("every email image is a built PNG/JPEG under public/email/v1 (no SVG or WebP)", async () => {
    const html = await render(NewsletterIssueEmail({ issue, unsubscribeUrl: "https://www.localley.io/newsletter/unsubscribe" }));
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(images.length).toBeGreaterThan(10);
    for (const src of images) {
      expect(src).toMatch(/^https:\/\/www\.localley\.io\/email\/v1\/[a-z0-9-]+\.(png|jpg)$/);
      expect(existsSync(path.join(process.cwd(), "public", new URL(src).pathname))).toBe(true);
    }
  });

  it("chart numbers agree with the stat tiles", () => {
    const total = issue.scores!.rows.reduce((sum, row) => sum + row.count, 0);
    expect(String(total)).toBe(issue.stats![0].value);
    expect(String(issue.scores!.rows.find((row) => row.level === 6)!.count)).toBe(issue.stats![1].value);
    for (const row of issue.cityShares!.rows) expect(row.share).toBeGreaterThanOrEqual(0);
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
