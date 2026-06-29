"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Coffee,
  Compass,
  CreditCard,
  MapPin,
  Route,
  Search,
  Sparkles,
  Star,
  Utensils,
} from "lucide-react";
import { MarketingNavbar } from "@/components/layout/marketing-navbar";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { CityImageAvatar } from "@/components/ui/city-image";
import { ENABLED_CITIES } from "@/lib/cities";
import { cn } from "@/lib/utils";

const CITY_OPTIONS = ENABLED_CITIES.slice(0, 8);
const FEATURED_CITIES = ENABLED_CITIES.slice(0, 6);
const FALLBACK_CITY = CITY_OPTIONS[0] ?? ENABLED_CITIES[0];

const VIBE_OPTIONS = [
  { id: "Food & Dining", label: "Food", icon: Utensils },
  { id: "Cafes & Coffee", label: "Cafes", icon: Coffee },
  { id: "Art & Culture", label: "Culture", icon: Compass },
  { id: "Street Food", label: "Street food", icon: Sparkles },
];

const QUICK_PRESETS = [
  {
    title: "One night in Seoul",
    detail: "Food street, tiny bar, late cafe. No palace marathon.",
    city: "Seoul",
    days: 1,
    interests: ["Food & Dining", "Nightlife & Bars"],
  },
  {
    title: "Tokyo cafe weekend",
    detail: "Quiet neighborhoods, coffee, small shops, walkable stops.",
    city: "Tokyo",
    days: 2,
    interests: ["Cafes & Coffee", "Art & Culture"],
  },
  {
    title: "Bangkok street-food run",
    detail: "Markets, local dinner, easy late route, fewer generic lists.",
    city: "Bangkok",
    days: 3,
    interests: ["Street Food", "Food & Dining"],
  },
];

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

function citySlug(cityName: string) {
  return cityName.toLowerCase().replace(/\s+/g, "-");
}

function encodedInterests(interests: string[]) {
  return interests.join(",");
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("Seoul");
  const [days, setDays] = useState(3);
  const [interests, setInterests] = useState<string[]>([
    "Food & Dining",
    "Cafes & Coffee",
  ]);
  const router = useRouter();

  const selectedCityMeta = CITY_OPTIONS.find((city) => city.name === selectedCity) ?? FALLBACK_CITY;

  const itineraryHref = useMemo(() => {
    const params = new URLSearchParams({
      city: selectedCity,
      days: String(days),
      interests: encodedInterests(interests),
      pace: days <= 2 ? "active" : "moderate",
      budget: "moderate",
      localness: "4",
    });
    return `/itineraries/new?${params.toString()}`;
  }, [days, interests, selectedCity]);

  const exploreHref = useMemo(() => {
    const params = new URLSearchParams({
      city: citySlug(selectedCity),
      sort: "local",
    });
    if (interests[0]) {
      const category = interests[0].split(" ")[0];
      params.set("category", category);
    }
    return `/spots?${params.toString()}`;
  }, [interests, selectedCity]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) {
      router.push(`/spots?search=${encodeURIComponent(query)}`);
      return;
    }
    router.push(exploreHref);
  };

  const toggleInterest = (interest: string) => {
    setInterests((current) => {
      if (current.includes(interest)) {
        const next = current.filter((item) => item !== interest);
        return next.length ? next : current;
      }
      return [...current, interest].slice(0, 3);
    });
  };

  const applyPreset = (preset: (typeof QUICK_PRESETS)[number]) => {
    setSelectedCity(preset.city);
    setDays(preset.days);
    setInterests(preset.interests);
  };

  return (
    <div className="min-h-screen bg-[#0b0714] text-white selection:bg-violet-300/30 mobile-sticky-safe-space md:pb-0">
      <MarketingNavbar />

      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-75"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=2400&auto=format&fit=crop')",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,7,20,0.98)_0%,rgba(20,12,36,0.9)_48%,rgba(30,18,55,0.58)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,58,237,0.2),rgba(255,255,255,0)_42%,rgba(79,70,229,0.16))]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b0714] to-transparent" />

        <div className="container relative z-10 mx-auto grid min-h-[calc(100svh-1rem)] max-w-7xl items-center gap-8 px-4 pb-10 pt-24 md:grid-cols-[1fr_420px] md:px-6 lg:pb-16">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-violet-300/25 bg-violet-400/12 px-3 py-2 text-sm font-semibold text-violet-100 shadow-lg shadow-violet-500/10">
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
                <Link href="/pricing">
                  Start planning
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-lg border-white/20 bg-white/10 px-6 text-base font-semibold text-white hover:bg-white/15 hover:text-white"
              >
                <Link href={exploreHref}>Browse local spots</Link>
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
                  key={city.slug}
                  href={`/spots?city=${city.slug}&sort=local`}
                  className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] py-1 pl-1 pr-3 text-sm text-white/85 backdrop-blur-sm transition hover:border-violet-300/40 hover:bg-violet-400/10"
                >
                  <CityImageAvatar city={city.name} className="h-8 w-8 rounded-full" sizes="32px" />
                  <span>{city.name}</span>
                </Link>
              ))}
            </div>

            <form
              onSubmit={handleSearch}
              className="mt-8 flex max-w-2xl flex-col gap-2 rounded-lg border border-violet-200/20 bg-black/35 p-2 shadow-xl shadow-violet-950/20 backdrop-blur-md sm:flex-row"
            >
              <label className="sr-only" htmlFor="landing-search">
                Search for a city, food, cafe, or neighborhood
              </label>
              <div className="flex min-h-12 flex-1 items-center gap-3 px-3">
                <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
                <input
                  id="landing-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search Seoul cafes, Bangkok food, Tokyo vintage..."
                  className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-500"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 rounded-lg bg-white text-slate-950 hover:bg-slate-200">
                Search
              </Button>
            </form>
          </div>

          <TripBuilder
            selectedCity={selectedCity}
            selectedCityMeta={selectedCityMeta}
            days={days}
            interests={interests}
            itineraryHref={itineraryHref}
            exploreHref={exploreHref}
            setSelectedCity={setSelectedCity}
            setDays={setDays}
            toggleInterest={toggleInterest}
          />
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#10131a] py-8">
        <div className="container mx-auto grid max-w-7xl gap-3 px-4 md:grid-cols-3 md:px-6">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.title}
              type="button"
              onClick={() => applyPreset(preset)}
              className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-left transition hover:border-violet-300/45 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              <div className="relative h-24 overflow-hidden">
                <CityImageAvatar
                  city={preset.city}
                  className="absolute inset-0 h-full w-full rounded-none"
                  imageClassName="transition duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                  imageWidth={900}
                  quality={90}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="absolute bottom-3 left-4 rounded-md bg-black/45 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  {preset.city}
                </span>
              </div>
              <div className="p-5">
                <h2 className="mb-3 text-lg font-bold text-white">{preset.title}</h2>
                <p className="text-sm leading-6 text-slate-400">{preset.detail}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

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
              <div key={step.title} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <step.icon className="mb-4 h-6 w-6 text-violet-300" />
                <h3 className="text-xl font-bold text-white">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#10131a] py-14">
        <div className="container mx-auto max-w-7xl px-4 md:px-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-indigo-200">Cities live now</p>
              <h2 className="mt-3 text-3xl font-black text-white md:text-5xl">Start where Localley is strongest.</h2>
            </div>
            <Button asChild variant="outline" className="h-11 rounded-lg border-white/15 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white">
              <Link href="/spots">See all spots</Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURED_CITIES.map((city) => {
              const imageUrl = highQualityUnsplashUrl(city.heroImage, 1200, 90);

              return (
                <Link
                  key={city.slug}
                  href={`/spots?city=${city.slug}&sort=local`}
                  className="group relative min-h-[180px] overflow-hidden rounded-lg border border-white/10 bg-slate-900 transition hover:border-violet-300/45"
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

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <CreditCard className="mb-4 h-6 w-6 text-violet-200" />
            <h3 className="text-2xl font-bold text-white">Pro starts at $9/month.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Pro is for regular travelers. Premium is for heavier planning, maps, collaboration and high-capacity usage.
            </p>
            <Button asChild className="mt-5 h-12 w-full rounded-lg bg-violet-500 text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400">
              <Link href="/pricing">
                Compare paid plans
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#0b0714] py-8">
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
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-violet-200/15 bg-[#0b0714]/92 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl shadow-black/40 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">Plan a local-first trip</p>
          <p className="truncate text-xs text-violet-100/70">Paid access from $9/month</p>
        </div>
        <Button asChild size="sm" className="h-11 shrink-0 rounded-lg bg-violet-500 px-4 font-bold text-white shadow-lg shadow-violet-500/30 hover:bg-violet-400">
          <Link href="/pricing">
            Sign up
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function TripBuilder({
  selectedCity,
  selectedCityMeta,
  days,
  interests,
  itineraryHref,
  exploreHref,
  setSelectedCity,
  setDays,
  toggleInterest,
}: {
  selectedCity: string;
  selectedCityMeta: (typeof CITY_OPTIONS)[number] | undefined;
  days: number;
  interests: string[];
  itineraryHref: string;
  exploreHref: string;
  setSelectedCity: (city: string) => void;
  setDays: (days: number) => void;
  toggleInterest: (interest: string) => void;
}) {
  return (
    <div className="rounded-lg border border-violet-200/15 bg-[#120d20]/92 p-4 shadow-2xl shadow-violet-950/30 backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-200">Build a route</p>
          <h2 className="mt-1 text-2xl font-black text-white">Where are you going?</h2>
        </div>
        <div className="rounded-md border border-violet-300/25 bg-violet-300/10 px-2 py-1 text-xs font-semibold text-violet-100">
          60 sec setup
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <MapPin className="h-4 w-4 text-violet-300" />
            City
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CITY_OPTIONS.slice(0, 6).map((city) => {
              const isSelected = city.name === selectedCity;
              return (
                <button
                  key={city.slug}
                  type="button"
                  onClick={() => setSelectedCity(city.name)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-lg border px-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
                    isSelected
                      ? "border-violet-300 bg-violet-400/15 text-white"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:bg-white/[0.07]"
                  )}
                >
                  <CityImageAvatar city={city.name} className="h-9 w-9" sizes="36px" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{city.name}</span>
                    <span className="block truncate text-xs text-slate-400">{city.vibe}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <CalendarDays className="h-4 w-4 text-indigo-300" />
            Days
          </div>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Trip duration">
            {[1, 2, 3, 5].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                aria-pressed={days === option}
                className={cn(
                  "min-h-11 rounded-lg border text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
                  days === option
                    ? "border-indigo-300 bg-indigo-300/15 text-white"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25"
                )}
              >
                {option}d
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Sparkles className="h-4 w-4 text-violet-300" />
            Vibe
          </div>
          <div className="grid grid-cols-2 gap-2">
            {VIBE_OPTIONS.map((vibe) => {
              const Icon = vibe.icon;
              const isSelected = interests.includes(vibe.id);
              return (
                <button
                  key={vibe.id}
                  type="button"
                  onClick={() => toggleInterest(vibe.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-12 items-center justify-between rounded-lg border px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
                    isSelected
                      ? "border-violet-300 bg-violet-400/15 text-white"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {vibe.label}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-violet-200" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-3">
            <CityImageAvatar city={selectedCityMeta?.name ?? selectedCity} className="h-12 w-12 rounded-lg" sizes="48px" />
            <div className="min-w-0">
              <p className="font-bold text-white">
                {selectedCityMeta?.name ?? selectedCity}, {days} {days === 1 ? "day" : "days"}
              </p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">
                {interests.join(", ")} with a local-first route and fewer obvious tourist stops.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild size="lg" className="h-12 rounded-lg bg-violet-500 font-bold text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400">
            <Link href={itineraryHref}>
              Build trip
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-lg border-white/15 bg-white/[0.04] text-white hover:bg-white/10 hover:text-white"
          >
            <Link href={exploreHref}>Browse spots</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
