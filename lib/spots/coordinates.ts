export interface SpotCoordinates {
    lat: number;
    lng: number;
}

interface GeoJsonPoint {
    coordinates?: unknown;
}

const EWKB_SRID_FLAG = 0x20000000;
const WKB_POINT_TYPE = 1;

function isValidCoordinatePair(lat: number, lng: number): boolean {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
    );
}

function normalizeCoordinatePair(lng: unknown, lat: unknown): SpotCoordinates | null {
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!isValidCoordinatePair(lat, lng)) return null;
    return { lat, lng };
}

function parseGeoJsonPoint(value: GeoJsonPoint): SpotCoordinates | null {
    if (!Array.isArray(value.coordinates) || value.coordinates.length < 2) return null;
    return normalizeCoordinatePair(value.coordinates[0], value.coordinates[1]);
}

function parseWktPoint(value: string): SpotCoordinates | null {
    const match = value.match(/^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i);
    if (!match) return null;

    return normalizeCoordinatePair(Number(match[1]), Number(match[2]));
}

function hexToBytes(hex: string): Uint8Array | null {
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
    }

    return bytes;
}

function parseEwkbPoint(value: string): SpotCoordinates | null {
    const bytes = hexToBytes(value.trim());
    if (!bytes || bytes.length < 1 + 4 + 16) return null;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const byteOrder = view.getUint8(0);
    if (byteOrder !== 0 && byteOrder !== 1) return null;

    const littleEndian = byteOrder === 1;
    let offset = 1;
    const rawType = view.getUint32(offset, littleEndian);
    offset += 4;

    const geometryType = rawType & 0x000000ff;
    if (geometryType !== WKB_POINT_TYPE) return null;

    if (rawType & EWKB_SRID_FLAG) {
        offset += 4;
    }

    if (bytes.length < offset + 16) return null;

    const lng = view.getFloat64(offset, littleEndian);
    const lat = view.getFloat64(offset + 8, littleEndian);

    return normalizeCoordinatePair(lng, lat);
}

export function parseSpotCoordinates(location: unknown): SpotCoordinates | null {
    if (!location) return null;

    if (typeof location === "object") {
        return parseGeoJsonPoint(location as GeoJsonPoint);
    }

    if (typeof location !== "string") return null;

    return parseWktPoint(location) || parseEwkbPoint(location);
}

export function getSpotCoordinateValues(location: unknown): SpotCoordinates {
    return parseSpotCoordinates(location) || { lat: 0, lng: 0 };
}
