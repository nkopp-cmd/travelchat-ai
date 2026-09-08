import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Serve the shipped worker without app authentication or external provider traffic.
let server: Server;
let origin: string;
test.beforeAll(async () => {
    const worker = readFileSync(resolve("public/sw.js"), "utf8");
    server = createServer((request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", request.url === "/sw.js" ? "application/javascript" : "text/html");
        response.end(request.url === "/sw.js" ? worker : "<!doctype html><title>Worker privacy test</title>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
test.use({ serviceWorkers: "allow" });

test("removes legacy private caches and cannot serve cached private responses offline", async ({ page, context }) => {
    await page.goto(origin);
    await page.evaluate(async () => {
        for (const name of ["supabase-cache", "start-url", "next-data", "localley-v1", "other-app"]) {
            const cache = await caches.open(name);
            await cache.put("/private-test", new Response("SEEDED_PRIVATE_RESPONSE"));
        }
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(["other-app"]);
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${origin}/sw.js`);
    await context.setOffline(true);
    const result = await page.evaluate(async () => {
        try {
            return await (await fetch("/private-test", { cache: "no-store" })).text();
        } catch {
            return "NETWORK_FAILED";
        }
    });
    expect(result).toBe("NETWORK_FAILED");
});
