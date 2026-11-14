import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const NEWSLETTER_SUBSCRIBE_ACTION = "/api/newsletter/subscribe";

/**
 * Localley's own newsletter sign-up (shared/plans/localley-newsletter.md). A plain HTML form: 0 KB JS, works without
 * scripts, posts to the double opt-in API. `source` names the page for list analytics (letters, digits, hyphens).
 */
export function LocalleySignup({ source, city, className, heading = "The Localley newsletter" }: {
  source: string;
  city?: string;
  className?: string;
  heading?: string;
}) {
  return (
    <aside className={cn("rounded-2xl bg-surface px-5 py-5 shadow-surface", className)} aria-labelledby={`newsletter-${source}`}>
      <p id={`newsletter-${source}`} className="font-semibold">{heading}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Asia picks that locals rate, plus how to pay, get around and plan your days. About twice a month, free.
      </p>
      <form method="post" action={NEWSLETTER_SUBSCRIBE_ACTION} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`newsletter-email-${source}`} className="sr-only">Email address</label>
        <Input id={`newsletter-email-${source}`} type="email" name="email" required autoComplete="email"
          inputMode="email" placeholder="you@example.com" maxLength={254} className="sm:flex-1" />
        <input type="hidden" name="source" value={source} />
        {city ? <input type="hidden" name="city" value={city} /> : null}
        {/* Honeypot: hidden from people and screen readers; bots that fill it get the normal answer and no mail. */}
        <div aria-hidden="true" className="absolute -left-[10000px] size-0 overflow-hidden">
          <label htmlFor={`newsletter-website-${source}`}>Website</label>
          <input id={`newsletter-website-${source}`} type="text" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <Button type="submit" className="min-h-12 font-semibold">Sign up</Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        We send a confirmation link first. Unsubscribe in one click. <a href="/privacy" className="underline underline-offset-2">Privacy</a>
      </p>
    </aside>
  );
}
