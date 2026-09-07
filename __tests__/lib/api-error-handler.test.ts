import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { withErrorHandling } from "@/lib/api-error-handler";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("withErrorHandling", () => {
    it("passes route arguments through and preserves the response", async () => {
        const response = new Response("created", { status: 201 });
        const request = new Request("https://localley.io/api/example");
        const context = { params: Promise.resolve({ id: "example" }) };
        const handler = vi.fn<(request: Request, routeContext: typeof context) => Promise<Response>>()
            .mockResolvedValue(response);
        const wrapped = withErrorHandling(handler, "example");

        expect(await wrapped(request, context)).toBe(response);
        expect(handler).toHaveBeenCalledWith(request, context);
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it("reports failures and returns the existing API error response", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const error = new Error("Unauthorized");
        const wrapped = withErrorHandling(async () => { throw error; }, "example");

        const response = await wrapped();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Unauthorized" });
        expect(Sentry.captureException).toHaveBeenCalledWith(error, {
            tags: { context: "example", api: true },
            user: undefined,
            extra: undefined,
        });
    });
});
