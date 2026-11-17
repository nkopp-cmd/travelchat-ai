import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { commonsFileName, commonsFileUrl, imageInfoUrl, imageNear, metresBetween, parseImageInfo, parseP18, photoInsert, spotPhotoPathOf, wikidataClaimsUrl } from "../../scripts/photos/osm-spot-photo.mjs";

const info = (over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
    query: { pages: [{ imageinfo: [{ thumburl: "https://upload.wikimedia.org/x/1600px-a.jpg", width: 4000, height: 3000, mime: "image/jpeg",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:A.jpg",
        extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "<a href='x'>Jane Doe</a>" }, ...meta }, ...over }] }] },
});

describe("osm-spot-photo", () => {
    it("round-trips Commons file names and page URLs", () => {
        const url = commonsFileUrl("Wat Arun (Bangkok) 2019.jpg");
        expect(url).toBe("https://commons.wikimedia.org/wiki/File:Wat_Arun_(Bangkok)_2019.jpg");
        expect(commonsFileName(url)).toBe("Wat Arun (Bangkok) 2019.jpg");
        expect(commonsFileName("https://example.com/wiki/File:A.jpg")).toBeNull();
        expect(commonsFileName(null)).toBeNull();
        expect(commonsFileName("https://commons.wikimedia.org/wiki/File:")).toBeNull();
    });

    it("asks Wikidata for at most 50 valid ids", () => {
        expect(wikidataClaimsUrl(["Q1", "Q2", "Q1", "bad"])).toContain("ids=Q1|Q2");
        expect(() => wikidataClaimsUrl(Array.from({ length: 51 }, (_, i) => `Q${i + 1}`))).toThrow();
        expect(() => wikidataClaimsUrl(["x"])).toThrow();
        expect(imageInfoUrl("A b.jpg")).toContain("titles=File%3AA+b.jpg");
    });

    it("takes the preferred, else first non-deprecated P18 file, only for items with coordinates", () => {
        const claim = (value: unknown, rank = "normal") => ({ rank, mainsnak: { datavalue: { value } } });
        const at = [claim({ latitude: 13.75, longitude: 100.5 })];
        expect(parseP18({ entities: {
            Q1: { claims: { P18: [claim("a.jpg"), claim("b.jpg", "preferred")], P625: at } },
            Q2: { claims: { P18: [claim("old.jpg", "deprecated"), claim("c.jpg")], P625: at } },
            Q3: { claims: { P625: at } },
            Q4: { claims: { P18: [claim("d.jpg", "deprecated")], P625: at } },
            Q5: { claims: { P18: [claim("people.jpg")] } }, // an ethnic group: no coordinates
        } })).toEqual({ Q1: { file: "b.jpg", lat: 13.75, lng: 100.5 }, Q2: { file: "c.jpg", lat: 13.75, lng: 100.5 } });
        expect(parseP18(null)).toEqual({});
    });

    it("uses the image only when the item is within 1 km of the OSM point", () => {
        const item = { file: "a.jpg", lat: 13.75, lng: 100.5 };
        expect(metresBetween(item, { lat: 13.759, lng: 100.5 })).toBeGreaterThan(990);
        expect(imageNear(item, { lat: 13.755, lng: 100.5 })).toBe("a.jpg");
        expect(imageNear(item, { lat: 13.77, lng: 100.5 })).toBeNull();
        expect(imageNear(undefined, { lat: 13.75, lng: 100.5 })).toBeNull();
    });

    it("accepts only free, unrestricted photos from the Wikimedia media hosts (upload. and thumb.)", () => {
        const ok = parseImageInfo(info());
        expect(ok.problem).toBeUndefined();
        expect(ok).toMatchObject({ licence: "CC BY-SA 4.0", author: "Jane Doe", sourceUrl: "https://commons.wikimedia.org/wiki/File:A.jpg" });
        expect(parseImageInfo(info({}, { LicenseShortName: { value: "Fair use" } })).problem).toBe("licence");
        expect(parseImageInfo(info({}, { Restrictions: { value: "trademarked" } })).problem).toBe("restricted");
        expect(parseImageInfo(info({ mime: "image/svg+xml" })).problem).toBe("not-a-photo");
        expect(parseImageInfo(info({ thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/A.jpg/1920px-A.jpg?utm_source=commons.wikimedia.org" })).problem).toBeUndefined();
        expect(parseImageInfo(info({ thumburl: "https://evil.example/a.jpg" })).problem).toBe("bad-url");
        expect(parseImageInfo(info({ thumburl: "https://thumb.wikimedia.org.evil.example/a.jpg" })).problem).toBe("bad-url");
        expect(parseImageInfo({ query: { pages: [{}] } }).problem).toBe("no-file-info");
    });

    it("maps the R2 key to the public path and writes one credited spot_photos row", () => {
        const id = "0b6f6a52-6f0e-4d36-9a54-0d5f6a2b1c3d", sha = "b".repeat(64);
        expect(spotPhotoPathOf(`spot-photos/${id}/${sha}.webp`)).toBe(`/media/spot/${id}/${sha}.webp`);
        expect(() => spotPhotoPathOf("spot-photos/x/y.webp")).toThrow();
        const row = photoInsert(id, { r2Key: `spot-photos/${id}/${sha}.webp`, licence: "CC0", author: "A", sourceUrl: "s", width: 1600, height: 900 });
        expect(row.sql).toContain("WHERE NOT EXISTS");
        expect(row.params).toEqual([`spot-photos/${id}/${sha}.webp`, id, "CC0", "A", "s", 1600, 900, "harvester-osm-p18", `spot-photos/${id}/${sha}.webp`]);
    });
});
