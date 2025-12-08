import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
    console.warn("RESEND_API_KEY is not set. Email functionality will be disabled.");
}

// Only create Resend client if API key exists, otherwise create a dummy that will fail gracefully
export const resend = apiKey ? new Resend(apiKey) : null;

export const FROM_EMAIL = process.env.FROM_EMAIL || "Localley <noreply@localley.app>";
