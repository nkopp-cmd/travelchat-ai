import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tier: "free" }));
vi.mock("@/hooks/use-subscription", () => ({ useSubscription: () => ({ tier: mocks.tier }) }));
import { usePlacePhoto } from "@/hooks/use-place-photo";
const venue = { photoUrl: "https://localley.io/venue.jpg", formattedAddress: "Exact venue address" };
const batchReply = async (_url: string, init?: RequestInit) => Response.json({ results: JSON.parse(String(init?.body)).items.map(() => venue) });
beforeEach(() => { mocks.tier = "free"; vi.stubGlobal("fetch", vi.fn(batchReply)); });
afterEach(() => vi.unstubAllGlobals());
describe("place detail entitlement and venue state", () => {
 it("does not send requests that the server denies to Free users", () => {
 const { result } = renderHook(() => usePlacePhoto("Free venue", "Seoul", { userTier: "free", includeDetails: true }));
 expect(fetch).not.toHaveBeenCalled(); expect(result.current.isLoading).toBe(false); expect(result.current.photoUrl).toBeNull();
 });
 it("uses the resolved subscription when the caller omits a tier", async () => {
 mocks.tier = "pro"; const { result } = renderHook(() => usePlacePhoto("Paid implicit venue", "Seoul"));
 await waitFor(() => expect(result.current.photoUrl).toBe("https://localley.io/venue.jpg")); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("does not fetch before a known paid tier is available", () => {
 const { result } = renderHook(() => usePlacePhoto("Unknown tier venue", "Seoul"));
 expect(fetch).not.toHaveBeenCalled(); expect(result.current.isLoading).toBe(false);
 });
 it("allows Premium details without replacing an existing image", async () => {
 mocks.tier = "premium"; const { result } = renderHook(() => usePlacePhoto("Premium venue", "Seoul", { userTier: "premium", existingImage: "saved.jpg", includeDetails: true }));
 await waitFor(() => expect(result.current.formattedAddress).toBe("Exact venue address")); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("keeps stored images without unnecessary detail requests", () => {
 mocks.tier = "pro"; renderHook(() => usePlacePhoto("Stored image venue", "Seoul", { userTier: "pro", existingImage: "saved.jpg" })); expect(fetch).not.toHaveBeenCalled();
 });
 it("refuses a hardcoded Pro hint when the actual viewer is Free", () => {
 renderHook(() => usePlacePhoto("Shared public venue", "Seoul", { userTier: "pro" })); expect(fetch).not.toHaveBeenCalled();
 });
 it("does not expose cached paid results after a downgrade", async () => {
 mocks.tier = "pro"; const { result, rerender } = renderHook(({ paid }) => usePlacePhoto("Downgrade venue", "Seoul", { userTier: paid ? "pro" : "free" }), { initialProps: { paid: true } });
 await waitFor(() => expect(result.current.photoUrl).toBeTruthy()); rerender({ paid: false });
 expect(result.current.photoUrl).toBeNull(); expect(result.current.formattedAddress).toBeNull(); expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("does not show the previous venue while a new lookup is pending", async () => {
 mocks.tier = "pro"; const { result, rerender } = renderHook(({ name }) => usePlacePhoto(name, "Seoul", { userTier: "pro" }), { initialProps: { name: "First exact venue" } });
 await waitFor(() => expect(result.current.photoUrl).toBeTruthy()); vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
 act(() => rerender({ name: "Second exact venue" })); expect(result.current.photoUrl).toBeNull(); expect(result.current.isLoading).toBe(true);
 });
 it("restarts a cancelled lookup when a paid viewer returns", async () => {
 mocks.tier = "pro"; vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
 const { result, rerender } = renderHook(({ tier }) => { mocks.tier = tier; return usePlacePhoto("Cancelled lookup venue", "Seoul"); }, { initialProps: { tier: "pro" } });
 await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1)); // the first batch is sent (and hangs)
 rerender({ tier: "free" }); rerender({ tier: "pro" }); await waitFor(() => expect(result.current.photoUrl).toBeTruthy()); expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("does not poison a later lookup with a failed HTTP response", async () => {
 mocks.tier = "pro"; vi.mocked(fetch).mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
 const first = renderHook(() => usePlacePhoto("Transient refusal venue", "Seoul")); await waitFor(() => expect(first.result.current.isLoading).toBe(false)); first.unmount();
 const second = renderHook(() => usePlacePhoto("Transient refusal venue", "Seoul")); await waitFor(() => expect(second.result.current.photoUrl).toBeTruthy()); expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("sends the lookups of one screen as ONE batched request, results in order", async () => {
 mocks.tier = "premium";
 const { result } = renderHook(() => [usePlacePhoto("Batch venue A", "Seoul"), usePlacePhoto("Batch venue B", "Seoul"), usePlacePhoto("Batch venue A", "Seoul")]);
 await waitFor(() => expect(result.current.every((r) => r.photoUrl)).toBe(true));
 expect(fetch).toHaveBeenCalledTimes(1);
 const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
 expect(url).toBe("/api/places/photos"); expect(init.method).toBe("POST");
 expect(JSON.parse(String(init.body))).toEqual({ items: [{ query: "Batch venue A", city: "Seoul" }, { query: "Batch venue B", city: "Seoul" }] });
 });
 it("does not cache a failed lookup inside a batch (null result)", async () => {
 mocks.tier = "pro"; vi.mocked(fetch).mockResolvedValueOnce(Response.json({ results: [null] }));
 const first = renderHook(() => usePlacePhoto("Null result venue", "Seoul")); await waitFor(() => expect(first.result.current.isLoading).toBe(false));
 expect(first.result.current.photoUrl).toBeNull(); first.unmount();
 const second = renderHook(() => usePlacePhoto("Null result venue", "Seoul")); await waitFor(() => expect(second.result.current.photoUrl).toBeTruthy()); expect(fetch).toHaveBeenCalledTimes(2);
 });
});
