/**
 * Cloudflare Cron Trigger -> Next.js route map.
 *
 * These are the same four jobs as `vercel.json` `crons`, with the same UTC
 * schedules. The scheduled handler in `worker.ts` calls the unchanged route
 * handlers through the Worker's self-service binding with `Authorization:
 * Bearer $CRON_SECRET`, exactly as Vercel Cron does.
 */
export const CRON_ROUTES: Readonly<Record<string, string>> = {
  "0 3 * * *": "/api/cron/cleanup-stories",
  "0 4 * * *": "/api/cron/process-social-submissions",
  "23 2 1 * *": "/api/cron/discover-spots-with-apify",
  "0 5 * * *": "/api/cron/refresh-weekly-social-trends",
};

export function cronRouteFor(cron: string): string | null {
  return CRON_ROUTES[cron] ?? null;
}

export interface SelfReference {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface ScheduledEnv {
  CRON_SECRET?: string;
  WORKER_SELF_REFERENCE?: SelfReference;
}

export interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

export async function runScheduledRoute(controller: ScheduledController, env: ScheduledEnv): Promise<void> {
  const path = cronRouteFor(controller.cron);
  if (!path) {
    console.error(`[cron] no route mapped for schedule "${controller.cron}"`);
    return;
  }
  if (!env.CRON_SECRET || !env.WORKER_SELF_REFERENCE) {
    console.error(`[cron] ${path} skipped: CRON_SECRET or WORKER_SELF_REFERENCE is missing`);
    return;
  }

  // Reuse the daily cleanup invocation to collect asynchronous monthly discovery.
  // The explicit mode cannot start a new paid actor or publish a candidate.
  const paths = controller.cron === "0 3 * * *"
    ? [path, "/api/cron/discover-spots-with-apify?mode=collect"] : [path];
  const self = env.WORKER_SELF_REFERENCE;
  const results = await Promise.allSettled(paths.map(async (route) => {
    const started = Date.now();
    const response = await self.fetch(`https://localley.internal${route}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "User-Agent": "cloudflare-cron/1.0" },
    });
    const body = await response.text();
    const log = `[cron] ${route} status=${response.status} ms=${Date.now() - started} body=${body.slice(0, 500)}`;
    if (!response.ok) {
      console.error(log);
      // Throwing marks the Cron Trigger invocation as failed in Workers observability.
      throw new Error(`[cron] ${route} failed with status ${response.status}`);
    }
    console.log(log);
  }));
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
