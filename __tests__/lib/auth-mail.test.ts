// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailSender, renderAuthMail } from "@/lib/auth/mail";

afterEach(() => { vi.unstubAllGlobals(); delete process.env.AUTH_MAIL_MODE; delete process.env.RESEND_API_KEY; });

describe("auth mail", () => {
  it("escapes the link and name in HTML", () => {
    const { html, subject } = renderAuthMail({ kind: "reset-password", to: "a@b.test", url: "https://x/?a=1&b=<2>", name: "<Eve>" });
    expect(subject).toBe("Set your Localley password");
    expect(html).toContain("&lt;Eve&gt;");
    expect(html).toContain("a=1&amp;b=&lt;2&gt;");
  });

  it("sends through Resend outside outbox mode", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createMailSender(undefined)({ kind: "magic-link", to: "a@b.test", url: "https://x" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ["a@b.test"], subject: "Your Localley sign-in link" });
  });

  it("fails loudly when Resend rejects or no key exists", async () => {
    await expect(createMailSender(undefined)({ kind: "magic-link", to: "a@b.test", url: "https://x" })).rejects.toThrow(/RESEND_API_KEY/);
    process.env.RESEND_API_KEY = "re_test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(createMailSender(undefined)({ kind: "magic-link", to: "a@b.test", url: "https://x" })).rejects.toThrow(/403/);
  });
});
