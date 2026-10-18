import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  CreditCard,
  MapPin,
  Route,
  Search,
  Star,
} from "@/components/ui/icons";
import { MarketingNavbar } from "@/components/layout/marketing-navbar";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { CityImageAvatar } from "@/components/ui/city-image";
import { ENABLED_CITIES } from "@/lib/cities";
import { LandingPlanner, LandingExploreLink, LandingSearch, LandingTripBuilder, LandingPresets } from "@/components/landing/planner";
import { LandingHero } from "@/components/landing/hero";

const CITY_OPTIONS = ENABLED_CITIES.slice(0, 8);
const FEATURED_CITIES = ENABLED_CITIES.slice(0, 6);

const RECEIPTS = [
  "Seoul, Tokyo, Bangkok, Singapore and more Asian cities",
  "Localley Score separates tourist traps from places locals actually rate",
  "Paid product for travelers with real trips to plan",
];

const PRODUCT_STEPS = [
  {
    icon: Search,
    title: "Pick the city",
    text: "Start with Seoul, Tokyo, Bangkok, Singapore, Osaka, Kyoto, Taipei or another supported city.",
  },
  {
    icon: Star,
    title: "Set your taste",
    text: "Food, cafes, culture, nightlife, markets, parks, shopping, vintage, street food, or a mix.",
  },
  {
    icon: Route,
    title: "Leave with a route",
    text: "Get a day-by-day plan with places, neighborhoods, timing, and notes that feel local.",
  },
];

function highQualityUnsplashUrl(imageUrl: string | undefined, width = 1200, quality = 90) {
  if (!imageUrl) return undefined;

  try {
    const url = new URL(imageUrl);
    if (url.hostname.includes("images.unsplash.com")) {
      url.searchParams.set("w", String(width));
      url.searchParams.set("q", String(quality));
      url.searchParams.set("auto", "format");
      url.searchParams.set("fit", "crop");
    }
    return url.toString();
  } catch {
    return imageUrl;
  }
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0b0714] text-white selection:bg-violet-300/30 mobile-sticky-safe-space md:pb-0">
      <MarketingNavbar />
      <LandingPlanner cities={CITY_OPTIONS.map(({ name, slug, vibe }) => ({ name, slug, vibe }))}>

      <section className="relative overflow-hidden ">
        <LandingHero />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,7,20,0.98)_0%,rgba(20,12,36,0.9)_48%,rgba(30,18,55,0.58)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,58,237,0.2),rgba(255,255,255,0)_42%,rgba(79,70,229,0.16))]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b0714] to-transparent" />

        <div className="container relative z-10 mx-auto grid min-h-[calc(100svh-1rem)] max-w-7xl items-center gap-8 px-4 pb-10 pt-24 md:grid-cols-[1fr_420px] md:px-6 lg:pb-16">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md bg-violet-400/12 px-3 py-2 text-sm font-semibold text-violet-100 shadow-lg shadow-violet-500/10">
              <MapPin className="h-4 w-4" />
              Asia trip planner for places locals actually like
            </div>

            <h1 className="text-5xl font-black leading-[0.96] tracking-normal text-white sm:text-6xl lg:text-7xl">
              Travel like a local friend planned it.
            </h1>
            <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-200 md:text-2xl">
              Choose a city and a vibe. Localley finds the restaurants, cafes, alleys, markets, and neighborhoods you would normally only hear about after you land.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-lg bg-violet-500 px-6 text-base font-bold text-white shadow-lg shadow-violet-500/30 hover:bg-violet-400">
                <Link prefetch={false} href="/itineraries/new">
                  Start planning
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-lg bg-white/10 px-6 text-base font-semibold text-white hover:bg-white/15 hover:text-white"
              >
                <LandingExploreLink />
              </Button>
            </div>

            <div className="mt-8 grid gap-2">
              {RECEIPTS.map((receipt) => (
                <div key={receipt} className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-violet-300" />
                  <span>{receipt}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2" aria-label="Supported city previews">
              {FEATURED_CITIES.slice(0, 4).map((city) => (
                <Link
                  prefetch={false}
                  key={city.slug}
                  href={`/spots?city=${city.slug}&sort=local`}
                  className="group flex items-center gap-2 rounded-full bg-white/[0.06] py-1 pl-1 pr-3 text-sm text-white/85 backdrop-blur-sm transition hover:bg-violet-400/10"
                >
                  <CityImageAvatar city={city.name} className="h-8 w-8 rounded-full" sizes="32px" />
                  <span>{city.name}</span>
                </Link>
              ))}
            </div>

            <LandingSearch />
          </div>

          <LandingTripBuilder />
        </div>
      </section>

      <LandingPresets />
      </LandingPlanner>

      <section className="bg-[#0b0714] py-14">
        <div className="container mx-auto max-w-7xl px-4 md:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-violet-300">The useful part</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white md:text-5xl">
              Stop planning from 47 tabs.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-400">
              Localley turns scattered TikToks, blog posts, maps, and friend recommendations into one local-first route you can actually follow.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PRODUCT_STEPS.map((step) => (
              <div key={step.title} className="rounded-lg bg-white/[0.04] p-5">
                <step.icon className="mb-4 h-6 w-6 text-violet-300" />
                <h3 className="text-xl font-bold text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className=" bg-[#10131a] py-14">
        <div className="container mx-auto max-w-7xl px-4 md:px-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-indigo-200">Cities live now</p>
              <h2 className="mt-3 text-3xl font-black text-white md:text-5xl">Start where Localley is strongest.</h2>
            </div>
            <Button asChild variant="outline" className="h-11 rounded-lg bg-white/[0.04] text-white hover:bg-white/10 hover:text-white">
              <Link prefetch={false} href="/spots">See all spots</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURED_CITIES.map((city) => {
              const imageUrl = highQualityUnsplashUrl(city.heroImage, 1200, 90);

              return (
                <Link
                  prefetch={false}
                  key={city.slug}
                  href={`/spots?city=${city.slug}&sort=local`}
                  className="group relative min-h-[180px] overflow-hidden rounded-lg bg-slate-900 transition "
                >
                  {imageUrl && (
                    <Image
                      src={imageUrl}
                      alt=""
                      fill
                      className="object-cover transition duration-500 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      quality={90}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{city.emoji}</span>
                      <h3 className="text-xl font-black text-white">{city.name}</h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-300">{city.vibe}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-violet-200">
                      Browse local spots
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#0b0714] py-14">
        <div className="container mx-auto grid max-w-7xl gap-6 px-4 md:grid-cols-[1fr_0.9fr] md:px-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-violet-200">Paid only</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white md:text-5xl">
              Built for people with a ticket booked.
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-400">
              Localley is not an endless inspiration feed. It is a practical trip-planning tool for turning a messy city into a route with better local signal.
            </p>
          </div>

          <div className="rounded-lg bg-white/[0.04] p-5">
            <CreditCard className="mb-4 h-6 w-6 text-violet-200" />
            <h3 className="text-2xl font-bold text-white">Pro starts at $9/month.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Pro is for regular travelers. Premium is for heavier planning, maps, collaboration and high-capacity usage.
            </p>
            <Button asChild className="mt-5 h-12 w-full rounded-lg bg-violet-500 text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400">
              <Link prefetch={false} href="/pricing">
                Compare paid plans
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className=" bg-[#0b0714] py-8">
        <div className="container mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 md:flex-row md:px-6">
          <Logo size="md" isLanding />
          <p className="text-sm text-slate-500">Local routes for Asian cities.</p>
        </div>
      </footer>
      <MobileSignupBar />
    </div>
  );
}

function MobileSignupBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-[#0b0714]/92 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl shadow-black/40 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">Plan a local-first trip</p>
          <p className="truncate text-xs text-violet-100/70">Paid access from $9/month</p>
        </div>
        <Button asChild size="sm" className="h-11 shrink-0 rounded-lg bg-violet-500 px-4 font-bold text-white shadow-lg shadow-violet-500/30 hover:bg-violet-400">
          <Link prefetch={false} href="/pricing">
            Sign up
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
