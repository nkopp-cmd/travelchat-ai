import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import MapComponent from "@/components/ui/map";

vi.mock("@/hooks/use-map-provider", () => ({
    useMapProvider: ({ forceProvider }: { forceProvider?: string }) => ({ provider: forceProvider ?? "leaflet" }),
}));
vi.mock("next/dynamic", () => ({
    default: (loader: () => unknown, options: { ssr: boolean }) => {
        const provider = loader.toString().match(/(leaflet|kakao|google)-map/)?.[1];
        expect(options.ssr).toBe(false);
        return function Provider({ onError }: { onError?: (error: string) => void }) {
            return <button onClick={() => onError?.("failed")}>{provider} provider</button>;
        };
    },
}));

describe("MapComponent readiness", () => {
    it("renders only the loading placeholder on the server and hydrates safely", async () => {
        const element = <MapComponent forceProvider="google" />;
        const container = document.createElement("div");
        container.innerHTML = renderToString(element);
        expect(container.textContent).toBe("Loading map...");
        const onRecoverableError = vi.fn();
        let root: ReturnType<typeof hydrateRoot>;
        await act(async () => { root = hydrateRoot(container, element, { onRecoverableError }); });
        expect(container.textContent).toContain("google provider");
        expect(onRecoverableError).not.toHaveBeenCalled();
        act(() => root.unmount());
    });

    it.each(["kakao", "google"] as const)("preserves %s fallback to Leaflet", provider => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        render(<MapComponent forceProvider={provider} markers={[{ lat: 1, lng: 2 }]} />);
        fireEvent.click(screen.getByText(`${provider} provider`));
        expect(screen.getByText("leaflet provider")).toBeTruthy();
        expect(screen.getByText("via OpenStreetMap")).toBeTruthy();
        warn.mockRestore();
    });
});
