import type { Plugin } from "vite";

export const itineraryId = "11111111-2222-4333-8444-555555555555";
export const base = `/api/itineraries/${itineraryId}/story/video`;
export const scenarios = ["unavailable", "budget", "loading", "error", "ready", "unknown", "zero", "reserved", "submitting", "queued", "running", "provider_ready", "processing", "delivered", "delivered_missing", "processing_failed", "failed", "cancelled", "premium_required", "unsupported_story_text", "processing_unavailable", "unauthorized", "not_found"];

// This server has no upstream, provider SDK, credentials, or persistence adapter.
export function fixturePlugin(): Plugin {
  const polls = new Map<string, number>();
  return {
    name: "story-fixtures-only",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://127.0.0.1:4174");
        if (!url.pathname.startsWith("/api/")) return next();
        const scenario = /preview-scenario=([^;]+)/.exec(req.headers.cookie || "")?.[1] || "unavailable";
        const session = /preview-session=([^;]+)/.exec(req.headers.cookie || "")?.[1] || "preview";
        const json = (data: unknown, status = 200) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
        };
        if (url.pathname === "/api/images/story-background") return json({ sources: { ai: false }, models: [] });
        if (url.pathname === "/api/user/tier") return json({ tier: "premium" });
        if (url.pathname === "/api/subscription/status") return json({ limits: { aiImagesPerMonth: 0 }, usage: {} });
        if (url.pathname === base && req.method === "GET") {
          if (scenario === "loading") return; // Deliberately pending; browser aborts on close.
          if (scenario === "error") return json({ errorCode: "fixture_network_error" }, 503);
          const reason = scenario === "budget" ? "limit" : ["unavailable", "premium_required", "unsupported_story_text", "processing_unavailable", "unauthorized", "not_found"].includes(scenario) ? scenario : null;
          return json({ model: "MiniMax-H3", format: "mp4", ratio: "9:16", canSubmit: !reason, reason, eligibleDurations: reason || scenario === "zero" ? [] : [4, 5, 6] });
        }
        const job = (status: string) => ({ jobId: "preview-job", status: status === "delivered_missing" ? "delivered" : status, statusUrl: `${base}/preview-job`, errorCode: null, ...(status === "delivered" ? { downloadUrl: `${base}/preview-job/download` } : {}) });
        if (url.pathname === base && req.method === "POST") {
          req.resume();
          if (polls.size > 100) polls.clear();
          polls.set(session, 0);
          if (scenario === "unknown") return json({ errorCode: "fixture_unknown" }, 503);
          return json(job(scenario === "ready" ? "running" : scenario), 202);
        }
        if (url.pathname === `${base}/preview-job`) {
          const step = polls.get(session) || 0;
          polls.set(session, step + 1);
          return json(job(scenario === "ready" ? ["provider_ready", "processing", "delivered"][Math.min(step, 2)] : scenario));
        }
        if (url.pathname === `${base}/preview-job/download`) {
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Content-Disposition", 'attachment; filename="synthetic-preview.txt"');
          return res.end("Synthetic download fixture. No footage or generated media.\n");
        }
        if (url.pathname.endsWith("/story")) {
          res.setHeader("Content-Type", "image/svg+xml");
          return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#ede9fe"/><text x="540" y="900" text-anchor="middle" font-size="48">SYNTHETIC PREVIEW</text><text x="540" y="980" text-anchor="middle" font-size="32">No artwork or footage</text></svg>');
        }
        return json({ errorCode: "preview_endpoint_blocked" }, 403);
      });
    },
  };
}
