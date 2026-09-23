import { render, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerRegistration } from "@/providers/service-worker-registration";
import { usePushNotifications } from "@/hooks/use-push-notifications";

vi.mock("@/lib/auth/client", () => ({ useUser: () => ({ isSignedIn: true }) }));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("service worker registration", () => {
    it.each(["success", "reject", "throw"])("registers silently and handles %s", async (outcome) => {
        const failure = new Error("Registration blocked");
        const subscribe = vi.fn();
        const register = vi.fn(() => {
            if (outcome === "throw") throw failure;
            if (outcome === "reject") return Promise.reject(failure);
            return Promise.resolve({ pushManager: { subscribe } });
        });
        const requestPermission = vi.fn();
        vi.stubGlobal("navigator", { serviceWorker: { register } });
        vi.stubGlobal("Notification", { requestPermission });
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const view = render(<><ServiceWorkerRegistration /><span>App remains usable</span></>);
        expect(view.getByText("App remains usable")).toBeTruthy();
        await act(async () => {});
        expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
        expect(requestPermission).not.toHaveBeenCalled();
        expect(subscribe).not.toHaveBeenCalled();
        if (outcome !== "success") expect(log).toHaveBeenCalledWith("Service worker registration failed:", failure);
    });

    it("does nothing when service workers are unsupported", () => {
        vi.stubGlobal("navigator", {});
        expect(render(<ServiceWorkerRegistration />).container.innerHTML).toBe("");
    });

    it.each([false, true])("checks existing subscription without waiting for ready: %s", async (exists) => {
        const subscription = { endpoint: "test", unsubscribe: vi.fn(async () => true) };
        const getSubscription = vi.fn(async () => subscription);
        const getRegistration = vi.fn(async () => exists ? { pushManager: { getSubscription } } : undefined);
        const ready = vi.fn(() => { throw new Error("Must not await ready for existence checks"); });
        vi.stubGlobal("navigator", { serviceWorker: { getRegistration, get ready() { return ready(); } } });
        vi.stubGlobal("PushManager", class {});
        vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
        const { result } = renderHook(() => usePushNotifications());
        await waitFor(() => expect(getRegistration).toHaveBeenCalledWith("/"));
        await waitFor(() => expect(result.current.isSubscribed).toBe(exists));
        await act(async () => { expect(await result.current.unsubscribe()).toBe(true); });
        expect(result.current.isLoading).toBe(false);
        expect(ready).not.toHaveBeenCalled();
        expect(Notification.requestPermission).not.toHaveBeenCalled();
    });
});
