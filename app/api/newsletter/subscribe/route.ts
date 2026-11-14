import { NextRequest, NextResponse } from "next/server";
import { rateLimit, strictPlatformLimit } from "@/lib/rate-limit";
import { sendNewsletterConfirm } from "@/lib/newsletter/mail";
import type { NewsletterState } from "@/lib/newsletter/states";
import { newsletterDb, normalizeEmail, releaseConfirm, subscribe } from "@/lib/newsletter/store";

// Plain HTML form post (0 KB JS). Answers are 303 redirects to static state pages; the same "thanks" page shows for
// new, pending, confirmed and honeypot requests, so the form never reveals who is on the list.
export const dynamic = "force-dynamic";

const developmentLimit = rateLimit({ windowMs: 60_000, maxRequests: 5 });
const go = (req: NextRequest, state: NewsletterState) =>
  NextResponse.redirect(new URL(`/newsletter/${state}`, req.url), { status: 303, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const verdict = await strictPlatformLimit(req, 5, "newsletter_subscribe");
    if (verdict !== "ok") return go(req, "retry");
  } else if (await developmentLimit(req)) {
    return go(req, "retry");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return go(req, "check-email");
  }
  // Honeypot: people never see or fill this field.
  if (String(form.get("website") ?? "") !== "") return go(req, "thanks");
  const email = normalizeEmail(form.get("email"));
  if (!email) return go(req, "check-email");
  const db = newsletterDb();
  if (!db) return go(req, "retry");
  try {
    const result = await subscribe(db, { email, source: String(form.get("source") ?? ""), city: String(form.get("city") ?? "") });
    if (result.send) {
      try {
        await sendNewsletterConfirm(result.email, result.confirmToken);
      } catch {
        await releaseConfirm(db, result.email);
        console.error("[newsletter] confirm_send_failed");
        return go(req, "retry");
      }
    }
  } catch {
    console.error("[newsletter] store_unavailable");
    return go(req, "retry");
  }
  return go(req, "thanks");
}
