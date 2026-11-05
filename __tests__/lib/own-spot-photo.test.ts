// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CARD_PHOTO_WIDTH, cardGooglePhotoUrl, cardPhotoCredits, cardSpotPhotos, directSpotPhotos, isCardGooglePhotoUrl, ownSpotPhotoPath, parseStoredSpotPhotos, shortAuthor, spotPhotoPinPath, spotPhotoThumbPath, storedGooglePhotoName } from "@/lib/spots/own-photo";
import { getDirectVenuePhotos } from "@/components/spots/venue-photo-provider";

const spotId = "00000000-0000-4000-8000-000000000001";
const own = `/media/spot/${spotId}/${"a".repeat(64)}.webp`;

describe("own spot photo first, Google Places only as fallback", () => {
  it("maps only real spot_photos keys to the public path", () => {
    expect(ownSpotPhotoPath(`spot-photos/${spotId}/${"a".repeat(64)}.webp`)).toBe(own);
    for (const bad of [null, undefined, 3, "", "tips/x.webp", `spot-photos/${spotId}/${"a".repeat(64)}.jpg`, `spot-photos/../${"a".repeat(64)}.webp`]) {
      expect(ownSpotPhotoPath(bad)).toBeNull();
    }
  });

  it("a Google listing with an own photo shows it without a Places call; without one it falls back to Places", () => {
    expect(directSpotPhotos({ ownPhoto: own, googlePlaceId: "ChIJ1", photos: ["https://x/a.jpg"] })).toEqual([own]);
    expect(directSpotPhotos({ ownPhoto: null, googlePlaceId: "ChIJ1", photos: ["https://x/a.jpg"] })).toEqual([]);
  });

  it("other spots keep their direct photos after the own photo, without Places proxy URLs or duplicates", () => {
    const photos = ["https://cdn.example.com/a.jpg", "/api/places/photo?name=places/1", own];
    expect(directSpotPhotos({ ownPhoto: own, photos })).toEqual([own, "https://cdn.example.com/a.jpg"]);
    expect(directSpotPhotos({ photos })).toEqual(["https://cdn.example.com/a.jpg", own]);
  });

  it("the gallery accepts the own photo first and labels it", () => {
    const [first] = getDirectVenuePhotos(directSpotPhotos({ ownPhoto: own, googlePlaceId: "ChIJ1", photos: [] }));
    expect(first).toMatchObject({ url: own, sourceLabel: "Localley traveller photo" });
  });

  it("reads the stored Google photo name from D1 photo URLs and rejects anything else", () => {
    const name = "places/ChIJ1/photos/AbC-_9";
    expect(storedGooglePhotoName([`/api/places/photo?name=${encodeURIComponent(name)}&w=1200`])).toBe(name);
    expect(storedGooglePhotoName(["https://x/a.jpg", `/api/places/photo?name=${encodeURIComponent(name)}`])).toBe(name);
    for (const bad of [null, undefined, [], ["/api/places/photo?name=old"], ["/api/places/photo?name=places%2F..%2Fphotos%2Fx"], ["/api/places/photo"]]) {
      expect(storedGooglePhotoName(bad as string[] | null | undefined)).toBeNull();
    }
  });

  it("cards, pins and Nearby share ONE small Google URL per spot (one billed Photo call, then browser cache)", () => {
    const name = "places/ChIJ1/photos/ref1";
    const url = cardGooglePhotoUrl(name);
    expect(url).toBe(`/api/places/photo?name=places%2FChIJ1%2Fphotos%2Fref1&w=${CARD_PHOTO_WIDTH}`);
    expect(isCardGooglePhotoUrl(url)).toBe(true);
    expect(isCardGooglePhotoUrl(`${url}&x=1`)).toBe(false);
    expect(isCardGooglePhotoUrl("/api/places/photo?name=old&w=400")).toBe(false);
    const photos = [`/api/places/photo?name=${encodeURIComponent(name)}&w=1200`];
    expect(cardSpotPhotos({ ownPhoto: own, photos })).toEqual([own.replace(/\.webp$/, "-w480.webp"), url]);
    expect(spotPhotoThumbPath("https://cdn.example.com/a.webp")).toBe("https://cdn.example.com/a.webp");
    expect(spotPhotoPinPath(own)).toBe(own.replace(/\.webp$/, "-w144.webp"));
    expect(spotPhotoPinPath(spotPhotoThumbPath(own))).toBe(own.replace(/\.webp$/, "-w144.webp"));
    expect(spotPhotoPinPath(url)).toBe(url);
    expect(spotPhotoPinPath("https://cdn.example.com/a-w480.webp")).toBe("https://cdn.example.com/a-w480.webp");
    expect(cardSpotPhotos({ photos: [] })).toEqual([]);
    expect(cardSpotPhotos({ googlePlaceId: "ChIJYVXJTcWYfDURM4kdvYV_flY", photos: [] }))
      .toEqual([cardGooglePhotoUrl("places/ChIJYVXJTcWYfDURM4kdvYV_flY/photos/current")]);
    expect(cardSpotPhotos({ googlePlaceId: "bad id/../x", photos: [] })).toEqual([]);
    expect(cardSpotPhotos({ googlePlaceId: "ChIJother", photos })).toEqual([url]);
    expect(getDirectVenuePhotos(cardSpotPhotos({ photos }))[0]).toMatchObject({ url, sourceLabel: "Google listing photo" });
  });

  it("stored photos: several own photos lead in order; licensed ones carry their credit into the caption", () => {
    const second = `/media/spot/${spotId}/${"b".repeat(64)}.webp`;
    const stored = parseStoredSpotPhotos(JSON.stringify([
      { k: `spot-photos/${spotId}/${"a".repeat(64)}.webp`, s: "tip", l: "x" },
      { k: `spot-photos/${spotId}/${"b".repeat(64)}.webp`, s: "commons", l: "CC BY 2.0", a: "Jane", u: "https://commons.wikimedia.org/wiki/File:Y.jpg" },
      { k: "spot-photos/bad", s: "commons" },
      { k: `spot-photos/${spotId}/${"c".repeat(64)}.webp`, s: "kto", l: "KOGL Type 1", u: "javascript:alert(1)" },
      { k: `spot-photos/${spotId}/${"d".repeat(64)}.webp`, s: "kto", l: "KOGL Type 1", a: "Korea Tourism Organization / 니오타니 스튜디오" },
      { k: `spot-photos/${spotId}/${"e".repeat(64)}.webp`, s: "kto", l: "KOGL Type 1", a: "Korea Tourism Organization" },
    ]));
    // The source name is in the label already; the author line keeps only the photographer.
    expect(stored[3].author).toBe("니오타니 스튜디오");
    expect(stored[3].credit).toBe("니오타니 스튜디오 · KOGL Type 1 · Korea Tourism Organization");
    expect(stored[4].author).toBeNull();
    stored.splice(3);
    expect(stored.map((photo) => photo.label)).toEqual([null, "CC BY 2.0", "Korea Tourism Organization · KOGL Type 1"]);
    expect(stored[1].credit).toBe("Jane · CC BY 2.0 · Wikimedia Commons");
    expect(stored[2].sourceUrl).toBeNull();
    expect(parseStoredSpotPhotos("not json")).toEqual([]);
    expect(parseStoredSpotPhotos(null)).toEqual([]);
    const direct = directSpotPhotos({ ownPhoto: own, ownPhotos: stored.map((photo) => photo.src), googlePlaceId: "ChIJ1", photos: [] });
    expect(direct.slice(0, 2)).toEqual([own, second]);
    const venue = getDirectVenuePhotos(direct, stored);
    expect(venue[0]).toMatchObject({ sourceLabel: "Localley traveller photo", attributions: [] });
    expect(venue[1]).toMatchObject({ sourceLabel: "CC BY 2.0",
      attributions: [{ displayName: "Jane", uri: "https://commons.wikimedia.org/wiki/File:Y.jpg" }] });
    expect(venue[2]).toMatchObject({ sourceLabel: "Korea Tourism Organization · KOGL Type 1", attributions: [] });
  });
  it("stored photos: Taiwan open-data photos credit the Tourism Administration once, then the photographer", () => {
    const [photo] = parseStoredSpotPhotos(JSON.stringify([
      { k: `spot-photos/${spotId}/${"f".repeat(64)}.webp`, s: "opendata", l: "OGDL-Taiwan-1.0",
        a: "Taiwan Tourism Administration / Taipei Travel", u: "https://www.travel.taipei/image/1.jpg" },
    ]));
    expect(photo.label).toBe("Taiwan Tourism Administration · OGDL-Taiwan-1.0");
    expect(photo.author).toBe("Taipei Travel");
    expect(photo.sourceUrl).toBe("https://www.travel.taipei/image/1.jpg");
  });
  it("a card credits its licensed own photo on the small copy it shows, never as a traveller photo", () => {
    const ownPhotoCredit = { label: "Wikimedia Commons · CC BY 3.0", author: "WiNG", sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg" };
    const spot = { ownPhoto: own, ownPhotoCredit, googlePlaceId: "ChIJ1", photos: [] };
    const [photo] = getDirectVenuePhotos(cardSpotPhotos(spot), cardPhotoCredits(spot));
    expect(photo).toMatchObject({ url: spotPhotoThumbPath(own), sourceLabel: "Wikimedia Commons · CC BY 3.0",
      attributions: [{ displayName: "WiNG", uri: "https://commons.wikimedia.org/wiki/File:X.jpg" }] });
    expect(cardPhotoCredits({ ownPhoto: own, ownPhotoCredit: null })).toEqual([]);
    expect(cardPhotoCredits({ ownPhoto: null, ownPhotoCredit })).toEqual([]);
  });
});

describe("shortAuthor keeps the name and drops Commons boilerplate", () => {
  it.each([
    ["No machine-readable author provided. LigerCommon assumed (based on copyright claims).", "LigerCommon"],
    ["This Photo was taken by Supanut Arunoprayote . Feel free to use any of my images, but please mention me as the", "Supanut Arunoprayote"],
    ["Fotograf / Photographer: Heinrich Damm ( User:Hdamm , Hdamm at de.wikipedia.org )", "Heinrich Damm"],
    ["The original uploader was Weihao.chiu at Chinese Wikipedia .", "Weihao.chiu"],
    ["RXerself , Creutzen This image was created with Hugin .", "RXerself, Creutzen"],
    ["Atelierdreiseitl (= www.dreiseitl.de; OTRS confirmation )", "Atelierdreiseitl"],
    ["Kakidai", "Kakidai"],
  ])("%s", (input, expected) => expect(shortAuthor(input)).toBe(expected));

  it("never returns more than the cap plus an ellipsis", () => {
    const long = "Imperial Japanese Commission to the Panama-Pacific International Exposition";
    const out = shortAuthor(long)!;
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith("…")).toBe(true);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
  });

  it("returns null for empty input", () => {
    expect(shortAuthor(null)).toBeNull();
    expect(shortAuthor("  ( talk ) ")).toBeNull();
  });

  it("parseStoredSpotPhotos uses the short author in credit lines", () => {
    const json = JSON.stringify([{ k: `spot-photos/0f8b442a-e869-4025-a0bb-e48f7fd44434/${"c".repeat(64)}.webp`, s: "commons", l: "CC BY 4.0", a: "No machine-readable author provided. WAHKEE assumed (based on copyright claims).", u: "https://commons.wikimedia.org/wiki/File:X.jpg" }]);
    const [photo] = parseStoredSpotPhotos(json);
    expect(photo.author).toBe("WAHKEE");
    expect(photo.credit).toBe("WAHKEE · CC BY 4.0 · Wikimedia Commons");
  });
});
