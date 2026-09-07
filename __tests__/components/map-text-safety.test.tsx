import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LeafletMap from "@/components/ui/leaflet-map";
import GoogleMap from "@/components/ui/google-map";
import { createInfoWindowContent } from "@/components/ui/kakao-map";

const leaflet = vi.hoisted(() => ({
    bindPopup: vi.fn(),
    on: vi.fn(),
    fitBounds: vi.fn(),
}));

vi.mock("leaflet", () => ({
    default: {
        map: () => ({
            remove: vi.fn(), setView: vi.fn(), eachLayer: vi.fn(),
            fitBounds: leaflet.fitBounds,
        }),
        tileLayer: () => ({ addTo: vi.fn() }),
        divIcon: vi.fn(),
        marker: () => ({ addTo: () => ({ bindPopup: leaflet.bindPopup, on: leaflet.on }) }),
        latLngBounds: vi.fn(),
    },
}));

const center = { lat: 37.57, lng: 126.98 };
const title = '<img src=x onerror="alert(1)"> & "quotes" <script>alert(2)</script>';
const description = '</p><svg onload="alert(3)"></svg> &lt;b&gt; \'text\'';
const titleKo = '</span><iframe srcdoc="attack"></iframe> & "name"';

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class {
        observe() {}
        disconnect() {}
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("map text safety", () => {
    it("renders Leaflet popup text literally and preserves marker clicks", () => {
        const marker = { ...center, title, description };
        const onMarkerClick = vi.fn();
        render(<LeafletMap center={center} zoom={13} markers={[marker]} onMarkerClick={onMarkerClick} />);

        const popup = leaflet.bindPopup.mock.calls[0][0] as HTMLElement;
        expect(popup).toBeInstanceOf(HTMLElement);
        expect(popup.querySelector("strong")?.textContent).toBe(title);
        expect(popup.querySelector("p")?.textContent).toBe(description);
        expect(popup.querySelectorAll("*").length).toBe(2);
        expect(popup.style.minWidth).toBe("150px");
        leaflet.on.mock.calls[0][1]();
        expect(onMarkerClick).toHaveBeenCalledWith(marker, 0);
    });

    it("preserves Leaflet optional popup fields", () => {
        render(<LeafletMap center={center} zoom={13} markers={[
            { ...center, title: "Cafe & tea" },
            { ...center, description: "No title" },
        ]} />);
        expect(leaflet.bindPopup).toHaveBeenCalledTimes(1);
        const popup = leaflet.bindPopup.mock.calls[0][0] as HTMLElement;
        expect(popup.textContent).toBe("Cafe & tea");
        expect(popup.querySelector("p")).toBeNull();
        expect(leaflet.fitBounds).toHaveBeenCalledOnce();
    });

    it("serializes Kakao bilingual titles and descriptions as literal text", () => {
        const popup = document.createElement("div");
        popup.innerHTML = createInfoWindowContent({ ...center, title, titleKo, description });
        expect(popup.querySelector("strong")?.textContent).toBe(`${title} (${titleKo})`);
        expect(popup.querySelector("span")?.textContent).toBe(`(${titleKo})`);
        expect(popup.querySelector("p")?.textContent).toBe(description);
        expect(Array.from(popup.querySelectorAll("*"), (node) => node.tagName))
            .toEqual(["DIV", "STRONG", "SPAN", "P"]);
    });

    it("preserves Kakao fallback titles and optional fields", () => {
        const popup = document.createElement("div");
        popup.innerHTML = createInfoWindowContent(center);
        expect(popup.querySelector("strong")?.textContent).toBe("Location");
        expect(popup.querySelector("span, p")).toBeNull();
        popup.innerHTML = createInfoWindowContent({ ...center, titleKo: "Local name" });
        expect(popup.querySelector("strong")?.textContent).toBe("Location (Local name)");
    });

    it("keeps Google titles and descriptions literal in both detail layouts", async () => {
        let clickMarker: () => void = () => { throw new Error("Marker not initialized"); };
        const advancedMarker = vi.fn(function (options: google.maps.marker.AdvancedMarkerElementOptions) {
            return {
                title: options.title,
                addListener: (_event: string, handler: () => void) => { clickMarker = handler; },
            };
        });
        vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
        vi.stubGlobal("google", {
            maps: {
                Map: class { setCenter() {} setZoom() {} },
                marker: { AdvancedMarkerElement: advancedMarker },
            },
        });
        const marker = { ...center, title, description };
        const onMarkerClick = vi.fn();
        const { container, rerender } = render(
            <GoogleMap center={center} zoom={13} markers={[]} onMarkerClick={onMarkerClick} />
        );
        const script = document.querySelector<HTMLScriptElement>('script[src*="maps.googleapis.com"]')!;
        try {
            await act(async () => { script.dispatchEvent(new Event("load")); });
            rerender(<GoogleMap center={center} zoom={13} markers={[marker]} onMarkerClick={onMarkerClick} />);
            expect(advancedMarker.mock.calls[0][0]).toMatchObject({ title });
            act(() => clickMarker());
            expect(screen.getAllByRole("heading", { name: title })).toHaveLength(2);
            expect(screen.getAllByText(description)).toHaveLength(2);
            expect(container.querySelector("img, script, iframe")).toBeNull();
            expect(container.querySelector("svg[onload]")).toBeNull();
            expect(onMarkerClick).toHaveBeenCalledWith(marker, 0);
        } finally {
            script.remove();
        }
    });
});
