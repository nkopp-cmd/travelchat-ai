import type { Metadata } from "next";
import Link from "next/link";
import { BreadcrumbJsonLd, FAQJsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo/meta";
import { usd, VS_WANDERLOG as P, VS_WANDERLOG_CHECKED } from "@/lib/vs/wanderlog";

// Push DR3: honest planner comparison for buyers who already know Wanderlog. Server HTML only (no client JS),
// prerendered and served as a static asset (scripts/cf-static-public-html.mjs).
export const dynamic = "force-static";

export const metadata: Metadata = pageMeta({ title: P.title, absoluteTitle: true, description: P.description, path: P.path });

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

export default function VsWanderlogPage() {
    return (
        <article className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 text-foreground sm:px-6" data-testid="vs-wanderlog">
            <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Localley vs Wanderlog", url: P.path }]} />
            <FAQJsonLd items={P.faq.map((f) => ({ question: f.question, answer: f.answer }))} />

            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{P.h1}</h1>
            <div className="mt-4 space-y-3 text-base leading-7 text-muted-foreground" data-testid="vs-verdict">
                {P.verdict.map((line) => <p key={line}>{line}</p>)}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild className="min-h-12 px-5 font-semibold">
                    <Link href="/itineraries/new" data-testid="vs-plan-free">Plan your first trip free</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-12 px-5">
                    <Link href="/pricing">See Localley prices</Link>
                </Button>
            </div>

            <h2 className="mt-12 text-2xl font-semibold">What decides between them</h2>
            <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm leading-6">
                    <thead>
                        <tr className="border-b border-border text-foreground">
                            <th scope="col" className="py-2 pr-3">Question</th>
                            <th scope="col" className="py-2 pr-3">Wanderlog</th>
                            <th scope="col" className="py-2 pr-3">Localley</th>
                            <th scope="col" className="py-2">Source</th>
                        </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                        {P.reasons.map((r) => (
                            <tr key={r.reason} className="border-b border-border/60 align-top">
                                <th scope="row" className="py-3 pr-3 font-medium text-foreground">{r.reason}</th>
                                <td className="py-3 pr-3">{r.them}</td>
                                <td className="py-3 pr-3">{r.us}</td>
                                <td className="py-3"><a href={r.source} rel="nofollow noopener" className="underline underline-offset-2">{host(r.source)}</a></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h2 className="mt-12 text-2xl font-semibold">What you pay for the paid plan</h2>
            <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse text-left text-sm leading-6" data-testid="vs-price-table">
                    <thead>
                        <tr className="border-b border-border text-foreground">
                            <th scope="col" className="py-2 pr-3">How you travel</th>
                            <th scope="col" className="py-2 pr-3">Wanderlog Pro</th>
                            <th scope="col" className="py-2 pr-3">Localley Pro</th>
                            <th scope="col" className="py-2">Difference</th>
                        </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                        {P.priceRows.map((row) => {
                            const diff = row.them - row.us;
                            return (
                                <tr key={row.window} className="border-b border-border/60">
                                    <th scope="row" className="py-3 pr-3 font-medium text-foreground">{row.window}</th>
                                    <td className="py-3 pr-3">{usd(row.them)}</td>
                                    <td className="py-3 pr-3">{usd(row.us)}</td>
                                    <td className="py-3">{diff >= 0 ? `Localley ${usd(diff)} less` : `Wanderlog ${usd(-diff)} less`}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{P.priceNote} Prices checked {VS_WANDERLOG_CHECKED}.</p>

            <h2 className="mt-12 text-2xl font-semibold">Switch from Wanderlog</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-base leading-7 text-muted-foreground">
                {P.switchSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{P.switchTime}</p>

            <h2 className="mt-12 text-2xl font-semibold">When Wanderlog is the better choice</h2>
            <ul className="mt-4 space-y-3" data-testid="vs-them-better">
                {P.themBetter.map((item) => (
                    <li key={item.title} className="rounded-lg bg-raised p-4">
                        <h3 className="font-semibold">{item.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.text}</p>
                    </li>
                ))}
            </ul>

            <h2 className="mt-12 text-2xl font-semibold">Questions travellers ask</h2>
            <div className="mt-4 space-y-5">
                {P.faq.map((f) => (
                    <div key={f.question}>
                        <h3 className="font-semibold">{f.question}</h3>
                        <p className="mt-1 text-base leading-7 text-muted-foreground">{f.answer}</p>
                    </div>
                ))}
            </div>

            <section className="mt-12 rounded-lg bg-raised p-5">
                <h2 className="text-xl font-semibold">Try the plan before you switch</h2>
                <p className="mt-2 text-base leading-7 text-muted-foreground">
                    Pick a city and your days. Localley writes the first plan for free, with no account and no card.
                </p>
                <Button asChild className="mt-4 min-h-12 px-5 font-semibold">
                    <Link href="/itineraries/new" data-testid="vs-plan-free-bottom">Plan your first trip free</Link>
                </Button>
            </section>

            <footer className="mt-12 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                <h2 className="text-sm font-semibold text-foreground">Sources</h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {P.sources.map((s) => (
                        <li key={s.url}><a href={s.url} rel="nofollow noopener" className="underline underline-offset-2">{s.label}</a></li>
                    ))}
                </ol>
                <p className="mt-3">Last updated {VS_WANDERLOG_CHECKED}. Wanderlog is a trademark of its owner; Localley is not affiliated with it.</p>
            </footer>
        </article>
    );
}
