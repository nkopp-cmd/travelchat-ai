import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CRON_ROUTES, runScheduledRoute } from "@/cloudflare/opennext/cron-routes";

const root = join(__dirname, "..");

function stripJsonComments(source: string) {
  return source.replace(/^\s*\/\/.*$/gm, "");
}

describe("Cloudflare cron parity", () => {
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    crons: { path: string; schedule: string }[];
  };

  it("maps every Vercel cron to the same route and schedule", () => {
    const fromVercel = Object.fromEntries(vercel.crons.map((c) => [c.schedule, c.path]));
    expect(CRON_ROUTES).toEqual(fromVercel);
  });

  it("keeps production Cron Triggers either off (before P8) or equal to every Vercel schedule", () => {
    const source = readFileSync(join(root, "wrangler.jsonc"), "utf8");
    const wrangler = JSON.parse(stripJsonComments(source));
    const crons = [...wrangler.env.production.triggers.crons].sort();
    const all = Object.keys(CRON_ROUTES).sort();
    // Before the DNS switch the triggers are [] so Vercel and Cloudflare never both run a job.
    if (crons.length > 0) expect(crons).toEqual(all);
    // The schedules to enable at P8 stay written next to the empty list.
    expect(source).toContain(JSON.stringify(Object.keys(CRON_ROUTES)).replace(/","/g, '", "'));
  });
});

describe("runScheduledRoute", () => {
  function selfReference(status = 200) {
    return { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status })) };
  }

  it("calls the mapped route with the cron bearer token", async () => {
    const self = selfReference();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runScheduledRoute({ cron: "0 3 * * *", scheduledTime: 0 }, { CRON_SECRET: "s3cret", WORKER_SELF_REFERENCE: self });
    expect(self.fetch).toHaveBeenCalledWith("https://localley.internal/api/cron/cleanup-stories", {
      method: "GET",
      headers: { Authorization: "Bearer s3cret", "User-Agent": "cloudflare-cron/1.0" },
    });
    log.mockRestore();
  });

  it("throws when the route fails so the invocation is marked failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runScheduledRoute({ cron: "0 4 * * *", scheduledTime: 0 }, { CRON_SECRET: "s", WORKER_SELF_REFERENCE: selfReference(500) }),
    ).rejects.toThrow("/api/cron/process-social-submissions failed with status 500");
    error.mockRestore();
  });

  it("skips unknown schedules and missing secrets without calling the app", async () => {
    const self = selfReference();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runScheduledRoute({ cron: "* * * * *", scheduledTime: 0 }, { CRON_SECRET: "s", WORKER_SELF_REFERENCE: self });
    await runScheduledRoute({ cron: "0 5 * * *", scheduledTime: 0 }, { WORKER_SELF_REFERENCE: self });
    expect(self.fetch).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
