import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotPhotoImage, VenueCardPhoto, VenueHeroPhoto, VenuePhotoThumbnails } from "@/components/spots/spot-photo-image";
import { getDirectVenuePhotos, VenuePhotoProvider } from "@/components/spots/venue-photo-provider";
import type { ImgHTMLAttributes } from "react";

vi.mock("next/image", () => ({
  default: ({ src, alt, onLoad, onError }: ImgHTMLAttributes<HTMLImageElement>) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onLoad={onLoad} onError={onError} />,
}));

const photo = (id: string) => ({ id, url: `/api/places/photo?name=${id}&v=venue-photos-2`, sourceLabel: "Google listing photo", attributions: [] });
const response = (ids: string[]) => ({ ok: true, json: async () => ({ status: "available", photos: ids.map(photo) }) });
afterEach(() => vi.unstubAllGlobals());

describe("venue photos", () => {
  it("shows failure without a stock substitute and resets on source change", () => {
    const { rerender } = render(<SpotPhotoImage photo={photo("a")} alt="Venue" sizes="320px" />);
    const image = screen.getByAltText("Venue");
    expect(image.getAttribute("src")).not.toContain("/_next/image");
    fireEvent.load(image);
    expect(screen.getByText("Google listing photo")).toBeTruthy();
    fireEvent.error(image);
    expect(screen.getByText("Photo unavailable")).toBeTruthy();
    expect(screen.queryByText("Google listing photo")).toBeNull();
    rerender(<SpotPhotoImage photo={photo("b")} alt="Venue" sizes="320px" />);
    expect(screen.getByAltText("Venue").getAttribute("src")).toContain("name=b");
  });

  it("shows author names and permits only safe HTTPS author links", () => {
    render(<SpotPhotoImage photo={{ ...photo("credit"), attributions: [
      { displayName: "Alice", uri: "https://example.com/alice" },
      { displayName: "Bob", uri: "javascript:alert(1)" },
      { displayName: "Carol", uri: "https://user:password@example.com" },
    ] }} alt="Venue" sizes="320px" />);
    expect(screen.getByRole("link", { name: "Alice" }).getAttribute("href")).toBe("https://example.com/alice");
    expect(screen.getByText("Bob").closest("a")).toBeNull();
    expect(screen.getByText("Carol").closest("a")).toBeNull();
  });

  it("coordinates hero and unique thumbnail indices with one request", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(["a", "a", "b", "c", "d", "e"]));
    vi.stubGlobal("fetch", fetcher);
    render(<VenuePhotoProvider spotId="gallery"><VenueHeroPhoto name="Venue" /><VenuePhotoThumbnails name="Venue" /></VenuePhotoProvider>);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(4));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText("Venue").getAttribute("src")).toContain("name=a");
    expect(screen.getByAltText("Venue photo 2").getAttribute("src")).toContain("name=b");
    expect(screen.getByAltText("Venue photo 4").getAttribute("src")).toContain("name=d");
    fireEvent.error(screen.getByAltText("Venue"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate a single photo into thumbnails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(["single"])));
    render(<VenuePhotoProvider spotId="single"><VenueHeroPhoto name="Venue" /><VenuePhotoThumbnails name="Venue" /></VenuePhotoProvider>);
    await screen.findByRole("img");
    expect(screen.queryByTestId("venue-thumbnails")).toBeNull();
  });

  it.each(["empty", "network", "http"])("shows unavailable for %s metadata", async (kind) => {
    vi.stubGlobal("fetch", kind === "network" ? vi.fn().mockRejectedValue(new Error("offline")) :
      vi.fn().mockResolvedValue(kind === "empty" ? response([]) : { ok: false }));
    render(<VenueCardPhoto spotId={kind} name="Venue" priority />);
    await screen.findByText("Photo unavailable");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("ignores stale metadata after spot identity changes", async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response(["new"]));
    vi.stubGlobal("fetch", fetcher);
    const { rerender } = render(<VenueCardPhoto spotId="old" name="Old" priority />);
    rerender(<VenueCardPhoto spotId="new" name="New" priority />);
    await screen.findByAltText("New");
    await act(async () => { resolveOld(response(["old"])); });
    expect(screen.getByAltText("New").getAttribute("src")).toContain("name=new");
  });

  it("deduplicates only in-flight requests, not later mounts", async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockResolvedValue(response(["fresh"]));
    vi.stubGlobal("fetch", fetcher);
    const first = render(<><VenueCardPhoto spotId="shared" name="One" priority /><VenueCardPhoto spotId="shared" name="Two" priority /></>);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(response(["first"])); });
    first.unmount();
    render(<VenueCardPhoto spotId="shared" name="Later" priority />);
    await screen.findByAltText("Later");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("waits until a card is visible", async () => {
    let visible!: IntersectionObserverCallback;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { visible = callback; }
      observe() {} disconnect() {}
    });
    const fetcher = vi.fn().mockResolvedValue(response(["visible"]));
    vi.stubGlobal("fetch", fetcher);
    render(<VenueCardPhoto spotId="lazy" name="Lazy" />);
    expect(fetcher).not.toHaveBeenCalled();
    act(() => visible([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await screen.findByAltText("Lazy");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves direct sources but rejects stock, Google, generated pools and credentials", () => {
    expect(getDirectVenuePhotos([
      "/images/venues/front.jpg", "https://images.unsplash.com/stock.jpg",
      "/api/places/photo?name=old", "https://maps.googleapis.com/photo?key=secret",
      "https://venue.example/front.jpg?api_key=secret", "/images/generated/pool.jpg",
    ])).toEqual([{ id: "/images/venues/front.jpg", url: "/images/venues/front.jpg", sourceLabel: "Direct source photo - unverified", attributions: [] }]);
  });
});
