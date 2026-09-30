// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { authMailMode, createMailSender, isLocalleyAuthLink, isProductionAuthHost, renderAuthMail, type AuthEmailBinding } from "@/lib/auth/mail";

afterEach(() => { delete process.env.AUTH_MAIL_MODE; delete process.env.FROM_EMAIL; delete process.env.BETTER_AUTH_URL; });

function binding(send: ReturnType<typeof vi.fn>) {
  return { send } as unknown as AuthEmailBinding;
}

describe("auth mail", () => {
  it("escapes the link and excludes untrusted names from both parts", () => {
    const { html, text, subject } = renderAuthMail({ kind: "reset-password", to: "a@b.test", url: "https://x/?a=1&b=<2>", name: "Visit https://evil.example <Eve>" });
    expect(subject).toBe("Set your Localley password");
    expect(html).toContain("a=1&amp;b=&lt;2&gt;");
    expect(html).not.toContain("evil.example");
    expect(text).not.toContain("evil.example");
  });

  it("sends each auth action with HTML and text through Cloudflare", async () => {
    process.env.FROM_EMAIL = "Localley <hello@localley.io>";
    const send = vi.fn(async () => ({ messageId: "test-id" }));
    const sender = createMailSender(undefined, binding(send));
    for (const kind of ["magic-link", "reset-password", "verify-email"] as const) {
      await sender({ kind, to: "a@b.test", url: "https://www.localley.io/auth/secret" });
    }
    expect(send).toHaveBeenCalledTimes(3);
    for (const [message] of send.mock.calls) {
      expect(message).toMatchObject({
        to: "a@b.test", from: { email: "hello@localley.io", name: "Localley" },
      });
      expect(message.html).toContain("https://www.localley.io/auth/secret");
      expect(message.text).toContain("https://www.localley.io/auth/secret");
      expect(message.subject).toBeTruthy();
      expect(message.text).toContain("If you did not ask for it, ignore this email.");
    }
  });

  it("fails closed for a missing binding or wrong sender", async () => {
    const mail = { kind: "magic-link" as const, to: "a@b.test", url: "https://www.localley.io/api/auth/magic-link/verify?token=test" };
    process.env.FROM_EMAIL = "Localley <hello@localley.io>";
    await expect(createMailSender(undefined)(mail)).rejects.toThrow(/AUTH_EMAIL/);
    process.env.FROM_EMAIL = "Localley <other@example.com>";
    const send = vi.fn();
    await expect(createMailSender(undefined, binding(send))(mail)).rejects.toThrow(/FROM_EMAIL/);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not retry or expose a suppressed recipient or link", async () => {
    process.env.FROM_EMAIL = "hello@localley.io";
    const send = vi.fn(async () => { throw Object.assign(new Error("a@b.test https://x"), { code: "E_RECIPIENT_SUPPRESSED" }); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createMailSender(undefined, binding(send))({ kind: "magic-link", to: "a@b.test", url: "https://www.localley.io/api/auth/magic-link/verify?token=test" }))
      .rejects.toThrow("Auth email could not be sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[auth] Cloudflare email send failed:", "E_RECIPIENT_SUPPRESSED");
    log.mockRestore();
  });

  it("keeps preview outbox isolated from the binding", async () => {
    process.env.AUTH_MAIL_MODE = "outbox";
    process.env.BETTER_AUTH_URL = "https://localley-next-preview.nkopp.workers.dev";
    const run = vi.fn(async () => {});
    const bind = vi.fn(() => ({ run }));
    const database = { prepare: vi.fn(() => ({ bind })) };
    const send = vi.fn();
    await createMailSender(database, binding(send))({ kind: "magic-link", to: "A@B.test", url: "https://x" });
    expect(bind).toHaveBeenCalledWith("magic-link", "a@b.test", "https://x", expect.any(Number));
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks shorteners and deceptive domains before production sending", async () => {
    process.env.FROM_EMAIL = "Localley <hello@localley.io>";
    const send = vi.fn();
    const sender = createMailSender(undefined, binding(send));
    for (const url of ["https://bit.ly/example", "https://localley.io.evil.test/link", "http://www.localley.io/link", "https://localley.io:8443/link", "https://evil.test@localley.io/link"]) {
      expect(isLocalleyAuthLink(url)).toBe(false);
      await expect(sender({ kind: "magic-link", to: "a@b.test", url })).rejects.toThrow(/HTTPS on localley.io/);
    }
    expect(send).not.toHaveBeenCalled();
    expect(isLocalleyAuthLink("https://www.localley.io/api/auth/magic-link/verify?token=test")).toBe(true);
    expect(isLocalleyAuthLink("https://localley.io/api/auth/verify-email?token=test")).toBe(true);
  });

  it("never uses the outbox on a production host", () => {
    process.env.AUTH_MAIL_MODE = "outbox";
    process.env.BETTER_AUTH_URL = "https://localley-next-preview.nkopp.workers.dev";
    expect(authMailMode()).toBe("outbox");
    for (const host of ["https://www.localley.io", "https://localley.io", "https://next.localley.io"]) {
      process.env.BETTER_AUTH_URL = host;
      expect(isProductionAuthHost(host)).toBe(true);
      expect(authMailMode()).toBe("cloudflare");
    }
    expect(isProductionAuthHost("https://notlocalley.io")).toBe(false);
  });
});
