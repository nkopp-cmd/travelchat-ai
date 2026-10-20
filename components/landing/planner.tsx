"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Coffee,
  Compass,
  MapPin,
  Search,
  Sparkles,
  Utensils,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { CityImageAvatar } from "@/components/ui/city-image";
import { LandingPresetPhoto } from "@/components/landing/preset-photo";
import { cn } from "@/lib/utils";

type CityOption = { name: string; slug: string; vibe?: string };
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

function citySlug(cityName: string) {
  return cityName.toLowerCase().replace(/\s+/g, "-");
}

function encodedInterests(interests: string[]) {
  return interests.join(",");
}

const PlannerContext = createContext<ReturnType<typeof usePlannerState> | null>(
  null,
);
function usePlannerState(cities: CityOption[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("Seoul");
  const [days, setDays] = useState(3);
  const [interests, setInterests] = useState<string[]>([
    "Food & Dining",
    "Cafes & Coffee",
  ]);
  const router = useRouter();

  const selectedCityMeta =
    cities.find((city) => city.name === selectedCity) ?? cities[0];

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

  return {
    cities,
    searchQuery,
    setSearchQuery,
    selectedCity,
    selectedCityMeta,
    days,
    interests,
    itineraryHref,
    exploreHref,
    setSelectedCity,
    setDays,
    toggleInterest,
    handleSearch,
    applyPreset,
  };
}
function usePlanner() {
  const planner = useContext(PlannerContext);
  if (!planner) throw new Error("Landing controls need their planner");
  return planner;
}
export function LandingPlanner({
  cities,
  children,
}: {
  cities: CityOption[];
  children: ReactNode;
}) {
  const planner = usePlannerState(cities);
  return (
    <PlannerContext.Provider value={planner}>
      {children}
    </PlannerContext.Provider>
  );
}
export function LandingExploreLink(
  props: Omit<ComponentProps<typeof Link>, "href">,
) {
  const { exploreHref } = usePlanner();
  return (
    <Link {...props} prefetch={false} href={exploreHref}>
      {props.children ?? "Browse local spots"}
    </Link>
  );
}
export function LandingSearch() {
  const { handleSearch, searchQuery, setSearchQuery } = usePlanner();
  return (
    <form
      onSubmit={handleSearch}
      className="mt-8 flex max-w-2xl flex-col gap-2 rounded-lg bg-black/35 p-2 shadow-xl shadow-violet-950/20 backdrop-blur-md sm:flex-row"
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
      <Button
        type="submit"
        size="lg"
        className="h-12 rounded-lg bg-white text-slate-950 hover:bg-slate-200"
      >
        Search
      </Button>
    </form>
  );
}
export function LandingTripBuilder() {
  const {
    cities,
    selectedCity,
    selectedCityMeta,
    days,
    interests,
    itineraryHref,
    exploreHref,
    setSelectedCity,
    setDays,
    toggleInterest,
  } = usePlanner();
  return (
    <TripBuilder
      cities={cities}
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
  );
}
export function LandingPresets() {
  const { applyPreset } = usePlanner();
  return (
    <section className=" bg-[#10131a] py-8">
      <div className="container mx-auto grid max-w-7xl gap-3 px-4 md:grid-cols-3 md:px-6">
        {QUICK_PRESETS.map((preset) => (
          <button
            key={preset.title}
            type="button"
            onClick={() => applyPreset(preset)}
            className="group overflow-hidden rounded-lg bg-white/[0.04] text-left transition hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
          >
            <div className="relative h-24 overflow-hidden">
              <LandingPresetPhoto city={preset.city} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <span className="absolute bottom-3 left-4 rounded-md bg-black/45 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {preset.city}
              </span>
            </div>
            <div className="p-5">
              <h2 className="mb-3 text-lg font-bold text-white">
                {preset.title}
              </h2>
              <p className="text-sm leading-6 text-slate-400">
                {preset.detail}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
function TripBuilder({
  cities,
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
  cities: CityOption[];
  selectedCity: string;
  selectedCityMeta: CityOption | undefined;
  days: number;
  interests: string[];
  itineraryHref: string;
  exploreHref: string;
  setSelectedCity: (city: string) => void;
  setDays: (days: number) => void;
  toggleInterest: (interest: string) => void;
}) {
  return (
    <div className="rounded-lg bg-[#120d20]/92 p-4 shadow-2xl shadow-violet-950/30 backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-200">Build a route</p>
          <h2 className="mt-1 text-2xl font-black text-white">
            Where are you going?
          </h2>
        </div>
        <div className="rounded-md bg-violet-300/10 px-2 py-1 text-xs font-semibold text-violet-100">
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
            {cities.slice(0, 6).map((city) => {
              const isSelected = city.name === selectedCity;
              return (
                <button
                  key={city.slug}
                  type="button"
                  onClick={() => setSelectedCity(city.name)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-lg px-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
                    isSelected
                      ? " bg-violet-400/15 text-white"
                      : " bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]",
                  )}
                >
                  <CityImageAvatar
                    city={city.name}
                    className="h-9 w-9"
                    sizes="36px"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {city.name}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {city.vibe}
                    </span>
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
          <div
            className="grid grid-cols-4 gap-2"
            role="group"
            aria-label="Trip duration"
          >
            {[1, 2, 3, 5].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                aria-pressed={days === option}
                className={cn(
                  "min-h-11 rounded-lg text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
                  days === option
                    ? " bg-indigo-300/15 text-white"
                    : " bg-white/[0.04] text-slate-300 ",
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
                    "flex min-h-12 items-center justify-between rounded-lg px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
                    isSelected
                      ? " bg-violet-400/15 text-white"
                      : " bg-white/[0.04] text-slate-300 ",
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

        <div className="rounded-lg bg-white/[0.04] p-3">
          <div className="flex items-center gap-3">
            <CityImageAvatar
              city={selectedCityMeta?.name ?? selectedCity}
              className="h-12 w-12 rounded-lg"
              sizes="48px"
            />
            <div className="min-w-0">
              <p className="font-bold text-white">
                {selectedCityMeta?.name ?? selectedCity}, {days}{" "}
                {days === 1 ? "day" : "days"}
              </p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">
                {interests.join(", ")} with a local-first route and fewer
                obvious tourist stops.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-lg bg-violet-500 font-bold text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400"
          >
            <Link prefetch={false} href={itineraryHref}>
              Start planning
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-lg bg-white/[0.04] text-white hover:bg-white/10 hover:text-white"
          >
            <Link prefetch={false} href={exploreHref}>
              Browse spots
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
