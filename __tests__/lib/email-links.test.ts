import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accountEmailLink, EMAIL_SITE } from "@/emails/links";

// Push BB1: account emails linked to the apex host (one 301 more) and to /dashboard or /settings directly,
// so a payer opening the mail on another device landed on the generic "Join Localley" sign-up form.
const APEX = /https?:\/\/localley\.(io|app)/;
const FILES = [...readdirSync("emails").filter((name) => /\.tsx?$/.test(name)).map((name) => join("emails", name)), "lib/subscription-mail.ts"];

describe("email links (Push BB1)", () => {
  it("account links go through sign-in on www and return to the page", () => {
    expect(EMAIL_SITE).toBe("https://www.localley.io");
    expect(accountEmailLink("/dashboard")).toBe("https://www.localley.io/sign-in?redirect_url=%2Fdashboard");
    expect(accountEmailLink("/settings")).toBe("https://www.localley.io/sign-in?redirect_url=%2Fsettings");
  });

  it("no email source links to the apex or old host", () => {
    const faults = FILES.flatMap((file) => readFileSync(file, "utf8").split("\n")
      .filter((line) => APEX.test(line)).map((line) => `${file}: ${line.trim()}`));
    expect(faults).toEqual([]);
  });

  it("no email source links straight to a private account page", () => {
    const direct = /["'`]https:\/\/www\.localley\.io\/(dashboard|settings)\b/;
    const faults = FILES.flatMap((file) => readFileSync(file, "utf8").split("\n")
      .filter((line) => direct.test(line)).map((line) => `${file}: ${line.trim()}`));
    expect(faults).toEqual([]);
  });
});
