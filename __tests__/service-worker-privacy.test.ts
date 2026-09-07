import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(resolve("public/sw.js"), "utf8");

function loadWorker() {
    const listeners = new Map<string, (event: unknown) => void>();
    const names = new Set([
        "supabase-cache", "start-url", "next-data", "localley-v1",
        "image-cache", "other-app", "supabase-cache-other", "next-data-v2",
    ]);
    const caches = {
        keys: vi.fn(async () => [...names]),
        delete: vi.fn(async (name: string) => names.delete(name)),
    };
    const clients = { claim: vi.fn(async () => undefined) };
    const self = {
        addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
        skipWaiting: vi.fn(),
        registration: { showNotification: vi.fn(async () => undefined) },
    };
    runInNewContext(source, { self, clients, caches, console });
    return { listeners, names, caches, clients, self };
}

describe("push-only service worker", () => {
    it("deletes only exact legacy caches and claims clients", async () => {
        const worker = loadWorker();
        const waitUntil = vi.fn();
        worker.listeners.get("activate")!({ waitUntil });
        await waitUntil.mock.calls[0][0];
        expect([...worker.names]).toEqual(["image-cache", "other-app", "supabase-cache-other", "next-data-v2"]);
        expect(worker.caches.delete).toHaveBeenCalledTimes(4);
        expect(worker.clients.claim).toHaveBeenCalledOnce();
    });

    it("keeps push handlers but never registers fetch interception", async () => {
        const { listeners, self } = loadWorker();
        expect([...listeners.keys()].sort()).toEqual([
            "activate", "install", "notificationclick", "notificationclose", "push",
        ]);
        listeners.get("install")!({});
        expect(self.skipWaiting).toHaveBeenCalledOnce();
        const waitUntil = vi.fn();
        listeners.get("push")!({
            data: { json: () => ({ title: "Trip reminder", body: "Test only", data: { url: "/dashboard" } }) },
            waitUntil,
        });
        await waitUntil.mock.calls[0][0];
        expect(self.registration.showNotification).toHaveBeenCalledWith("Trip reminder", expect.objectContaining({
            body: "Test only", icon: "/icons/icon-192x192.png", data: { url: "/dashboard" },
        }));
    });
});
