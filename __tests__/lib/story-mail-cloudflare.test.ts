import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { sendStoryReadyEmail } from "@/lib/story-mail";
const symbol = Symbol.for("__cloudflare-context__");
const globals = globalThis as Record<symbol, unknown>;
const previous = globals[symbol], env = process.env;
const send = vi.fn(), run = vi.fn(), bind = vi.fn(), prepare = vi.fn();
beforeEach(() => {
 process.env = { ...env, AUTH_MAIL_MODE: "cloudflare", BETTER_AUTH_URL: "https://www.localley.io", FROM_EMAIL: "Localley <hello@localley.io>" };
 send.mockResolvedValue({ messageId: "cf-id" }); run.mockResolvedValue({ success: true }); bind.mockReturnValue({ run }); prepare.mockReturnValue({ bind });
 globals[symbol] = { env: { AUTH_EMAIL: { send }, AUTH_DB: { prepare } } };
});
afterEach(() => { process.env = env; globals[symbol] = previous; vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("Cloudflare story mail transport", () => {
 it("sends a named Localley sender with both message parts and a matching direct link", async () => {
  const url = "https://localley.io/itineraries/12345678-1234-1234-1234-123456789abc/stories";
  expect(await sendStoryReadyEmail("owner@example.com", url)).toEqual({ sent: true, emailId: "cf-id" });
  expect(send).toHaveBeenCalledTimes(1); const message = send.mock.calls[0][0];
  expect(message.from).toEqual({ name: "Localley", email: "hello@localley.io" });
  expect(message.subject).toBe("Your Localley story slides are ready");
  expect(message.html).toContain(url); expect(message.text).toContain(url); expect(message.text.length).toBeGreaterThan(40);
  expect(prepare).not.toHaveBeenCalled();
 });
 it("records a preview outbox link without calling a live binding", async () => {
  process.env.AUTH_MAIL_MODE = "outbox"; process.env.BETTER_AUTH_URL = "https://localley-next-preview.nkopp.workers.dev";
  expect(await sendStoryReadyEmail("owner@preview.localley.test", "https://localley.io/itineraries/owned/stories")).toEqual({ sent: false, queued: true, reason: "preview_outbox" });
  expect(send).not.toHaveBeenCalled(); expect(bind).toHaveBeenCalledWith("story-ready", "owner@preview.localley.test", "https://localley.io/itineraries/owned/stories", expect.any(Number));
 });
 it("fails closed for missing bindings or suppression and does not retry or reveal provider details", async () => {
  globals[symbol] = { env: {} };
  await expect(sendStoryReadyEmail("owner@example.com", "https://localley.io/itineraries/owned/stories")).rejects.toThrow("binding");
  expect(send).not.toHaveBeenCalled();
  globals[symbol] = { env: { AUTH_EMAIL: { send } } }; send.mockRejectedValue({ code: "E_SUPPRESSED", message: "private recipient detail" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(sendStoryReadyEmail("owner@example.com", "https://localley.io/itineraries/owned/stories")).rejects.toThrow("Auth email could not be sent");
  expect(send).toHaveBeenCalledTimes(1); expect(JSON.stringify(log.mock.calls)).not.toContain("private recipient");
 });
});
