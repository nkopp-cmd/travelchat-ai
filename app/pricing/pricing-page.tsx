import Link from "next/link";
import { ArrowLeft, Map, ShieldCheck, Sparkles } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppBackground } from "@/components/layout/app-background";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { FREE_ACCOUNT_SUBTITLE } from "@/lib/auth/auth-copy";
import type { PlannerLimitNotice } from "@/lib/pricing-checkout";
import { PricingPlans } from "./pricing-plans";

// Push CH2: server HTML. Only <PricingPlans> (toggle, cards, Stripe buttons) hydrates on the client.
export function PricingPage({ plannerLimit }: { plannerLimit?: PlannerLimitNotice | null }) {
    const hero = (
        <>
            <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-raised px-3 py-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Secure subscription through Stripe
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl lg:text-6xl">
                Your local friend is free. Pro plans the whole trip.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Phrases, menus, paying and taxi help cost nothing. Your first trip plan is free too, no account needed. Pro plans every day around the spots locals rate, with full addresses and exports.
            </p>
            <Button asChild className="mt-6 min-h-12 px-5 font-semibold">
                <Link href="/itineraries/new" data-testid="pricing-free-plan">Plan a free trip</Link>
            </Button>
            {/* Push BG3: the same free-account offer as /sign-up, built from TIER_CONFIGS.free.limits. */}
            <p className="mt-3 text-sm text-muted-foreground" data-testid="pricing-free-account">{FREE_ACCOUNT_SUBTITLE}</p>
            {/* Push DR3: one contextual link for buyers who compare planners. */}
            <p className="mt-2 text-sm text-muted-foreground">
                Using Wanderlog now? <Link href="/vs/wanderlog" className="underline underline-offset-2 hover:text-foreground">See how Localley compares</Link>.
            </p>
        </>
    );

    return (
        <AppBackground ambient className="min-h-screen bg-surface" contentClassName="min-h-screen">
            <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-8">
                <header className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <Link
                        href="/"
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Link>
                    <Badge className="rounded-md bg-primary/10 px-3 py-1.5 text-foreground">
                        First plan free
                    </Badge>
                </header>

                <div className="flex flex-1 flex-col">
                    <PricingPlans hero={hero} initialPlannerLimit={plannerLimit} />

                    <section className="grid gap-4 py-8 md:grid-cols-3">
                        <ProofBlock
                            icon={Map}
                            title="Spots locals rate"
                            text="Plans use the restaurants, cafes, markets and neighborhoods you would normally only hear about after you land."
                        />
                        <ProofBlock
                            icon={Sparkles}
                            title="Addresses a driver can read"
                            text="Pro shows the full address of every stop. Each spot card shows it in the local script, so a taxi takes you to the door."
                        />
                        <ProofBlock
                            icon={ShieldCheck}
                            title="Cancel anytime"
                            text="Pay securely through Stripe. Change or cancel your plan yourself in the billing portal."
                        />
                    </section>

                    <section className="mb-4 rounded-lg bg-raised p-5">
                        <h2 className="text-xl font-semibold text-foreground">Billing notes</h2>
                        <div className="mt-4 grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-2">
                            <p>Subscriptions can be changed or cancelled through Stripe Billing Portal.</p>
                            <p>Refund requests are handled within 14 days of the first payment when the product is not a fit.</p>
                        </div>
                    </section>

                    {/* Push BD1: a visitor who is not ready to pay can still leave an email (plain form, 0 KB JS). */}
                    <LocalleySignup source="pricing" heading="Not ready yet? Get the Localley newsletter" className="mb-4" />
                </div>
            </div>
        </AppBackground>
    );
}

function ProofBlock({
    icon: Icon,
    title,
    text,
}: {
    icon: typeof Sparkles;
    title: string;
    text: string;
}) {
    return (
        <div className="rounded-lg bg-raised p-4">
            <Icon className="mb-3 h-5 w-5 text-cyan-200" />
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        </div>
    );
}
