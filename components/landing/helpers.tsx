import type { ComponentType } from "react";
import Link from "next/link";
import { Car, Clock, CreditCard, Languages, Utensils, type IconProps } from "@/components/ui/icons";
import { HELP_COUNTRIES } from "@/lib/help/phrases";

// The landing promise (shared/plans/localley-helper-community.md): "your local friend in Asia", backed by the five
// live helpers. Korea opens first because Seoul is where the catalog is strongest; /help lists every country.
export interface LandingHelper {
    id: string;
    title: string;
    short: string;
    text: string;
    href: string;
    icon: ComponentType<IconProps>;
}

export const LANDING_HELPERS: LandingHelper[] = [
    {
        id: "say", title: "Help me say this", short: "Say this", href: "/help", icon: Languages,
        text: "Big phrase cards in Korean, Japanese, Thai, Vietnamese and Chinese. Tap one and show it to staff. Works without signal once the page is open.",
    },
    {
        id: "menu", title: "Help me order this", short: "Order from a menu", href: "/help/korea/menu", icon: Utensils,
        text: "Take a photo of a menu. Read every dish in English with a short description, then show your choice to the staff.",
    },
    {
        id: "pay", title: "How can I pay here?", short: "Pay", href: "/help/korea/pay", icon: CreditCard,
        text: "Which cards work, when you need cash, which wallets and transit cards to load, and what to say at the counter.",
    },
    {
        id: "driver", title: "Show the driver", short: "Taxi card", href: "/spots?city=seoul&sort=local", icon: Car,
        text: "Every spot page has a full-screen card with the address in the local script, so a taxi driver can take you to the door.",
    },
    {
        id: "open", title: "Find somewhere open nearby", short: "Open nearby", href: "/help/korea/open", icon: Clock,
        text: "Spots within 2 km of you, nearest first, with one tap to today's hours on the map.",
    },
];

/** Hero shortcuts: one tap to each helper. */
export function HeroHelperLinks() {
    return (
        <nav aria-label="Travel helpers" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {LANDING_HELPERS.map(({ id, short, href }) => (
                <Link key={id} prefetch={false} href={href}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-raised/85 px-4 text-sm font-semibold text-foreground backdrop-blur-sm transition hover:bg-overlay">
                    {short}
                </Link>
            ))}
        </nav>
    );
}

export function LandingHelpers() {
    const others = HELP_COUNTRIES.filter((country) => country.slug !== "korea").map((country) => country.name);
    return (
        <section aria-labelledby="landing-helpers" className="bg-background py-12">
            <div className="container mx-auto max-w-7xl px-4 md:px-6">
                <div className="max-w-2xl">
                    <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">On the street</p>
                    <h2 id="landing-helpers" className="mt-3 text-3xl font-black leading-tight text-foreground md:text-5xl">
                        Help for the moments a guidebook skips.
                    </h2>
                    <p className="mt-4 text-lg leading-8 text-muted-foreground">
                        Ordering, paying, getting a taxi, finding what is open. Open the helper, show your phone, move on.
                    </p>
                </div>
                <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {LANDING_HELPERS.map((helper) => (
                        <li key={helper.id}>
                            <Link prefetch={false} href={helper.href}
                                className="flex h-full flex-col rounded-lg bg-raised p-5 transition hover:bg-overlay focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                                <helper.icon className="mb-4 h-6 w-6 text-primary" />
                                <h3 className="text-xl font-bold text-foreground">{helper.title}</h3>
                                <p className="mt-3 text-sm leading-6 text-muted-foreground">{helper.text}</p>
                            </Link>
                        </li>
                    ))}
                </ul>
                <p className="mt-6 text-sm text-muted-foreground">
                    The helpers open for South Korea. <Link prefetch={false} href="/help" className="font-semibold text-foreground underline underline-offset-4">Pick another country</Link>: {others.join(", ")}.
                </p>
            </div>
        </section>
    );
}
