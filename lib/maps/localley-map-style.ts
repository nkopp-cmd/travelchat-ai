import type { StyleSpecification } from "maplibre-gl";

// Localley base map (shared/plans/localley-landing-map-weather.md step 1): OpenFreeMap vector
// tiles (free, no key) drawn in the Localley token colours. The map stays quiet so the photo
// pins carry the colour: no POI icons (our pins are the POIs), few road labels, labels in
// English with the local script (Hangul, kana, Thai) on a second line.

/** "r g b" channel triples, as the --ll-* tokens in styles/borderless-tokens.css store them. */
export interface MapTokens {
    background: string;
    surface: string;
    raised: string;
    overlay: string;
    text: string;
    muted: string;
    success: string;
}

// Values of [data-localley-design="borderless"]; the map reads the live tokens when it can.
export const DARK_MAP_TOKENS: MapTokens = {
    background: "13 15 22",
    surface: "24 27 38",
    raised: "36 40 56",
    overlay: "48 54 74",
    text: "244 244 250",
    muted: "175 182 204",
    success: "156 228 194",
};

const TOKEN_VARS: Record<keyof MapTokens, string> = {
    background: "--ll-background",
    surface: "--ll-surface",
    raised: "--ll-raised",
    overlay: "--ll-overlay",
    text: "--ll-text",
    muted: "--ll-muted",
    success: "--ll-success",
};

export const MAP_ATTRIBUTION =
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> '
    + '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> '
    + 'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** Reads the --ll-* tokens from the element's computed style; missing ones keep the dark defaults. */
export function readMapTokens(element: Element | null): MapTokens {
    if (!element || typeof getComputedStyle !== "function") return DARK_MAP_TOKENS;
    const style = getComputedStyle(element);
    const tokens = { ...DARK_MAP_TOKENS };
    for (const key of Object.keys(TOKEN_VARS) as Array<keyof MapTokens>) {
        const value = style.getPropertyValue(TOKEN_VARS[key]).trim();
        if (/^\d{1,3} \d{1,3} \d{1,3}$/.test(value)) tokens[key] = value;
    }
    return tokens;
}

/** `rgb()` of a token, mixed toward a second token by `amount` (0..1), with optional alpha. */
export function tone(from: string, to: string = from, amount = 0, alpha = 1): string {
    const a = from.split(" ").map(Number);
    const b = to.split(" ").map(Number);
    const mix = a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount));
    return alpha < 1 ? `rgba(${mix.join(", ")}, ${alpha})` : `rgb(${mix.join(", ")})`;
}

// English first, the local script below it when the place has one.
const PLACE_LABEL = [
    "case",
    ["all", ["has", "name:nonlatin"], ["has", "name:en"]],
    ["format", ["get", "name:en"], {}, "\n", {}, ["get", "name:nonlatin"], { "font-scale": 0.8 }],
    ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]],
] as const;
const ROAD_LABEL = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]] as const;
const REGULAR = ["Noto Sans Regular"];
const BOLD = ["Noto Sans Bold"];
const POLYGON = ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false] as const;
const LINE = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false] as const;
const POINT = ["match", ["geometry-type"], ["MultiPoint", "Point"], true, false] as const;

export function localleyMapStyle(tokens: MapTokens = DARK_MAP_TOKENS): StyleSpecification {
    const land = tone(tokens.background, tokens.surface, 0.55);
    const water = tone(tokens.background, "60 70 130", 0.32);
    const park = tone(tokens.surface, tokens.success, 0.1);
    const building = tone(tokens.surface, tokens.raised, 0.35);
    const minorRoad = tone(tokens.surface, tokens.raised, 0.7);
    const majorRoad = tone(tokens.raised, tokens.overlay, 0.6);
    const motorway = tone(tokens.overlay, tokens.muted, 0.18);
    const label = tone(tokens.muted, tokens.text, 0.25);
    const quietLabel = tone(tokens.muted, tokens.surface, 0.25);
    const halo = tone(tokens.background, tokens.background, 0, 0.85);
    const width = (stops: number[]) => ["interpolate", ["exponential", 1.4], ["zoom"], ...stops];

    return {
        version: 8,
        name: "Localley dark",
        glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
        sources: {
            openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: MAP_ATTRIBUTION },
        },
        layers: [
            { id: "background", type: "background", paint: { "background-color": land } },
            {
                id: "park", type: "fill", source: "openmaptiles", "source-layer": "park",
                filter: POLYGON as never, paint: { "fill-color": park, "fill-antialias": false },
            },
            {
                id: "landcover-wood", type: "fill", source: "openmaptiles", "source-layer": "landcover",
                filter: ["all", POLYGON, ["match", ["get", "class"], ["wood", "grass"], true, false]] as never,
                paint: { "fill-color": park, "fill-opacity": 0.7, "fill-antialias": false },
            },
            {
                id: "water", type: "fill", source: "openmaptiles", "source-layer": "water",
                filter: ["all", POLYGON, ["!=", ["get", "brunnel"], "tunnel"]] as never,
                paint: { "fill-color": water, "fill-antialias": false },
            },
            {
                id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway",
                filter: LINE as never, paint: { "line-color": water, "line-width": width([10, 0.6, 18, 4]) as never },
            },
            {
                id: "building", type: "fill", source: "openmaptiles", "source-layer": "building", minzoom: 14,
                paint: { "fill-color": building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.5, 1] as never },
            },
            {
                id: "road-minor", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 12.5,
                filter: ["all", LINE, ["match", ["get", "class"], ["minor", "service", "street", "residential"], true, false]] as never,
                layout: { "line-cap": "round", "line-join": "round" },
                paint: { "line-color": minorRoad, "line-width": width([12.5, 0.5, 18, 9]) as never },
            },
            {
                id: "rail", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 11,
                filter: ["all", LINE, ["match", ["get", "class"], ["rail", "transit"], true, false], ["!=", ["get", "brunnel"], "tunnel"]] as never,
                paint: { "line-color": minorRoad, "line-width": width([11, 0.6, 18, 2.5]) as never, "line-dasharray": [3, 3] },
            },
            {
                id: "road-major", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 8,
                filter: ["all", LINE, ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk"], true, false]] as never,
                layout: { "line-cap": "round", "line-join": "round" },
                paint: { "line-color": majorRoad, "line-width": width([8, 0.4, 13, 1.6, 18, 14]) as never },
            },
            {
                id: "road-motorway", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 6,
                filter: ["all", LINE, ["==", ["get", "class"], "motorway"]] as never,
                layout: { "line-cap": "round", "line-join": "round" },
                paint: { "line-color": motorway, "line-width": width([6, 0.5, 13, 2.2, 18, 16]) as never },
            },
            {
                id: "road-label", type: "symbol", source: "openmaptiles", "source-layer": "transportation_name", minzoom: 14,
                filter: ["all", LINE, ["match", ["get", "class"], ["primary", "secondary", "tertiary", "trunk", "motorway"], true, false]] as never,
                layout: {
                    "symbol-placement": "line", "symbol-spacing": 420, "text-field": ROAD_LABEL as never,
                    "text-font": REGULAR, "text-size": 11, "text-rotation-alignment": "map",
                },
                paint: { "text-color": quietLabel, "text-halo-color": halo, "text-halo-width": 1.2 },
            },
            {
                id: "water-label", type: "symbol", source: "openmaptiles", "source-layer": "water_name", minzoom: 11,
                filter: LINE as never,
                layout: { "symbol-placement": "line", "text-field": ROAD_LABEL as never, "text-font": REGULAR, "text-size": 12, "text-letter-spacing": 0.08 },
                paint: { "text-color": tone(tokens.muted, "120 140 220", 0.35), "text-halo-color": halo, "text-halo-width": 1 },
            },
            {
                id: "place-neighbourhood", type: "symbol", source: "openmaptiles", "source-layer": "place", minzoom: 12, maxzoom: 17,
                filter: ["all", POINT, ["match", ["get", "class"], ["suburb", "quarter", "neighbourhood"], true, false]] as never,
                layout: {
                    "text-field": PLACE_LABEL as never, "text-font": REGULAR, "text-transform": "uppercase",
                    "text-letter-spacing": 0.1, "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13] as never,
                    "text-max-width": 8,
                },
                paint: { "text-color": quietLabel, "text-halo-color": halo, "text-halo-width": 1.2 },
            },
            {
                id: "place-city", type: "symbol", source: "openmaptiles", "source-layer": "place", maxzoom: 13,
                filter: ["all", POINT, ["match", ["get", "class"], ["city", "town"], true, false]] as never,
                layout: {
                    "text-field": PLACE_LABEL as never, "text-font": BOLD,
                    "text-size": ["interpolate", ["linear"], ["zoom"], 5, 12, 11, 18] as never, "text-max-width": 8,
                },
                paint: { "text-color": label, "text-halo-color": halo, "text-halo-width": 1.5 },
            },
        ],
    };
}
