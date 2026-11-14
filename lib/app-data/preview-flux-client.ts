import { createFalClient } from "@fal-ai/client";

/** One client per candidate image. SDK queue.submit overrides config.retry. */
export function previewFluxClient(credentials: string, transport: typeof fetch = fetch) {
    let submitted = false;
    return createFalClient({
        credentials,
        fetch: async (input, init) => {
            const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
            if (method === "GET" || method === "HEAD") return transport(input, init);
            // Set before dispatch: a lost reply must never permit another paid submission.
            if (submitted) throw new Error("Candidate FLUX submission already attempted");
            submitted = true;
            // Workers support manual redirects. Never follow a paid POST redirect.
            const response = await transport(input, { ...init, redirect: "manual" });
            if (!response.ok) {
                await response.body?.cancel();
                // A plain Error is deliberately not the SDK's retryable ApiError.
                // Do not retain response bodies, prompts, URLs or credentials in errors.
                throw new Error(`Candidate FLUX submission failed (${response.status}); reconcile before retry`);
            }
            return response;
        },
    });
}
