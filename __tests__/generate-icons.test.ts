import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => Buffer.from("<svg/>")),
    resize: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined),
    sharp: vi.fn(),
}));

vi.mock("node:fs", () => ({
    existsSync: mocks.existsSync,
    mkdirSync: mocks.mkdirSync,
    readFileSync: mocks.readFileSync,
}));
vi.mock("sharp", () => ({ default: mocks.sharp }));

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("icon generator", () => {
    it("loads sharp's default export and generates both PNG sizes", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});
        const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
        mocks.sharp.mockReturnValue(mocks);

        await import("../scripts/generate-icons.js");
        await vi.dynamicImportSettled();

        expect(mocks.sharp).toHaveBeenCalledTimes(2);
        expect(mocks.sharp).toHaveBeenCalledWith(Buffer.from("<svg/>"));
        expect(mocks.resize.mock.calls).toEqual([[192, 192], [512, 512]]);
        expect(mocks.png).toHaveBeenCalledTimes(2);
        expect(mocks.toFile).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/public\/icons\/icon-192x192\.png$/));
        expect(mocks.toFile).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/public\/icons\/icon-512x512\.png$/));
        expect(errors).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();
    });
});
