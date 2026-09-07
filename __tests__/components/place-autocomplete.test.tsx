import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceAutocomplete } from "@/components/ui/place-autocomplete";

const selector = 'script[src*="maps.googleapis.com"]';
const place = { name: "Seoul" };
let placeChanged: () => void;
const clearInstanceListeners = vi.fn();
const Autocomplete = vi.fn(function () {
    return {
        getPlace: () => place,
        addListener: (_event: string, callback: () => void) => { placeChanged = callback; },
    };
});
function installPlaces() {
    window.google = {
        maps: { places: { Autocomplete }, event: { clearInstanceListeners } },
    } as unknown as typeof google;
}

beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
    cleanup();
    document.querySelectorAll(selector).forEach(script => script.remove());
    delete window.google;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("PlaceAutocomplete", () => {
    it("renders on the server without loading a script", () => {
        expect(renderToString(<PlaceAutocomplete value="" onChange={() => {}} />)).toContain("Search for a place");
        expect(document.querySelector(selector)).toBeNull();
    });

    it("supports preloaded Places, selection, and listener cleanup", () => {
        installPlaces();
        const onChange = vi.fn();
        const { unmount } = render(<PlaceAutocomplete value="" onChange={onChange} />);
        expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(false);
        expect(Autocomplete).toHaveBeenCalledTimes(1);
        act(() => placeChanged());
        expect(onChange).toHaveBeenCalledWith("Seoul", place);
        expect(document.querySelector(selector)).toBeNull();
        unmount();
        expect(clearInstanceListeners).toHaveBeenCalled();
    });

    it("shares one pending script and enables both inputs when Places loads", () => {
        render(<><PlaceAutocomplete value="" onChange={() => {}} /><PlaceAutocomplete value="" onChange={() => {}} /></>);
        expect(document.querySelectorAll(selector)).toHaveLength(1);
        expect(screen.getAllByRole("textbox").every(input => (input as HTMLInputElement).disabled)).toBe(true);
        installPlaces();
        act(() => document.querySelector(selector)!.dispatchEvent(new Event("load")));
        expect(Autocomplete).toHaveBeenCalledTimes(2);
        expect(screen.getAllByRole("textbox").every(input => !(input as HTMLInputElement).disabled)).toBe(true);
    });

    it.each(["load", "error"])("allows manual input after script %s without Places", event => {
        const script = document.createElement("script");
        script.src = "https://maps.googleapis.com/maps/api/js";
        document.head.appendChild(script);
        const onChange = vi.fn();
        render(<PlaceAutocomplete value="" onChange={onChange} />);
        act(() => script.dispatchEvent(new Event(event)));
        expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(false);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "Tokyo" } });
        expect(onChange).toHaveBeenCalledWith("Tokyo");
        expect(Autocomplete).not.toHaveBeenCalled();
    });

    it("supports manual input without a key and honors disabled", () => {
        vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
        const { rerender } = render(<PlaceAutocomplete value="" onChange={() => {}} />);
        expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(false);
        expect(document.querySelector(selector)).toBeNull();
        rerender(<PlaceAutocomplete value="" onChange={() => {}} disabled />);
        expect((screen.getByRole("textbox") as HTMLInputElement).disabled).toBe(true);
    });

    it("removes pending script listeners on unmount", () => {
        const { unmount } = render(<PlaceAutocomplete value="" onChange={() => {}} />);
        const script = document.querySelector(selector)!;
        const remove = vi.spyOn(script, "removeEventListener");
        unmount();
        expect(remove).toHaveBeenCalledWith("load", expect.any(Function));
        expect(remove).toHaveBeenCalledWith("error", expect.any(Function));
    });
});
