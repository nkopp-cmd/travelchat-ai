import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), first: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewSpotPhotosCandidate, previewSpotPhotoSource } from "@/lib/app-data/preview-spot-photos";

const id = "550e8400-e29b-41d4-a716-446655440000";
const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("preview spot photo source", () => {
  it("requires the exact preview host, flag, and isolated environment", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag: string) => new NextRequest(`https://${host}/api/spots/${id}/photos${flag}`);
    expect(isPreviewSpotPhotosCandidate(request("localley-next-preview.nkopp.workers.dev", "?data_candidate=d1"))).toBe(true);
    expect(isPreviewSpotPhotosCandidate(request("www.localley.io", "?data_candidate=d1"))).toBe(false);
    expect(isPreviewSpotPhotosCandidate(request("localley-next-preview.nkopp.workers.dev", ""))).toBe(false);
    process.env = { ...process.env, SUPABASE_READ_ONLY: "false" };
    expect(isPreviewSpotPhotosCandidate(request("localley-next-preview.nkopp.workers.dev", "?data_candidate=d1"))).toBe(false);
  });

  it("uses one published exact-ID join and checks source identity", async () => {
    const bind = vi.fn(() => ({ first: mocks.first }));
    const prepare = vi.fn(() => ({ bind }));
    mocks.reader.mockReturnValue({ prepare });
    const source = { id, name: { en: "One" }, address: { en: "Seoul" }, category: "Cafe", photos: [] };
    mocks.first.mockResolvedValueOnce({ payload: JSON.stringify(source) })
      .mockResolvedValueOnce({ payload: JSON.stringify({ ...source, id: "other" }) });
    expect((await previewSpotPhotoSource(id.toUpperCase()))?.id).toBe(id);
    expect(bind).toHaveBeenCalledWith(id);
    expect(prepare.mock.calls[0][0]).toContain("p.visible = 1");
    await expect(previewSpotPhotoSource(id)).rejects.toThrow("Invalid preview spot photo source");
  });

  it("returns null for missing rows and rejects malformed payloads", async () => {
    mocks.reader.mockReturnValue({ prepare: () => ({ bind: () => ({ first: mocks.first }) }) });
    mocks.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ payload: "not-json" });
    expect(await previewSpotPhotoSource(id)).toBeNull();
    await expect(previewSpotPhotoSource(id)).rejects.toThrow();
  });
});
