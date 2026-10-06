// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendItineraryEmail } from "@/lib/itinerary-mail";

const symbol = Symbol.for("__cloudflare-context__");
const globals = globalThis as Record<symbol, unknown>;
const environment = process.env;
const originalContext = globals[symbol];
const props = { itineraryTitle: "Owned <Seoul> trip", city: "Seoul", recipientName: "<Eve>",
  days: [{ day: "Day 1", activities: [{ title: "Walk", description: "A saved stop", type: "mixed" as const }] }],
  insights: [{ label: "Train", text: "Use the metro", kind: "transport" as const }],
  shareUrl: "https://localley.io/itineraries/owned-id" };
let send: ReturnType<typeof vi.fn>;
beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "cloudflare", BETTER_AUTH_URL: "https://www.localley.io",
    FROM_EMAIL: "Localley <hello@localley.io>" };
  send = vi.fn().mockResolvedValue({ messageId: "cloudflare-id" });
  globals[symbol] = { env: { AUTH_EMAIL: { send } } };
});
afterEach(() => { process.env = environment; globals[symbol] = originalContext; vi.restoreAllMocks(); });

describe("owned itinerary Cloudflare mail", () => {
  it("sends the existing full itinerary as escaped HTML and plain text with a named sender", async () => {
    expect(await sendItineraryEmail("owned@example.test", props)).toEqual({ sent: true, emailId: "cloudflare-id" });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message).toMatchObject({ from: { email: "hello@localley.io", name: "Localley" },
      to: "owned@example.test", subject: "Your Localley itinerary" });
    expect(message.html).toContain("&lt;Eve&gt;");
    expect(message.html).not.toContain("<Eve>");
    for (const part of [message.html, message.text]) {
      expect(part).toContain("A saved stop"); expect(part).toContain("Use the metro"); expect(part).toContain(props.shareUrl);
    }
    expect(message.text).not.toContain("<html");
  });
  it("queues preview without rendering or external delivery", async () => {
    process.env.AUTH_MAIL_MODE = "outbox";
    process.env.BETTER_AUTH_URL = "https://localley-next-preview.nkopp.workers.dev";
    const run = vi.fn(); const bind = vi.fn().mockReturnValue({ run }); const prepare = vi.fn().mockReturnValue({ bind });
    globals[symbol] = { env: { AUTH_DB: { prepare }, AUTH_EMAIL: { send } } };
    expect(await sendItineraryEmail("OWNED@preview.localley.test", props))
      .toEqual({ sent: false, queued: true, reason: "preview_outbox" });
    expect(bind).toHaveBeenCalledWith("itinerary-copy", "owned@preview.localley.test", props.shareUrl, expect.any(Number));
    expect(send).not.toHaveBeenCalled();
  });
  it("does not let production outbox configuration disable real delivery", async () => {
    process.env.AUTH_MAIL_MODE = "outbox"; vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendItineraryEmail("owned@example.test", props)).toEqual({ sent: true, emailId: "cloudflare-id" });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("refuses an absent binding, unapproved sender or external link before sending", async () => {
    globals[symbol] = { env: {} };
    await expect(sendItineraryEmail("owned@example.test", props)).rejects.toThrow("AUTH_EMAIL");
    globals[symbol] = { env: { AUTH_EMAIL: { send } } };
    process.env.FROM_EMAIL = "other@example.test";
    await expect(sendItineraryEmail("owned@example.test", props)).rejects.toThrow("FROM_EMAIL");
    process.env.FROM_EMAIL = "hello@localley.io";
    await expect(sendItineraryEmail("owned@example.test", { ...props, shareUrl: "https://evil.example/" }))
      .rejects.toThrow("HTTPS on localley.io");
    expect(send).not.toHaveBeenCalled();
  });
  it("logs only a suppression code, exposes no private details, and never retries", async () => {
    send.mockRejectedValue(Object.assign(new Error("owned@example.test private message"), { code: "E_RECIPIENT_SUPPRESSED" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendItineraryEmail("owned@example.test", props)).rejects.toThrow("Auth email could not be sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("[auth] Cloudflare email send failed:", "E_RECIPIENT_SUPPRESSED");
  });
});
