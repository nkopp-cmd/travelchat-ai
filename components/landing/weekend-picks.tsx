import Link from "next/link";
import { WEEKEND_PICKS } from "@/components/landing/weekend-picks-data";
import { PickAttribution, PickChip } from "@/components/landing/pick-conditions";

export { WEEKEND_PICKS };
export type { WeekendPick } from "@/components/landing/weekend-picks-data";

// "Weekend picks" scroll-snap selector (shared/plans/localley-landing-map-weather.md step 2b,
// reference: District "Weekend pick", 60fps.design shot 2110; frames in
// claude-work/design-refs/weekend-picks/). The card at the centre of the list is fully open;
// cards away from it shrink, clip and darken with their distance while scrolling, and the list
// snaps one card into focus. CSS only: scroll-snap + scroll-driven animations
// (animation-timeline: view()). Browsers without scroll-driven animations, and reduced motion,
// get a static, fully open list. Season + live weather chips load in one cached request
// (components/landing/pick-conditions.tsx), so the page itself stays static.

// Unsplash city photos already used by lib/city-images.ts, resized to 3:2 and served by the
// static-asset CDN (public/images/picks/README.md).
function pickSources(slug: string) {
    const base = `/images/picks/${slug}-pick-v1`;
    return {
        avif: `${base}-480.avif 480w, ${base}-960.avif 960w`,
        webp: `${base}-480.webp 480w, ${base}-960.webp 960w`,
        fallback: `${base}-480.webp`,
    };
}
const SIZES = "(min-width: 640px) 560px, 100vw";

export function WeekendPicks() {
    return (
        <section className="bg-background py-12" aria-labelledby="weekend-picks-title">
            <div className="container mx-auto max-w-xl px-4 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Choose your</p>
                <h2 id="weekend-picks-title" className="mt-1 text-3xl font-black uppercase tracking-wide text-primary md:text-4xl">
                    Weekend pick
                </h2>
            </div>
            <ol className="ll-picks mx-auto mt-6 max-w-xl px-4" aria-label="Weekend picks">
                {WEEKEND_PICKS.map((pick) => {
                    const source = pickSources(pick.slug);
                    return (
                        <li key={pick.slug} className="ll-pick">
                            <Link prefetch={false} href={`/spots?city=${pick.slug}`} className="ll-pick-card"
                                aria-label={`${pick.name}: ${pick.tagline}`}>
                                <picture>
                                    <source type="image/avif" srcSet={source.avif} sizes={SIZES} />
                                    {/* Pre-sized CDN photo; inside <picture> the next/image rule does not apply. */}
                                    <img src={source.fallback} srcSet={source.webp} sizes={SIZES} width={960} height={640}
                                        alt="" loading="lazy" decoding="async" className="ll-pick-photo" />
                                </picture>
                                <span className="ll-pick-shade" aria-hidden="true" />
                                <span className="ll-pick-caption" aria-hidden="true">
                                    <span className="ll-pick-name">{pick.name}</span>
                                    <span className="ll-pick-tagline">{pick.tagline}</span>
                                    <PickChip slug={pick.slug} />
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ol>
            <PickAttribution />
        </section>
    );
}
